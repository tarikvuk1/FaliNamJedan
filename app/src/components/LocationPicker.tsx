import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GREEN } from '../lib/ui';
import { matchCity } from '../lib/cities';

export type PickedLocation = {
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  name: string | null; // naziv mjesta iz pretrage (npr. "Skenderija")
};

type SearchResult = {
  id: string;
  name: string;
  details: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
};

const SARAJEVO = { latitude: 43.8563, longitude: 18.4131 };

// Pretraga preko OpenStreetMap (Nominatim), samo u BiH
async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8' +
    '&countrycodes=ba&accept-language=bs&q=' + encodeURIComponent(query);
  const res = await fetch(url, { headers: { 'User-Agent': 'FaliNamJedan/0.1 (studentski projekat)' } });
  if (!res.ok) throw new Error('Pretraga trenutno ne radi');
  const data: any[] = await res.json();

  return data.map((r) => {
    const a = r.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const name = r.name || street || r.display_name.split(',')[0];
    return {
      id: String(r.place_id),
      name,
      details: r.display_name.split(',').slice(1, 4).join(',').trim(),
      latitude: Number(r.lat),
      longitude: Number(r.lon),
      address: street || null,
      city: matchCity(a.city, a.town, a.village, a.municipality, a.suburb, a.county),
    };
  });
}

export function LocationPicker({ visible, initial, onClose, onPick }: {
  visible: boolean;
  initial: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onPick: (loc: PickedLocation) => void;
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const start = initial ?? SARAJEVO;

  const [center, setCenter] = useState(start);
  const [address, setAddress] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Pri otvaranju traži dozvolu za lokaciju (treba za "Moja lokacija" i adresu na Androidu)
  useEffect(() => {
    if (!visible) return;
    Location.requestForegroundPermissionsAsync();
    lookup(start.latitude, start.longitude);
  }, [visible]);

  async function lookup(latitude: number, longitude: number) {
    setGeocoding(true);
    try {
      const [r] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const street = r ? [r.street, r.streetNumber].filter(Boolean).join(' ') : '';
      setAddress(street || r?.name || null);
      setCity(matchCity(r?.city, r?.district, r?.subregion));
    } catch {
      setAddress(null);
      setCity(null);
    }
    setGeocoding(false);
  }

  async function runSearch() {
    if (query.trim().length < 3) return setSearchError('Upiši bar 3 slova.');
    Keyboard.dismiss();
    setSearching(true);
    setSearchError('');
    try {
      const found = await searchPlaces(query.trim());
      setResults(found);
      if (!found.length) setSearchError('Nema rezultata. Probaj drugačije ili pomjeri iglu ručno.');
    } catch (e: any) {
      setSearchError(e.message);
    }
    setSearching(false);
  }

  function selectResult(r: SearchResult) {
    setResults([]);
    setQuery(r.name);
    setPlaceName(r.name);
    mapRef.current?.animateToRegion({
      latitude: r.latitude, longitude: r.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005,
    });
  }

  async function goToMyLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    setPlaceName(null);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion({
      latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          showsUserLocation
          initialRegion={{ ...start, latitudeDelta: initial ? 0.01 : 0.05, longitudeDelta: initial ? 0.01 : 0.05 }}
          onPanDrag={() => setPlaceName(null)} // ručno pomjeranje briše naziv iz pretrage
          onRegionChangeComplete={(r) => {
            setCenter({ latitude: r.latitude, longitude: r.longitude });
            lookup(r.latitude, r.longitude);
          }}
        />

        {/* Igla fiksirana u sredini mape */}
        <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -44 }}>
          <Text style={{ fontSize: 40 }}>📍</Text>
        </View>

        {/* Gornji dio: dugmad i pretraga */}
        <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable onPress={onClose} style={floating}>
              <Text style={{ fontWeight: '600', color: '#111' }}>✕ Odustani</Text>
            </Pressable>
            <Pressable onPress={goToMyLocation} style={floating}>
              <Text style={{ fontWeight: '600', color: '#111' }}>◎ Moja lokacija</Text>
            </Pressable>
          </View>

          <View style={[floating, { flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 4, paddingLeft: 12 }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={runSearch}
              placeholder="Traži teren, dvoranu, ulicu..."
              placeholderTextColor="#999"
              returnKeyType="search"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 16, color: '#111', paddingVertical: 8 }}
            />
            <Pressable onPress={runSearch} style={{ backgroundColor: GREEN, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
              {searching
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700' }}>Traži</Text>}
            </Pressable>
          </View>

          {!!searchError && (
            <View style={[floating, { marginTop: 8 }]}>
              <Text style={{ color: '#666' }}>{searchError}</Text>
            </View>
          )}

          {results.length > 0 && (
            <View style={[floating, { marginTop: 8, padding: 0, maxHeight: 300 }]}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {results.map((r) => (
                  <Pressable key={r.id} onPress={() => selectResult(r)} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}>
                    <Text style={{ fontWeight: '700', color: '#111' }}>{r.name}</Text>
                    <Text style={{ color: '#666', marginTop: 2 }} numberOfLines={1}>{r.details}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Donja kartica s adresom */}
        <View style={{ backgroundColor: '#fff', padding: 20, paddingBottom: insets.bottom + 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -20 }}>
          <Text style={{ color: '#666' }}>Pretraži ili pomjeri mapu da igla bude na terenu</Text>
          <View style={{ minHeight: 48, justifyContent: 'center' }}>
            {geocoding ? <ActivityIndicator style={{ alignSelf: 'flex-start' }} /> : (
              <>
                {!!placeName && <Text style={{ fontSize: 17, fontWeight: '800', color: '#111', marginTop: 6 }}>{placeName}</Text>}
                <Text style={{ fontSize: placeName ? 15 : 17, fontWeight: placeName ? '400' : '700', color: placeName ? '#444' : '#111', marginTop: 4 }}>
                  {address ?? 'Nepoznata adresa'}{city ? `, ${city}` : ''}
                </Text>
              </>
            )}
          </View>
          <Pressable
            onPress={() => onPick({ ...center, address, city, name: placeName })}
            style={{ backgroundColor: GREEN, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Potvrdi lokaciju</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const floating = {
  backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
  shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
};