import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  onboarded: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkOnboarded = useCallback(async (s: Session | null) => {
    if (!s) return setOnboarded(false);
    const { data } = await supabase.rpc('is_onboarded', { uid: s.user.id });
    setOnboarded(data === true);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') {
        setSession(s);
        return;
      }
      // Supabase ne smije zvati bazu direktno unutar ovog callbacka, zato setTimeout
      setTimeout(async () => {
        await checkOnboarded(s);
        setSession(s);
        setLoading(false);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [checkOnboarded]);

  const refreshProfile = useCallback(() => checkOnboarded(session), [checkOnboarded, session]);

  return (
    <AuthContext.Provider value={{ session, onboarded, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth mora biti unutar AuthProvider');
  return ctx;
}