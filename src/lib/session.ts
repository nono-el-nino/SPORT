/** Logique pure du mode séance : création, préremplissage, variantes, validation. */
import { num, uid } from './format';
import { exerciseHistory } from './history';
import { setsAt, suggest, totalReps, workingWeight, type Suggestion } from './progression';
import type { EntryLog, Program, Slot, TemplateId, Workout } from './types';

export function slotFor(program: Program, w: Workout, e: EntryLog): Slot | undefined {
  return program.templates[w.template].slots.find((s) => s.id === e.slotId);
}

export function suggestionFor(program: Program, workouts: Workout[], e: EntryLog, excludeId?: string): Suggestion {
  const ex = program.exercises[e.exerciseId];
  return suggest(exerciseHistory(workouts, e.exerciseId, excludeId), {
    sets: e.target.sets,
    repMin: e.target.repMin,
    repMax: e.target.repMax,
    increment: ex?.increment ?? 2.5,
  });
}

function prefilledEntry(program: Program, workouts: Workout[], slot: Slot, exerciseId: string): EntryLog {
  const entry: EntryLog = {
    slotId: slot.id,
    exerciseId,
    target: { sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax, restSec: slot.restSec },
    sets: [],
  };
  const s = suggestionFor(program, workouts, entry);
  entry.sets = Array.from({ length: slot.sets }, (_, i) => ({ weight: s.weight, reps: s.reps[i] ?? slot.repMin, done: false }));
  entry.suggestion = s.message;
  return entry;
}

export function startWorkout(program: Program, workouts: Workout[], template: TemplateId, short: boolean): Workout {
  const slots = program.templates[template].slots.filter((s) => !short || s.core);
  return {
    id: uid(),
    template,
    short,
    startedAt: Date.now(),
    status: 'active',
    current: 0,
    entries: slots.map((s) => prefilledEntry(program, workouts, s, s.exerciseId)),
  };
}

/** Remplace l'exercice d'une entrée par une variante (historique propre, aucune équivalence de charge). */
export function swapExercise(program: Program, workouts: Workout[], w: Workout, index: number, exerciseId: string): Workout {
  const e = w.entries[index];
  const slot = slotFor(program, w, e) ?? {
    id: e.slotId,
    exerciseId: e.exerciseId,
    alternatives: [],
    sets: e.target.sets,
    repMin: e.target.repMin,
    repMax: e.target.repMax,
    restSec: e.target.restSec,
    core: true,
  };
  const fresh = prefilledEntry(program, workouts, { ...slot, sets: e.target.sets, repMin: e.target.repMin, repMax: e.target.repMax, restSec: e.target.restSec }, exerciseId);
  const entries = w.entries.slice();
  entries[index] = fresh;
  return { ...w, entries };
}

export function updateSet(w: Workout, index: number, setIndex: number, patch: Partial<EntryLog['sets'][number]>): Workout {
  const entries = w.entries.slice();
  const e = { ...entries[index], sets: entries[index].sets.slice() };
  e.sets[setIndex] = { ...e.sets[setIndex], ...patch };
  // Une charge modifiée sur une série se propage aux séries suivantes non validées.
  if (patch.weight !== undefined) {
    for (let i = setIndex + 1; i < e.sets.length; i++) if (!e.sets[i].done) e.sets[i] = { ...e.sets[i], weight: patch.weight };
  }
  entries[index] = e;
  return { ...w, entries };
}

export function validateSet(w: Workout, index: number, setIndex: number): Workout {
  return updateSet(w, index, setIndex, { done: true, at: Date.now() });
}

export function addSet(w: Workout, index: number): Workout {
  const entries = w.entries.slice();
  const e = { ...entries[index], sets: entries[index].sets.slice() };
  const last = e.sets[e.sets.length - 1];
  e.sets.push({ weight: last?.weight ?? null, reps: last?.reps ?? e.target.repMin, done: false });
  entries[index] = e;
  return { ...w, entries };
}

