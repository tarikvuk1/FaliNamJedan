import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';

type Notification = {
  id: string;
  type: string;
  payload: { game_id?: string };
  read: boolean;
  created_at: string;
};

const TEXTS: Record<string, { icon: string; text: string }> = {
  new_request:      { icon: '🙋', text: 'Nova prijava na tvoj termin' },
  request_approved: { icon: '✅', text: 'Odobren si za termin! Kontakt organizatora je u detaljima.' },
  request_rejected: { icon: '❌', text: 'Organizator je odbio tvoju prijavu' },
  game_full:        { icon: '🔒', text: 'Termin na koji si se prijavio je popunjen' },
  request_expired:  { icon: '⌛', text: 'Tvoja prijava je istekla' },
  player_left:      { icon: '🚶', text: 'Igrač je otkazao dolazak, mjesto je ponovo otvoreno' },
  game_cancelled:   { icon: '🚫', text: 'Organizator je otkazao termin' },
  game_updated:     { icon: '✏️', text: 'Organizator je izmijenio termin. Provjeri vrijeme i mjesto.' },
  new_game:         { icon: '📣', text: 'Novi termin za sport koji pratiš' },
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
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: '#111', paddingHorizontal: 20, paddingTop: 8 }}>Obavijesti</Text>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ padding: 20, flexGrow: 1 }}
        ListEmptyComponent={
          loading ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ fontSize: 40 }}>🔔</Text>
              <Text style={{ color: '#666', marginTop: 8 }}>Još nemaš obavijesti.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const t = TEXTS[item.type] ?? { icon: '•', text: item.type };
          return (
            <Pressable
              onPress={() => item.payload?.game_id && router.push(`/game/${item.payload.game_id}`)}
              style={{
                flexDirection: 'row', padding: 14, borderRadius: 14, marginBottom: 8,
                backgroundColor: item.read ? '#fafafa' : '#ecfdf5',
              }}
            >
              <Text style={{ fontSize: 22, marginRight: 12 }}>{t.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#111', fontWeight: item.read ? '400' : '700' }}>{t.text}</Text>
                <Text style={{ color: '#888', marginTop: 4, fontSize: 12 }}>{formatDateTime(item.created_at)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
