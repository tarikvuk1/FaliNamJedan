import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime, SPORT_EMOJI } from '../../lib/format';
import { GREEN } from '../../lib/ui';

type GameRow = {
  id: string;
  venue_name: string;
  city: string;
  starts_at: string;
  status: string;
  sport: { name: string; slug: string } | null;
};

type Item = { game: GameRow; badge: string; badgeColor: string };

export default function MyGames() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const [sections, setSections] = useState<{ title: string; data: Item[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const gameFields = 'id, venue_name, city, starts_at, status, sport:sports(name, slug)';

    const [{ data: organizing }, { data: joined }] = await Promise.all([
      supabase.from('games').select(gameFields)
        .eq('organizer_id', uid).in('status', ['open', 'full']).gte('starts_at', now)
        .order('starts_at'),
      supabase.from('join_requests').select(`status, game:games(${gameFields})`)
        .eq('player_id', uid).in('status', ['pending', 'approved']),
    ]);

    // Broj prijava na čekanju za moje oglase
    const myIds = (organizing ?? []).map((g: any) => g.id);
    const pendingCount: Record<string, number> = {};
    if (myIds.length) {
      const { data: pend } = await supabase.from('join_requests').select('game_id')
        .in('game_id', myIds).eq('status', 'pending');
      (pend ?? []).forEach((r: any) => { pendingCount[r.game_id] = (pendingCount[r.game_id] ?? 0) + 1; });
    }

    const organizingItems: Item[] = (organizing ?? []).map((g: any) => {
      const n = pendingCount[g.id] ?? 0;
      return {
        game: g,
        badge: n > 0 ? `${n} ${n === 1 ? 'nova prijava' : 'nove prijave'}` : g.status === 'full' ? 'Popunjeno' : 'Otvoreno',
        badgeColor: n > 0 ? '#ea580c' : '#888',
      };
    });

    const joinedItems: Item[] = (joined ?? [])
      .filter((r: any) => r.game && r.game.starts_at >= now && r.game.status !== 'cancelled')
      .sort((a: any, b: any) => a.game.starts_at.localeCompare(b.game.starts_at))
      .map((r: any) => ({
        game: r.game,
        badge: r.status === 'approved' ? '✅ Odobren' : '⏳ Na čekanju',
        badgeColor: r.status === 'approved' ? GREEN : '#888',
      }));

    setSections([
      { title: 'Organizujem', data: organizingItems },
      { title: 'Prijavljen sam', data: joinedItems },
    ]);
    setLoading(false);
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: '#111', paddingHorizontal: 20, paddingTop: 8 }}>Moji termini</Text>

      {loading && !sections.length ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.game.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ padding: 20 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ marginTop: 12, marginBottom: 8 }}>
              <Text style={{ color: '#888', fontWeight: '700', textTransform: 'uppercase', fontSize: 12 }}>{section.title}</Text>
              {section.data.length === 0 && (
                <Text style={{ color: '#aaa', marginTop: 8 }}>
                  {section.title === 'Organizujem' ? 'Nemaš aktivnih oglasa.' : 'Nisi prijavljen ni na jedan termin.'}
                </Text>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/game/${item.game.id}`)}
              style={({ pressed }) => ({
                borderWidth: 1, borderColor: '#eee', borderRadius: 16, padding: 16, marginBottom: 10,
                backgroundColor: pressed ? '#f0f0f0' : '#fafafa',
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>
                  {SPORT_EMOJI[item.game.sport?.slug ?? ''] ?? ''} {item.game.sport?.name}
                </Text>
                <Text style={{ color: item.badgeColor, fontWeight: '700' }}>{item.badge}</Text>
              </View>
              <Text style={{ color: '#333', marginTop: 6 }}>📍 {item.game.venue_name}, {item.game.city}</Text>
              <Text style={{ color: '#333', marginTop: 2 }}>🕒 {formatDateTime(item.game.starts_at)}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}