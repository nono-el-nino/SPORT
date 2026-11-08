import { describe, expect, it } from 'vitest';
import { consecutiveDeclines, suggest, type Perf, type ProgConfig } from '../src/lib/progression';
import { exerciseHistory } from '../src/lib/history';
import type { Workout } from '../src/lib/types';

const cfg: ProgConfig = { sets: 2, repMin: 8, repMax: 12, increment: 2.5 };
let day = 0;
const p = (weight: number, reps: number[], quality?: Perf['quality']): Perf => ({
  date: ++day * 86400000,
  sets: reps.map((r) => ({ weight, reps: r })),
  quality,
});

describe('double progression', () => {
  it('première utilisation : aucune charge inventée', () => {
    const s = suggest([], cfg);
    expect(s.kind).toBe('first');
    expect(s.weight).toBeNull();
    expect(s.reps).toEqual([8, 8]);
  });

  it('règle 1 : sous le haut de fourchette → même charge, +1 rep par série', () => {
    const s = suggest([p(60, [10, 9])], cfg);
    expect(s.kind).toBe('hold');
    expect(s.weight).toBe(60);
    expect(s.reps).toEqual([11, 10]);
    expect(s.message).toBe('Même charge. Vise 11 · 10 reps.');
  });

  it('la cible ne dépasse jamais le haut de fourchette', () => {
    const s = suggest([p(60, [12, 11])], cfg);
    expect(s.reps).toEqual([12, 12]);
    expect(s.message).toBe('Même charge. Vise 12 reps.');
  });

  it('règle 2 : toutes les séries au max + exécution maîtrisée → hausse', () => {
    const s = suggest([p(60, [12, 12], 'ok')], cfg);
    expect(s.kind).toBe('increase');
    expect(s.weight).toBe(62.5);
    expect(s.reps).toEqual([8, 8]);
    expect(s.message).toBe('2 × 12 validées à 60 kg. Essaie 62,5 kg.');
  });

  it('règle 3a : qualité non renseignée → charge conservée, hausse proposée en option', () => {
    const s = suggest([p(60, [12, 12])], cfg);
    expect(s.kind).toBe('confirm');
    expect(s.weight).toBe(60);
    expect(s.option).toEqual({ weight: 62.5, label: 'Passer à 62,5 kg' });
  });

  it('règle 3b : seconde séance réussie à la même charge → hausse', () => {
    const s = suggest([p(60, [12, 12]), p(60, [12, 13])], cfg);
    expect(s.kind).toBe('increase');
    expect(s.weight).toBe(62.5);
  });

  it('exécution signalée limite → pas de hausse', () => {
    const s = suggest([p(60, [12, 12], 'limit')], cfg);
    expect(s.kind).toBe('hold');
    expect(s.weight).toBe(60);
  });

  it('règle 4 : performances en baisse → jamais de hausse, même au max', () => {
    // 13+13 puis 12+12 : au max mais en baisse
    const s = suggest([p(60, [13, 13]), p(60, [12, 12], 'ok')], cfg);
    expect(s.kind).toBe('decline');
    expect(s.weight).toBe(60);
  });

  it('une baisse isolée → même charge, cible = séance précédente', () => {
    const s = suggest([p(60, [10, 10]), p(60, [9, 8])], cfg);
    expect(s.kind).toBe('decline');
    expect(s.weight).toBe(60);
    expect(s.reps).toEqual([10, 10]);
  });

  it('règle 5 : deux contre-performances comparables → allègement proposé, pas imposé', () => {
    const h = [p(60, [11, 10]), p(60, [10, 9]), p(60, [9, 8])];
    expect(consecutiveDeclines(h, cfg)).toBe(2);
    const s = suggest(h, cfg);
    expect(s.kind).toBe('deload');
    expect(s.weight).toBe(60); // préremplie : charge actuelle
    expect(s.option?.weight).toBe(55); // 54 → arrondi au pas de 2,5
    expect(s.message).toBe('Deux baisses de suite à 60 kg. Garde la charge ou allège à 55 kg.');
  });

  it('baisses non comparables (charge différente) → pas d’allègement', () => {
    const h = [p(57.5, [12, 12]), p(60, [10, 9]), p(60, [9, 8])];
    expect(consecutiveDeclines(h, cfg)).toBe(1);
    expect(suggest(h, cfg).kind).toBe('decline');
  });

  it('stagnation : reps identiques sur plusieurs séances → même charge, même cible', () => {
    const h = [p(60, [10, 10]), p(60, [10, 10]), p(60, [10, 10])];
    const s = suggest(h, cfg);
    expect(s.kind).toBe('hold');
    expect(s.weight).toBe(60);
    expect(s.reps).toEqual([11, 11]);
  });

  it('série incomplète : jamais de hausse, même si la série faite est au max', () => {
    const s = suggest([p(60, [12])], cfg);
    expect(s.kind).toBe('hold');
    expect(s.weight).toBe(60);
    expect(s.reps).toEqual([12, 8]);
    expect(s.message).toMatch(/incomplète/);
  });

  it('séance incomplète puis complète → comparaison non faussée', () => {
    const s = suggest([p(60, [12, 12]), p(60, [12])], cfg);
    expect(s.kind).toBe('hold');
  });

  it('séries à charges mixtes : seule la charge de travail compte', () => {
    const perf: Perf = { date: 1, sets: [{ weight: 60, reps: 12 }, { weight: 55, reps: 12 }] };
    const s = suggest([perf], cfg);
    expect(s.kind).toBe('hold'); // une seule série à 60 kg : incomplète
    expect(s.weight).toBe(60);
  });

  it('poids du corps au max → aucune charge inventée', () => {
    const s = suggest([p(0, [12, 12], 'ok')], cfg);
    expect(s.kind).toBe('top-bodyweight');
    expect(s.weight).toBe(0);
  });

  it('incrément configurable (haltères de 2 kg)', () => {
    const s = suggest([p(24, [12, 12], 'ok')], { ...cfg, increment: 2 });
    expect(s.weight).toBe(26);
  });
});

describe('historique par variante', () => {
  const w = (id: string, exerciseId: string, weight: number, reps: number[], status: Workout['status'] = 'done'): Workout => ({
    id,
    template: 'A',
    short: false,
    startedAt: Number(id) * 1000,
    status,
    current: 0,
    entries: [
      {
        slotId: 'a1',
        exerciseId,
        target: { sets: 2, repMin: 8, repMax: 12, restSec: 90 },
        sets: reps.map((r) => ({ weight, reps: r, done: true })),
      },
    ],
  });

  it('les alternatives ont un historique distinct, sans équivalence', () => {
    const ws = [w('1', 'bench', 80, [10, 9]), w('2', 'db-bench', 30, [12, 12]), w('3', 'bench', 80, [11, 10])];
    const bench = exerciseHistory(ws, 'bench');
    const db = exerciseHistory(ws, 'db-bench');
    expect(bench.map((x) => x.sets[0].weight)).toEqual([80, 80]);
    expect(db).toHaveLength(1);
    expect(suggest(bench, cfg).weight).toBe(80);
    expect(suggest(db, { ...cfg, increment: 2 }).kind).toBe('confirm');
    // Une variante jamais faite : saisie libre
    expect(suggest(exerciseHistory(ws, 'smith-bench'), cfg).kind).toBe('first');
  });

  it('les séances abandonnées ou en cours ne comptent pas', () => {
    const ws = [w('1', 'bench', 80, [12, 12], 'abandoned'), w('2', 'bench', 85, [6, 6], 'active')];
    expect(exerciseHistory(ws, 'bench')).toHaveLength(0);
  });
});
