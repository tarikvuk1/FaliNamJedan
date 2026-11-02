export const CITIES = [
    'Banja Luka', 'Bihać', 'Bijeljina', 'Bileća', 'Bosanska Krupa', 'Bosanski Petrovac',
    'Bosansko Grahovo', 'Bratunac', 'Brčko', 'Breza', 'Bugojno', 'Busovača', 'Cazin',
    'Čapljina', 'Čelić', 'Čitluk', 'Derventa', 'Doboj', 'Doboj Istok', 'Doboj Jug',
    'Donji Vakuf', 'Drvar', 'Foča', 'Fojnica', 'Glamoč', 'Goražde', 'Gornji Vakuf-Uskoplje',
    'Gračanica', 'Gradačac', 'Gradiška', 'Grude', 'Han Pijesak', 'Istočno Sarajevo',
    'Jablanica', 'Jajce', 'Kakanj', 'Kalesija', 'Kiseljak', 'Kladanj', 'Ključ', 'Konjic',
    'Kotor Varoš', 'Kreševo', 'Kupres', 'Laktaši', 'Livno', 'Lopare', 'Lukavac', 'Ljubuški',
    'Maglaj', 'Milići', 'Modriča', 'Mostar', 'Mrkonjić Grad', 'Neum', 'Nevesinje',
    'Novi Grad', 'Novi Travnik', 'Odžak', 'Olovo', 'Orašje', 'Pale', 'Posušje', 'Prijedor',
    'Prnjavor', 'Prozor-Rama', 'Rogatica', 'Sanski Most', 'Sarajevo', 'Sokolac',
    'Srebrenica', 'Srebrenik', 'Stolac', 'Šamac', 'Široki Brijeg', 'Teslić', 'Tešanj',
    'Tomislavgrad', 'Travnik', 'Trebinje', 'Tuzla', 'Ugljevik', 'Vareš', 'Velika Kladuša',
    'Visoko', 'Višegrad', 'Vitez', 'Vlasenica', 'Zavidovići', 'Zenica', 'Zvornik',
    'Žepče', 'Živinice',
  ];
  
  // Pretvara tekst u mala slova bez kvačica, da "zivinice" nađe "Živinice"
  export function normalizeText(s: string) {
    return s.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  
  const SARAJEVO_PARTS = ['centar', 'stari grad', 'novo sarajevo', 'ilidza', 'vogosca', 'hadzici', 'ilijas', 'trnovo'];
  const ISTOCNO_SARAJEVO_PARTS = ['istocna ilidza', 'istocno novo sarajevo', 'istocni stari grad'];
  
  // Naziv koji vrati mapa pretvara u grad s naše liste (ili null ako nije prepoznat)
  export function matchCity(...names: (string | null | undefined)[]) {
    for (const raw of names) {
      if (!raw) continue;
      const n = normalizeText(raw);
      if (ISTOCNO_SARAJEVO_PARTS.includes(n) || n.startsWith('istocno sarajevo')) return 'Istočno Sarajevo';
      if (SARAJEVO_PARTS.includes(n) || n.includes('sarajevo')) return 'Sarajevo';
      const found = CITIES.find((c) => normalizeText(c) === n);
      if (found) return found;
    }
    return null;
  }