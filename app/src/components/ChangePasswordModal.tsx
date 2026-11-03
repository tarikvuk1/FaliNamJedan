import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { GREEN } from '../lib/ui';
import { translate } from '../app/login';

export function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setCurrent(''); setNext(''); setRepeat(''); setError(''); }
  }, [visible]);

  async function save() {
    if (!current) return setError('Unesi trenutnu lozinku.');
    if (next.length < 6) return setError('Nova lozinka mora imati bar 6 znakova.');
    if (next !== repeat) return setError('Nove lozinke se ne podudaraju.');
    if (next === current) return setError('Nova lozinka mora biti drugačija od stare.');

    setSaving(true);
    setError('');

    // Prvo provjeri da je trenutna lozinka tačna
    const { error: e1 } = await supabase.auth.signInWithPassword({
      email: session!.user.email!,
      password: current,
    });
    if (e1) {
      setSaving(false);
      return setError('Trenutna lozinka nije tačna.');
    }

    const { error: e2 } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (e2) return setError(translate(e2.message));

    onClose();
    Alert.alert('Gotovo', 'Lozinka je promijenjena.');
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#fff' }}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: '#111' }}>Promijeni lozinku</Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: GREEN, fontSize: 16, fontWeight: '600' }}>Zatvori</Text>
            </Pressable>
          </View>

          <PasswordField label="Trenutna lozinka" value={current} onChange={setCurrent} type="password" />
          <PasswordField label="Nova lozinka" value={next} onChange={setNext} type="newPassword" />
          <PasswordField label="Ponovi novu lozinku" value={repeat} onChange={setRepeat} type="newPassword" />

          {!!error && <Text style={{ color: '#d00', marginTop: 12 }}>{error}</Text>}

          <Pressable
            onPress={save}
            disabled={saving}
            style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, opacity: saving ? 0.6 : 1 }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Sačuvaj novu lozinku</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PasswordField({ label, value, onChange, type }: {
  label: string; value: string; onChange: (v: string) => void; type: 'password' | 'newPassword';
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: '#444', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        textContentType={type}
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, color: '#111' }}
      />
    </View>
  );
}
