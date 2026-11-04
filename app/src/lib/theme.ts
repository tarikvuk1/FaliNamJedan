// Boje i fontovi cijele aplikacije (crno-zeleno, kao logo).
// Ako želiš promijeniti izgled, mijenjaš ovdje i promjena važi svuda.

export const C = {
  bg: '#0A0C0B',          // pozadina ekrana
  card: '#141917',        // kartice
  card2: '#1C2320',       // dugmad, polja, pritisnuta kartica
  border: '#2A322E',      // okviri polja i dugmadi
  line: '#1E2421',        // tanke linije između redova
  text: '#F2F5F3',        // glavni tekst
  text2: '#C9D0CC',       // sporedni tekst
  muted: '#8C9590',       // opisi
  faint: '#5F6763',       // placeholderi, najmanje bitno
  accent: '#22C55E',      // zelena
  accentSoft: 'rgba(34,197,94,0.14)',
  onAccent: '#0A0C0B',    // tekst na zelenom dugmetu
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.12)',
  warn: '#FB923C',
};

export const F = {
  bold: 'Poppins_700Bold',
  semi: 'Poppins_600SemiBold',
};

// Boja po sportu (traka na kartici, oznake)
export const SPORT_COLOR: Record<string, string> = {
  football: '#22C55E',
  football_11: '#4ADE80',
  volleyball: '#FACC15',
  beach_volleyball: '#FDE047',
  basketball: '#FB923C',
  tennis: '#A3E635',
  padel: '#38BDF8',
  squash: '#60A5FA',
  badminton: '#C084FC',
  handball: '#F472B6',
  table_tennis: '#F87171',
  running: '#F59E0B',
  hiking: '#84CC16',
  cycling: '#2DD4BF',
};

export const sportColor = (slug?: string | null) => SPORT_COLOR[slug ?? ''] ?? C.accent;
