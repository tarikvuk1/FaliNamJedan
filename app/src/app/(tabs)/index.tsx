import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSports } from '../../lib/sports';
import { formatDateTime, LEVELS, Level, SPORT_EMOJI } from '../../lib/format';
import { Chip, GREEN } from '../../lib/ui';
import { CityField } from '../../components/CityPicker';

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
};

export default function Home() {
  const sports = useSports();
  const [sportId, setSportId] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>('Sarajevo');
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('search_games', {
      p_sport_id: sportId,
      p_city: city,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setError('');
    setGames(data ?? []);
  }, [sportId, city]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sportById = (id: number) => sports.find((s) => s.id === id);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#111' }}>Fali nam jedan</Text>
        <Pressable onPress={() => router.push('/create')} style={{ backgroundColor: GREEN, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>+ Objavi</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <CityField value={city} onChange={setCity} allowAll style={{ marginBottom: 12 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="Svi sportovi" active={sportId === null} onPress={() => setSportId(null)} />
          {sports.map((s) => (
            <Chip key={s.id} label={`${SPORT_EMOJI[s.slug] ?? ''} ${s.name}`} active={sportId === s.id} onPress={() => setSportId(s.id)} />
          ))}
        </ScrollView>
      </View>

      {!!error && <Text style={{ color: '#d00', paddingHorizontal: 20 }}>{error}</Text>}

      <FlatList
        data={games}
        keyExtractor={(g) => g.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ padding: 20, paddingTop: 8, flexGrow: 1 }}
        ListEmptyComponent={
          loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 40 }}>🏟️</Text>
              <Text style={{ color: '#666', marginTop: 8 }}>Nema otvorenih termina.</Text>
              <Text style={{ color: '#666' }}>Objavi prvi!</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const sport = sportById(item.sport_id);
          return (
            <Pressable
              onPress={() => router.push(`/game/${item.id}`)}
              style={({ pressed }) => ({
                borderWidth: 1, borderColor: '#eee', borderRadius: 16, padding: 16, marginBottom: 12,
                backgroundColor: pressed ? '#f0f0f0' : '#fafafa',
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
                  {SPORT_EMOJI[sport?.slug ?? ''] ?? ''} {sport?.name}
                </Text>
                <Text style={{ color: GREEN, fontWeight: '700' }}>
                  Fali {item.spots_left} {item.spots_left === 1 ? 'igrač' : 'igrača'}
                </Text>
              </View>
              <Text style={{ color: '#333', marginTop: 6 }}>📍 {item.venue_name}, {item.city}</Text>
              <Text style={{ color: '#333', marginTop: 2 }}>🕒 {formatDateTime(item.starts_at)}</Text>
              <Text style={{ color: '#666', marginTop: 6 }}>
                {LEVELS[item.level]}
                {item.price_per_person != null ? ` · ${item.price_per_person} KM po osobi` : ''}
                {` · ${item.organizer_name}`}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}