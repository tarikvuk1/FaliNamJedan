import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Prikaži notifikaciju i kad je aplikacija otvorena
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let currentToken: string | null = null;

export async function registerForPush() {
  if (!Device.isDevice) return; // simulator ne prima push

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Obavijesti',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Nema EAS projectId. Pokreni: npx eas-cli init');
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = token;
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch (e) {
    console.warn('Push registracija nije uspjela:', e);
  }
}

export async function unregisterPush() {
  if (currentToken) {
    await supabase.rpc('unregister_push_token', { p_token: currentToken });
  }
  currentToken = null;
}