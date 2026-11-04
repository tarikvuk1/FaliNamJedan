import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { LEVELS, Level } from '../lib/format';
import { C, F } from '../lib/theme';
import { success, tap } from '../lib/haptics';
import { Avatar } from './Visuals';

type Candidate = {
  id: string; first_name: string | null; last_name: string | null;
  games_attended: number; games_no_show: number;
  level: Level | null; position: string | null;
  is_available: boolean; played_before: boolean; invited: boolean;
};

const nameOf = (p: Candidate) => [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Igrač';

// Organizator poziva igrače: one koji su označili "slobodan sam" u to vrijeme
// i one s kojima je već igrao.
export function InviteModal({ gameId, visible, onClose }: { gameId: string; visible: boolean; onClose: () => void }) {
  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('invitable_players', { p_game_id: gameId });
    setLoading(false);
    if (error) return Alert.alert('Greška', error.message);
    setList((data ?? []) as Candidate[]);
  }

  useEffect(() => { if (visible) load(); }, [visible]);

  async function invite(p: Candidate) {
    tap();
    setBusy(p.id);
    const { error } = await supabase.rpc('invite_player', { p_game_id: gameId, p_player_id: p.id });
    setBusy(null);
    if (error) return Alert.alert('Greška', error.message);
    success();
    setList((l) => l.map((x) => (x.id === p.id ? { ...x, invited: true } : x)));
  }

  const available = list.filter((p) => p.is_available);
  const played = list.filter((p) => !p.is_available && p.played_before);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 22, fontFamily: F.bold, color: C.text }}>Pozovi igrače</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>Gotovo</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.muted, marginTop: 6, lineHeight: 21 }}>
          Pozvani igrač dobija obavijest i sam se prijavljuje. Ti ga zatim odobriš kao i svakog drugog.
        </Text>

        {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : (
          <>
            <Group title={`🙋 Slobodni u to vrijeme (${available.length})`} empty="Trenutno niko nije označio da je slobodan za ovaj sport, grad i vrijeme.">
              {available.map((p) => <Row key={p.id} p={p} busy={busy === p.id} onInvite={() => invite(p)} />)}
            </Group>
            <Group title={`🤝 Igrali s tobom (${played.length})`} empty="Ovdje će se pojaviti igrači koje si odobrio na ranijim terminima.">
              {played.map((p) => <Row key={p.id} p={p} busy={busy === p.id} onInvite={() => invite(p)} />)}
            </Group>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

function Group({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: C.text, fontWeight: '700', marginBottom: 10 }}>{title}</Text>
      {children.length ? children : <Text style={{ color: C.faint, lineHeight: 20 }}>{empty}</Text>}
    </View>
  );
}

function Row({ p, busy, onInvite }: { p: Candidate; busy: boolean; onInvite: () => void }) {
  const total = p.games_attended + p.games_no_show;
  const info = [
    p.position,
    p.level && p.level !== 'any' ? LEVELS[p.level] : null,
    total > 0 ? `došao ${p.games_attended}/${total}` : 'novi igrač',
  ].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line }}>
      <Avatar name={nameOf(p)} size={40} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{nameOf(p)}</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 1 }}>{info}</Text>
      </View>
      {p.invited ? (
        <Text style={{ color: C.accent, fontWeight: '700' }}>Pozvan ✓</Text>
      ) : (
        <Pressable
          onPress={onInvite}
          disabled={busy}
          style={({ pressed }) => ({ backgroundColor: C.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, opacity: busy ? 0.5 : pressed ? 0.85 : 1 })}
        >
          {busy ? <ActivityIndicator color={C.onAccent} size="small" /> : <Text style={{ color: C.onAccent, fontWeight: '800' }}>Pozovi</Text>}
        </Pressable>
      )}
    </View>
  );
}
