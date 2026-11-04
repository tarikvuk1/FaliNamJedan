import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { completeSessionFromUrl } from '../lib/social-auth';

// Na Androidu se nakon Google prijave aplikacija ponekad otvori na ovoj adresi.
// Ako adresa sadrži tokene, napravi sesiju, pa idi na početni ekran.
export default function AuthCallback() {
  const url = Linking.useURL();

  useEffect(() => {
    (async () => {
      if (url && (url.includes('access_token') || url.includes('code='))) {
        try { await completeSessionFromUrl(url); } catch {}
      }
      router.replace('/');
    })();
  }, [url]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0C0B' }}>
      <ActivityIndicator color="#22C55E" />
    </View>
  );
}
