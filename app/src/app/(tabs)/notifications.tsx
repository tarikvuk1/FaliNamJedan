import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { refreshUnread } from '../../lib/unread';
import { C } from '../../lib/theme';
import { ScreenTitle } from '../../lib/ui';
import { tap } from '../../lib/haptics';
import { EmptyState } from '../../components/Visuals';

type Notification = {
  id: string;
  type: string;
  payload: { game_id?: string };
  read: boolean;
  created_at: string;
};

const TEXTS: Record<string, { icon: string; text: string; color: string }> = {
  new_request:      { icon: '🙋', text: 'Nova prijava na tvoj termin', color: C.warn },
  request_approved: { icon: '✅', text: 'Odobren si za termin! Kontakt organizatora je u detaljima.', color: C.accent },
  request_rejected: { icon: '❌', text: 'Organizator je odbio tvoju prijavu', color: C.danger },
  game_full:        { icon: '🔒', text: 'Termin na koji si se prijavio je popunjen', color: C.muted },
  request_expired:  { icon: '⌛', text: 'Tvoja prijava je istekla', color: C.muted },
  player_left:      { icon: '🚶', text: 'Igrač je otkazao dolazak, mjesto je ponovo otvoreno', color: C.warn },
  game_cancelled:   { icon: '🚫', text: 'Organizator je otkazao termin', color: C.danger },
  game_updated:     { icon: '✏️', text: 'Organizator je izmijenio termin. Provjeri vrijeme i mjesto.', color: '#38BDF8' },
  new_game:         { icon: '📣', text: 'Novi termin za sport koji pratiš', color: C.accent },
  game_reminder:    { icon: '⏰', text: 'Tvoj termin počinje za manje od 2 sata', color: '#FACC15' },
  mark_attendance:  { icon: '📝', text: 'Označi ko je došao na tvoj termin', color: '#C084FC' },
  urgent_game:      { icon: '🔥', text: 'Hitno: termin počinje uskoro, a fali im igrač. Uskoči!', color: C.warn },
  game_for_you:     { icon: '🎯', text: 'Termin baš u vrijeme kad si slobodan', color: C.accent },
  invite:           { icon: '🙌', text: 'Organizator te poziva na termin', color: C.accent },
  repeat_invite:    { icon: '🔁', text: 'Termin na kojem si igrao ponavlja se. Prijavi se ponovo!', color: '#38BDF8' },
  game_repeated:    { icon: '🔁', text: 'Tvoj sedmični termin je objavljen za sljedeću sedmicu', color: '#38BDF8' },
  repeat_failed:    { icon: '⚠️', text: 'Sedmični termin nije ponovljen (možda imaš previše aktivnih oglasa)', color: C.warn },
  spot_open:        { icon: '🟢', text: 'Oslobodilo se mjesto u terminu za koji čekaš. Brzo!', color: C.accent },
};

export default function Notifications() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('notifications')
      .select('id, type, payload, read, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setItems(data ?? []);
    setLoading(false);

    // Označi sve kao pročitane (nove ostaju istaknute dok ne napustiš ekran)
    await supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
    refreshUnread();
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 }}>
        <ScreenTitle>Obavijesti</ScreenTitle>
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        refreshing={loading && items.length > 0}
        onRefresh={load}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30, flexGrow: 1 }}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : (
            <EmptyState icon="🔔" title="Još nemaš obavijesti" text="Ovdje stižu prijave, odobrenja i podsjetnici za termine." />
          )
        }
        renderItem={({ item }) => {
          const t = TEXTS[item.type] ?? { icon: '•', text: item.type, color: C.muted };
          return (
            <Pressable
              onPress={() => { if (item.payload?.game_id) { tap(); router.push(`/game/${item.payload.game_id}`); } }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, marginBottom: 8,
                backgroundColor: pressed ? C.card2 : item.read ? C.card : C.accentSoft,
                borderWidth: 1, borderColor: item.read ? C.line : 'rgba(34,197,94,0.35)',
              })}
            >
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.color + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 20 }}>{t.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: item.read ? '500' : '700', lineHeight: 20 }}>{t.text}</Text>
                <Text style={{ color: C.muted, marginTop: 4, fontSize: 12 }}>{formatDateTime(item.created_at)}</Text>
              </View>
              {!item.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, marginLeft: 8 }} />}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
