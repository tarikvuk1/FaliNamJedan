import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import { C, F } from './theme';

// Stari naziv, da postojeći importi rade
export const GREEN = C.accent;

// ---------------------------------------------------------------------
// Čip (filteri, izbor sporta, nivoa...)
// ---------------------------------------------------------------------
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, marginRight: 8, marginBottom: 8,
        backgroundColor: active ? C.accent : C.card2,
        borderWidth: 1, borderColor: active ? C.accent : C.border,
      }}
    >
      <Text style={{ color: active ? C.onAccent : C.text2, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// Dugmad
// ---------------------------------------------------------------------
export function PrimaryButton({ label, onPress, loading, disabled, style }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: C.accent, borderRadius: 14, padding: 16, alignItems: 'center',
        opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading
        ? <ActivityIndicator color={C.onAccent} />
        : <Text style={{ color: C.onAccent, fontSize: 16, fontFamily: F.bold }}>{label}</Text>}
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, color = C.text, disabled, style }: {
  label: string; onPress: () => void; color?: string; disabled?: boolean; style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{
        borderWidth: 1, borderColor: C.border, backgroundColor: pressed ? C.card2 : 'transparent',
        borderRadius: 14, padding: 14, alignItems: 'center', opacity: disabled ? 0.55 : 1,
      }, style]}
    >
      <Text style={{ color, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// Polje za unos teksta
// ---------------------------------------------------------------------
export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginTop: 12 }}>
      {!!label && <Text style={{ color: C.muted, marginBottom: 6, fontWeight: '600' }}>{label}</Text>}
      <TextInput
        placeholderTextColor={C.faint}
        keyboardAppearance="dark"
        {...rest}
        style={[{
          backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14,
          padding: 14, fontSize: 16, color: C.text,
        }, style]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------
// Polje sa stalnim prefiksom koji se ne može obrisati (npr. "@" ili "facebook.com/")
// ---------------------------------------------------------------------
export function PrefixField(props: TextInputProps & { label?: string; prefix: string; error?: string | null }) {
  const { label, prefix, error, ...rest } = props;
  return (
    <View style={{ marginTop: 12 }}>
      {!!label && <Text style={{ color: C.muted, marginBottom: 6, fontWeight: '600' }}>{label}</Text>}
      <View style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1,
        borderColor: error ? C.danger : C.border, borderRadius: 14, paddingLeft: 14,
      }}>
        <Text style={{ color: C.muted, fontSize: 16 }}>{prefix}</Text>
        <TextInput
          placeholderTextColor={C.faint}
          keyboardAppearance="dark"
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
          style={{ flex: 1, paddingVertical: 14, paddingRight: 14, paddingLeft: 2, fontSize: 16, color: C.text }}
        />
      </View>
      {!!error && <Text style={{ color: C.danger, marginTop: 6, fontSize: 13 }}>{error}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------
// Naslov sekcije i kartica
// ---------------------------------------------------------------------
export function SectionTitle({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Text style={[{ color: C.muted, fontWeight: '700', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.6, marginBottom: 8 }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.line }, style]}>
      {children}
    </View>
  );
}

// Veliki naslov ekrana (Poppins)
export function ScreenTitle({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 28, fontFamily: F.bold, color: C.text }}>{children}</Text>;
}
