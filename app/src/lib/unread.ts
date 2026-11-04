import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

// Broj nepročitanih obavijesti (crveni broj na tabu "Obavijesti").
// Osvježava se: pri otvaranju, svakih 30 s, kad stigne push, kad se aplikacija vrati u fokus,
// i kad neki ekran pozove refreshUnread() (npr. nakon čitanja obavijesti).

const listeners = new Set<() => void>();

export function refreshUnread() {
  listeners.forEach((l) => l());
}

export function useUnreadCount(userId?: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const load = async () => {
      const { count: c } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (alive) setCount(c ?? 0);
    };

    load();
    listeners.add(load);
    const interval = setInterval(load, 30000);
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const pushSub = Notifications.addNotificationReceivedListener(() => load());

    return () => {
      alive = false;
      listeners.delete(load);
      clearInterval(interval);
      appSub.remove();
      pushSub.remove();
    };
  }, [userId]);

  return count;
}

// Nepročitane poruke u chatovima termina: ukupno (broj na tabu "Moji termini") i po terminu
export function useChatUnread(userId?: string) {
  const [byGame, setByGame] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const load = async () => {
      const { data } = await supabase.rpc('chat_unread');
      if (!alive) return;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { game_id: string; unread: number }) => { map[r.game_id] = r.unread; });
      setByGame(map);
    };

    load();
    listeners.add(load);
    const interval = setInterval(load, 30000);
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const pushSub = Notifications.addNotificationReceivedListener(() => load());

    return () => {
      alive = false;
      listeners.delete(load);
      clearInterval(interval);
      appSub.remove();
      pushSub.remove();
    };
  }, [userId]);

  const total = Object.values(byGame).reduce((a, b) => a + b, 0);
  return { total, byGame };
}
