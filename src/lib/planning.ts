import { isoDay, toDate } from './format';
import type { Activity, Plan, Settings, TemplateId, WeightEntry, Workout } from './types';

/** Alternance A/B basée uniquement sur les séances réellement terminées. */
export function nextTemplate(workouts: Workout[]): TemplateId {
  const done = workouts.filter((w) => w.status === 'done').sort((a, b) => a.startedAt - b.startedAt);
  const last = done[done.length - 1];
  if (!last) return 'A';
  return last.template === 'A' ? 'B' : 'A';
}

/** Lundi de la semaine contenant d. */
export function mondayOf(d: Date | string | number): Date {
  const x = toDate(d);
  const m = new Date(x.getFullYear(), x.getMonth(), x.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Clé de semaine ISO, ex. « 2026-W45 ». */
export function weekKey(d: Date | string | number): string {
  const x = toDate(d);
  const t = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

export type DayItemKind = 'A' | 'B' | 'basket' | 'match' | 'jogging';

export interface DayItem {
  kind: DayItemKind;
  /** prévu ou réalisé */
  done: boolean;
  label: string;
  time?: string;
  ref?: string;
}

export interface DayPlan {
  date: string;
  dow: number;
  items: DayItem[];
}

export function buildWeek(
  anchor: Date,
  settings: Settings,
  workouts: Workout[],
  activities: Activity[],
  plans: Plan[],
): DayPlan[] {
  const mon = mondayOf(anchor);
  const days: DayPlan[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const date = isoDay(d);
    const items: DayItem[] = [];

    // Séances de musculation réalisées ce jour
    const doneW = workouts.filter((w) => w.status === 'done' && isoDay(w.startedAt) === date);
    for (const w of doneW) items.push({ kind: w.template, done: true, label: `Séance ${w.template}`, ref: w.id });
    // Séances prévues (non encore réalisées ce jour-là)
    for (const p of plans.filter((p) => p.date === date && (p.kind === 'A' || p.kind === 'B'))) {
      if (!doneW.some((w) => w.template === p.kind)) items.push({ kind: p.kind, done: false, label: `Séance ${p.kind}`, ref: p.id });
    }

    const acts = activities.filter((a) => a.date === date);
    // Basket récurrent
    const basketDone = acts.filter((a) => a.kind === 'basket');
    for (const b of settings.basket.filter((b) => b.day === i)) {
      items.push({ kind: 'basket', done: basketDone.length > 0, label: 'Basket', time: b.time, ref: basketDone[0]?.id });
    }
    // Basket enregistré hors créneau
    if (!settings.basket.some((b) => b.day === i)) {
      for (const a of basketDone) items.push({ kind: 'basket', done: true, label: 'Basket', ref: a.id });
    }
    // Match
    const matchDone = acts.find((a) => a.kind === 'match');
    const matchPlan = plans.find((p) => p.date === date && p.kind === 'match');
    if (matchDone || matchPlan) items.push({ kind: 'match', done: !!matchDone, label: 'Match', ref: matchDone?.id ?? matchPlan?.id });
    // Jogging
    for (const a of acts.filter((a) => a.kind === 'jogging')) items.push({ kind: 'jogging', done: true, label: 'Jogging', ref: a.id });

    days.push({ date, dow: i, items });
  }
  return days;
}

export interface WeekAvg {
  week: string;
  monday: string;
  avg: number;
  count: number;
}

export function weeklyAverages(weights: WeightEntry[]): WeekAvg[] {
  const by = new Map<string, { sum: number; n: number; monday: string }>();
  for (const w of weights) {
    const k = weekKey(w.date);
    const e = by.get(k) ?? { sum: 0, n: 0, monday: isoDay(mondayOf(w.date)) };
    e.sum += w.kg;
    e.n++;
    by.set(k, e);
  }
  return [...by.entries()]
    .map(([week, e]) => ({ week, monday: e.monday, avg: Math.round((e.sum / e.n) * 10) / 10, count: e.n }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/** Progression vers l'objectif, 0 → 1. */
export function goalProgress(current: number, start: number, target: number): number {
  if (target === start) return 1;
  return Math.min(1, Math.max(0, (current - start) / (target - start)));
}
