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
type Contacts = { phone: string | null; instagram: string | null; facebook: string | null; other: string | null };
type Player = { id: string; first_name: string | null; last_name: string | null; games_attended: number; games_no_show: number };
type Req = { id: string; status: 'pending' | 'approved'; message: string | null; player: Player | null };

const fullName = (p: { first_name: string | null; last_name: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Nepoznato';

const reliability = (attended: number, noShow: number) =>
  attended + noShow > 0 ? `Došao ${attended} od ${attended + noShow} puta` : 'Novi korisnik';

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session!.user.id;
  const insets = useSafeAreaInsets();

  const [game, setGame] = useState<GameDetails | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [myRequest, setMyRequest] = useState<MyRequest>(null);
  const [organizerContacts, setOrganizerContacts] = useState<Contacts | null>(null);

  // Samo za organizatora
  const [requests, setRequests] = useState<Req[]>([]);
  const [playerContacts, setPlayerContacts] = useState<Record<string, Contacts>>({});
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: g, error: e1 }, { data: ex }, { data: req }] = await Promise.all([
      supabase
        .from('games')
        .select('*, sport:sports(name, slug), organizer:profiles!games_organizer_id_fkey(first_name, last_name, games_attended, games_no_show)')
        .eq('id', id)
        .single(),
      supabase.rpc('game_extra', { p_game_id: id }).maybeSingle(),
      supabase.from('join_requests').select('id, status').eq('game_id', id).eq('player_id', uid).maybeSingle(),
    ]);

    if (e1 || !g) {
      setError(e1?.message ?? 'Termin nije pronađen.');
      setLoading(false);
      return;
    }

    const gameData = g as GameDetails;
    setGame(gameData);
    setExtra(ex as Extra);
    setMyRequest(req as MyRequest);

    if (gameData.organizer_id === uid) {
      // ORGANIZATOR: prijave, kontakti odobrenih i dolasci
      const { data: reqs } = await supabase
        .from('join_requests')
        .select('id, status, message, player:profiles!join_requests_player_id_fkey(id, first_name, last_name, games_attended, games_no_show)')
        .eq('game_id', id)
        .in('status', ['pending', 'approved'])
        .order('created_at');
      const list = (reqs ?? []) as unknown as Req[];
      setRequests(list);

      const approvedIds = list.filter((r) => r.status === 'approved' && r.player).map((r) => r.player!.id);
      if (approvedIds.length) {
        const { data: cs } = await supabase
          .from('profile_contacts')
          .select('user_id, phone, instagram, facebook, other')
          .in('user_id', approvedIds);
        const map: Record<string, Contacts> = {};
        (cs ?? []).forEach((c: any) => { map[c.user_id] = c; });
        setPlayerContacts(map);
      } else {
        setPlayerContacts({});
      }

      const { data: att } = await supabase.from('attendance').select('player_id, showed_up').eq('game_id', id);
      const attMap: Record<string, boolean> = {};
      (att ?? []).forEach((a: any) => { attMap[a.player_id] = a.showed_up; });
      setAttendance(attMap);
    } else if ((req as MyRequest)?.status === 'approved') {
      // IGRAČ: kontakt organizatora vidi samo kad je odobren (to provjerava i baza)
      const { data: c } = await supabase
        .from('profile_contacts')
        .select('phone, instagram, facebook, other')
        .eq('user_id', gameData.organizer_id)
        .maybeSingle();
      setOrganizerContacts(c as Contacts | null);
    } else {
      setOrganizerContacts(null);
    }

    setError('');
    setLoading(false);
  }, [id, uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Pomoćna funkcija: pozovi akciju u bazi, pokaži grešku ili osvježi ekran
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setActing(true);
    const { error } = await fn();
    setActing(false);
    if (error) return Alert.alert('Greška', error.message);
    load();
  }

  // ---------- Akcije igrača ----------
  const join = () => run(() => supabase.rpc('request_to_join', { p_game_id: id }));

  function cancelMyRequest() {
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
          onPress: () => run(() => supabase.rpc('cancel_request', { p_request_id: myRequest.id })),
        },
      ],
    );
  }

  // ---------- Akcije organizatora ----------
  const approve = (requestId: string) =>
    run(() => supabase.rpc('respond_to_request', { p_request_id: requestId, p_approve: true }));

  function reject(requestId: string, name: string) {
    Alert.alert('Odbij prijavu?', `${name} će dobiti obavijest da je prijava odbijena.`, [
      { text: 'Nazad', style: 'cancel' },
      {
        text: 'Odbij',
        style: 'destructive',
        onPress: () => run(() => supabase.rpc('respond_to_request', { p_request_id: requestId, p_approve: false })),
      },
    ]);
  }

  function cancelGame() {
    Alert.alert('Otkaži termin?', 'Svi prijavljeni igrači dobit će obavijest. Ovo se ne može poništiti.', [
      { text: 'Nazad', style: 'cancel' },
      { text: 'Otkaži termin', style: 'destructive', onPress: () => run(() => supabase.rpc('cancel_game', { p_game_id: id })) },
    ]);
  }

  const markAttendance = (playerId: string, showedUp: boolean) =>
    run(() => supabase.rpc('mark_attendance', { p_game_id: id, p_player_id: playerId, p_showed_up: showedUp }));

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
  const hasMap = extra?.lat != null && extra?.lng != null;
  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Naslov */}
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#111' }}>
          {SPORT_EMOJI[game.sport?.slug ?? ''] ?? ''} {game.sport?.name}
        </Text>
        <Text style={{ fontSize: 18, color: game.status === 'cancelled' ? '#d00' : GREEN, fontWeight: '700', marginTop: 6 }}>
          {game.status === 'cancelled'
            ? 'Otkazano'
            : game.status === 'full' || spotsLeft <= 0
              ? 'Popunjeno'
              : `Fali ${spotsLeft} ${spotsLeft === 1 ? 'igrač' : 'igrača'}`}
        </Text>

        {/* ===== ORGANIZATOR: prijave ===== */}
        {isOrganizer && game.status !== 'cancelled' && (
          <>
            {!hasStarted && (
              <Section title={`Prijave na čekanju (${pending.length})`}>
                {pending.length === 0 && <Text style={sub}>Još nema novih prijava.</Text>}
                {pending.map((r) => (
                  <Card key={r.id}>
                    <Text style={value}>{fullName(r.player)}</Text>
                    <Text style={sub}>{reliability(r.player?.games_attended ?? 0, r.player?.games_no_show ?? 0)}</Text>
                    {!!r.message && <Text style={{ color: '#333', marginTop: 6 }}>"{r.message}"</Text>}
                    <View style={{ flexDirection: 'row', marginTop: 12 }}>
                      <Pressable
                        onPress={() => approve(r.id)}
                        disabled={acting || spotsLeft <= 0}
                        style={{ flex: 1, backgroundColor: GREEN, borderRadius: 10, padding: 12, alignItems: 'center', marginRight: 8, opacity: acting || spotsLeft <= 0 ? 0.5 : 1 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Odobri</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => reject(r.id, fullName(r.player))}
                        disabled={acting}
                        style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, alignItems: 'center' }}
                      >
                        <Text style={{ color: '#d00', fontWeight: '700' }}>Odbij</Text>
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </Section>
            )}

            <Section title={`Odobreni igrači (${approved.length}/${game.players_needed})`}>
              {approved.length === 0 && <Text style={sub}>Još niko nije odobren.</Text>}
              {approved.map((r) => {
                const pid = r.player?.id ?? '';
                const marked = attendance[pid];
                return (
                  <Card key={r.id}>
                    <Text style={value}>{fullName(r.player)}</Text>
                    <Text style={sub}>{reliability(r.player?.games_attended ?? 0, r.player?.games_no_show ?? 0)}</Text>
                    {playerContacts[pid] && <ContactList c={playerContacts[pid]} />}

                    {/* Nakon početka termina: evidencija dolaska */}
                    {hasStarted && (
                      <View style={{ flexDirection: 'row', marginTop: 10 }}>
                        <AttendanceButton label="✓ Došao" active={marked === true} color={GREEN} onPress={() => markAttendance(pid, true)} disabled={acting} />
                        <AttendanceButton label="✕ Nije došao" active={marked === false} color="#d00" onPress={() => markAttendance(pid, false)} disabled={acting} />
                      </View>
                    )}
                  </Card>
                );
              })}
            </Section>
          </>
        )}

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

        {/* Organizator (vide igrači) */}
        {!isOrganizer && (
          <Section title="Organizator">
            <Text style={value}>{fullName(game.organizer)}</Text>
            <Text style={sub}>{reliability(game.organizer?.games_attended ?? 0, game.organizer?.games_no_show ?? 0)}</Text>
          </Section>
        )}

        {/* Kontakt organizatora (samo odobreni igrač) */}
        {!isOrganizer && organizerContacts && (
          <Section title="Kontakt organizatora">
            <ContactList c={organizerContacts} />
          </Section>
        )}
      </ScrollView>

      {/* Donja traka s akcijom */}
      <View style={{ borderTopWidth: 1, borderTopColor: '#eee', padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: '#fff' }}>
        {isOrganizer ? (
          game.status === 'cancelled' ? <Info text="Otkazao si ovaj termin." />
          : hasStarted || game.status === 'finished' ? <Info text="Termin je počeo ili završio. Označi dolaske iznad." />
          : (
            <>
              <Info text="Ovo je tvoj oglas." />
              <SecondaryButton label="Otkaži termin" onPress={cancelGame} disabled={acting} />
            </>
          )
        ) : (
          <PlayerActions
            gameStatus={game.status}
            hasStarted={hasStarted}
            spotsLeft={spotsLeft}
            request={myRequest}
            acting={acting}
            onJoin={join}
            onCancel={cancelMyRequest}
          />
        )}
      </View>
    </View>
  );
}

