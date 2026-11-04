// Čišćenje i provjera Instagram i Facebook kontakata.
// Korisnik može upisati ime, @ime ili zalijepiti cijeli link: uvijek čuvamo samo korisničko ime.

export function normalizeInstagram(input: string) {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#\s]/)[0]
    .toLowerCase();
}

export function instagramError(username: string) {
  if (!username) return null;
  if (!/^[a-z0-9._]{1,30}$/.test(username)) {
    return 'Instagram ime može imati samo slova, brojeve, tačku i donju crtu (bez razmaka).';
  }
  return null;
}

export function normalizeFacebook(input: string) {
  let v = input.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.|m\.|web\.)?(facebook|fb)\.com\//i, '');
  // profile.php?id=123 zadržavamo cijelo, inače samo ime do prve kose crte ili upitnika
  if (/^profile\.php\?id=\d+/i.test(v)) return v.match(/^profile\.php\?id=\d+/i)![0];
  // Ako je upisano puno ime s razmakom ("Tarik Vuk"), ostavi ga da se prikaže greška, ne skraćuj tiho
  if (/\s/.test(v)) return v;
  return v.split(/[/?#\s]/)[0];
}

export function facebookError(username: string) {
  if (!username) return null;
  if (/^profile\.php\?id=\d+$/i.test(username)) return null;
  if (!/^[A-Za-z0-9.]{3,50}$/.test(username)) {
    return 'Upiši Facebook korisničko ime (dio adrese profila poslije facebook.com/), bez razmaka.';
  }
  return null;
}

export const instagramUrl = (u: string) => `https://instagram.com/${u.replace(/^@/, '')}`;

// Stari unosi (prije ove izmjene) mogu biti puno ime s razmakom: za njih ostaje pretraga
export function facebookUrl(v: string) {
  if (v.startsWith('http')) return v;
  if (/\s/.test(v)) return `https://www.facebook.com/search/top?q=${encodeURIComponent(v)}`;
  return `https://www.facebook.com/${v}`;
}

export const facebookLabel = (v: string) => (/\s/.test(v) || v.startsWith('http') ? v : `facebook.com/${v}`);
