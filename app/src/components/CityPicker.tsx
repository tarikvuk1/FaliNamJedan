import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CITIES, normalizeText } from '../lib/cities';
import { GREEN } from '../lib/ui';

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
        style={[{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between' }, style]}
      >
        <Text style={{ fontSize: 16, color: value ? '#111' : '#999' }}>
          {value ?? (allowAll ? 'Svi gradovi' : 'Izaberi grad')}
        </Text>
        <Text style={{ color: '#999' }}>▾</Text>
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
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#111' }}>Izaberi grad</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Pretraži..."
          placeholderTextColor="#999"
          autoCorrect={false}
          style={{ marginHorizontal: 20, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, fontSize: 16, color: '#111' }}
        />

        <FlatList
          data={results}
          keyExtractor={(c) => c}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          ListHeaderComponent={allowAll && !query ? (
            <Row label="Svi gradovi" active={value === null} onPress={() => onSelect(null)} />
          ) : undefined }
          renderItem={({ item }) => (
            <Row label={item} active={value === item} onPress={() => onSelect(item)} />
          )}
          ListEmptyComponent={<Text style={{ color: '#666', padding: 20 }}>Nema rezultata.</Text>}
        />
      </View>
    </Modal>
  );
}

function Row({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f1f1f1', flexDirection: 'row', justifyContent: 'space-between' }}
    >
      <Text style={{ fontSize: 16, color: '#111', fontWeight: active ? '700' : '400' }}>{label}</Text>
      {active && <Text style={{ color: GREEN, fontWeight: '700' }}>✓</Text>}
    </Pressable>
  );
}