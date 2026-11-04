import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSports } from '../lib/sports';
import { LEVELS, Level, POSITIONS, SPORT_EMOJI } from '../lib/format';
import { Chip, PrimaryButton } from '../lib/ui';
import { C, F } from '../lib/theme';
import { success, tap } from '../lib/haptics';

type Row = { level: Level; position: string | null };

// Sportovi koje igram: nivo i pozicija po sportu.
// Organizator to vidi uz tvoju prijavu ("Golman · Srednji").
export function MySportsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const uid = session!.user.id;
  const sports = useSports();
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    supabase.from('user_sports').select('sport_id, level, position').eq('user_id', uid).then(({ data }) => {
      const map: Record<number, Row> = {};
      (data ?? []).forEach((r: any) => { map[r.sport_id] = { level: r.level, position: r.position }; });
      setRows(map);
      setLoading(false);
    });
  }, [visible]);

  function toggle(id: number) {
    tap();
    setRows((r) => {
      const next = { ...r };
      if (next[id]) delete next[id]; else next[id] = { level: 'any', position: null };
      return next;
    });
  }

  const set = (id: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  async function save() {
    setSaving(true);
    const keep = Object.keys(rows).map(Number);
    const del = supabase.from('user_sports').delete().eq('user_id', uid);
    const { error: e1 } = keep.length ? await del.not('sport_id', 'in', `(${keep.join(',')})`) : await del;
    const { error: e2 } = keep.length
      ? await supabase.from('user_sports').upsert(keep.map((sport_id) => ({ user_id: uid, sport_id, level: rows[sport_id].level, position: rows[sport_id].position })))
      : { error: null };
    setSaving(false);
    if (e1 || e2) return Alert.alert('Greška', (e1 ?? e2)!.message);
    success();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 22, fontFamily: F.bold, color: C.text }}>Moji sportovi</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
          </Pressable>
        </View>
        <Text style={{ color: C.muted, marginTop: 6, lineHeight: 21 }}>
          Izaberi šta igraš, na kom nivou i na kojoj poziciji. Organizator to vidi uz tvoju prijavu, pa lakše odluči.
        </Text>

        {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} /> : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 }}>
              {sports.map((s) => (
                <Chip key={s.id} label={`${SPORT_EMOJI[s.slug] ?? ''} ${s.name}`} active={!!rows[s.id]} onPress={() => toggle(s.id)} />
              ))}
            </View>

            {sports.filter((s) => rows[s.id]).map((s) => (
              <View key={s.id} style={{ backgroundColor: C.card, borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1, borderColor: C.line }}>
                <Text style={{ color: C.text, fontFamily: F.semi, fontSize: 16 }}>{SPORT_EMOJI[s.slug] ?? ''} {s.name}</Text>
                <Text style={{ color: C.muted, marginTop: 10, marginBottom: 6, fontWeight: '600' }}>Nivo</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(Object.keys(LEVELS) as Level[]).map((l) => (
                    <Chip key={l} label={l === 'any' ? 'Ne znam' : LEVELS[l]} active={rows[s.id].level === l} onPress={() => set(s.id, { level: l })} />
                  ))}
                </View>
                {!!POSITIONS[s.slug]?.length && (
                  <>
                    <Text style={{ color: C.muted, marginTop: 6, marginBottom: 6, fontWeight: '600' }}>Pozicija</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      <Chip label="Bilo koja" active={!rows[s.id].position} onPress={() => set(s.id, { position: null })} />
                      {POSITIONS[s.slug].map((pos) => (
                        <Chip key={pos} label={pos} active={rows[s.id].position === pos} onPress={() => set(s.id, { position: pos })} />
                      ))}
                    </View>
                  </>
                )}
              </View>
            ))}

            <PrimaryButton label="Sačuvaj" onPress={save} loading={saving} style={{ marginTop: 20 }} />
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
