import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSports } from '../lib/sports';
import { formatTime, shortDay, SPORT_EMOJI } from '../lib/format';
import { Chip, PrimaryButton } from '../lib/ui';
import { C, F } from '../lib/theme';
import { success, tap } from '../lib/haptics';
import { CityField } from './CityPicker';

type Slot = { id: string; sport_id: number; city: string; available_from: string; available_to: string };
type Preset = { key: string; label: string; from: Date; to: Date };

function at(base: Date, dayOffset: number, hour: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// Brzi izbor vremena, računa se od trenutnog vremena
function presets(): Preset[] {
  const now = new Date();
  const list: Preset[] = [];
  const tonightEnd = at(now, 0, 23);
  if (tonightEnd.getTime() - now.getTime() > 60 * 60 * 1000) {
    list.push({ key: 'now', label: 'Od sad do 23h', from: now, to: tonightEnd });
  } else {
    list.push({ key: 'now', label: 'Sljedeća 3 sata', from: now, to: new Date(now.getTime() + 3 * 3600 * 1000) });
  }
  if (now.getHours() < 17) list.push({ key: 'eve', label: 'Večeras 18–23h', from: at(now, 0, 18), to: tonightEnd });
  list.push({ key: 'tmr', label: 'Sutra 17–23h', from: at(now, 1, 17), to: at(now, 1, 23) });
  list.push({ key: 'tmrday', label: 'Sutra 9–16h', from: at(now, 1, 9), to: at(now, 1, 16) });
  // Najbliža subota (ako je danas subota, sljedeća)
  const toSat = ((6 - now.getDay() + 7) % 7) || 7;
  list.push({ key: 'sat', label: `Subota ${at(now, toSat, 10).getDate()}.${at(now, toSat, 10).getMonth() + 1}. 10–20h`, from: at(now, toSat, 10), to: at(now, toSat, 20) });
  return list;
}

// "Slobodan sam": igrač javi kad može igrati. Organizatori ga tada mogu pozvati,
// a on dobija obavijest kad se pojavi termin baš u to vrijeme.
export function AvailabilityModal({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged?: () => void }) {
  const { session } = useAuth();
  const uid = session!.user.id;
  const sports = useSports();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<number[]>([]);
  const [city, setCity] = useState<string | null>('Sarajevo');
  const [presetKey, setPresetKey] = useState('now');
  const [saving, setSaving] = useState(false);
  const options = presets();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('availability')
      .select('id, sport_id, city, available_from, available_to')
      .eq('user_id', uid).gt('available_to', new Date().toISOString())
      .order('available_from');
    setSlots(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!visible) return;
    load();
    // Grad iz profila kao početni izbor
    supabase.from('profiles').select('city').eq('id', uid).single().then(({ data }) => { if (data?.city) setCity(data.city); });
  }, [visible]);

  async function save() {
    if (!picked.length) return Alert.alert('Izaberi bar jedan sport.');
    if (!city) return Alert.alert('Izaberi grad.');
    const p = options.find((o) => o.key === presetKey) ?? options[0];
    setSaving(true);
    const rows = picked.map((sport_id) => ({
      user_id: uid, sport_id, city, available_from: p.from.toISOString(), available_to: p.to.toISOString(),
    }));
    const { error } = await supabase.from('availability').insert(rows);
    setSaving(false);
    if (error) return Alert.alert('Greška', error.message);
    success();
    setPicked([]);
    load();
    onChanged?.();
  }

  async function remove(id: string) {
    tap();
    const { error } = await supabase.from('availability').delete().eq('id', id);
    if (error) return Alert.alert('Greška', error.message);
    load();
    onChanged?.();
  }

  const sportLabel = (id: number) => {
    const s = sports.find((x) => x.id === id);
    return s ? `${SPORT_EMOJI[s.slug] ?? ''} ${s.name}` : '';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 22, fontFamily: F.bold, color: C.text }}>🙋 Slobodan sam</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.muted, marginTop: 6, lineHeight: 21 }}>
          Javi kad možeš igrati. Organizatori kojima fali igrač mogu te pozvati, a ti dobijaš obavijest čim se pojavi termin baš u to vrijeme.
        </Text>

        <Text style={{ fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 8 }}>Trenutno</Text>
        {loading ? <ActivityIndicator color={C.accent} style={{ alignSelf: 'flex-start' }} /> : slots.length === 0 ? (
          <Text style={{ color: C.faint }}>Nisi označen kao slobodan.</Text>
        ) : slots.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.accentSoft, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>{sportLabel(s.sport_id)} · {s.city}</Text>
              <Text style={{ color: C.text2, marginTop: 2 }}>
                {shortDay(s.available_from)} {formatTime(s.available_from)}–{formatTime(s.available_to)}
              </Text>
            </View>
            <Pressable onPress={() => remove(s.id)} hitSlop={8}>
              <Text style={{ color: C.danger, fontWeight: '600' }}>Ukloni</Text>
            </Pressable>
          </View>
        ))}

        <Text style={{ fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 8 }}>Šta igraš?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sports.map((s) => (
            <Chip
              key={s.id}
              label={`${SPORT_EMOJI[s.slug] ?? ''} ${s.name}`}
              active={picked.includes(s.id)}
              onPress={() => { tap(); setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])); }}
            />
          ))}
        </View>

        <Text style={{ fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 8 }}>Kad?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {options.map((o) => (
            <Chip key={o.key} label={o.label} active={presetKey === o.key} onPress={() => { tap(); setPresetKey(o.key); }} />
          ))}
        </View>

        <Text style={{ fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 8 }}>Gdje?</Text>
        <CityField value={city} onChange={setCity} />

        <PrimaryButton label="Označi da sam slobodan" onPress={save} loading={saving} style={{ marginTop: 20 }} />
        <Text style={{ color: C.faint, marginTop: 10, fontSize: 13, lineHeight: 19 }}>
          Ovo vide samo organizatori termina u tom sportu, gradu i vremenu. Oznaka sama nestaje kad vrijeme prođe.
        </Text>
      </ScrollView>
    </Modal>
  );
}
