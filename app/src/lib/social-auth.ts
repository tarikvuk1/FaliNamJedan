import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------
// Apple (samo iPhone): prijava preko sistemskog Apple ekrana
// ---------------------------------------------------------------------
export async function appleAvailable() {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export async function signInWithApple() {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return; // korisnik je odustao
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple prijava nije uspjela.');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple šalje ime samo pri PRVOJ prijavi, pa ga odmah upisujemo u profil
  const first = credential.fullName?.givenName ?? null;
  const last = credential.fullName?.familyName ?? null;
  if (data.user && (first || last)) {
    await supabase.auth.updateUser({ data: { full_name: [first, last].filter(Boolean).join(' ') } });
    const { data: p } = await supabase.from('profiles').select('first_name, last_name').eq('id', data.user.id).single();
    await supabase.from('profiles').update({
      first_name: p?.first_name || first,
      last_name: p?.last_name || last,
    }).eq('id', data.user.id);
  }
}

// ---------------------------------------------------------------------
// Google: otvara Googleov ekran u browseru i vraća se u aplikaciju
// ---------------------------------------------------------------------
export async function signInWithGoogle() {
  // U Expo Go ovo je exp://.../--/auth-callback, u pravoj aplikaciji falinamjedan://auth-callback
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // korisnik je zatvorio prozor

  await completeSessionFromUrl(result.url);
}

// Supabase vraća tokene u adresi (nakon # ili ?) – iz njih pravimo sesiju
export async function completeSessionFromUrl(url: string) {
  const params: Record<string, string> = {};
  const parts = url.split(/[?#]/).slice(1).join('&');
  for (const pair of parts.split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }

  if (params.error_description || params.error) {
    throw new Error(params.error_description || params.error);
  }
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return;
  }
  throw new Error('Google prijava nije uspjela. Pokušaj ponovo.');
}
