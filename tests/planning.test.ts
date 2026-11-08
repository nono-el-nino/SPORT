import { describe, expect, it } from 'vitest';
import { buildWeek, goalProgress, nextTemplate, weekKey, weeklyAverages } from '../src/lib/planning';
import { computeFacts, localSummary } from '../src/lib/facts';
import { defaultProgram, defaultSettings } from '../src/lib/defaults';
import type { Workout } from '../src/lib/types';

const wk = (id: string, template: 'A' | 'B', date: string, status: Workout['status'] = 'done', entries: Workout['entries'] = []): Workout => ({
  id,
  template,
  short: false,
  startedAt: new Date(`${date}T18:00:00`).getTime(),
  endedAt: new Date(`${date}T18:35:00`).getTime(),
  status,
  current: 0,
  entries,
});

describe('alternance A/B', () => {
  it('commence par A', () => expect(nextTemplate([])).toBe('A'));
  it('dépend des séances réellement terminées', () => {
    expect(nextTemplate([wk('1', 'A', '2026-11-02')])).toBe('B');
    expect(nextTemplate([wk('1', 'A', '2026-11-02'), wk('2', 'B', '2026-11-04')])).toBe('A');
  });
  it('une séance abandonnée ou manquée ne fait pas avancer l’alternance', () => {
    expect(nextTemplate([wk('1', 'A', '2026-11-02'), wk('2', 'B', '2026-11-04', 'abandoned')])).toBe('B');
  });
  it('l’ordre chronologique prime sur l’ordre de stockage', () => {
    expect(nextTemplate([wk('2', 'B', '2026-11-04'), wk('1', 'A', '2026-11-02')])).toBe('A');
  });
});

describe('semaine', () => {
  it('distingue prévu et réalisé', () => {
    const s = defaultSettings();
    const week = buildWeek(
      new Date('2026-11-04T12:00:00'),
      s,
      [wk('1', 'A', '2026-11-03')],
      [{ id: 'x', kind: 'basket', date: '2026-11-03' }],
      [
        { id: 'p1', date: '2026-11-06', kind: 'B' },
        { id: 'm', date: '2026-11-08', kind: 'match' },
      ],
    );
    expect(week[0].date).toBe('2026-11-02');
    const tue = week[1].items;
    expect(tue.find((i) => i.kind === 'A')?.done).toBe(true);
    expect(tue.find((i) => i.kind === 'basket')?.done).toBe(true);
    expect(week[3].items.find((i) => i.kind === 'basket')?.done).toBe(false);
    expect(week[4].items.find((i) => i.kind === 'B')?.done).toBe(false);
    expect(week[6].items.find((i) => i.kind === 'match')?.done).toBe(false);
  });
});

describe('poids', () => {
  it('moyenne hebdomadaire', () => {
    const a = weeklyAverages([
      { id: '2026-11-02', date: '2026-11-02', kg: 94.2 },
      { id: '2026-11-04', date: '2026-11-04', kg: 94.6 },
      { id: '2026-11-10', date: '2026-11-10', kg: 95 },
    ]);
    expect(a).toHaveLength(2);
    expect(a[0].avg).toBe(94.4);
    expect(a[0].week).toBe(weekKey('2026-11-02'));
  });
  it('progression vers 100 kg', () => {
    expect(goalProgress(97, 94, 100)).toBe(0.5);
    expect(goalProgress(92, 94, 100)).toBe(0);
  });
});

describe('Le point — faits locaux', () => {
  const entry = (exerciseId: string, weight: number, reps: number[]) => ({
    slotId: 'a1',
    exerciseId,
    target: { sets: 2, repMin: 6, repMax: 10, restSec: 90 },
    sets: reps.map((r) => ({ weight, reps: r, done: true })),
  });

  it('données insuffisantes', () => {
    const f = computeFacts(defaultProgram(), [wk('1', 'A', '2026-11-02')], [], [], defaultSettings(), new Date('2026-11-08T12:00:00'));
    expect(localSummary(f)[0]).toBe('Pas encore assez de séances pour dégager une tendance.');
    expect(f.missing.length).toBeGreaterThan(0);
  });

  it('chiffres exacts : reps gagnées à charge identique et stagnation', () => {
    const ws = [
      wk('1', 'A', '2026-10-20', 'done', [entry('bench', 80, [8, 8]), entry('cable-row', 60, [10, 9])]),
      wk('2', 'A', '2026-10-27', 'done', [entry('bench', 80, [8, 8]), entry('cable-row', 60, [10, 9])]),
      wk('3', 'A', '2026-11-03', 'done', [entry('bench', 80, [8, 8]), entry('cable-row', 60, [11, 10])]),
    ];
    const f = computeFacts(defaultProgram(), ws, [], [{ id: 'b', kind: 'basket', date: '2026-11-03' }], defaultSettings(), new Date('2026-11-08T12:00:00'));
    const row = f.exercises.find((e) => e.id === 'cable-row')!;
    expect(row.repsChangeSamePrevious).toBe(2);
    const bench = f.exercises.find((e) => e.id === 'bench')!;
    expect(bench.flatSessions).toBe(3);
    const text = localSummary(f).join(' ');
    expect(text).toContain('Rowing horizontal poulie : +2 répétitions à charge identique depuis la dernière séance.');
    expect(text).toContain('Développé couché : performances stables depuis 3 séances à 80 kg.');
    expect(text).toContain('1 entraînement de basket');
    expect(f.activities.basket).toBe(1);
  });
});
