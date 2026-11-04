import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSports } from '../lib/sports';
import { SPORT_EMOJI } from '../lib/format';
import { Chip, GREEN } from '../lib/ui';
import { CityField } from './CityPicker';
import { C } from '../lib/theme';

type Follow = { sport_id: number; city: string };

// Upravljanje praćenjem: "javi mi kad se pojavi novi termin za ovaj sport u ovom gradu"
export function FollowsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const uid = session!.user.id;
  const sports = useSports();

  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sportId, setSportId] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>('Sarajevo');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('follows').select('sport_id, city').eq('user_id', uid);
    setFollows(data ?? []);
    setLoading(false);
  }

  useEffect(() => { if (visible) load(); }, [visible]);

  async function add() {
    if (!sportId || !city) return Alert.alert('Izaberi sport i grad.');
    setSaving(true);
    const { error } = await supabase
      .from('follows')
      .upsert({ user_id: uid, sport_id: sportId, city }, { ignoreDuplicates: true });
    setSaving(false);
    if (error) return Alert.alert('Greška', error.message);
    setSportId(null);
    load();
  }

  async function remove(f: Follow) {
    const { error } = await supabase.from('follows').delete()
      .eq('user_id', uid).eq('sport_id', f.sport_id).eq('city', f.city);
    if (error) return Alert.alert('Greška', error.message);
    load();
  }

  const sportName = (id: number) => {
    const s = sports.find((x) => x.id === id);
    return s ? `${SPORT_EMOJI[s.slug] ?? ''} ${s.name}` : '';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text }}>Praćenje</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.muted, marginTop: 6 }}>
          Dobit ćeš obavijest čim neko objavi novi termin za sport i grad koji pratiš.
        </Text>

        {/* Trenutna praćenja */}
        <Text style={{ fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 8 }}>Pratiš</Text>
        {loading ? <ActivityIndicator style={{ alignSelf: 'flex-start' }} /> : follows.length === 0 ? (
          <Text style={{ color: C.faint }}>Još ništa ne pratiš.</Text>
        ) : follows.map((f) => (
          <View key={`${f.sport_id}-${f.city}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ flex: 1, fontSize: 16, color: C.text }}>{sportName(f.sport_id)} · {f.city}</Text>
            <Pressable onPress={() => remove(f)} hitSlop={8}>
              <Text style={{ color: C.danger, fontWeight: '600' }}>Ukloni</Text>
            </Pressable>
          </View>
        ))}

        {/* Dodaj novo */}
        <Text style={{ fontWeight: '700', color: C.text, marginTop: 28, marginBottom: 8 }}>Dodaj praćenje</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sports.map((s) => (
            <Chip key={s.id} label={`${SPORT_EMOJI[s.slug] ?? ''} ${s.name}`} active={sportId === s.id} onPress={() => setSportId(s.id)} />
          ))}
        </View>
        <View style={{ marginTop: 8 }}>
          <CityField value={city} onChange={setCity} />
        </View>
        <Pressable
          onPress={add}
          disabled={saving}
          style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ color: C.onAccent, fontSize: 16, fontWeight: '700' }}>🔔 Prati</Text>}
        </Pressable>
      </ScrollView>
    </Modal>
  );
}
