const DAYS = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
const DAYS_FULL = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];
const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(value: string | Date) {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = formatTime(d);

  if (d.toDateString() === now.toDateString()) return `Danas u ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Sutra u ${time}`;
  return `${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}. u ${time}`;
}

// Naslov grupe za oglasnu ploču: "Danas", "Sutra", "Subota, 8.11."
export function dayLabel(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Danas';
  if (d.toDateString() === tomorrow.toDateString()) return 'Sutra';
  return `${DAYS_FULL[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`;
}

// Kratko za kartice: "Danas", "Sutra", "sub 8.11."
export function shortDay(value: string | Date) {
  const d = new Date(value);
  const label = dayLabel(d);
  if (label === 'Danas' || label === 'Sutra') return label;
  return `${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

export const LEVELS = {
  any: 'Svi nivoi',
  beginner: 'Početni',
  intermediate: 'Srednji',
  advanced: 'Napredni',
} as const;
export type Level = keyof typeof LEVELS;

export const SPORT_EMOJI: Record<string, string> = {
  football: '⚽', volleyball: '🏐', basketball: '🏀', tennis: '🎾',
  padel: '🎾', handball: '🤾', table_tennis: '🏓',
  football_11: '🥅', beach_volleyball: '🏖️', badminton: '🏸', squash: '🎾',
  running: '🏃', hiking: '🥾', cycling: '🚴',
};

// Pozicije po sportu (za "Traži se: golman" i profil igrača)
export const POSITIONS: Record<string, string[]> = {
  football: ['Golman', 'Odbrana', 'Vezni', 'Napad'],
  football_11: ['Golman', 'Odbrana', 'Vezni', 'Napad'],
  futsal: ['Golman', 'Odbrana', 'Krilo', 'Pivot'],
  volleyball: ['Libero', 'Tehničar', 'Primač', 'Srednji bloker', 'Korektor'],
  beach_volleyball: ['Bloker', 'Odbrana'],
  basketball: ['Plejmejker', 'Bek', 'Krilo', 'Krilni centar', 'Centar'],
  handball: ['Golman', 'Krilo', 'Bek', 'Pivot'],
};

// Hitno: počinje za manje od 2 sata, a još fali igrač
export function isUrgent(startsAt: string | Date, spotsLeft?: number | null) {
  const diff = new Date(startsAt).getTime() - Date.now();
  return (spotsLeft ?? 1) > 0 && diff > 0 && diff <= 2 * 3600 * 1000;
}
