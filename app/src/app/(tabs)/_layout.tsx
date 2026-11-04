import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { useChatUnread, useUnreadCount } from '../../lib/unread';
import { C } from '../../lib/theme';
import { tap } from '../../lib/haptics';

export default function TabsLayout() {
  const { session } = useAuth();
  const unread = useUnreadCount(session?.user.id);
  const chat = useChatUnread(session?.user.id);

  return (
    <Tabs
      screenListeners={{ tabPress: () => tap() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.faint,
        tabBarStyle: { backgroundColor: C.bg, borderTopColor: C.line },
        tabBarLabelStyle: { fontWeight: '600' },
        tabBarBadgeStyle: { backgroundColor: C.accent, color: C.onAccent, fontWeight: '700' },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Oglasi',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'football' : 'football-outline'} color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my-games"
        options={{
          title: 'Moji termini',
          tabBarBadge: chat.total > 0 ? (chat.total > 99 ? '99+' : chat.total) : undefined,
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Obavijesti',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'notifications' : 'notifications-outline'} color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}
