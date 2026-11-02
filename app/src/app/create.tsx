import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSports } from '../lib/sports';
import { formatDateTime, LEVELS, Level, SPORT_EMOJI } from '../lib/format';
import { Chip, GREEN } from '../lib/ui';
import { LocationPicker } from '../components/LocationPicker';
import { CityField } from '../components/CityPicker';

function defaultStart() {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0); // za 2 sata, okrugli sat
  return d;
}

export default function CreateGame() {
  const { session } = useAuth();
  const sports = useSports();

  const [sportId, setSportId] = useState<number | null>(null);
  const [city, setCity] = useState<string | null>('Sarajevo');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [date, setDate] = useState(defaultStart());
  const [duration, setDuration] = useState(60);
  const [needed, setNeeded] = useState(1);
  const [price, setPrice] = useState('');
  const [level, setLevel] = useState<Level>('any');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openAndroidPicker() {
    DateTimePickerAndroid.open({
      value: date, mode: 'date', minimumDate: new Date(),
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: true,
          onChange: (e2, t) => {
            if (e2.type !== 'set' || !t) return;
            const result = new Date(d);
            result.setHours(t.getHours(), t.getMinutes(), 0, 0);
            setDate(result);
          },
        });
      },
    });
  }

  async function publish() {
    if (!sportId) return setError('Izaberi sport.');
    if (!venue.trim()) return setError('Unesi teren ili salu.');
    if (!city) return setError('Izaberi grad.');
    if (date <= new Date()) return setError('Termin mora biti u budućnosti.');

    const priceNum = price.trim() ? Number(price.replace(',', '.')) : null;
    if (priceNum !== null && (isNaN(priceNum) || priceNum < 0)) return setError('Cijena nije ispravna.');

    setSaving(true);
    setError('');

    const { error } = await supabase.from('games').insert({
      organizer_id: session!.user.id,
      sport_id: sportId,
      city,
      venue_name: venue.trim(),
      address: address.trim() || null,
      location: coords ? `SRID=4326;POINT(${coords.longitude} ${coords.latitude})` : null,
      starts_at: date.toISOString(),
      duration_minutes: duration,
      players_needed: needed,
      price_per_person: priceNum,
      level,
      note: note.trim() || null,
    });

    setSaving(false);
    if (error) return setError(error.message);
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Label text="Sport *" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {sports.map((s) => (
            <Chip key={s.id} label={`${SPORT_EMOJI[s.slug] ?? ''} ${s.name}`} active={sportId === s.id} onPress={() => setSportId(s.id)} />
          ))}
        </View>

        <Label text="Teren / sala *" />
        <Input value={venue} onChange={setVenue} placeholder="npr. Sportska dvorana Mirza Delibašić" />

        <Label text="Lokacija" />
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={[inputBox, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
        >
          <Text style={{ fontSize: 16, color: coords ? '#111' : GREEN, fontWeight: coords ? '400' : '600' }}>
            {coords ? '✓ Lokacija izabrana' : '📍 Izaberi na mapi'}
          </Text>
          {coords && <Text style={{ color: GREEN }}>Promijeni</Text>}
        </Pressable>

        <Label text="Adresa" />
        <Input value={address} onChange={setAddress} placeholder="popuni se sa mape ili upiši" />

        <Label text="Grad *" />
        <CityField value={city} onChange={setCity} />

        <LocationPicker
          visible={pickerOpen}
          initial={coords}
          onClose={() => setPickerOpen(false)}
          onPick={(loc) => {
            setCoords({ latitude: loc.latitude, longitude: loc.longitude });
            if (loc.address) setAddress(loc.address);
            if (loc.city) setCity(loc.city);
            if (loc.name && !venue.trim()) setVenue(loc.name);
            setPickerOpen(false);
          }}
        />

        <Label text="Datum i vrijeme *" />
        {Platform.OS === 'ios' ? (
          <View style={{ alignItems: 'flex-start' }}>
            <DateTimePicker
              value={date}
              mode="datetime"
              display="compact"
              minimumDate={new Date()}
              minuteInterval={5}
              locale="bs-BA"
              themeVariant="light"
              onChange={(_, d) => d && setDate(d)}
            />
          </View>
        ) : (
          <Pressable onPress={openAndroidPicker} style={inputBox}>
            <Text style={{ fontSize: 16, color: '#111' }}>{formatDateTime(date)}</Text>
          </Pressable>
        )}

        <Label text="Trajanje" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[60, 90, 120].map((m) => (
            <Chip key={m} label={`${m} min`} active={duration === m} onPress={() => setDuration(m)} />
          ))}
        </View>

        <Label text="Koliko igrača fali? *" />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StepButton label="−" onPress={() => setNeeded(Math.max(1, needed - 1))} />
          <Text style={{ fontSize: 22, fontWeight: '700', width: 50, textAlign: 'center', color: '#111' }}>{needed}</Text>
          <StepButton label="+" onPress={() => setNeeded(Math.min(20, needed + 1))} />
        </View>

        <Label text="Cijena po osobi (KM)" />
        <Input value={price} onChange={setPrice} placeholder="npr. 5 (neobavezno)" keyboard="decimal-pad" />

        <Label text="Nivo igre" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <Chip key={l} label={LEVELS[l]} active={level === l} onPress={() => setLevel(l)} />
          ))}
        </View>

        <Label text="Napomena" />
        <Input value={note} onChange={setNote} placeholder="npr. treba golman, ponesite tamne majice" multiline />

        {!!error && <Text style={{ color: '#d00', marginTop: 16 }}>{error}</Text>}

        <Pressable
          onPress={publish}
          disabled={saving}
          style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, opacity: saving ? 0.6 : 1 }}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Objavi oglas</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputBox = { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14 };

function Label({ text }: { text: string }) {
  return <Text style={{ fontWeight: '700', color: '#111', marginTop: 20, marginBottom: 8 }}>{text}</Text>;
}

function Input(props: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  keyboard?: 'default' | 'decimal-pad'; multiline?: boolean;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChange}
      placeholder={props.placeholder}
      placeholderTextColor="#999"
      keyboardType={props.keyboard ?? 'default'}
      multiline={props.multiline}
      style={[inputBox, { fontSize: 16, color: '#111' }, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
    />
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f1f1', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#111' }}>{label}</Text>
    </Pressable>
  );
}