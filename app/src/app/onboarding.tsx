import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { C, F } from '../lib/theme';
import { Field, PrefixField, PrimaryButton, SectionTitle } from '../lib/ui';
import { facebookError, instagramError, normalizeFacebook, normalizeInstagram } from '../lib/contacts';
import { success } from '../lib/haptics';
import { CityField } from '../components/CityPicker';

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const uid = session!.user.id;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState<string | null>('Sarajevo');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Ako ime već postoji (npr. iz Google ili Apple prijave), popuni ga
  useEffect(() => {
    supabase.from('profiles').select('first_name, last_name, city').eq('id', uid).single()
      .then(({ data }) => {
        if (data?.first_name) setFirstName(data.first_name);
        if (data?.last_name) setLastName(data.last_name);
        if (data?.city) setCity(data.city);
      });
  }, [uid]);

  async function save() {
    const clean = (v: string) => v.trim() || null;
    const ig = normalizeInstagram(instagram);
    const fb = normalizeFacebook(facebook);
    const contactError = instagramError(ig) || facebookError(fb);

    if (!firstName.trim() || !lastName.trim()) return setError('Unesi ime i prezime.');
    if (!clean(phone) && !ig && !fb) return setError('Unesi bar jedan kontakt.');
    if (contactError) return setError(contactError);

    setSaving(true);
    setError('');

    const { error: e1 } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), city })
      .eq('id', uid);

    const { error: e2 } = await supabase
      .from('profile_contacts')
      .upsert({ user_id: uid, phone: clean(phone), instagram: ig || null, facebook: fb || null });

    if (e1 || e2) {
      setSaving(false);
      return setError((e1 ?? e2)!.message);
    }

    success();
    await refreshProfile(); // _layout prebacuje na početni ekran
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 30, fontFamily: F.bold, color: C.text }}>
          Još jedan <Text style={{ color: C.accent }}>korak</Text>
        </Text>
        <Text style={{ color: C.muted, marginTop: 8, marginBottom: 12, lineHeight: 22 }}>
          Napravi profil da bi mogao objavljivati termine i prijavljivati se na njih.
        </Text>

        <SectionTitle style={{ marginTop: 16 }}>O tebi</SectionTitle>
        <Field label="Ime *" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
        <Field label="Prezime *" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
        <Text style={{ color: C.muted, marginTop: 12, marginBottom: 6, fontWeight: '600' }}>Grad</Text>
        <CityField value={city} onChange={setCity} />

        <SectionTitle style={{ marginTop: 28 }}>Kontakt (bar jedan) *</SectionTitle>
        <View style={{ backgroundColor: C.accentSoft, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: C.text2, lineHeight: 20 }}>
            🔒 Kontakt vidi samo organizator termina kad te odobri, i obrnuto. Niko drugi.
          </Text>
        </View>
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+387 6x xxx xxx" />
        <PrefixField
          label="Instagram"
          prefix="@"
          value={instagram}
          onChangeText={(v) => setInstagram(normalizeInstagram(v))}
          placeholder="korisnicko_ime"
          error={instagramError(normalizeInstagram(instagram))}
        />
        <PrefixField
          label="Facebook"
          prefix="facebook.com/"
          value={facebook}
          onChangeText={setFacebook}
          onEndEditing={() => setFacebook(normalizeFacebook(facebook))}
          placeholder="ime.prezime"
          error={facebook ? facebookError(normalizeFacebook(facebook)) : null}
        />

        {!!error && <Text style={{ color: C.danger, marginTop: 12 }}>{error}</Text>}

        <PrimaryButton label="Sačuvaj i nastavi" onPress={save} loading={saving} style={{ marginTop: 24 }} />

        <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ color: C.faint }}>Odjavi se</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
