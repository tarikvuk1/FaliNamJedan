import { Share } from 'react-native';
import { formatDateTime } from './format';

// Javna stranica koja otvara termin u aplikaciji (ili nudi preuzimanje).
// Nalazi se u repozitoriju falinamjedan-pravno, fajl t.html.
export const SHARE_BASE = 'https://tarikvuk1.github.io/falinamjedan-pravno/t.html';

export const gameLink = (id: string) => `${SHARE_BASE}?id=${id}`;

export async function shareGame(g: {
  id: string; sportName?: string; emoji?: string; venue: string; city: string;
  startsAt: string; spotsLeft: number; position?: string | null;
}) {
  const who = g.position ? g.position.toLowerCase() : g.spotsLeft === 1 ? 'jedan igrač' : `${g.spotsLeft} igrača`;
  const message =
    `${g.emoji ?? '🟢'} Fali nam ${who}${g.sportName ? ` za ${g.sportName.toLowerCase()}` : ''}!\n` +
    `📍 ${g.venue}, ${g.city}\n` +
    `🕗 ${formatDateTime(g.startsAt)}\n\n` +
    `Uskoči preko aplikacije Jedan 👉 ${gameLink(g.id)}`;
  try {
    await Share.share({ message });
  } catch {
    // korisnik je zatvorio meni za dijeljenje
  }
}
