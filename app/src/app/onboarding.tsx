import { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const uid = session!.user.id;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('Sarajevo');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Ako ime već postoji (npr. iz Google prijave kasnije), popuni ga
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
    const ig = instagram.trim().replace(/^@/, '');

    if (!firstName.trim() || !lastName.trim()) return setError('Unesi ime i prezime.');
    if (!clean(phone) && !ig && !clean(facebook)) return setError('Unesi bar jedan kontakt.');

    setSaving(true);
    setError('');

    const { error: e1 } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), city: clean(city) })
      .eq('id', uid);

    const { error: e2 } = await supabase
      .from('profile_contacts')
      .upsert({ user_id: uid, phone: clean(phone), instagram: ig || null, facebook: clean(facebook) });

    if (e1 || e2) {
      setSaving(false);
      return setError((e1 ?? e2)!.message);
    }

    await refreshProfile(); // _layout prebacuje na početni ekran
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#111' }}>Tvoj profil</Text>
        <Text style={{ color: '#666', marginTop: 8, marginBottom: 24 }}>
          Kontakt vidi samo organizator termina kad te odobri, i obrnuto.
        </Text>

        <Field label="Ime *" value={firstName} onChange={setFirstName} />
        <Field label="Prezime *" value={lastName} onChange={setLastName} />
        <Field label="Grad" value={city} onChange={setCity} />

        <Text style={{ marginTop: 16, marginBottom: 4, fontWeight: '700', color: '#111' }}>
          Kontakt *
        </Text>
        <Field label="Telefon" value={phone} onChange={setPhone} keyboard="phone-pad" placeholder="+387 6x xxx xxx" />
        <Field label="Instagram" value={instagram} onChange={setInstagram} placeholder="@korisnicko_ime" />
        <Field label="Facebook" value={facebook} onChange={setFacebook} placeholder="ime ili link profila" />

        {!!error && <Text style={{ color: '#d00', marginTop: 12 }}>{error}</Text>}

        <Pressable
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, opacity: saving ? 0.6 : 1 }}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Sačuvaj i nastavi</Text>}
        </Pressable>

        <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ color: '#888' }}>Odjavi se</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: 'default' | 'phone-pad';
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: '#444', marginBottom: 6 }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor="#999"
        keyboardType={props.keyboard ?? 'default'}
        autoCapitalize={props.keyboard === 'phone-pad' ? 'none' : 'words'}
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, color: '#111' }}
      />
    </View>
  );
}