import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GREEN } from '../../lib/ui';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GREEN,
        tabBarInactiveTintColor: '#999',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oglasi',
          tabBarIcon: ({ color, size }) => <Ionicons name="football-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my-games"
        options={{
          title: 'Moji termini',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Obavijesti',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}