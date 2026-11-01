import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [email, setEmail] = useState('');
  const [sports, setSports] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
    supabase.from('sports').select('id, name').order('id').then(({ data }) => setSports(data ?? []));
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: '#111' }}>Fali nam jedan</Text>
      <Text style={{ color: '#666', marginTop: 6 }}>Prijavljen: {email}</Text>

      <Text style={{ marginTop: 24, fontWeight: '700', color: '#111' }}>Sportovi ({sports.length}):</Text>
      {sports.map((s) => (
        <Text key={s.id} style={{ color: '#444', marginTop: 4 }}>• {s.name}</Text>
      ))}

      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={{ marginTop: 32, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' }}
      >
        <Text style={{ color: '#d00', fontWeight: '600' }}>Odjavi se</Text>
      </Pressable>
    </View>
  );
}