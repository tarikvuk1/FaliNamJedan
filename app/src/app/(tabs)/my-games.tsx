import { useCallback, useState } from 'react';
import { ActivityIndicator, SectionList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { C } from '../../lib/theme';
import { ScreenTitle } from '../../lib/ui';
import { tap } from '../../lib/haptics';
import { EmptyState, GameCard } from '../../components/Visuals';
import { useChatUnread } from '../../lib/unread';

type GameRow = {
  id: string;
  venue_name: string;
  city: string;
  starts_at: string;
  status: string;
  sport: { name: string; slug: string } | null;
};

type Item = { game: GameRow; badge: string; badgeColor: string; past?: boolean };

const EMPTY: Record<string, string> = {
  'Organizujem': 'Nemaš aktivnih oglasa.',
  'Prijavljen sam': 'Nisi prijavljen ni na jedan termin.',
  'Odigrani termini': 'Još nema odigranih termina.',
};

export default function MyGames() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const chat = useChatUnread(uid);
  const [sections, setSections] = useState<{ title: string; data: Item[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(); // historija: zadnjih 60 dana
    const gameFields = 'id, venue_name, city, starts_at, status, sport:sports(name, slug)';

    const [{ data: organizing }, { data: joined }, { data: organizedPast }] = await Promise.all([
      supabase.from('games').select(gameFields)
        .eq('organizer_id', uid).in('status', ['open', 'full']).gte('starts_at', now)
        .order('starts_at'),
      supabase.from('join_requests').select(`status, game:games(${gameFields})`)
        .eq('player_id', uid).in('status', ['pending', 'approved']),
      supabase.from('games').select(gameFields)
        .eq('organizer_id', uid).neq('status', 'cancelled').lt('starts_at', now).gte('starts_at', since)
        .order('starts_at', { ascending: false }).limit(20),
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
        badgeColor: n > 0 ? C.warn : C.muted,
      };
    });

    const joinedRows = (joined ?? []).filter((r: any) => r.game && r.game.status !== 'cancelled');

    const joinedItems: Item[] = joinedRows
      .filter((r: any) => r.game.starts_at >= now)
      .sort((a: any, b: any) => a.game.starts_at.localeCompare(b.game.starts_at))
      .map((r: any) => ({
        game: r.game,
        badge: r.status === 'approved' ? 'Odobren' : 'Na čekanju',
        badgeColor: r.status === 'approved' ? C.accent : C.muted,
      }));

    // Historija: termini koje sam organizovao + oni na kojima sam bio odobren
    const pastItems: Item[] = [
      ...(organizedPast ?? []).map((g: any) => ({ game: g, badge: 'Organizator', badgeColor: C.muted, past: true })),
      ...joinedRows
        .filter((r: any) => r.status === 'approved' && r.game.starts_at < now && r.game.starts_at >= since)
        .map((r: any) => ({ game: r.game, badge: 'Igrač', badgeColor: C.muted, past: true })),
    ].sort((a, b) => b.game.starts_at.localeCompare(a.game.starts_at));

    setSections([
      { title: 'Organizujem', data: organizingItems },
      { title: 'Prijavljen sam', data: joinedItems },
      { title: 'Odigrani termini', data: pastItems },
    ]);
    setLoading(false);
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nothing = !loading && sections.every((sec) => sec.data.length === 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 }}>
        <ScreenTitle>Moji termini</ScreenTitle>
      </View>

      {loading && !sections.length ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : nothing ? (
        <EmptyState
          icon="📅"
          title="Još nemaš termina"
          text="Objavi svoj termin ili se prijavi na neki s oglasne ploče."
          action={{ label: 'Pogledaj oglase', onPress: () => router.navigate('/') }}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.past ? 'p' : 'a'}-${item.badge}-${item.game.id}`}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ marginTop: 14, marginBottom: 10 }}>
              <Text style={{ color: C.muted, fontWeight: '700', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.6 }}>{section.title}</Text>
              {section.data.length === 0 && (
                <Text style={{ color: C.faint, marginTop: 8 }}>{EMPTY[section.title]}</Text>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <GameCard
              sportSlug={item.game.sport?.slug}
              sportName={item.game.sport?.name}
              venue={item.game.venue_name}
              city={item.game.city}
              startsAt={item.game.starts_at}
              badge={!item.past && chat.byGame[item.game.id]
                ? { text: `💬 ${chat.byGame[item.game.id]} ${chat.byGame[item.game.id] === 1 ? 'nova poruka' : 'nove poruke'}`, color: C.accent }
                : { text: item.badge, color: item.badgeColor }}
              dimmed={item.past}
              onPress={() => { tap(); router.push(`/game/${item.game.id}`); }}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
