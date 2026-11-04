import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CITIES, normalizeText } from '../lib/cities';
import { C } from '../lib/theme';

// Polje koje prikazuje izabrani grad i otvara listu
export function CityField({ value, onChange, allowAll, style }: {
  value: string | null;
  onChange: (city: string | null) => void;
  allowAll?: boolean;
  style?: object;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[{
          height: 50, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14,
          paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
        }, style]}
      >
        <Ionicons name="location-outline" size={18} color={C.muted} style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontSize: 16, color: value ? C.text : C.faint }}>
          {value ?? (allowAll ? 'Svi gradovi' : 'Izaberi grad')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </Pressable>
      <CityPicker
        visible={open}
        value={value}
        allowAll={allowAll}
        onClose={() => setOpen(false)}
        onSelect={(c) => { onChange(c); setOpen(false); }}
      />
    </>
  );
}

function CityPicker({ visible, value, allowAll, onClose, onSelect }: {
  visible: boolean;
  value: string | null;
  allowAll?: boolean;
  onClose: () => void;
  onSelect: (city: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = normalizeText(query);
    return q ? CITIES.filter((c) => normalizeText(c).includes(q)) : CITIES;
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: C.text }}>Izaberi grad</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: C.accent, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Pretraži..."
          placeholderTextColor={C.faint}
          autoCorrect={false}
          keyboardAppearance="dark"
          style={{ marginHorizontal: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, fontSize: 16, color: C.text }}
        />

        <FlatList
          data={results}
          keyExtractor={(c) => c}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: 8 }}
          ListHeaderComponent={allowAll && !query ? (
            <Row label="Svi gradovi" active={value === null} onPress={() => onSelect(null)} />
          ) : undefined}
          renderItem={({ item }) => (
            <Row label={item} active={value === item} onPress={() => onSelect(item)} />
          )}
          ListEmptyComponent={<Text style={{ color: C.muted, padding: 20 }}>Nema rezultata.</Text>}
        />
      </View>
    </Modal>
  );
}

function Row({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.line,
        flexDirection: 'row', justifyContent: 'space-between', backgroundColor: pressed ? C.card : 'transparent',
      })}
    >
      <Text style={{ fontSize: 16, color: active ? C.accent : C.text, fontWeight: active ? '700' : '400' }}>{label}</Text>
      {active && <Ionicons name="checkmark" size={20} color={C.accent} />}
    </Pressable>
  );
}
