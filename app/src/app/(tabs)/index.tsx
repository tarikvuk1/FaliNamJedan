import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, SectionList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useSports } from '../../lib/sports';
import { dayLabel, isUrgent, Level, SPORT_EMOJI } from '../../lib/format';
import { Chip } from '../../lib/ui';
import { C, F } from '../../lib/theme';
import { tap, success } from '../../lib/haptics';
import { CityField } from '../../components/CityPicker';
import { DayHeader, EmptyState, GameCard, LogoMark } from '../../components/Visuals';
import { AvailabilityModal } from '../../components/AvailabilityModal';

type Game = {
  id: string;
  sport_id: number;
  city: string;
  venue_name: string;
  starts_at: string;
  players_needed: number;
  spots_left: number;
  price_per_person: number | null;
  level: Level;
  organizer_name: string;
  distance_km: number | null;
  wanted_position: string | null;
  repeat_weekly: boolean;
};

const NEARBY_RADIUS_KM = 15;

export default function Home() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const sports = useSports();
  const [sportId, setSportId] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>('Sarajevo');
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [following, setFollowing] = useState(false);
  const [nearby, setNearby] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [availCount, setAvailCount] = useState(0);

  const loadAvailability = useCallback(async () => {
    const { count } = await supabase.from('availability').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).gt('available_to', new Date().toISOString());
    setAvailCount(count ?? 0);
  }, [uid]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('search_games', nearby
      ? { p_sport_id: sportId, p_city: null, p_lat: nearby.lat, p_lng: nearby.lng, p_radius_km: NEARBY_RADIUS_KM }
      : { p_sport_id: sportId, p_city: city });
    setLoading(false);
    if (error) return setError(error.message);
    setError('');
    setGames(data ?? []);
  }, [sportId, city, nearby]);

  useFocusEffect(useCallback(() => { load(); loadAvailability(); }, [load, loadAvailability]));

  // Grupisanje po danima: Danas, Sutra, Subota 8.11. ...
  const sections = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of games) {
      const key = dayLabel(g.starts_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [games]);

  // Da li korisnik već prati izabrani sport + grad
  useEffect(() => {
    if (!sportId || !city) return setFollowing(false);
    supabase.from('follows').select('sport_id').eq('user_id', uid).eq('sport_id', sportId).eq('city', city).maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [sportId, city, uid]);

  async function toggleFollow() {
    if (!sportId || !city) return;
    tap();
    if (following) {
      const { error } = await supabase.from('follows').delete().eq('user_id', uid).eq('sport_id', sportId).eq('city', city);
      if (error) return Alert.alert('Greška', error.message);
      setFollowing(false);
    } else {
      const { error } = await supabase.from('follows').upsert({ user_id: uid, sport_id: sportId, city }, { ignoreDuplicates: true });
      if (error) return Alert.alert('Greška', error.message);
      setFollowing(true);
      success();
    }
  }

  async function toggleNearby() {
    tap();
    if (nearby) return setNearby(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Lokacija nije dozvoljena', 'Za termine u blizini dozvoli lokaciju u podešavanjima telefona.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setNearby({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Greška', 'Nije moguće odrediti lokaciju.');
    } finally {
      setLocating(false);
    }
  }

  const sportById = (id: number) => sports.find((s) => s.id === id);

  const header = (
    <View>
      {/* Filteri */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1, opacity: nearby ? 0.4 : 1 }} pointerEvents={nearby ? 'none' : 'auto'}>
          <CityField value={city} onChange={setCity} allowAll />
        </View>
        <Pressable
          onPress={toggleNearby}
          disabled={locating}
          style={{
            marginLeft: 8, height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, justifyContent: 'center',
            borderColor: nearby ? C.accent : C.border, backgroundColor: nearby ? C.accent : C.card,
            flexDirection: 'row', alignItems: 'center',
          }}
        >
          {locating ? <ActivityIndicator color={C.accent} /> : (
            <>
              <Ionicons name="navigate" size={16} color={nearby ? C.onAccent : C.text} style={{ marginRight: 6 }} />
              <Text style={{ color: nearby ? C.onAccent : C.text, fontWeight: '700' }}>Blizu</Text>
            </>
          )}
        </Pressable>
      </View>
      {nearby && <Text style={{ color: C.muted, marginTop: -4, marginBottom: 10 }}>Termini do {NEARBY_RADIUS_KM} km od tebe</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <Chip label="Svi sportovi" active={sportId === null} onPress={() => { tap(); setSportId(null); }} />
        {sports.map((s) => (
          <Chip key={s.id} label={`${SPORT_EMOJI[s.slug] ?? ''} ${s.name}`} active={sportId === s.id} onPress={() => { tap(); setSportId(s.id); }} />
        ))}
      </ScrollView>

      {!nearby && sportId && city && (
        <Pressable
          onPress={toggleFollow}
          style={{
            flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 4,
            paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
            borderWidth: 1, borderColor: following ? C.accent : C.border, backgroundColor: following ? C.accentSoft : 'transparent',
          }}
        >
          <Ionicons name={following ? 'notifications' : 'notifications-outline'} size={15} color={following ? C.accent : C.text2} style={{ marginRight: 6 }} />
          <Text style={{ color: following ? C.accent : C.text2, fontWeight: '600' }}>
            {following ? 'Pratiš ovaj sport u ovom gradu' : 'Javi mi za nove termine'}
          </Text>
        </Pressable>
      )}

      {/* Slobodan sam */}
      <Pressable
        onPress={() => { tap(); setAvailOpen(true); }}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', marginTop: 12, padding: 14, borderRadius: 16,
          backgroundColor: availCount ? C.accentSoft : pressed ? C.card2 : C.card,
          borderWidth: 1, borderColor: availCount ? 'rgba(34,197,94,0.4)' : C.line,
        })}
      >
        <Text style={{ fontSize: 22, marginRight: 12 }}>🙋</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: availCount ? C.accent : C.text, fontFamily: F.semi, fontSize: 15 }}>
            {availCount ? 'Označen si kao slobodan ✓' : 'Slobodan si za igru?'}
          </Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 1 }}>
            {availCount ? 'Organizatori te mogu pozvati. Dodirni za izmjenu.' : 'Javi kad možeš, organizatori će te pozvati.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.faint} />
      </Pressable>

      {!!error && <Text style={{ color: C.danger, marginTop: 8 }}>{error}</Text>}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Zaglavlje */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <LogoMark size={24} />
          <Text style={{ fontSize: 26, fontFamily: F.bold, color: C.text, marginLeft: 10, letterSpacing: -0.5 }}>Jedan</Text>
        </View>
        <Pressable
          onPress={() => { tap(); router.push('/create'); }}
          style={({ pressed }) => ({
            backgroundColor: C.accent, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999,
            flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="add" size={18} color={C.onAccent} />
          <Text style={{ color: C.onAccent, fontFamily: F.bold, marginLeft: 2 }}>Objavi</Text>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={loading && games.length > 0} onRefresh={load} tintColor={C.accent} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, flexGrow: 1 }}
        renderSectionHeader={({ section }) => <DayHeader>{section.title}</DayHeader>}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
            <EmptyState
              icon="🏟️"
              title={nearby ? 'Nema termina u blizini' : 'Nema otvorenih termina'}
              text={nearby
                ? 'U blizini se prikazuju samo termini s lokacijom na mapi.'
                : 'Budi prvi: objavi termin i pronađi igrače koji vam fale.'}
              action={{ label: '+ Objavi termin', onPress: () => router.push('/create') }}
            />
          )
        }
        renderItem={({ item }) => {
          const sport = sportById(item.sport_id);
          return (
            <GameCard
              sportSlug={sport?.slug}
              sportName={sport?.name}
              venue={item.venue_name}
              city={item.city}
              startsAt={item.starts_at}
              needed={item.players_needed}
              left={item.spots_left}
              price={item.price_per_person}
              level={item.level}
              organizer={item.organizer_name}
              distanceKm={item.distance_km}
              urgent={isUrgent(item.starts_at, item.spots_left)}
              position={item.wanted_position}
              repeat={item.repeat_weekly}
              onPress={() => { tap(); router.push(`/game/${item.id}`); }}
            />
          );
        }}
      />
      <AvailabilityModal visible={availOpen} onClose={() => setAvailOpen(false)} onChanged={loadAvailability} />
    </SafeAreaView>
  );
}
