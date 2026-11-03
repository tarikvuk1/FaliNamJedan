import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Linking } from 'react-native';
import { CONTACT_EMAIL } from '../../lib/legal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { GREEN } from '../../lib/ui';
import { CityField } from '../../components/CityPicker';
import { unregisterPush } from '../../lib/push';
import { BlockedUsersModal } from '../../components/ReportModal';
import { ChangePasswordModal } from '../../components/ChangePasswordModal';

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
  const [deleting, setDeleting] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
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

  async function signOut() {
    await unregisterPush();
    await supabase.auth.signOut();
  }

  // Brisanje naloga: dvostruka potvrda jer se ne može poništiti
  function confirmDelete() {
    Alert.alert(
      'Obrisati nalog?',
      'Trajno se brišu tvoj profil, kontakti, oglasi, prijave i obavijesti. Tvoji aktivni termini se otkazuju i igrači dobijaju obavijest.',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Nastavi',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Jesi li siguran?', 'Ovo se ne može poništiti.', [
              { text: 'Odustani', style: 'cancel' },
              { text: 'Obriši nalog', style: 'destructive', onPress: deleteAccount },
            ]),
        },
      ],
    );
  }

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      setDeleting(false);
      return Alert.alert('Greška', error.message);
    }
    // Nalog više ne postoji na serveru, pa brišemo samo sesiju na telefonu
    await supabase.auth.signOut({ scope: 'local' });
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
            onPress={signOut}
            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#d00', fontWeight: '700' }}>Odjavi se</Text>
          </Pressable>

          <Pressable
            onPress={() => setPasswordOpen(true)}
            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#333', fontWeight: '600' }}>Promijeni lozinku</Text>
          </Pressable>
          <ChangePasswordModal visible={passwordOpen} onClose={() => setPasswordOpen(false)} />

          <Pressable
            onPress={() => setBlockedOpen(true)}
            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#333', fontWeight: '600' }}>Blokirani korisnici</Text>
          </Pressable>
          <BlockedUsersModal visible={blockedOpen} onClose={() => setBlockedOpen(false)} />

          {/* Pravni dokumenti i kontakt */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 28 }}>
            <SmallLink text="Uslovi korištenja" onPress={() => router.push('/legal/terms')} />
            <SmallLink text="Politika privatnosti" onPress={() => router.push('/legal/privacy')} />
            <SmallLink text="Kontakt" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
          </View>

          {/* Opasna zona */}
          <Pressable onPress={confirmDelete} disabled={deleting} style={{ alignItems: 'center', marginTop: 32, padding: 8 }}>
            {deleting
              ? <ActivityIndicator />
              : <Text style={{ color: '#999', textDecorationLine: 'underline' }}>Obriši nalog</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SmallLink({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ color: '#666', fontSize: 13 }}>{text}</Text>
    </Pressable>
  );
}

function Field(props:{ label: string; value: string; onChange: (v: string) => void; keyboard?: 'default' | 'phone-pad' }) {
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
