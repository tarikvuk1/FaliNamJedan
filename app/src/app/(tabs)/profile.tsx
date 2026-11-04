import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { C, F } from '../../lib/theme';
import { Field, PrefixField, PrimaryButton, SectionTitle } from '../../lib/ui';
import { facebookError, instagramError, normalizeFacebook, normalizeInstagram } from '../../lib/contacts';
import { success } from '../../lib/haptics';
import { CONTACT_EMAIL } from '../../lib/legal';
import { unregisterPush } from '../../lib/push';
import { CityField } from '../../components/CityPicker';
import { BlockedUsersModal } from '../../components/ReportModal';
import { ChangePasswordModal } from '../../components/ChangePasswordModal';
import { FollowsModal } from '../../components/FollowsModal';
import { Avatar, badgesFor } from '../../components/Visuals';
import { MySportsModal } from '../../components/MySportsModal';

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
  const [message, setMessage] = useState('');
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [followsOpen, setFollowsOpen] = useState(false);
  const [sportsOpen, setSportsOpen] = useState(false);
  const [organized, setOrganized] = useState(0);

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
    supabase.from('games').select('id', { count: 'exact', head: true })
      .eq('organizer_id', uid).neq('status', 'cancelled').lt('starts_at', new Date().toISOString())
      .then(({ count }) => setOrganized(count ?? 0));
    supabase.from('profile_contacts').select('phone, instagram, facebook').eq('user_id', uid).maybeSingle()
      .then(({ data }) => {
        setPhone(data?.phone ?? '');
        setInstagram(data?.instagram ?? '');
        setFacebook(data?.facebook ?? '');
      });
  }, [uid]));

  async function save() {
    const clean = (v: string) => v.trim() || null;
    const ig = normalizeInstagram(instagram);
    const fb = normalizeFacebook(facebook);
    const contactError = instagramError(ig) || facebookError(fb);
    if (!firstName.trim() || !lastName.trim()) return setMessage('Unesi ime i prezime.');
    if (!clean(phone) && !ig && !fb) return setMessage('Unesi bar jedan kontakt.');
    if (contactError) return setMessage(contactError);

    setSaving(true);
    setMessage('');
    const { error: e1 } = await supabase.from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim(), city })
      .eq('id', uid);
    const { error: e2 } = await supabase.from('profile_contacts')
      .upsert({ user_id: uid, phone: clean(phone), instagram: ig || null, facebook: fb || null });
    setSaving(false);
    if (e1 || e2) return setMessage((e1 ?? e2)!.message);
    success();
    setMessage('Sačuvano ✓');
  }

  async function signOut() {
    await unregisterPush();
    await supabase.auth.signOut();
  }

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
    await supabase.auth.signOut({ scope: 'local' });
  }

  const total = attended + noShow;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Tvoj profil';
  const pct = total > 0 ? Math.round((attended / total) * 100) : null;
  const badges = badgesFor({ attended, noShow, organized });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
          {/* Zaglavlje profila */}
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Avatar name={fullName} size={84} />
            <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 22, marginTop: 12 }}>{fullName}</Text>
            <Text style={{ color: C.muted, marginTop: 2 }}>{session?.user.email}</Text>
          </View>

          {/* Pouzdanost */}
          <View style={{ flexDirection: 'row', marginTop: 20 }}>
            <Stat label="Pouzdanost" value={pct != null ? `${pct}%` : '–'} color={pct == null ? C.muted : pct >= 80 ? C.accent : pct >= 50 ? C.warn : C.danger} />
            <Stat label="Došao" value={String(attended)} />
            <Stat label="Nije došao" value={String(noShow)} last />
          </View>

          {/* Bedževi */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
            {badges.length === 0 ? (
              <Text style={{ color: C.faint, fontSize: 13 }}>Odigraj prvi termin i osvoji prvi bedž ⚽</Text>
            ) : badges.map((b) => (
              <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card2, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ marginRight: 6 }}>{b.icon}</Text>
                <Text style={{ color: C.text2, fontWeight: '700', fontSize: 13 }}>{b.label}</Text>
              </View>
            ))}
          </View>

          {/* Podaci */}
          <SectionTitle style={{ marginTop: 28 }}>Podaci</SectionTitle>
          <Field label="Ime" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
          <Field label="Prezime" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
          <Text style={{ color: C.muted, marginTop: 12, marginBottom: 6, fontWeight: '600' }}>Grad</Text>
          <CityField value={city} onChange={setCity} />

          <SectionTitle style={{ marginTop: 28 }}>Kontakt (bar jedan)</SectionTitle>
          <Text style={{ color: C.faint, marginTop: -4 }}>Vidi ga samo organizator kad te odobri, i obrnuto.</Text>
          <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
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

          {!!message && <Text style={{ color: message.includes('✓') ? C.accent : C.danger, marginTop: 12 }}>{message}</Text>}
          <PrimaryButton label="Sačuvaj izmjene" onPress={save} loading={saving} style={{ marginTop: 18 }} />

          {/* Postavke */}
          <SectionTitle style={{ marginTop: 32 }}>Postavke</SectionTitle>
          <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
            <Row icon="football-outline" label="Moji sportovi i pozicije" onPress={() => setSportsOpen(true)} />
            <Row icon="notifications-outline" label="Praćenje sportova" onPress={() => setFollowsOpen(true)} />
            <Row icon="key-outline" label="Promijeni lozinku" onPress={() => setPasswordOpen(true)} />
            <Row icon="ban-outline" label="Blokirani korisnici" onPress={() => setBlockedOpen(true)} />
            <Row icon="document-text-outline" label="Uslovi korištenja" onPress={() => router.push('/legal/terms')} />
            <Row icon="shield-checkmark-outline" label="Politika privatnosti" onPress={() => router.push('/legal/privacy')} />
            <Row icon="mail-outline" label="Kontakt" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} last />
          </View>

          <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginTop: 12 }}>
            <Row icon="log-out-outline" label="Odjavi se" onPress={signOut} color={C.danger} last />
          </View>

          <Pressable onPress={confirmDelete} disabled={deleting} style={{ alignItems: 'center', marginTop: 28, padding: 8 }}>
            {deleting ? <ActivityIndicator color={C.muted} /> : <Text style={{ color: C.faint, textDecorationLine: 'underline' }}>Obriši nalog</Text>}
          </Pressable>

          <FollowsModal visible={followsOpen} onClose={() => setFollowsOpen(false)} />
          <MySportsModal visible={sportsOpen} onClose={() => setSportsOpen(false)} />
          <ChangePasswordModal visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
          <BlockedUsersModal visible={blockedOpen} onClose={() => setBlockedOpen(false)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color = C.text, last }: { label: string; value: string; color?: string; last?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginRight: last ? 0 : 8, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ color, fontFamily: F.bold, fontSize: 22 }}>{value}</Text>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, onPress, color = C.text, last }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; color?: string; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 16,
        backgroundColor: pressed ? C.card2 : 'transparent',
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line,
      })}
    >
      <Ionicons name={icon} size={20} color={color === C.text ? C.muted : color} style={{ marginRight: 12 }} />
      <Text style={{ flex: 1, color, fontSize: 16 }}>{label}</Text>
      {color === C.text && <Ionicons name="chevron-forward" size={18} color={C.faint} />}
    </Pressable>
  );
}
