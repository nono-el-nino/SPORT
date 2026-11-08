import { describe, expect, it } from 'vitest';
import { defaultProgram } from '../src/lib/defaults';
import { activeSetIndex, nextOpenEntry, startWorkout, swapExercise, updateSet, validateSet } from '../src/lib/session';
import type { Workout } from '../src/lib/types';

const program = defaultProgram();

const doneWorkout = (exerciseId: string, weight: number, reps: number[]): Workout => ({
  id: 'old',
  template: 'A',
  short: false,
  startedAt: 1000,
  endedAt: 2000,
  status: 'done',
  current: 0,
  entries: [
    {
      slotId: 'a1',
      exerciseId,
      target: { sets: 2, repMin: 6, repMax: 10, restSec: 150 },
      sets: reps.map((r) => ({ weight, reps: r, done: true })),
    },
  ],
});

describe('mode séance', () => {
  it('première séance : aucune charge préremplie', () => {
    const w = startWorkout(program, [], 'A', false);
    expect(w.entries).toHaveLength(5);
    expect(w.entries[0].sets.every((s) => s.weight === null)).toBe(true);
    expect(w.entries[0].sets.map((s) => s.reps)).toEqual([6, 6]);
  });

  it('préremplit charge et reps cibles depuis l’historique', () => {
    const w = startWorkout(program, [doneWorkout('bench', 80, [8, 7])], 'A', false);
    expect(w.entries[0].sets.map((s) => [s.weight, s.reps])).toEqual([
      [80, 9],
      [80, 8],
    ]);
    expect(w.entries[0].suggestion).toBe('Même charge. Vise 9 · 8 reps.');
  });

  it('format court : exercices prioritaires seulement', () => {
    const w = startWorkout(program, [], 'A', true);
    expect(w.entries.map((e) => e.exerciseId)).toEqual(['bench', 'lat-pulldown', 'cable-row']);
  });

  it('variante : historique et préremplissage propres', () => {
    const hist = [doneWorkout('bench', 80, [10, 10]), { ...doneWorkout('db-bench', 30, [9, 9]), id: 'old2', startedAt: 3000 }];
    let w = startWorkout(program, hist, 'A', false);
    w = swapExercise(program, hist, w, 0, 'db-bench');
    expect(w.entries[0].exerciseId).toBe('db-bench');
    expect(w.entries[0].sets[0].weight).toBe(30);
    w = swapExercise(program, hist, w, 0, 'smith-bench');
    expect(w.entries[0].sets[0].weight).toBeNull();
  });

  it('validation en un geste et propagation de charge', () => {
    let w = startWorkout(program, [doneWorkout('bench', 80, [8, 8])], 'A', false);
    w = updateSet(w, 0, 0, { weight: 82.5 });
    expect(w.entries[0].sets[1].weight).toBe(82.5);
    w = validateSet(w, 0, 0);
    expect(activeSetIndex(w.entries[0])).toBe(1);
    w = validateSet(w, 0, 1);
    expect(nextOpenEntry(w, 0)).toBe(1);
  });
});

describe('bilan de fin de séance', () => {
  it('une séance incomplète n’est pas comptée comme une baisse', async () => {
    const { entryComparisons } = await import('../src/lib/session');
    const hist = [doneWorkout('bench', 80, [8, 8])];
    let w = startWorkout(program, hist, 'A', false);
    w = validateSet(w, 0, 0);
    const c = entryComparisons(hist, { ...w, startedAt: 5000 });
    expect(c[0].text).toBe('1 série sur 2 : pas de comparaison.');
  });
});