function PlayerActions(p: {
  gameStatus: GameDetails['status'];
  hasStarted: boolean;
  spotsLeft: number;
  request: MyRequest;
  acting: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
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

function ContactList({ c }: { c: Contacts }) {
  return (
    <View style={{ marginTop: 6 }}>
      {!!c.phone && <ContactLink label={`📞 ${c.phone}`} url={`tel:${c.phone.replace(/\s/g, '')}`} />}
      {!!c.instagram && <ContactLink label={`📷 @${c.instagram}`} url={`https://instagram.com/${c.instagram}`} />}
      {!!c.facebook && (
        <ContactLink
          label={`👤 ${c.facebook}`}
          url={c.facebook.startsWith('http') ? c.facebook : `https://www.facebook.com/search/top?q=${encodeURIComponent(c.facebook)}`}
        />
      )}
      {!!c.other && <Text style={{ color: '#333', marginTop: 4 }}>{c.other}</Text>}
    </View>
  );
}

function ContactLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)} style={{ paddingVertical: 6 }}>
      <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function AttendanceButton({ label, active, color, onPress, disabled }: {
  label: string; active: boolean; color: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', marginRight: 8,
        borderWidth: 1, borderColor: active ? color : '#ddd', backgroundColor: active ? color : '#fff',
      }}
    >
      <Text style={{ color: active ? '#fff' : '#333', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 14, padding: 14, marginBottom: 10, backgroundColor: '#fafafa' }}>
      {children}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: '#888', fontWeight: '700', textTransform: 'uppercase', fontSize: 12, marginBottom: 8 }}>{title}</Text>
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