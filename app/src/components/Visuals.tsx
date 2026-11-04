import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { C, F, sportColor } from '../lib/theme';
import { formatTime, shortDay, LEVELS, Level, SPORT_EMOJI } from '../lib/format';

// ---------------------------------------------------------------------
// Avatar s inicijalima (boja se izvodi iz imena, uvijek ista za istu osobu)
// ---------------------------------------------------------------------
const AVATAR_COLORS = ['#22C55E', '#38BDF8', '#FB923C', '#C084FC', '#F472B6', '#FACC15', '#2DD4BF', '#F87171'];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26',
      borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color, fontFamily: F.bold, fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------
// Slotovi igrača: puni krug = igrač je tu, isprekidan = fali
// ---------------------------------------------------------------------
export function PlayerSlots({ needed, left, size = 16, color = C.accent, max = 8 }: {
  needed: number; left: number; size?: number; color?: string; max?: number;
}) {
  const filled = Math.max(0, needed - left);
  const shown = Math.min(needed, max);
  const slots = Array.from({ length: shown }, (_, i) => i < filled);
  const gap = Math.round(size * 0.4);
  // Na malim kružićima isprekidana linija izgleda kao greška, pa je prazno mjesto blijedi prsten.
  // Na velikim (detalji termina) prazno mjesto je isprekidano, kao slovo D u logu.
  const dashed = size >= 22;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', flexShrink: 1 }}>
      {slots.map((full, i) => (
        <View
          key={i}
          style={{
            width: size, height: size, borderRadius: size / 2, marginRight: i === shown - 1 ? 0 : gap,
            backgroundColor: full ? color : 'transparent',
            borderWidth: full ? 0 : dashed ? 2 : 2,
            borderColor: full ? 'transparent' : dashed ? color : color + '80',
            borderStyle: dashed ? 'dashed' : 'solid',
          }}
        />
      ))}
      {needed > max && <Text style={{ color: C.muted, fontSize: 13, marginLeft: gap }}>+{needed - max}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------
// Kartica termina (oglasna ploča, moji termini)
// ---------------------------------------------------------------------
export function GameCard(p: {
  sportSlug?: string | null;
  sportName?: string;
  venue: string;
  city: string;
  startsAt: string;
  needed?: number;
  left?: number;
  price?: number | null;
  level?: Level;
  organizer?: string;
  distanceKm?: number | null;
  badge?: { text: string; color?: string };
  urgent?: boolean;
  position?: string | null;
  repeat?: boolean;
  dimmed?: boolean;
  onPress: () => void;
}) {
  const color = sportColor(p.sportSlug);
  const showSlots = p.needed != null && p.left != null;
  return (
    <Pressable
      onPress={p.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', backgroundColor: pressed ? C.card2 : C.card, borderRadius: 18,
        marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: p.urgent ? C.warn + '88' : C.line, opacity: p.dimmed ? 0.6 : 1,
      })}
    >
      {/* Traka u boji sporta */}
      <View style={{ width: 5, backgroundColor: color }} />

      {/* Vrijeme */}
      <View style={{ width: 74, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.line }}>
        <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 19 }}>{formatTime(p.startsAt)}</Text>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{shortDay(p.startsAt)}</Text>
      </View>

      {/* Sadržaj */}
      <View style={{ flex: 1, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color, fontWeight: '700', fontSize: 13 }}>
            {SPORT_EMOJI[p.sportSlug ?? ''] ?? ''} {p.sportName?.toUpperCase()}
          </Text>
          {p.urgent && !p.badge && (
            <View style={{ backgroundColor: C.warn + '22', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: C.warn, fontSize: 12, fontWeight: '800' }}>🔥 HITNO</Text>
            </View>
          )}
          {p.badge && (
            <View style={{ backgroundColor: (p.badge.color ?? C.accent) + '22', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: p.badge.color ?? C.accent, fontSize: 12, fontWeight: '700' }}>{p.badge.text}</Text>
            </View>
          )}
        </View>

        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginTop: 4 }} numberOfLines={1}>{p.venue}</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
          {p.city}
          {p.distanceKm != null ? ` · ${p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1).replace('.', ',')} km`}` : ''}
          {p.organizer ? ` · ${p.organizer}` : ''}
        </Text>

        {showSlots && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <PlayerSlots needed={p.needed!} left={p.left!} color={color} size={16} max={6} />
            </View>
            <Text style={{ color: p.left! > 0 ? color : C.muted, fontWeight: '700', fontSize: 13, marginLeft: 8 }}>
              {p.left! > 0 ? `Fali ${p.left}` : 'Popunjeno'}
            </Text>
          </View>
        )}

        {((p.level && p.level !== 'any') || p.price != null || !!p.position || p.repeat) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {!!p.position && <Tag text={`Traži se: ${p.position}`} color={color} />}
            {p.level && p.level !== 'any' && <Tag text={LEVELS[p.level]} />}
            {p.price != null && <Tag text={`${p.price} KM`} />}
            {p.repeat && <Tag text="🔁 Svake sedmice" />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Tag({ text, color }: { text: string; color?: string }) {
  return (
    <View style={{ backgroundColor: color ? color + '1F' : C.card2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 4 }}>
      <Text style={{ color: color ?? C.text2, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------
// Znak aplikacije JEDAN: tri puna kruga i jedno prazno (isprekidano) mjesto
// ---------------------------------------------------------------------
export function LogoMark({ size = 24, color = C.accent }: { size?: number; color?: string }) {
  const gap = Math.max(2, Math.round(size * 0.1));
  const dot = (size - gap) / 2;
  const border = Math.max(1.5, dot * 0.16);
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between' }}>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, borderWidth: border, borderColor: color, borderStyle: 'dashed' }} />
    </View>
  );
}

// Oznake (bedževi) igrača, računaju se iz statistike
export function badgesFor(s: { attended: number; noShow: number; organized: number }) {
  const out: { icon: string; label: string }[] = [];
  const total = s.attended + s.noShow;
  if (s.attended >= 1) out.push({ icon: '⚽', label: 'Prvi termin' });
  if (s.attended >= 10) out.push({ icon: '🔟', label: '10 odigranih' });
  if (s.attended >= 50) out.push({ icon: '🏆', label: '50 odigranih' });
  if (total >= 5 && s.noShow === 0) out.push({ icon: '💎', label: 'Uvijek dođe' });
  if (s.organized >= 5) out.push({ icon: '📣', label: 'Organizator' });
  if (s.organized >= 25) out.push({ icon: '👑', label: 'Kapiten' });
  return out;
}

// ---------------------------------------------------------------------
// Prazan ekran: isprekidani krug (motiv "fali jedan") + poruka + dugme
// ---------------------------------------------------------------------
export function EmptyState({ icon, title, text, action }: {
  icon: string; title: string; text?: string; action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: 30 }}>
      <View style={{
        width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderStyle: 'dashed', borderColor: C.accent,
        alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft,
      }}>
        <Text style={{ fontSize: 40 }}>{icon}</Text>
      </View>
      <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 18, marginTop: 16, textAlign: 'center' }}>{title}</Text>
      {!!text && <Text style={{ color: C.muted, marginTop: 6, textAlign: 'center', lineHeight: 21 }}>{text}</Text>}
      {action && (
        <Pressable onPress={action.onPress} style={{ marginTop: 18, backgroundColor: C.accent, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22 }}>
          <Text style={{ color: C.onAccent, fontFamily: F.bold }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Naslov grupe dana na oglasnoj ploči
export function DayHeader({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: C.text, fontFamily: F.bold, fontSize: 16, marginTop: 10, marginBottom: 10 }}>{children}</Text>
  );
}
