import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useFonts, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { AuthProvider, useAuth } from '../lib/auth';
import { registerForPush } from '../lib/push';
import { C, F } from '../lib/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootStack />
    </AuthProvider>
  );
}

function RootStack() {
  const { session, onboarded, loading } = useAuth();
  const [fontsLoaded] = useFonts({ Poppins_600SemiBold, Poppins_700Bold });
  const ready = !!session && onboarded;

  // Kad je korisnik prijavljen i ima profil: registruj telefon za push
  useEffect(() => {
    if (ready) registerForPush();
  }, [ready, session?.user.id]);

  // Klik na notifikaciju otvara termin
  useEffect(() => {
    if (!ready) return;

    const openGame = (data: any) => {
      if (data?.game_id) router.push(`/game/${data.game_id}`);
    };

    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) openGame(r.notification.request.content.data);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      openGame(r.notification.request.content.data);
    });
    return () => sub.remove();
  }, [ready]);

  if (loading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.bg },
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        headerTitleStyle: { fontFamily: F.semi, color: C.text },
        headerShadowVisible: false,
        headerBackTitle: 'Nazad',
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="create" options={{ headerShown: true, title: 'Novi oglas' }} />
        <Stack.Screen name="game/[id]" options={{ headerShown: true, title: '' }} />
      </Stack.Protected>

      {/* Pravni dokumenti su dostupni svima, i prije prijave */}
      <Stack.Screen name="legal/[doc]" options={{ headerShown: true, title: '' }} />
    </Stack>
  );
}
