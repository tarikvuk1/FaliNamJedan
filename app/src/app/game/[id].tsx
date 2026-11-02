import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime, LEVELS, Level, SPORT_EMOJI } from '../../lib/format';
import { GREEN } from '../../lib/ui';

type GameDetails = {
  id: string;
  organizer_id: string;
  city: string;
  venue_name: string;
  address: string | null;
  starts_at: string;
  duration_minutes: number;
  players_needed: number;
  price_per_person: number | null;
  level: Level;
  note: string | null;
  status: 'open' | 'full' | 'cancelled' | 'finished';
  sport: { name: string; slug: string } | null;
  organizer: { first_name: string | null; last_name: string | null; games_attended: number; games_no_show: number } | null;
};
type Extra = { lat: number | null; lng: number | null; spots_left: number };
type MyRequest = { id: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' } | null;
type Contacts = { phone: string | null; instagram: string | null; facebook: string | null; other: string | null } | null;

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session!.user.id;
  const insets = useSafeAreaInsets();

  const [game, setGame] = useState<GameDetails | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [myRequest, setMyRequest] = useState<MyRequest>(null);
  const [contacts, setContacts] = useState<Contacts>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: g, error: e1 }, { data: ex }, { data: req }] = await Promise.all([
      supabase
        .from('games')
        .select('*, sport:sports(name, slug), organizer:profiles!games_organizer_id_fkey(first_name, last_name, games_attended, games_no_show)')        .eq('id', id)
        .single(),
      supabase.rpc('game_extra', { p_game_id: id }).maybeSingle(),
      supabase.from('join_requests').select('id, status').eq('game_id', id).eq('player_id', uid).maybeSingle(),
    ]);

    if (e1 || !g) {
      setError(e1?.message ?? 'Termin nije pronađen.');
      setLoading(false);
      return;
    }

    setGame(g as GameDetails);
    setExtra(ex as Extra);
    setMyRequest(req as MyRequest);

    // Kontakt organizatora vidiš samo ako si odobren (to provjerava i baza)
    if ((req as MyRequest)?.status === 'approved') {
      const { data: c } = await supabase
        .from('profile_contacts')
        .select('phone, instagram, facebook, other')
        .eq('user_id', (g as GameDetails).organizer_id)
        .maybeSingle();
      setContacts(c as Contacts);
    } else {
      setContacts(null);
    }

    setError('');
    setLoading(false);
  }, [id, uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function join() {
    setActing(true);
    const { error } = await supabase.rpc('request_to_join', { p_game_id: id });
    setActing(false);
    if (error) return Alert.alert('Greška', error.message);
    load();
  }

  function cancel() {
    if (!myRequest) return;
    const approved = myRequest.status === 'approved';
    Alert.alert(
      approved ? 'Ne možeš doći?' : 'Otkaži prijavu?',
      approved ? 'Organizator će dobiti obavijest i mjesto se ponovo otvara.' : 'Prijava će biti povučena.',
      [
        { text: 'Nazad', style: 'cancel' },
        {
          text: approved ? 'Otkaži dolazak' : 'Otkaži prijavu',
          style: 'destructive',
          onPress: async () => {
            setActing(true);
            const { error } = await supabase.rpc('cancel_request', { p_request_id: myRequest.id });
            setActing(false);
            if (error) return Alert.alert('Greška', error.message);
            load();
          },
        },
      ],
    );
  }

  function openInMaps() {
    if (!game || extra?.lat == null || extra?.lng == null) return;
    const label = encodeURIComponent(game.venue_name);
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${extra.lat},${extra.lng}&q=${label}`
      : `geo:${extra.lat},${extra.lng}?q=${extra.lat},${extra.lng}(${label})`;
    Linking.openURL(url);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#fff' }} />;
  if (error || !game) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 }}>
        <Text style={{ color: '#666' }}>{error || 'Termin nije pronađen.'}</Text>
      </View>
    );
  }

  const isOrganizer = game.organizer_id === uid;
  const hasStarted = new Date(game.starts_at) <= new Date();
  const spotsLeft = extra?.spots_left ?? game.players_needed;
  const organizerName = [game.organizer?.first_name, game.organizer?.last_name].filter(Boolean).join(' ');
  const attended = game.organizer?.games_attended ?? 0;
  const noShow = game.organizer?.games_no_show ?? 0;
  const hasMap = extra?.lat != null && extra?.lng != null;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Naslov */}
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#111' }}>
          {SPORT_EMOJI[game.sport?.slug ?? ''] ?? ''} {game.sport?.name}
        </Text>
        <Text style={{ fontSize: 18, color: GREEN, fontWeight: '700', marginTop: 6 }}>
          {game.status === 'full' || spotsLeft <= 0
            ? 'Popunjeno'
            : `Fali ${spotsLeft} ${spotsLeft === 1 ? 'igrač' : 'igrača'}`}
        </Text>

        {/* Mjesto */}
        <Section title="Mjesto">
          <Text style={value}>{game.venue_name}</Text>
          <Text style={sub}>{[game.address, game.city].filter(Boolean).join(', ')}</Text>
          {hasMap && (
            <>
              <MapView
                style={{ height: 160, borderRadius: 12, marginTop: 12 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={{ latitude: extra!.lat!, longitude: extra!.lng!, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
              >
                <Marker coordinate={{ latitude: extra!.lat!, longitude: extra!.lng! }} />
              </MapView>
              <Pressable onPress={openInMaps} style={{ marginTop: 10 }}>
                <Text style={{ color: GREEN, fontWeight: '700' }}>Otvori u mapama →</Text>
              </Pressable>
            </>
          )}
        </Section>

        {/* Vrijeme */}
        <Section title="Vrijeme">
          <Text style={value}>{formatDateTime(game.starts_at)}</Text>
          <Text style={sub}>Trajanje: {game.duration_minutes} min</Text>
        </Section>

        {/* Detalji */}
        <Section title="Detalji">
          <Row label="Nivo" value={LEVELS[game.level]} />
          <Row label="Cijena" value={game.price_per_person != null ? `${game.price_per_person} KM po osobi` : 'Nije navedena'} />
          <Row label="Traži se igrača" value={String(game.players_needed)} />
          {!!game.note && <Text style={{ color: '#333', marginTop: 10, lineHeight: 21 }}>{game.note}</Text>}
        </Section>

        {/* Organizator */}
        <Section title="Organizator">
          <Text style={value}>{organizerName || 'Nepoznato'}</Text>
          <Text style={sub}>
            {attended + noShow > 0
              ? `Pouzdanost: došao ${attended} od ${attended + noShow} puta`
              : 'Novi korisnik'}
          </Text>
        </Section>

        {/* Kontakt (samo kad je igrač odobren) */}
        {contacts && (
          <Section title="Kontakt organizatora">
            {!!contacts.phone && (
              <ContactLink label={`📞 ${contacts.phone}`} url={`tel:${contacts.phone.replace(/\s/g, '')}`} />
            )}
            {!!contacts.instagram && (
              <ContactLink label={`📷 @${contacts.instagram}`} url={`https://instagram.com/${contacts.instagram}`} />
            )}
            {!!contacts.facebook && (
              <ContactLink
                label={`👤 ${contacts.facebook}`}
                url={contacts.facebook.startsWith('http')
                  ? contacts.facebook
                  : `https://www.facebook.com/search/top?q=${encodeURIComponent(contacts.facebook)}`}
              />
            )}
            {!!contacts.other && <Text style={{ color: '#333', marginTop: 8 }}>{contacts.other}</Text>}
          </Section>
        )}
      </ScrollView>

      {/* Donja traka s akcijom */}
      <View style={{ borderTopWidth: 1, borderTopColor: '#eee', padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: '#fff' }}>
        <ActionBar
          isOrganizer={isOrganizer}
          gameStatus={game.status}
          hasStarted={hasStarted}
          spotsLeft={spotsLeft}
          request={myRequest}
          acting={acting}
          onJoin={join}
          onCancel={cancel}
        />
      </View>
    </View>
  );
}

