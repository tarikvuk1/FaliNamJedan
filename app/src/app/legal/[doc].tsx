import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LEGAL } from '../../lib/legal';
import { GREEN } from '../../lib/ui';

// Prikaz pravnog dokumenta: /legal/privacy ili /legal/terms
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = LEGAL[doc === 'terms' ? 'terms' : 'privacy'];

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack.Screen options={{ title: d.title }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {d.body.split('\n').map((line, i) => <Line key={i} line={line} />)}
        <Pressable onPress={() => Linking.openURL(d.url)} style={{ marginTop: 24 }}>
          <Text style={{ color: GREEN, fontWeight: '600' }}>Otvori u browseru →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// Jednostavan prikaz: # naslov, ## podnaslov, - stavka, **podebljano**
function Line({ line }: { line: string }) {
  if (!line.trim()) return null;
  if (line.startsWith('# ')) return null; // naslov je već u zaglavlju ekrana
  if (line.startsWith('## ')) {
    return <Text style={{ fontSize: 18, fontWeight: '800', color: '#111', marginTop: 24, marginBottom: 6 }}>{line.slice(3)}</Text>;
  }
  if (line.startsWith('- ')) {
    return (
      <View style={{ flexDirection: 'row', marginTop: 6, paddingRight: 8 }}>
        <Text style={{ color: '#333', width: 16 }}>•</Text>
        <Rich text={line.slice(2)} />
      </View>
    );
  }
  if (line.startsWith('Važi od:')) return <Text style={{ color: '#888', marginBottom: 8 }}>{line}</Text>;
  return <View style={{ marginTop: 8 }}><Rich text={line} /></View>;
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return (
    <Text style={{ flex: 1, color: '#333', fontSize: 15, lineHeight: 22 }}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <Text key={i} style={{ fontWeight: '700', color: '#111' }}>{p.slice(2, -2)}</Text>
          : p,
      )}
    </Text>
  );
}
