import { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useSports } from '../lib/sports';
import { formatDateTime, LEVELS, Level, SPORT_EMOJI } from '../lib/format';
import { Chip, GREEN } from '../lib/ui';
import { LocationPicker } from '../components/LocationPicker';
import { CityField } from '../components/CityPicker';
import { C } from '../lib/theme';

function defaultStart() {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0); // za 2 sata, okrugli sat
  return d;
}

// Isti ekran služi za novi oglas (/create) i za izmjenu (/create?id=...)
export default function CreateGame() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
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
  const [loadingGame, setLoadingGame] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Izmjena: učitaj postojeći oglas
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: g }, { data: ex }] = await Promise.all([
        supabase
          .from('games')
          .select('sport_id, city, venue_name, address, starts_at, duration_minutes, players_needed, price_per_person, level, note')
          .eq('id', id)
          .single(),
        supabase.rpc('game_extra', { p_game_id: id }).maybeSingle(),
      ]);
      if (g) {
        setSportId(g.sport_id);
        setCity(g.city);
        setVenue(g.venue_name);
        setAddress(g.address ?? '');
        setDate(new Date(g.starts_at));
        setDuration(g.duration_minutes);
        setNeeded(g.players_needed);
        setPrice(g.price_per_person != null ? String(g.price_per_person) : '');
        setLevel(g.level);
        setNote(g.note ?? '');
      }
      const e = ex as { lat: number | null; lng: number | null } | null;
      if (e?.lat != null && e?.lng != null) setCoords({ latitude: e.lat, longitude: e.lng });
      setLoadingGame(false);
    })();
  }, [id]);

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

  async function save() {
    if (!sportId) return setError('Izaberi sport.');
    if (!venue.trim()) return setError('Unesi teren ili salu.');
    if (!city) return setError('Izaberi grad.');
    if (date <= new Date()) return setError('Termin mora biti u budućnosti.');

    const priceNum = price.trim() ? Number(price.replace(',', '.')) : null;
    if (priceNum !== null && (isNaN(priceNum) || priceNum < 0)) return setError('Cijena nije ispravna.');

    setSaving(true);
    setError('');

    const { error } = isEdit
      ? await supabase.rpc('update_game', {
          p_game_id: id,
          p_sport_id: sportId,
          p_city: city,
          p_venue_name: venue.trim(),
          p_address: address.trim() || null,
          p_lat: coords?.latitude ?? null,
          p_lng: coords?.longitude ?? null,
          p_starts_at: date.toISOString(),
          p_duration: duration,
          p_players_needed: needed,
          p_price: priceNum,
          p_level: level,
          p_note: note.trim() || null,
        })
      : await supabase.from('games').insert({
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

  if (loadingGame) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Stack.Screen options={{ title: 'Uredi oglas' }} />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: isEdit ? 'Uredi oglas' : 'Novi oglas' }} />
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
          <Text style={{ fontSize: 16, color: coords ? C.text : GREEN, fontWeight: coords ? '400' : '600' }}>
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
              themeVariant="dark"
              onChange={(_, d) => d && setDate(d)}
            />
          </View>
        ) : (
          <Pressable onPress={openAndroidPicker} style={inputBox}>
            <Text style={{ fontSize: 16, color: C.text }}>{formatDateTime(date)}</Text>
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
          <Text style={{ fontSize: 22, fontWeight: '700', width: 50, textAlign: 'center', color: C.text }}>{needed}</Text>
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

        {isEdit && (
          <Text style={{ color: C.muted, marginTop: 16 }}>
            Svi prijavljeni igrači dobit će obavijest da je termin izmijenjen.
          </Text>
        )}

        {!!error && <Text style={{ color: C.danger, marginTop: 16 }}>{error}</Text>}

        <Pressable
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, opacity: saving ? 0.6 : 1 }}
        >
          {saving
            ? <ActivityIndicator color={C.onAccent} />
            : <Text style={{ color: C.onAccent, fontSize: 16, fontWeight: '700' }}>{isEdit ? 'Sačuvaj izmjene' : 'Objavi oglas'}</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputBox = { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 };

function Label({ text }: { text: string }) {
  return <Text style={{ fontWeight: '700', color: C.text, marginTop: 20, marginBottom: 8 }}>{text}</Text>;
}

function Input(props: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  keyboard?: 'default' | 'decimal-pad'; multiline?: boolean;
}) {
  return (
    <TextInput keyboardAppearance="dark"
      value={props.value}
      onChangeText={props.onChange}
      placeholder={props.placeholder}
      placeholderTextColor={C.faint}
      keyboardType={props.keyboard ?? 'default'}
      multiline={props.multiline}
      style={[inputBox, { fontSize: 16, color: C.text }, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
    />
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>{label}</Text>
    </Pressable>
  );
}
