/**
 * État applicatif en mémoire, adossé à IndexedDB.
 * Chaque écriture est persistée immédiatement puis signalée à la synchronisation.
 */
import { useEffect, useState } from 'preact/hooks';
import { allRecords, kvGet, kvSet, putRecords } from './db';
import { defaultProgram, defaultSettings } from './defaults';
import { isoDay, uid } from './format';
import type { Activity, Collection, Plan, Program, Rec, Settings, WeightEntry, Workout } from './types';

const recs = new Map<string, Rec>();
const key = (col: Collection, id: string) => `${col}:${id}`;
const listeners = new Set<() => void>();
let onLocalChange: (() => void) | null = null;

export function setLocalChangeHook(fn: () => void) {
  onLocalChange = fn;
}

function emit() {
  for (const l of listeners) l();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-rendu du composant à chaque modification du store. */
export function useStore(): number {
  const [v, setV] = useState(0);
  useEffect(() => subscribe(() => setV((x) => x + 1)), []);
  return v;
}

export async function initStore(): Promise<void> {
  for (const r of await allRecords()) recs.set(key(r.col, r.id), r);
  // Configuration initiale uniquement si absente : jamais d'écrasement de données existantes.
  const writes: Rec[] = [];
  if (!recs.has(key('config', 'program'))) writes.push(mk('config', 'program', defaultProgram(), 0));
  if (!recs.has(key('config', 'settings'))) writes.push(mk('config', 'settings', defaultSettings(), 0));
  if (writes.length) {
    for (const w of writes) recs.set(key(w.col, w.id), w);
    await putRecords(writes);
  }
  emit();
}

/** updatedAt = 0 pour les valeurs par défaut : toute version distante les remplace. */
function mk<T>(col: Collection, id: string, data: T, updatedAt = Date.now()): Rec<T> {
  return { col, id, data, updatedAt, dirty: updatedAt ? 1 : 0 };
}

export function get<T>(col: Collection, id: string): T | undefined {
  const r = recs.get(key(col, id));
  return r && !r.deleted ? (r.data as T) : undefined;
}

export function list<T>(col: Collection): T[] {
  const out: T[] = [];
  for (const r of recs.values()) if (r.col === col && !r.deleted) out.push(r.data as T);
  return out;
}

export function rawRecords(): Rec[] {
  return [...recs.values()];
}

export async function put<T>(col: Collection, id: string, data: T): Promise<void> {
  const prev = recs.get(key(col, id));
  // Horodatage strictement croissant même si deux écritures tombent dans la même ms.
  const now = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
  const r: Rec = { col, id, data, updatedAt: now, dirty: 1 };
  recs.set(key(col, id), r);
  emit();
  await putRecords([r]);
  onLocalChange?.();
}

export async function remove(col: Collection, id: string): Promise<void> {
  const prev = recs.get(key(col, id));
  if (!prev) return;
  const r: Rec = { ...prev, deleted: true, updatedAt: Math.max(Date.now(), prev.updatedAt + 1), dirty: 1 };
  recs.set(key(col, id), r);
  emit();
  await putRecords([r]);
  onLocalChange?.();
}

/**
 * Fusion « dernier écrit gagne » d'enregistrements venus d'ailleurs (cloud ou import).
 * Une version locale plus récente n'est jamais écrasée.
 */
export async function mergeRecords(incoming: Rec[], markClean: boolean): Promise<number> {
  const writes: Rec[] = [];
  for (const r of incoming) {
    const cur = recs.get(key(r.col, r.id));
    if (cur && cur.updatedAt >= r.updatedAt) continue;
    const next: Rec = { col: r.col, id: r.id, data: r.data, updatedAt: r.updatedAt, deleted: r.deleted, dirty: markClean ? 0 : 1 };
    recs.set(key(r.col, r.id), next);
    writes.push(next);
  }
  if (writes.length) {
    await putRecords(writes);
    emit();
  }
  return writes.length;
}

/** Marque comme synchronisés les enregistrements envoyés, s'ils n'ont pas changé entre-temps. */
export async function markSynced(sent: Rec[]): Promise<void> {
  const writes: Rec[] = [];
  for (const s of sent) {
    const cur = recs.get(key(s.col, s.id));
    if (cur && cur.updatedAt === s.updatedAt && cur.dirty) {
      const next = { ...cur, dirty: 0 as const };
      recs.set(key(s.col, s.id), next);
      writes.push(next);
    }
  }
  await putRecords(writes);
}

export function dirtyRecords(): Rec[] {
  return [...recs.values()].filter((r) => r.dirty);
}

/* ——— Accès typés ——— */

export const program = (): Program => get<Program>('config', 'program') ?? defaultProgram();
export const settings = (): Settings => ({ ...defaultSettings(), ...(get<Settings>('config', 'settings') ?? {}) });
export const saveProgram = (p: Program) => put('config', 'program', p);
export const saveSettings = (s: Settings) => put('config', 'settings', s);

export const workouts = (): Workout[] => list<Workout>('workouts').sort((a, b) => b.startedAt - a.startedAt);
export const activeWorkout = (): Workout | undefined => workouts().find((w) => w.status === 'active');
export const saveWorkout = (w: Workout) => put('workouts', w.id, w);

export const activities = (): Activity[] => list<Activity>('activities').sort((a, b) => b.date.localeCompare(a.date));
export const saveActivity = (a: Activity) => put('activities', a.id, a);

export const weights = (): WeightEntry[] => list<WeightEntry>('weights').sort((a, b) => a.date.localeCompare(b.date));
export const saveWeight = (kg: number, date = isoDay()) => put<WeightEntry>('weights', date, { id: date, date, kg });

export const plans = (): Plan[] => list<Plan>('plans');
export const savePlan = (p: Plan) => put('plans', p.id, p);
export const newId = uid;

/* ——— Stockage local non synchronisé ——— */
export const local = { get: kvGet, set: kvSet };