function ActionBar(p: {
  isOrganizer: boolean;
  gameStatus: GameDetails['status'];
  hasStarted: boolean;
  spotsLeft: number;
  request: MyRequest;
  acting: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  if (p.isOrganizer) return <Info text="Ovo je tvoj oglas." />;
  if (p.gameStatus === 'cancelled') return <Info text="Organizator je otkazao termin." />;
  if (p.hasStarted || p.gameStatus === 'finished') return <Info text="Termin je počeo ili završio." />;

  switch (p.request?.status) {
    case 'pending':
      return (
        <>
          <Info text="⏳ Prijava poslana, čeka odobrenje organizatora." />
          <SecondaryButton label="Otkaži prijavu" onPress={p.onCancel} disabled={p.acting} />
        </>
      );
    case 'approved':
      return (
        <>
          <Info text="✅ Odobren si! Kontakt organizatora je iznad." />
          <SecondaryButton label="Ne mogu doći" onPress={p.onCancel} disabled={p.acting} />
        </>
      );
    case 'rejected':
      return <Info text="Organizator je odbio prijavu za ovaj termin." />;
    default:
      if (p.gameStatus === 'full' || p.spotsLeft <= 0) return <Info text="Termin je popunjen." />;
      return (
        <Pressable
          onPress={p.onJoin}
          disabled={p.acting}
          style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', opacity: p.acting ? 0.6 : 1 }}
        >
          {p.acting
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Pridruži se</Text>}
        </Pressable>
      );
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: '#888', fontWeight: '700', textTransform: 'uppercase', fontSize: 12, marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value: v }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: '#666' }}>{label}</Text>
      <Text style={{ color: '#111', fontWeight: '600' }}>{v}</Text>
    </View>
  );
}

function ContactLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)} style={{ paddingVertical: 8 }}>
      <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Info({ text }: { text: string }) {
  return <Text style={{ color: '#444', textAlign: 'center', marginBottom: 8, fontSize: 15 }}>{text}</Text>;
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}
    >
      <Text style={{ color: '#d00', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const value = { fontSize: 17, fontWeight: '700' as const, color: '#111' };
const sub = { color: '#666', marginTop: 2 };