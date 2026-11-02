import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable, Text, TextInput,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@')) return setError('Unesi ispravan email.');
    if (!password) return setError('Unesi lozinku.');
    if (mode === 'register' && password.length < 6) return setError('Lozinka mora imati bar 6 znakova.');
    setLoading(true);
    setError('');

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password });

    setLoading(false);
    if (error) {
      if (error.message.includes('Invalid login')) setError('Pogrešan email ili lozinka.');
      else if (error.message.includes('already registered')) setError('Ovaj email već ima nalog. Prijavi se.');
      else setError(error.message);
    }
    // Ako je uspjelo, _layout automatski prebacuje na početni ekran
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' }}
    >
      <Text style={{ fontSize: 32, fontWeight: '800', color: '#111' }}>Fali nam jedan</Text>
      <Text style={{ fontSize: 16, color: '#666', marginTop: 8, marginBottom: 32 }}>
        {mode === 'login' ? 'Prijavi se na svoj nalog' : 'Napravi novi nalog'}
      </Text>

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
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Lozinka"
        placeholderTextColor="#999"
        secureTextEntry
        autoCapitalize="none"
        style={[inputStyle, { marginTop: 12 }]}
      />

      {!!error && <Text style={{ color: '#d00', marginTop: 12 }}>{error}</Text>}

      <Pressable
        onPress={submit}
        disabled={loading}
        style={{
          backgroundColor: '#16a34a', borderRadius: 12, padding: 16,
          alignItems: 'center', marginTop: 20, opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
              {mode === 'login' ? 'Prijavi se' : 'Registruj se'}
            </Text>}
      </Pressable>

      <Pressable
        onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        style={{ marginTop: 16, alignItems: 'center' }}
      >
        <Text style={{ color: '#16a34a' }}>
          {mode === 'login' ? 'Nemaš nalog? Registruj se' : 'Već imaš nalog? Prijavi se'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
  padding: 16, fontSize: 16, color: '#111',
};