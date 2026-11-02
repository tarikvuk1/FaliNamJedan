const DAYS = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (d.toDateString() === now.toDateString()) return `Danas u ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Sutra u ${time}`;
  return `${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}. u ${time}`;
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