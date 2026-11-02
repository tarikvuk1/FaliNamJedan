import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { GREEN } from '../../lib/ui';
import { CityField } from '../../components/CityPicker';
import { unregisterPush } from '../../lib/push';

export default function Profile() {
  const { session } = useAuth();
  const uid = session!.user.id;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [attended, setAttended] = useState(0);
  const [noShow, setNoShow] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    supabase.from('profiles').select('first_name, last_name, city, games_attended, games_no_show').eq('id', uid).single()
      .then(({ data }) => {
        if (!data) return;
        setFirstName(data.first_name ?? '');
        setLastName(data.last_name ?? '');
        setCity(data.city);
        setAttended(data.games_attended);
        setNoShow(data.games_no_show);
      });
    supabase.from('profile_contacts').select('phone, instagram, facebook').eq('user_id', uid).maybeSingle()
      .then(({ data }) => {
        setPhone(data?.phone ?? '');
        setInstagram(data?.instagram ?? '');
        setFacebook(data?.facebook ?? '');
      });
  }, [uid]));

  async function save() {
    const clean = (v: string) => v.trim() || null;
    const ig = instagram.trim().replace(/^@/, '');
    if (!firstName.trim() || !lastName.trim()) return setMessage('Unesi ime i prezime.');
    if (!clean(phone) && !ig && !clean(facebook)) return setMessage('Unesi bar jedan kontakt.');

    setSaving(true);
    setMessage('');
    const { error: e1 } = await supabase.from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), city })
      .eq('id', uid);
    const { error: e2 } = await supabase.from('profile_contacts')
      .upsert({ user_id: uid, phone: clean(phone), instagram: ig || null, facebook: clean(facebook) });
    setSaving(false);
    setMessage(e1 || e2 ? (e1 ?? e2)!.message : 'Sačuvano ✓');
  }

  const total = attended + noShow;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#111' }}>Profil</Text>
          <Text style={{ color: '#666', marginTop: 4 }}>{session?.user.email}</Text>

          {/* Pouzdanost */}
          <View style={{ backgroundColor: '#f6f6f6', borderRadius: 14, padding: 16, marginTop: 20 }}>
            <Text style={{ color: '#888', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>Pouzdanost</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111', marginTop: 6 }}>
              {total > 0 ? `Došao ${attended} od ${total} puta` : 'Još nema odigranih termina'}
            </Text>
          </View>

          <Field label="Ime" value={firstName} onChange={setFirstName} />
          <Field label="Prezime" value={lastName} onChange={setLastName} />
          <Text style={{ color: '#444', marginTop: 12, marginBottom: 6 }}>Grad</Text>
          <CityField value={city} onChange={setCity} />

          <Text style={{ marginTop: 20, fontWeight: '700', color: '#111' }}>Kontakt (bar jedan)</Text>
          <Text style={{ color: '#888', marginTop: 2 }}>Vidi ga samo organizator kad te odobri, i obrnuto.</Text>
          <Field label="Telefon" value={phone} onChange={setPhone} keyboard="phone-pad" />
          <Field label="Instagram" value={instagram} onChange={setInstagram} />
          <Field label="Facebook" value={facebook} onChange={setFacebook} />

          {!!message && (
            <Text style={{ color: message.includes('✓') ? GREEN : '#d00', marginTop: 12 }}>{message}</Text>
          )}

          <Pressable
            onPress={save}
            disabled={saving}
            style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20, opacity: saving ? 0.6 : 1 }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Sačuvaj izmjene</Text>}
          </Pressable>

          <Pressable
            onPress={async () => { await unregisterPush(); await supabase.auth.signOut(); }}
            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#d00', fontWeight: '700' }}>Odjavi se</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'default' | 'phone-pad' }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: '#444', marginBottom: 6 }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboard ?? 'default'}
        autoCapitalize={props.keyboard === 'phone-pad' ? 'none' : 'words'}
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, color: '#111' }}
      />
    </View>
  );
}