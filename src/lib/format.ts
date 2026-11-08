/** Formatage français, sans zéro inutile : 62.5 → « 62,5 », 60 → « 60 ». */
export function num(n: number, maxDecimals = 2): string {
  const r = Math.round(n * 10 ** maxDecimals) / 10 ** maxDecimals;
  return String(r).replace('.', ',').replace('-', '−');
}

export function kg(n: number | null | undefined): string {
  return n == null ? '—' : `${num(n)} kg`;
}

export function signed(n: number, unit = ''): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : '±';
  return `${s}${num(Math.abs(n))}${unit ? ` ${unit}` : ''}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.').replace('−', '-');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function dateShort(d: Date | number | string): string {
  const x = toDate(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
}

export function dateLong(d: Date | number | string): string {
  const x = toDate(d);
  return `${DAYS[(x.getDay() + 6) % 7]} ${x.getDate()} ${MONTHS_LONG[x.getMonth()]}`;
}

export function monthYear(d: Date | number | string): string {
  const x = toDate(d);
  return `${MONTHS_LONG[x.getMonth()]} ${x.getFullYear()}`;
}

export function monthShort(d: Date | number | string): string {
  return MONTHS[toDate(d).getMonth()];
}

export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toDate(d: Date | number | string): Date {
  if (d instanceof Date) return d;
  if (typeof d === 'number') return new Date(d);
  // YYYY-MM-DD → date locale (pas UTC)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(d);
}

export function isoDay(d: Date | number = new Date()): string {
  const x = toDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
