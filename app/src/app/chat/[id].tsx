import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatTime } from '../../lib/format';
import { C, F } from '../../lib/theme';
import { tap, warning } from '../../lib/haptics';
import { refreshUnread } from '../../lib/unread';
import { Avatar } from '../../components/Visuals';

type Msg = { id: number; user_id: string; body: string; created_at: string };
type Name = { first_name: string | null; last_name: string | null };

const fullName = (p?: Name | null) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Igrač';

// Chat termina: organizator i odobreni igrači
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session!.user.id;
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('Chat');
  const [sub, setSub] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, Name>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const namesRef = useRef(names);
  namesRef.current = names;

  // Imena autora koje još nemamo
  const ensureNames = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((x) => !namesRef.current[x]);
    if (!missing.length) return;
    const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', missing);
    const add: Record<string, Name> = {};
    (data ?? []).forEach((p: any) => { add[p.id] = p; });
    setNames((n) => ({ ...n, ...add }));
  }, []);

  // Dok je chat otvoren, sve poruke su pročitane
  const markRead = useCallback(async () => {
    await supabase.rpc('mark_chat_read', { p_game_id: id });
    refreshUnread();
  }, [id]);

  const addMessage = useCallback((m: Msg) => {
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [m, ...list]));
    ensureNames([m.user_id]);
    if (m.user_id !== uid) markRead();
  }, [ensureNames, markRead, uid]);

  useEffect(() => {
    (async () => {
      const [{ data: g }, { data: req }] = await Promise.all([
        supabase.from('games').select('organizer_id, venue_name, starts_at').eq('id', id).maybeSingle(),
        supabase.from('join_requests').select('status').eq('game_id', id).eq('player_id', uid).maybeSingle(),
      ]);
      if (!g) { setAllowed(false); return; }
      setTitle(g.venue_name);
      setSub(formatDateTime(g.starts_at));
      const ok = g.organizer_id === uid || req?.status === 'approved';
      setAllowed(ok);
      if (!ok) return;

      const { data } = await supabase.from('game_messages')
        .select('id, user_id, body, created_at')
        .eq('game_id', id)
        .order('created_at', { ascending: false })
        .limit(200);
      const list = (data ?? []) as Msg[];
      setMessages(list);
      ensureNames([g.organizer_id, ...list.map((m) => m.user_id)]);
      markRead();
    })();
  }, [id, uid]);

  // Nove poruke stižu uživo
  useEffect(() => {
    if (!allowed) return;
    const channel = supabase
      .channel(`chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_messages', filter: `game_id=eq.${id}` },
        (payload) => addMessage(payload.new as Msg))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allowed, id, addMessage]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    tap();
    setSending(true);
    setError('');
    const { data, error } = await supabase.from('game_messages')
      .insert({ game_id: id, user_id: uid, body })
      .select('id, user_id, body, created_at')
      .single();
    setSending(false);
    if (error) { warning(); return setError(error.message); }
    setText('');
    if (data) addMessage(data as Msg);
  }

  if (allowed === null) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  }
  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
        <Stack.Screen options={{ title: 'Chat' }} />
        <Text style={{ color: C.muted, textAlign: 'center', lineHeight: 22 }}>
          Chat vide samo organizator i odobreni igrači ovog termina.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <Stack.Screen options={{ title, headerTitle: () => (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: C.text, fontFamily: F.semi, fontSize: 16 }} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text>}
        </View>
      ) }} />

      <FlatList
        data={messages}
        inverted
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 30, transform: [{ scaleY: -1 }] }}>
            <Text style={{ fontSize: 34 }}>💬</Text>
            <Text style={{ color: C.text, fontFamily: F.bold, marginTop: 10 }}>Dogovorite se ovdje</Text>
            <Text style={{ color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Ko nosi loptu, koje boje majice, gdje se nalazite… Poruke vide samo igrači ovog termina.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const mine = item.user_id === uid;
          const older = messages[index + 1];
          const showName = !mine && (!older || older.user_id !== item.user_id);
          const name = fullName(names[item.user_id]);
          return (
            <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: showName ? 10 : 3 }}>
              {!mine && (
                <View style={{ width: 34, marginRight: 8, justifyContent: 'flex-end' }}>
                  {showName && <Avatar name={name} size={30} />}
                </View>
              )}
              <View style={{
                maxWidth: '76%', borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12,
                backgroundColor: mine ? C.accent : C.card, borderWidth: mine ? 0 : 1, borderColor: C.line,
                borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6,
              }}>
                {showName && <Text style={{ color: C.accent, fontWeight: '700', fontSize: 12, marginBottom: 2 }}>{name}</Text>}
                <Text style={{ color: mine ? C.onAccent : C.text, fontSize: 15, lineHeight: 20 }}>{item.body}</Text>
                <Text style={{ color: mine ? 'rgba(10,12,11,0.6)' : C.faint, fontSize: 10, marginTop: 2, alignSelf: 'flex-end' }}>
                  {formatTime(item.created_at)}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {!!error && <Text style={{ color: C.danger, paddingHorizontal: 16, paddingBottom: 6 }}>{error}</Text>}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 8,
        paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg,
      }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Poruka…"
          placeholderTextColor={C.faint}
          keyboardAppearance="dark"
          multiline
          maxLength={500}
          style={{
            flex: 1, maxHeight: 120, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
            borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16, color: C.text,
          }}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          accessibilityLabel="Pošalji"
          style={{
            width: 42, height: 42, borderRadius: 21, marginLeft: 8, alignItems: 'center', justifyContent: 'center',
            backgroundColor: text.trim() ? C.accent : C.card2,
          }}
        >
          {sending ? <ActivityIndicator color={C.onAccent} size="small" /> : <Ionicons name="arrow-up" size={22} color={text.trim() ? C.onAccent : C.faint} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
