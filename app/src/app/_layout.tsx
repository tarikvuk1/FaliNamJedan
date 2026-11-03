import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../lib/auth';
import { registerForPush } from '../lib/push';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootStack />
    </AuthProvider>
  );
}

function RootStack() {
  const { session, onboarded, loading } = useAuth();
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

    // Aplikacija je bila potpuno zatvorena, pa je otvorena klikom na notifikaciju
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) openGame(r.notification.request.content.data);
    });

    // Aplikacija je bila otvorena ili u pozadini
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      openGame(r.notification.request.content.data);
    });
    return () => sub.remove();
  }, [ready]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>

      <Stack.Protected guard={!!session && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="create"
          options={{ headerShown: true, title: 'Novi oglas', headerBackTitle: 'Nazad' }}
        />
        <Stack.Screen
          name="game/[id]"
          options={{ headerShown: true, title: 'Termin', headerBackTitle: 'Nazad' }}
        />
      </Stack.Protected>

      {/* Pravni dokumenti su dostupni svima, i prije prijave */}
      <Stack.Screen
        name="legal/[doc]"
        options={{ headerShown: true, title: '', headerBackTitle: 'Nazad' }}
      />
    </Stack>
  );
}
