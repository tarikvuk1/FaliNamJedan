import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { appleAvailable, signInWithApple, signInWithGoogle } from '../lib/social-auth';
import { AnimatedLogo, FloatingSports, RotatingTitle, useEnterAnimation } from '../components/WelcomeAnimations';

// Boje početnog ekrana (crno-zeleno, kao logo)
const BG = '#0A0C0B';
const GREEN = '#22C55E';
const TEXT = '#F2F5F3';
const MUTED = '#8C9590';
const FIELD = '#151A17';
const BORDER = '#252C28';

// welcome  – početni ekran s Apple / Google / email
// login    – email + lozinka
// register – novi nalog emailom
// forgot   – unos emaila za reset lozinke
// reset    – kod iz emaila + nova lozinka
type Mode = 'welcome' | 'login' | 'register' | 'forgot' | 'reset';

export default function Login() {
  const [mode, setMode] = useState<Mode>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState<null | 'apple' | 'google' | 'form'>(null);
  const [error, setError] = useState('');
  const [hasApple, setHasApple] = useState(false);

  useEffect(() => { appleAvailable().then(setHasApple); }, []);

  // Animacije početnog ekrana: tekst i dugmad se pojave kad logo "sleti"
  const textEnter = useEnterAnimation();
  const buttonsEnter = useEnterAnimation();
  const onLogoLanded = () => {
    textEnter.start(0);
    buttonsEnter.start(150);
  };

  const cleanEmail = () => email.trim().toLowerCase();

  function go(next: Mode) {
    setMode(next);
    setError('');
    setCode('');
  }

  async function run(kind: 'apple' | 'google' | 'form', fn: () => Promise<void>) {
    setLoading(kind);
    setError('');
    try {
      await fn();
    } catch (e: any) {
      setError(translate(e?.message ?? 'Greška'));
    }
    setLoading(null);
  }

  // ---------- Email ----------
  const login = () => run('form', async () => {
    if (!cleanEmail().includes('@')) throw new Error('Unesi ispravan email.');
    if (!password) throw new Error('Unesi lozinku.');
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(), password });
    if (error) throw error;
  });

  const register = () => run('form', async () => {
    if (!cleanEmail().includes('@')) throw new Error('Unesi ispravan email.');
    if (password.length < 6) throw new Error('Lozinka mora imati bar 6 znakova.');
    if (!accepted) throw new Error('Za registraciju moraš prihvatiti Uslove korištenja i Politiku privatnosti.');
    const { error } = await supabase.auth.signUp({
      email: cleanEmail(),
      password,
      options: { data: { terms_accepted_at: new Date().toISOString(), terms_version: '2026-11-03' } },
    });
    if (error) throw error;
  });

  const sendReset = () => run('form', async () => {
    if (!cleanEmail().includes('@')) throw new Error('Unesi ispravan email.');
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail());
    if (error) throw error;
    go('reset');
    setPassword('');
  });

  const doReset = () => run('form', async () => {
    if (code.trim().length < 6) throw new Error('Unesi kod iz emaila.');
    if (password.length < 6) throw new Error('Nova lozinka mora imati bar 6 znakova.');
    const { error: e1 } = await supabase.auth.verifyOtp({ email: cleanEmail(), token: code.trim(), type: 'recovery' });
    if (e1) throw new Error('Pogrešan ili istekao kod.');
    const { error: e2 } = await supabase.auth.updateUser({ password });
    if (e2) throw e2;
  });

  const resendReset = () => run('form', async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail());
    if (error) throw error;
  });

  // =====================================================================
  // POČETNI EKRAN
  // =====================================================================
  if (mode === 'welcome') {
    return (
      <View style={{ flex: 1, backgroundColor: BG, padding: 24, justifyContent: 'center' }}>
        <StatusBar style="light" />
        <FloatingSports />
        {/* Logo, tekst i dugmad su jedna cjelina, centrirana po visini ekrana */}
        <View style={{ alignItems: 'center' }}>
          <AnimatedLogo size={62} onLanded={onLogoLanded} />
          <Animated.View style={[{ alignItems: 'center', marginTop: 20 }, textEnter.style]}>
            <RotatingTitle color={TEXT} />
            <Text style={{ color: MUTED, fontSize: 16, textAlign: 'center', marginTop: 8, lineHeight: 23, paddingHorizontal: 12 }}>
              Objavi termin ili uskoči u tuđi. Mali fudbal, basket, odbojka, tenis i još mnogo toga.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[{ marginTop: 40 }, buttonsEnter.style]}>
          {hasApple && (
            <SocialButton
              icon="logo-apple"
              label="Nastavi s Apple"
              loading={loading === 'apple'}
              disabled={!!loading}
              onPress={() => run('apple', signInWithApple)}
            />
          )}
          <SocialButton
            icon="logo-google"
            label="Nastavi s Google"
            loading={loading === 'google'}
            disabled={!!loading}
            onPress={() => run('google', signInWithGoogle)}
          />
          <SocialButton
            icon="mail-outline"
            label="Nastavi s emailom"
            disabled={!!loading}
            onPress={() => go('login')}
          />

          {!!error && <Text style={{ color: '#f87171', marginTop: 12, textAlign: 'center' }}>{error}</Text>}

          <Text style={{ color: MUTED, fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 }}>
            Nastavkom potvrđuješ da imaš 16 ili više godina i prihvataš{' '}
            <Text style={{ color: TEXT, textDecorationLine: 'underline' }} onPress={() => router.push('/legal/terms')}>Uslove korištenja</Text>
            {' '}i{' '}
            <Text style={{ color: TEXT, textDecorationLine: 'underline' }} onPress={() => router.push('/legal/privacy')}>Politiku privatnosti</Text>.
          </Text>
        </Animated.View>
      </View>
    );
  }

  // =====================================================================
  // EMAIL EKRANI
  // =====================================================================
  const titles: Record<Exclude<Mode, 'welcome'>, [string, string]> = {
    login: ['Prijava', 'Prijavi se emailom i lozinkom.'],
    register: ['Novi nalog', 'Napravi nalog emailom.'],
    forgot: ['Zaboravljena lozinka', 'Unesi email, poslat ćemo ti kod za novu lozinku.'],
    reset: ['Nova lozinka', `Unesi kod koji smo poslali na ${cleanEmail()} i novu lozinku.`],
  };
  const action: Record<Exclude<Mode, 'welcome'>, [string, () => void]> = {
    login: ['Prijavi se', login],
    register: ['Registruj se', register],
    forgot: ['Pošalji kod', sendReset],
    reset: ['Sačuvaj novu lozinku', doReset],
  };
  const m = mode as Exclude<Mode, 'welcome'>;
  const showEmail = mode !== 'reset';
  const showPassword = mode !== 'forgot';
  const showCode = mode === 'reset';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => go(mode === 'reset' || mode === 'forgot' ? 'login' : 'welcome')} hitSlop={10} style={{ marginBottom: 24 }}>
          <Text style={{ color: GREEN, fontSize: 16 }}>‹ Nazad</Text>
        </Pressable>

        <Text style={{ fontSize: 30, fontWeight: '800', color: TEXT }}>{titles[m][0]}</Text>
        <Text style={{ fontSize: 16, color: MUTED, marginTop: 8, marginBottom: 28 }}>{titles[m][1]}</Text>

        {showEmail && (
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={MUTED}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            keyboardAppearance="dark"
            style={inputStyle}
          />
        )}

        {showCode && (
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            placeholder="Kod iz emaila"
            placeholderTextColor={MUTED}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            keyboardAppearance="dark"
            maxLength={8}
            style={[inputStyle, { letterSpacing: 6, fontSize: 22 }]}
          />
        )}

        {showPassword && (
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'reset' ? 'Nova lozinka' : 'Lozinka'}
            placeholderTextColor={MUTED}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            keyboardAppearance="dark"
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
                borderColor: accepted ? GREEN : MUTED, backgroundColor: accepted ? GREEN : 'transparent',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {accepted && <Text style={{ color: BG, fontWeight: '800' }}>✓</Text>}
            </Pressable>
            <Text style={{ flex: 1, color: MUTED, lineHeight: 21 }}>
              Imam 16 ili više godina i slažem se s{' '}
              <Text style={{ color: GREEN, fontWeight: '600' }} onPress={() => router.push('/legal/terms')}>Uslovima korištenja</Text>
              {' '}i{' '}
              <Text style={{ color: GREEN, fontWeight: '600' }} onPress={() => router.push('/legal/privacy')}>Politikom privatnosti</Text>.
            </Text>
          </View>
        )}

        {!!error && <Text style={{ color: '#f87171', marginTop: 12 }}>{error}</Text>}

        <Pressable
          onPress={action[m][1]}
          disabled={!!loading}
          style={{ backgroundColor: GREEN, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20, opacity: loading ? 0.6 : 1 }}
        >
          {loading === 'form'
            ? <ActivityIndicator color={BG} />
            : <Text style={{ color: BG, fontSize: 17, fontWeight: '800' }}>{action[m][0]}</Text>}
        </Pressable>

        {mode === 'login' && (
          <>
            <Link text="Zaboravio si lozinku?" onPress={() => go('forgot')} />
            <Link text="Nemaš nalog? Registruj se" onPress={() => go('register')} />
          </>
        )}
        {mode === 'register' && <Link text="Već imaš nalog? Prijavi se" onPress={() => go('login')} />}
        {mode === 'reset' && (
          <>
            <Link text="Nije stigao kod? Pošalji ponovo" onPress={resendReset} />
            <Text style={{ color: MUTED, textAlign: 'center', marginTop: 20, fontSize: 13 }}>
              Ne vidiš email? Provjeri folder Spam ili Promocije.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Sva tri dugmeta za prijavu su identična: ista boja, ikonica i font
function SocialButton({ icon, label, onPress, loading, disabled }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: '100%', maxWidth: 290, height: 50, alignSelf: 'center',
        borderRadius: 25, marginBottom: 12, backgroundColor: pressed ? '#E6E9E7' : '#FFFFFF',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        opacity: disabled && !loading ? 0.6 : 1,
      })}
    >
      {loading ? <ActivityIndicator color="#111" /> : (
        <>
          <Ionicons name={icon} size={20} color="#111" style={{ marginRight: 10 }} />
          <Text style={{ color: '#111', fontSize: 16, fontWeight: '600' }} allowFontScaling={false}>{label}</Text>
        </>
      )}
    </Pressable>
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
  if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) return 'Ovaj način prijave još nije uključen.';
  return msg;
}


const inputStyle = {
  backgroundColor: FIELD, borderWidth: 1, borderColor: BORDER, borderRadius: 14,
  padding: 16, fontSize: 16, color: TEXT,
};
