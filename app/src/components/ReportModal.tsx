import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Chip, GREEN } from '../lib/ui';
import { C } from '../lib/theme';

const REASONS: { key: string; label: string }[] = [
  { key: 'no_show', label: 'Nije došao' },
  { key: 'abuse', label: 'Uvredljivo ponašanje' },
  { key: 'fake', label: 'Lažan profil' },
  { key: 'spam', label: 'Spam ili lažni oglas' },
  { key: 'other', label: 'Drugo' },
];

export type ReportTarget = { id: string; name: string };

// Prijava korisnika (uz opciju blokiranja)
export function ReportModal({ target, gameId, onClose, onBlocked }: {
  target: ReportTarget | null;   // null = zatvoreno
  gameId?: string;
  onClose: () => void;
  onBlocked?: () => void;        // poziva se nakon blokiranja
}) {
  const { session } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) { setReason(null); setDetails(''); setAlsoBlock(true); }
  }, [target]);

  if (!target) return null;

  async function block() {
    const { error } = await supabase.rpc('block_user', { p_user_id: target!.id });
    if (error) throw error;
  }

  async function sendReport() {
    if (!reason) return Alert.alert('Izaberi razlog prijave.');
    setBusy(true);
    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: session!.user.id,
        reported_id: target!.id,
        game_id: gameId ?? null,
        reason,
        details: details.trim() || null,
      });
      if (error) throw error;
      if (alsoBlock) await block();
      setBusy(false);
      onClose();
      Alert.alert('Hvala', alsoBlock ? 'Prijava je poslana i korisnik je blokiran.' : 'Prijava je poslana.');
      if (alsoBlock) onBlocked?.();
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Greška', e.message);
    }
  }

  function blockOnly() {
    Alert.alert(
      `Blokirati: ${target!.name}?`,
      'Nećete vidjeti oglase jedno drugog i nećete se moći prijavljivati na termine jedno drugog.',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Blokiraj',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await block();
              setBusy(false);
              onClose();
              onBlocked?.();
            } catch (e: any) {
              setBusy(false);
              Alert.alert('Greška', e.message);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text }}>Prijavi korisnika</Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
            </Pressable>
          </View>
          <Text style={{ color: C.muted, marginTop: 6 }}>{target.name}</Text>

          <Text style={{ fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 8 }}>Razlog</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {REASONS.map((r) => (
              <Chip key={r.key} label={r.label} active={reason === r.key} onPress={() => setReason(r.key)} />
            ))}
          </View>

          <Text style={{ fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 8 }}>Detalji (neobavezno)</Text>
          <TextInput keyboardAppearance="dark"
            value={details}
            onChangeText={setDetails}
            placeholder="Šta se desilo?"
            placeholderTextColor={C.faint}
            multiline
            maxLength={500}
            style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, fontSize: 16, color: C.text, minHeight: 100, textAlignVertical: 'top' }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
            <Text style={{ flex: 1, color: C.text }}>Blokiraj i ovog korisnika</Text>
            <Switch value={alsoBlock} onValueChange={setAlsoBlock} />
          </View>

          <Pressable
            onPress={sendReport}
            disabled={busy}
            style={{ backgroundColor: C.danger, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ color: C.onAccent, fontSize: 16, fontWeight: '700' }}>Pošalji prijavu</Text>}
          </Pressable>

          <Pressable onPress={blockOnly} disabled={busy} style={{ alignItems: 'center', marginTop: 16, padding: 8 }}>
            <Text style={{ color: C.muted, textDecorationLine: 'underline' }}>Samo blokiraj, bez prijave</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Lista blokiranih korisnika (iz Profila), s odblokiranjem
export function BlockedUsersModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('blocks')
      .select('blocked_id, profile:profiles!blocks_blocked_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false });
    setItems((data ?? []).map((b: any) => ({
      id: b.blocked_id,
      name: [b.profile?.first_name, b.profile?.last_name].filter(Boolean).join(' ') || 'Nepoznato',
    })));
    setLoading(false);
  }

  useEffect(() => { if (visible) load(); }, [visible]);

  async function unblock(id: string) {
    const { error } = await supabase.rpc('unblock_user', { p_user_id: id });
    if (error) return Alert.alert('Greška', error.message);
    load();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text }}>Blokirani korisnici</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            ListEmptyComponent={<Text style={{ color: C.muted, marginTop: 12 }}>Nisi blokirao nikoga.</Text>}
            renderItem={({ item }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ flex: 1, fontSize: 16, color: C.text }}>{item.name}</Text>
                <Pressable onPress={() => unblock(item.id)}>
                  <Text style={{ color: GREEN, fontWeight: '700' }}>Odblokiraj</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
