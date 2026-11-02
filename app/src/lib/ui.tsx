import { Pressable, Text } from 'react-native';

export const GREEN = '#16a34a';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, marginRight: 8, marginBottom: 8,
        backgroundColor: active ? GREEN : '#f1f1f1',
      }}
    >
      <Text style={{ color: active ? '#fff' : '#333', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}