export function setEntry(w: Workout, index: number, patch: Partial<EntryLog>): Workout {
  const entries = w.entries.slice();
  entries[index] = { ...entries[index], ...patch };
  return { ...w, entries };
}

export function activeSetIndex(e: EntryLog): number {
  return e.sets.findIndex((s) => !s.done);
}

export function entryDone(e: EntryLog): boolean {
  return !!e.skipped || (e.sets.length > 0 && e.sets.every((s) => s.done));
}

export function nextOpenEntry(w: Workout, from: number): number {
  for (let i = 1; i <= w.entries.length; i++) {
    const j = (from + i) % w.entries.length;
    if (!entryDone(w.entries[j])) return j;
  }
  return -1;
}

export function workoutStats(w: Workout) {
  let sets = 0;
  let volume = 0;
  for (const e of w.entries) {
    if (e.skipped) continue;
    for (const s of e.sets) {
      if (!s.done) continue;
      sets++;
      volume += (s.weight ?? 0) * (s.reps ?? 0);
    }
  }
  const end = w.endedAt ?? Date.now();
  return { sets, volume: Math.round(volume), ms: end - w.startedAt, exercises: w.entries.filter((e) => !e.skipped && e.sets.some((s) => s.done)).length };
}

/** Estimation de durée : séries × (≈ 45 s d'effort + repos). */
export function estimateMinutes(slots: Slot[]): number {
  const sec = slots.reduce((a, s) => a + s.sets * (45 + s.restSec), 0) + slots.length * 60;
  return Math.round(sec / 60 / 5) * 5;
}

export interface EntryComparison {
  exerciseId: string;
  text: string;
  tone: 'up' | 'down' | 'same' | 'new';
}

/** Comparaison de chaque exercice avec sa séance précédente (charge de travail, puis reps à charge égale). */
export function entryComparisons(workouts: Workout[], w: Workout): EntryComparison[] {
  const out: EntryComparison[] = [];
  for (const e of w.entries) {
    if (e.skipped) continue;
    const sets = e.sets.filter((s) => s.done && s.reps != null).map((s) => ({ weight: s.weight, reps: s.reps as number }));
    if (!sets.length) continue;
    const hist = exerciseHistory(workouts, e.exerciseId, w.id).filter((p) => p.date < w.startedAt);
    const prev = hist[hist.length - 1];
    if (!prev) {
      out.push({ exerciseId: e.exerciseId, text: 'Première séance enregistrée.', tone: 'new' });
      continue;
    }
    const cur = { date: w.startedAt, sets };
    const cw = workingWeight(cur);
    const pw = workingWeight(prev);
    if (cw !== pw) {
      const d = cw - pw;
      out.push({ exerciseId: e.exerciseId, text: `${d > 0 ? '+' : '−'}${num(Math.abs(d))} kg depuis la dernière séance.`, tone: d > 0 ? 'up' : 'down' });
      continue;
    }
    const n = e.target.sets;
    const doneHere = setsAt(cur, cw, n).length;
    if (doneHere < Math.min(n, setsAt(prev, pw, n).length)) {
      out.push({ exerciseId: e.exerciseId, text: `${doneHere} série${doneHere > 1 ? 's' : ''} sur ${n} : pas de comparaison.`, tone: 'same' });
      continue;
    }
    const dr = totalReps(setsAt(cur, cw, n)) - totalReps(setsAt(prev, pw, n));
    if (dr === 0) out.push({ exerciseId: e.exerciseId, text: 'Même performance que la dernière fois.', tone: 'same' });
    else out.push({ exerciseId: e.exerciseId, text: `${dr > 0 ? '+' : '−'}${Math.abs(dr)} rep${Math.abs(dr) > 1 ? 's' : ''} à charge identique.`, tone: dr > 0 ? 'up' : 'down' });
  }
  return out;
}
