import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Text, View, useWindowDimensions } from 'react-native';
import { useFonts, Poppins_700Bold } from '@expo-google-fonts/poppins';

const GREEN = '#22C55E';

// Da li korisnik ima uključeno "Reduce Motion" (tada bez animacija)
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

// ---------------------------------------------------------------------
// Logo "FALI NAM JE_AN": redovi se pojavljuju jedan po jedan,
// a zatim slovo D uskoči odozgo na prazno mjesto.
// ---------------------------------------------------------------------
export function AnimatedLogo({ size = 62, onLanded }: { size?: number; onLanded?: () => void }) {
  const [fontsLoaded] = useFonts({ Poppins_700Bold });
  const reduce = useReduceMotion();
  const lines = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const drop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fontsLoaded) return;
    if (reduce) {
      lines.forEach((v) => v.setValue(1));
      drop.setValue(1);
      onLanded?.();
      return;
    }
    Animated.sequence([
      Animated.stagger(140, lines.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      )),
      Animated.delay(300),
      Animated.spring(drop, { toValue: 1, friction: 4.5, tension: 60, useNativeDriver: true }),
    ]).start();
    // Ostatak ekrana kreće malo prije nego D sleti
    const t = setTimeout(() => onLanded?.(), 900);
    return () => clearTimeout(t);
  }, [fontsLoaded, reduce]);

  if (!fontsLoaded) return <View style={{ height: size * 3.3 }} />;

  const text = { fontFamily: 'Poppins_700Bold', fontSize: size, lineHeight: size * 1.08, color: GREEN };
  const lineStyle = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  });

  // Treći red "JE_AN" su dvije slike iste veličine (napravljene istim fontom kao logo):
  // dole "JE  AN", gore samo isprekidano D koje uskače. Zato se savršeno poklapaju.
  const k = size / 62;            // slike su napravljene za veličinu 62
  const W = 222.7 * k;
  const H = 67 * k;

  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel="Fali nam jedan">
      <Animated.Text style={[text, lineStyle(lines[0])]}>FALI</Animated.Text>
      <Animated.Text style={[text, lineStyle(lines[1])]}>NAM</Animated.Text>
      <Animated.View style={[{ width: W, height: H }, lineStyle(lines[2])]}>
        <Image source={require('../../assets/images/logo-je-an.png')} style={{ width: W, height: H, position: 'absolute' }} />
        <Animated.Image
          source={require('../../assets/images/logo-d.png')}
          style={{
            width: W, height: H, position: 'absolute',
            opacity: drop.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-size * 4, 0] }) },
              { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) },
            ],
          }}
        />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------
// "Fali vam ___?" s riječima koje se smjenjuju
// ---------------------------------------------------------------------
const WORDS = ['igrač', 'golman', 'četvrti za padel', 'libero', 'centar', 'partner za tenis', 'još jedan'];

export function RotatingTitle({ color }: { color: string }) {
  const reduce = useReduceMotion();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 2200);
    return () => clearInterval(interval);
  }, [reduce]);

  return (
    <Text style={{ color, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
      Fali vam{' '}
      <Animated.Text style={{ color: GREEN, opacity: fade }}>{WORDS[index]}</Animated.Text>?
    </Text>
  );
}

// ---------------------------------------------------------------------
// Blijede sportske ikonice koje lebde u pozadini
// ---------------------------------------------------------------------
const ITEMS = [
  { e: '⚽', x: 0.10, y: 0.12, s: 34, d: 3200 },
  { e: '🏀', x: 0.80, y: 0.18, s: 40, d: 3800 },
  { e: '🏐', x: 0.06, y: 0.48, s: 30, d: 3500 },
  { e: '🎾', x: 0.86, y: 0.52, s: 28, d: 3000 },
  { e: '🏓', x: 0.16, y: 0.84, s: 30, d: 4100 },
  { e: '🏸', x: 0.82, y: 0.86, s: 32, d: 3600 },
];

export function FloatingSports() {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const values = useRef(ITEMS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (reduce) return;
    const loops = values.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ITEMS[i].d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: ITEMS[i].d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {ITEMS.map((it, i) => (
        <Animated.Text
          key={it.e}
          style={{
            position: 'absolute', left: it.x * width, top: it.y * height, fontSize: it.s, opacity: 0.14,
            transform: [
              { translateY: values[i].interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
              { rotate: values[i].interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) },
            ],
          }}
        >
          {it.e}
        </Animated.Text>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------
// Pojavljivanje odozdo (za tekst i dugmad)
// ---------------------------------------------------------------------
export function useEnterAnimation() {
  const v = useRef(new Animated.Value(0)).current;
  const start = (delay = 0) =>
    Animated.timing(v, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  const style = {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
  };
  return { start, style };
}
