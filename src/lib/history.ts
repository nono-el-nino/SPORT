import type { Perf } from './progression';
import type { Workout } from './types';

/** Performances passées d'un exercice (séances terminées, séries validées), de la plus ancienne à la plus récente. */
export function exerciseHistory(workouts: Workout[], exerciseId: string, excludeId?: string): Perf[] {
  const out: Perf[] = [];
  const sorted = workouts
    .filter((w) => w.status === 'done' && w.id !== excludeId)
    .sort((a, b) => a.startedAt - b.startedAt);
  for (const w of sorted) {
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId || e.skipped) continue;
      const sets = e.sets.filter((s) => s.done && s.reps != null).map((s) => ({ weight: s.weight, reps: s.reps as number }));
      if (sets.length) out.push({ date: w.startedAt, sets, quality: e.quality });
    }
  }
  return out;
}

/** Ids des exercices ayant au moins une performance. */
export function exercisesWithHistory(workouts: Workout[]): string[] {
  const ids = new Set<string>();
  for (const w of workouts) {
    if (w.status !== 'done') continue;
    for (const e of w.entries) if (!e.skipped && e.sets.some((s) => s.done)) ids.add(e.exerciseId);
  }
  return [...ids];
}
