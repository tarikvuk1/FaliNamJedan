import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootStack />
    </AuthProvider>
  );
}

function RootStack() {
  const { session, onboarded, loading } = useAuth();

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

      <Stack.Protected guard={!!session && onboarded}>
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
    </Stack>
  );
}