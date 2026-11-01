import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [status, setStatus] = useState('Povezujem...');

  useEffect(() => {
    supabase
      .from('sports')
      .select('id')
      .then(({ data, error }) => {
        if (error) setStatus('Greška: ' + error.message);
        else setStatus(`Povezano ✅  Vidljivih sportova: ${data.length}`);
      });
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 26, fontWeight: '700', color: '#111' }}>Fali nam jedan</Text>
      <Text style={{ marginTop: 12, color: '#444' }}>{status}</Text>
    </View>
  );
}