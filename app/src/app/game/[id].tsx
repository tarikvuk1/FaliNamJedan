import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime, isUrgent, LEVELS, Level, SPORT_EMOJI } from '../../lib/format';
import { C, F, sportColor } from '../../lib/theme';
import { OutlineButton, PrimaryButton, SectionTitle } from '../../lib/ui';
import { success, tap, warning } from '../../lib/haptics';
import { Avatar, PlayerSlots } from '../../components/Visuals';
import { facebookLabel, facebookUrl, instagramUrl } from '../../lib/contacts';
import { ReportModal, ReportTarget } from '../../components/ReportModal';
import { InviteModal } from '../../components/InviteModal';
import { shareGame } from '../../lib/share';
import { useChatUnread } from '../../lib/unread';

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
  wanted_position: string | null;
  repeat_weekly: boolean;
  sport: { name: string; slug: string } | null;
  organizer: { first_name: string | null; last_name: string | null; games_attended: number; games_no_show: number } | null;
};
type Extra = { lat: number | null; lng: number | null; spots_left: number };
type MyRequest = { id: string; status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' } | null;
type Contacts = { phone: string | null; instagram: string | null; facebook: string | null; other: string | null };
type Player = { id: string; first_name: string | null; last_name: string | null; games_attended: number; games_no_show: number };
type Req = { id: string; status: 'pending' | 'approved'; message: string | null; player: Player | null };
type PlayerSport = { level: Level; position: string | null };

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

  const [playerSports, setPlayerSports] = useState<Record<string, PlayerSport>>({});
  const [waitlisted, setWaitlisted] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const chatUnread = useChatUnread(uid).byGame[id] ?? 0;
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: g, error: e1 }, { data: ex }, { data: req }, { data: wl }] = await Promise.all([
      supabase
        .from('games')
        .select('*, sport:sports(name, slug), organizer:profiles!games_organizer_id_fkey(first_name, last_name, games_attended, games_no_show)')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('game_extra', { p_game_id: id }).maybeSingle(),
      supabase.from('join_requests').select('id, status').eq('game_id', id).eq('player_id', uid).maybeSingle(),
      supabase.from('game_waitlist').select('game_id').eq('game_id', id).eq('player_id', uid).maybeSingle(),
    ]);

    if (e1 || !g) {
      setError(e1?.message ?? 'Termin nije pronađen. Možda ga je organizator obrisao.');
      setLoading(false);
      return;
    }

    const gameData = g as GameDetails;
    setGame(gameData);
    setExtra(ex as Extra);
    setMyRequest(req as MyRequest);
    setWaitlisted(!!wl);

    if (gameData.organizer_id === uid) {
      const { data: reqs } = await supabase
        .from('join_requests')
        .select('id, status, message, player:profiles!join_requests_player_id_fkey(id, first_name, last_name, games_attended, games_no_show)')
        .eq('game_id', id)
        .in('status', ['pending', 'approved'])
        .order('created_at');
      const list = (reqs ?? []) as unknown as Req[];
      setRequests(list);

      // Nivo i pozicija prijavljenih igrača za ovaj sport
      const playerIds = list.map((r) => r.player?.id).filter(Boolean) as string[];
      if (playerIds.length) {
        const { data: us } = await supabase.from('user_sports').select('user_id, level, position')
          .eq('sport_id', (g as any).sport_id).in('user_id', playerIds);
        const map: Record<string, PlayerSport> = {};
        (us ?? []).forEach((u: any) => { map[u.user_id] = { level: u.level, position: u.position }; });
        setPlayerSports(map);
      }

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

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, onOk?: () => void) {
    setActing(true);
    const { error } = await fn();
    setActing(false);
    if (error) { warning(); return Alert.alert('Greška', error.message); }
    onOk?.();
    load();
  }

  // ---------- Akcije igrača ----------
  const join = () => run(() => supabase.rpc('request_to_join', { p_game_id: id }), success);

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

  async function joinWaitlist() {
    tap();
    const { error } = await supabase.from('game_waitlist').insert({ game_id: id, player_id: uid });
    if (error) { warning(); return Alert.alert('Greška', error.message); }
    success();
    setWaitlisted(true);
  }

  async function leaveWaitlist() {
    const { error } = await supabase.from('game_waitlist').delete().eq('game_id', id).eq('player_id', uid);
    if (error) return Alert.alert('Greška', error.message);
    setWaitlisted(false);
  }

  function share() {
    if (!game) return;
    tap();
    shareGame({
      id: game.id, sportName: game.sport?.name, emoji: SPORT_EMOJI[game.sport?.slug ?? ''],
      venue: game.venue_name, city: game.city, startsAt: game.starts_at,
      spotsLeft: Math.max(1, extra?.spots_left ?? game.players_needed), position: game.wanted_position,
    });
  }

  // ---------- Akcije organizatora ----------
  const approve = (requestId: string) =>
    run(() => supabase.rpc('respond_to_request', { p_request_id: requestId, p_approve: true }), success);

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

  function deleteGame() {
    Alert.alert('Obriši oglas?', 'Oglas će biti trajno obrisan. Ovo se ne može poništiti.', [
      { text: 'Nazad', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          const { error } = await supabase.rpc('delete_game', { p_game_id: id });
          setActing(false);
          if (error) return Alert.alert('Greška', error.message);
          router.back();
        },
      },
    ]);
  }

  const markAttendance = (playerId: string, showedUp: boolean) => {
    tap();
    run(() => supabase.rpc('mark_attendance', { p_game_id: id, p_player_id: playerId, p_showed_up: showedUp }));
  };

  function openInMaps() {
    if (!game || extra?.lat == null || extra?.lng == null) return;
    const label = encodeURIComponent(game.venue_name);
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${extra.lat},${extra.lng}&q=${label}`
      : `geo:${extra.lat},${extra.lng}?q=${extra.lat},${extra.lng}(${label})`;
    Linking.openURL(url);
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  if (error || !game) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 24 }}>
        <Text style={{ color: C.muted, textAlign: 'center' }}>{error || 'Termin nije pronađen.'}</Text>
      </View>
    );
  }

  const color = sportColor(game.sport?.slug);
  const isOrganizer = game.organizer_id === uid;
  const hasStarted = new Date(game.starts_at) <= new Date();
  const isActive = (game.status === 'open' || game.status === 'full') && !hasStarted;
  const spotsLeft = extra?.spots_left ?? game.players_needed;
  const hasMap = extra?.lat != null && extra?.lng != null;
  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');
  const urgent = isActive && isUrgent(game.starts_at, spotsLeft);
  const minutesLeft = Math.max(0, Math.round((new Date(game.starts_at).getTime() - Date.now()) / 60000));
  const canChat = game.status !== 'cancelled' && (isOrganizer || myRequest?.status === 'approved');
  const sportInfo = (pid?: string) => {
    const ps = pid ? playerSports[pid] : undefined;
    if (!ps) return '';
    return [ps.position, ps.level !== 'any' ? LEVELS[ps.level] : null].filter(Boolean).join(' · ');
  };
  const personSub = (pl: Player | null) =>
    [sportInfo(pl?.id), reliability(pl?.games_attended ?? 0, pl?.games_no_show ?? 0)].filter(Boolean).join(' · ');

  const statusText = game.status === 'cancelled' ? 'Otkazano'
    : game.status === 'finished' || hasStarted ? 'Završeno'
    : spotsLeft <= 0 ? 'Popunjeno'
    : `Fali ${spotsLeft} ${spotsLeft === 1 ? 'igrač' : 'igrača'}`;
  const statusColor = game.status === 'cancelled' ? C.danger : spotsLeft > 0 && isActive ? color : C.muted;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{
        headerRight: () => game.status !== 'cancelled' && !hasStarted ? (
          <Pressable onPress={share} hitSlop={10} accessibilityLabel="Podijeli termin">
            <Ionicons name="share-outline" size={23} color={C.accent} />
          </Pressable>
        ) : null,
      }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {urgent && (
          <View style={{ backgroundColor: C.warn + '1F', borderColor: C.warn + '66', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, marginRight: 10 }}>🔥</Text>
            <Text style={{ color: C.warn, fontWeight: '800', flex: 1 }}>
              Hitno! Počinje za {minutesLeft < 60 ? `${minutesLeft} min` : `${Math.floor(minutesLeft / 60)} h ${minutesLeft % 60} min`}, a fali {spotsLeft === 1 ? 'jedan igrač' : `${spotsLeft} igrača`}.
            </Text>
          </View>
        )}
        {/* ===== Zaglavlje termina ===== */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ backgroundColor: color + '22', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color, fontWeight: '700' }}>{SPORT_EMOJI[game.sport?.slug ?? ''] ?? ''} {game.sport?.name}</Text>
          </View>
          {game.level !== 'any' && (
            <View style={{ backgroundColor: C.card2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
              <Text style={{ color: C.text2, fontWeight: '600' }}>{LEVELS[game.level]}</Text>
            </View>
          )}
          {game.repeat_weekly && (
            <View style={{ backgroundColor: C.card2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
              <Text style={{ color: C.text2, fontWeight: '600' }}>🔁 Svake sedmice</Text>
            </View>
          )}
        </View>
        {!!game.wanted_position && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: color + '1F', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 }}>
            <Text style={{ color, fontWeight: '800' }}>🎯 Traži se: {game.wanted_position}</Text>
          </View>
        )}

        <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 26, marginTop: 12, lineHeight: 32 }}>{game.venue_name}</Text>
        <Text style={{ color: C.muted, marginTop: 4 }}>{[game.address, game.city].filter(Boolean).join(', ')}</Text>

        {/* Vrijeme i cijena */}
        <View style={{ flexDirection: 'row', marginTop: 18 }}>
          <InfoBox icon="time-outline" title={formatDateTime(game.starts_at)} sub={`${game.duration_minutes} min`} />
          <InfoBox icon="cash-outline" title={game.price_per_person != null ? `${game.price_per_person} KM` : 'Bez cijene'} sub="po osobi" last />
        </View>

        {/* Slotovi */}
        <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 16, marginTop: 12, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: C.text, fontFamily: F.semi, fontSize: 15 }}>Igrači</Text>
            <Text style={{ color: statusColor, fontFamily: F.bold }}>{statusText}</Text>
          </View>
          <PlayerSlots needed={game.players_needed} left={Math.max(0, spotsLeft)} size={30} color={color} max={10} />
          <Text style={{ color: C.faint, marginTop: 10, fontSize: 13 }}>
            Puni krug je igrač koji je odobren, a isprekidan mjesto koje još fali.
          </Text>
        </View>

        {canChat && (
          <Pressable
            onPress={() => { tap(); router.push(`/chat/${id}`); }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? C.card2 : C.card, borderRadius: 18,
              padding: 16, marginTop: 12, borderWidth: 1, borderColor: C.line,
            })}
          >
            <Text style={{ fontSize: 22, marginRight: 12 }}>💬</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontFamily: F.semi, fontSize: 15 }}>Chat termina</Text>
              <Text style={{ color: chatUnread ? C.accent : C.muted, fontSize: 13, marginTop: 1, fontWeight: chatUnread ? '700' : '400' }}>
                {chatUnread ? `${chatUnread} ${chatUnread === 1 ? 'nova poruka' : 'nove poruke'}` : 'Dogovor s organizatorom i igračima'}
              </Text>
            </View>
            {chatUnread > 0 && (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 8 }}>
                <Text style={{ color: C.onAccent, fontWeight: '800', fontSize: 12 }}>{chatUnread}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={C.faint} />
          </Pressable>
        )}

        {isOrganizer && isActive && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {spotsLeft > 0 && game.status === 'open' && (
              <OutlineButton label="🙌 Pozovi igrače" color={C.accent} onPress={() => { tap(); setInviteOpen(true); }} style={{ flex: 1 }} />
            )}
            <OutlineButton label="📤 Podijeli" onPress={share} style={{ flex: 1 }} />
          </View>
        )}

        {/* ===== ORGANIZATOR: prijave ===== */}
        {isOrganizer && game.status !== 'cancelled' && (
          <>
            {!hasStarted && (
              <Section title={`Prijave na čekanju (${pending.length})`}>
                {pending.length === 0 && <Text style={{ color: C.faint }}>Još nema novih prijava.</Text>}
                {pending.map((r) => (
                  <PersonCard key={r.id} name={fullName(r.player)} sub={personSub(r.player)}>
                    {!!r.message && <Text style={{ color: C.text2, marginTop: 8 }}>"{r.message}"</Text>}
                    <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                      <PrimaryButton label="Odobri" onPress={() => approve(r.id)} disabled={acting || spotsLeft <= 0} style={{ flex: 1, padding: 12 }} />
                      <OutlineButton label="Odbij" color={C.danger} onPress={() => reject(r.id, fullName(r.player))} disabled={acting} style={{ flex: 1, padding: 12 }} />
                    </View>
                    <ReportLink onPress={() => r.player && setReportTarget({ id: r.player.id, name: fullName(r.player) })} />
                  </PersonCard>
                ))}
              </Section>
            )}

            <Section title={`Odobreni igrači (${approved.length}/${game.players_needed})`}>
              {approved.length === 0 && <Text style={{ color: C.faint }}>Još niko nije odobren.</Text>}
              {approved.map((r) => {
                const pid = r.player?.id ?? '';
                const marked = attendance[pid];
                return (
                  <PersonCard key={r.id} name={fullName(r.player)} sub={personSub(r.player)}>
                    {playerContacts[pid] && <ContactList c={playerContacts[pid]} />}
                    {hasStarted && (
                      <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                        <AttendanceButton label="✓ Došao" active={marked === true} color={C.accent} onPress={() => markAttendance(pid, true)} disabled={acting} />
                        <AttendanceButton label="✕ Nije došao" active={marked === false} color={C.danger} onPress={() => markAttendance(pid, false)} disabled={acting} />
                      </View>
                    )}
                    <ReportLink onPress={() => r.player && setReportTarget({ id: r.player.id, name: fullName(r.player) })} />
                  </PersonCard>
                );
              })}
            </Section>
          </>
        )}

        {/* Napomena */}
        {!!game.note && (
          <Section title="Napomena">
            <Text style={{ color: C.text2, lineHeight: 22 }}>{game.note}</Text>
          </Section>
        )}

        {/* Mapa */}
        {hasMap && (
          <Section title="Lokacija">
            <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
              <MapView
                style={{ height: 170 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={{ latitude: extra!.lat!, longitude: extra!.lng!, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
              >
                <Marker coordinate={{ latitude: extra!.lat!, longitude: extra!.lng! }} />
              </MapView>
            </View>
            <Pressable onPress={openInMaps} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="navigate-outline" size={16} color={C.accent} style={{ marginRight: 6 }} />
              <Text style={{ color: C.accent, fontWeight: '700' }}>Otvori u mapama</Text>
            </Pressable>
          </Section>
        )}

        {/* Organizator (vide igrači) */}
        {!isOrganizer && (
          <Section title="Organizator">
            <PersonCard name={fullName(game.organizer)} sub={reliability(game.organizer?.games_attended ?? 0, game.organizer?.games_no_show ?? 0)}>
              {organizerContacts && <ContactList c={organizerContacts} />}
              <ReportLink
                label="Prijavi ili blokiraj organizatora"
                onPress={() => setReportTarget({ id: game.organizer_id, name: fullName(game.organizer) })}
              />
            </PersonCard>
          </Section>
        )}
      </ScrollView>

      {/* Donja traka s akcijom */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line, padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: C.bg }}>
        {isOrganizer ? (
          isActive ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <OutlineButton label="✏️ Uredi" onPress={() => router.push({ pathname: '/create', params: { id } })} disabled={acting} style={{ flex: 1 }} />
              {approved.length === 0
                ? <OutlineButton label="Obriši oglas" color={C.danger} onPress={deleteGame} disabled={acting} style={{ flex: 1 }} />
                : <OutlineButton label="Otkaži termin" color={C.danger} onPress={cancelGame} disabled={acting} style={{ flex: 1 }} />}
            </View>
          ) : (
            <>
              <Info text={game.status === 'cancelled' ? 'Otkazao si ovaj termin.' : 'Termin je počeo ili završio. Označi dolaske iznad.'} />
              <OutlineButton label="Obriši oglas" color={C.danger} onPress={deleteGame} disabled={acting} />
            </>
          )
        ) : (
          <PlayerActions
            gameStatus={game.status}
            hasStarted={hasStarted}
            spotsLeft={spotsLeft}
            request={myRequest}
            acting={acting}
            waitlisted={waitlisted}
            onJoin={join}
            onCancel={cancelMyRequest}
            onWaitlist={joinWaitlist}
            onLeaveWaitlist={leaveWaitlist}
          />
        )}
      </View>

      <ReportModal
        target={reportTarget}
        gameId={id}
        onClose={() => setReportTarget(null)}
        onBlocked={() => (isOrganizer ? load() : router.back())}
      />
      {isOrganizer && <InviteModal gameId={id} visible={inviteOpen} onClose={() => { setInviteOpen(false); load(); }} />}
    </View>
  );
}

function PlayerActions(p: {
  gameStatus: GameDetails['status'];
  hasStarted: boolean;
  spotsLeft: number;
  request: MyRequest;
  acting: boolean;
  waitlisted: boolean;
  onJoin: () => void;
  onCancel: () => void;
  onWaitlist: () => void;
  onLeaveWaitlist: () => void;
}) {
  if (p.gameStatus === 'cancelled') return <Info text="Organizator je otkazao termin." />;
  if (p.hasStarted || p.gameStatus === 'finished') return <Info text="Termin je počeo ili završio." />;

  switch (p.request?.status) {
    case 'pending':
      return (
        <>
          <Info text="⏳ Prijava poslana, čeka odobrenje organizatora." />
          <OutlineButton label="Otkaži prijavu" color={C.danger} onPress={p.onCancel} disabled={p.acting} />
        </>
      );
    case 'approved':
      return (
        <>
          <Info text="✅ Odobren si! Kontakt organizatora i chat su iznad." />
          <OutlineButton label="Ne mogu doći" color={C.danger} onPress={p.onCancel} disabled={p.acting} />
        </>
      );
    case 'rejected':
      return <Info text="Organizator je odbio prijavu za ovaj termin." />;
    default:
      if (p.gameStatus === 'full' || p.spotsLeft <= 0) {
        return p.waitlisted ? (
          <>
            <Info text="⏳ Na listi čekanja si. Javimo ti čim se oslobodi mjesto." />
            <OutlineButton label="Izađi s liste čekanja" onPress={p.onLeaveWaitlist} disabled={p.acting} />
          </>
        ) : (
          <>
            <Info text="Termin je popunjen." />
            <OutlineButton label="🔔 Javi mi ako se oslobodi mjesto" color={C.accent} onPress={p.onWaitlist} disabled={p.acting} />
          </>
        );
      }
      return <PrimaryButton label="Uskoči u termin" onPress={() => { tap(); p.onJoin(); }} loading={p.acting} />;
  }
}

function InfoBox({ icon, title, sub, last }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; last?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 14, marginRight: last ? 0 : 10, borderWidth: 1, borderColor: C.line }}>
      <Ionicons name={icon} size={18} color={C.accent} />
      <Text style={{ color: C.text, fontFamily: F.semi, fontSize: 15, marginTop: 6 }}>{title}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{sub}</Text>
    </View>
  );
}

function PersonCard({ name, sub, children }: { name: string; sub: string; children?: ReactNode }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar name={name} size={42} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: C.muted, marginTop: 1, fontSize: 13 }}>{sub}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function ContactList({ c }: { c: Contacts }) {
  return (
    <View style={{ marginTop: 10, backgroundColor: C.card2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
      {!!c.phone && <ContactLink icon="call-outline" label={c.phone} url={`tel:${c.phone.replace(/\s/g, '')}`} />}
      {!!c.instagram && <ContactLink icon="logo-instagram" label={`@${c.instagram.replace(/^@/, '')}`} url={instagramUrl(c.instagram)} />}
      {!!c.facebook && <ContactLink icon="logo-facebook" label={facebookLabel(c.facebook)} url={facebookUrl(c.facebook)} />}
      {!!c.other && <Text style={{ color: C.text2, paddingVertical: 8 }}>{c.other}</Text>}
    </View>
  );
}

function ContactLink({ icon, label, url }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url)} style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={icon} size={18} color={C.accent} style={{ marginRight: 10 }} />
      <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>{label}</Text>
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
        flex: 1, borderRadius: 12, padding: 11, alignItems: 'center',
        borderWidth: 1, borderColor: active ? color : C.border, backgroundColor: active ? color : 'transparent',
      }}
    >
      <Text style={{ color: active ? C.onAccent : C.text2, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function ReportLink({ onPress, label = 'Prijavi / blokiraj' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
      <Text style={{ color: C.faint, fontSize: 13, textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 26 }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

function Info({ text }: { text: string }) {
  return <Text style={{ color: C.text2, textAlign: 'center', marginBottom: 10, fontSize: 15 }}>{text}</Text>;
}
