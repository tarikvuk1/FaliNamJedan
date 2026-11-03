import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { GREEN } from '../lib/ui';

// Ekrani unutar prijave:
// login    – email + lozinka
// register – novi nalog (bez potvrde emaila)
// forgot   – unos emaila za reset lozinke
// reset    – kod iz emaila + nova lozinka
type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cleanEmail = () => email.trim().toLowerCase();

  function go(next: Mode) {
    setMode(next);
    setError('');
    setCode('');
  }

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true);
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(translate(e?.message ?? 'Greška'));
    }
    setLoading(false);
  }

  // ---------- Prijava ----------
  const login = () => withLoading(async () => {
    if (!cleanEmail().includes('@')) throw new Error('Unesi ispravan email.');
    if (!password) throw new Error('Unesi lozinku.');
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(), password });
    if (error) throw error;
    // Uspjeh: _layout automatski prebacuje dalje
  });

  // ---------- Registracija ----------
  const register = () => withLoading(async () => {
    if (!cleanEmail().includes('@')) throw new Error('Unesi ispravan email.');
    if (password.length < 6) throw new Error('Lozinka mora imati bar 6 znakova.');
    if (!accepted) throw new Error('Za registraciju moraš prihvatiti Uslove korištenja i Politiku privatnosti.');
    const { error } = await supabase.auth.signUp({
      email: cleanEmail(),
      password,
      // Zapis o saglasnosti (vidljiv u Supabaseu uz korisnika)
      options: { data: { terms_accepted_at: new Date().toISOString(), terms_version: '2026-11-03' } },
    });
    if (error) throw error;
  });

  // ---------- Zaboravljena lozinka ----------
  const sendReset = () => withLoading(async () => {
    if (!cleanEmail().includes('@')) throw new Error('Unesi ispravan email.');
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail());
    if (error) throw error;
    go('reset');
    setPassword('');
  });

  const doReset = () => withLoading(async () => {
    if (code.trim().length < 6) throw new Error('Unesi kod iz emaila.');
    if (password.length < 6) throw new Error('Nova lozinka mora imati bar 6 znakova.');
    const { error: e1 } = await supabase.auth.verifyOtp({ email: cleanEmail(), token: code.trim(), type: 'recovery' });
    if (e1) throw new Error('Pogrešan ili istekao kod.');
    const { error: e2 } = await supabase.auth.updateUser({ password });
    if (e2) throw e2;
    // Korisnik je sada prijavljen s novom lozinkom
  });

  const resendReset = () => withLoading(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail());
    if (error) throw error;
  });

  const titles: Record<Mode, [string, string]> = {
    login: ['Fali nam jedan', 'Prijavi se na svoj nalog'],
    register: ['Fali nam jedan', 'Napravi novi nalog'],
    forgot: ['Zaboravljena lozinka', 'Unesi email, poslat ćemo ti kod za novu lozinku.'],
    reset: ['Nova lozinka', `Unesi kod koji smo poslali na ${cleanEmail()} i novu lozinku.`],
  };

  const action: Record<Mode, [string, () => void]> = {
    login: ['Prijavi se', login],
    register: ['Registruj se', register],
    forgot: ['Pošalji kod', sendReset],
    reset: ['Sačuvaj novu lozinku', doReset],
  };

  const showEmail = mode !== 'reset';
  const showPassword = mode !== 'forgot';
  const showCode = mode === 'reset';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 32, fontWeight: '800', color: '#111' }}>{titles[mode][0]}</Text>
        <Text style={{ fontSize: 16, color: '#666', marginTop: 8, marginBottom: 32 }}>{titles[mode][1]}</Text>

        {showEmail && (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={inputStyle}
          />
        )}

        {showCode && (
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            placeholder="Kod iz emaila"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={8}
            style={[inputStyle, { letterSpacing: 6, fontSize: 22 }]}
          />
        )}

        {showPassword && (
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'reset' ? 'Nova lozinka' : 'Lozinka'}
            placeholderTextColor="#999"
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            style={[inputStyle, { marginTop: 12 }]}
          />
        )}

        {mode === 'register' && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 }}>
            <Pressable
              onPress={() => setAccepted(!accepted)}
              hitSlop={10}
              style={{
                width: 24, height: 24, borderRadius: 6, borderWidth: 2, marginRight: 10, marginTop: 1,
                borderColor: accepted ? GREEN : '#bbb', backgroundColor: accepted ? GREEN : '#fff',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {accepted && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
            </Pressable>
            <Text style={{ flex: 1, color: '#444', lineHeight: 21 }}>
              Imam 16 ili više godina i slažem se s{' '}
              <Text style={{ color: GREEN, fontWeight: '600' }} onPress={() => router.push('/legal/terms')}>Uslovima korištenja</Text>
              {' '}i{' '}
              <Text style={{ color: GREEN, fontWeight: '600' }} onPress={() => router.push('/legal/privacy')}>Politikom privatnosti</Text>.
            </Text>
          </View>
        )}

        {!!error && <Text style={{ color: '#d00', marginTop: 12 }}>{error}</Text>}

        <Pressable
          onPress={action[mode][1]}
          disabled={loading}
          style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20, opacity: loading ? 0.6 : 1 }}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{action[mode][0]}</Text>}
        </Pressable>

        {mode === 'login' && (
          <>
            <Link text="Zaboravio si lozinku?" onPress={() => go('forgot')} />
            <Link text="Nemaš nalog? Registruj se" onPress={() => go('register')} />
          </>
        )}
        {mode === 'register' && <Link text="Već imaš nalog? Prijavi se" onPress={() => go('login')} />}
        {mode === 'forgot' && <Link text="Nazad na prijavu" onPress={() => go('login')} />}
        {mode === 'reset' && (
          <>
            <Link text="Nije stigao kod? Pošalji ponovo" onPress={resendReset} />
            <Link text="Nazad na prijavu" onPress={() => go('login')} />
            <Text style={{ color: '#999', textAlign: 'center', marginTop: 20, fontSize: 13 }}>
              Ne vidiš email? Provjeri folder Spam ili Promocije.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Link({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ marginTop: 16, alignItems: 'center' }}>
      <Text style={{ color: GREEN }}>{text}</Text>
    </Pressable>
  );
}

// Najčešće poruke Supabasea na bosanskom
export function translate(msg: string) {
  if (msg.includes('Invalid login')) return 'Pogrešan email ili lozinka.';
  if (msg.includes('already registered')) return 'Ovaj email već ima nalog. Prijavi se.';
  if (msg.includes('rate limit') || msg.includes('security purposes')) return 'Previše pokušaja. Sačekaj minut pa probaj ponovo.';
  if (msg.includes('Password should be')) return 'Lozinka je preslaba. Koristi bar 6 znakova.';
  if (msg.includes('same as the old') || msg.includes('should be different')) return 'Nova lozinka mora biti drugačija od stare.';
  return msg;
}

const inputStyle = {
  borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
  padding: 16, fontSize: 16, color: '#111',
};
