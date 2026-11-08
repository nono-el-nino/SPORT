import type { Exercise, Program, Settings, Slot } from './types';

const ex = (id: string, name: string, increment: number): Exercise => ({ id, name, increment });

export const DEFAULT_EXERCISES: Exercise[] = [
  // Séance A
  ex('bench', 'Développé couché', 2.5),
  ex('lat-pulldown', 'Tirage vertical', 5),
  ex('incline-db', 'Développé incliné haltères', 2),
  ex('cable-row', 'Rowing horizontal poulie', 5),
  ex('lateral-db', 'Élévations latérales', 1),
  // Séance B
  ex('ohp-db', 'Développé épaules haltères', 2),
  ex('barbell-row', 'Rowing barre', 2.5),
  ex('chest-press', 'Chest press', 5),
  ex('leg-press', 'Presse à cuisses', 10),
  ex('leg-curl', 'Leg curl', 5),
  // Alternatives
  ex('db-bench', 'Développé couché haltères', 2),
  ex('smith-bench', 'Développé couché Smith', 2.5),
  ex('pullup', 'Tractions', 2.5),
  ex('lat-neutral', 'Tirage vertical prise neutre', 5),
  ex('incline-bar', 'Développé incliné barre', 2.5),
  ex('incline-machine', 'Développé incliné machine', 5),
  ex('row-machine', 'Rowing machine appui poitrine', 5),
  ex('row-db', 'Rowing haltère un bras', 2),
  ex('lateral-cable', 'Élévations latérales poulie', 1.25),
  ex('lateral-machine', 'Élévations latérales machine', 2.5),
  ex('ohp-machine', 'Développé épaules machine', 5),
  ex('ohp-bar', 'Développé militaire barre', 2.5),
  ex('row-tbar', 'Rowing T-bar', 2.5),
  ex('dips', 'Dips', 2.5),
  ex('hack-squat', 'Hack squat', 5),
  ex('bulgarian', 'Fentes bulgares haltères', 2),
  ex('rdl-db', 'Soulevé de terre roumain haltères', 2),
  ex('leg-curl-lying', 'Leg curl allongé', 5),
];

const slot = (
  id: string,
  exerciseId: string,
  sets: number,
  repMin: number,
  repMax: number,
  restSec: number,
  core: boolean,
  alternatives: string[],
): Slot => ({ id, exerciseId, sets, repMin, repMax, restSec, core, alternatives });

export function defaultProgram(): Program {
  const exercises: Program['exercises'] = {};
  for (const e of DEFAULT_EXERCISES) exercises[e.id] = { ...e };
  return {
    exercises,
    templates: {
      A: {
        id: 'A',
        title: 'Haut du corps',
        slots: [
          slot('a1', 'bench', 2, 6, 10, 150, true, ['db-bench', 'smith-bench', 'chest-press']),
          slot('a2', 'lat-pulldown', 2, 8, 12, 120, true, ['pullup', 'lat-neutral']),
          slot('a3', 'incline-db', 2, 8, 12, 120, false, ['incline-bar', 'incline-machine']),
          slot('a4', 'cable-row', 2, 8, 12, 120, true, ['row-machine', 'row-db']),
          slot('a5', 'lateral-db', 2, 12, 20, 60, false, ['lateral-cable', 'lateral-machine']),
        ],
      },
      B: {
        id: 'B',
        title: 'Haut du corps + jambes',
        slots: [
          slot('b1', 'ohp-db', 2, 6, 10, 150, true, ['ohp-machine', 'ohp-bar']),
          slot('b2', 'barbell-row', 2, 8, 12, 120, true, ['row-tbar', 'row-db', 'row-machine']),
          slot('b3', 'chest-press', 2, 8, 12, 120, false, ['db-bench', 'dips']),
          slot('b4', 'leg-press', 2, 8, 12, 150, true, ['hack-squat', 'bulgarian']),
          slot('b5', 'leg-curl', 2, 10, 15, 90, false, ['leg-curl-lying', 'rdl-db']),
        ],
      },
    },
  };
}

export function defaultSettings(): Settings {
  return {
    basket: [
      { day: 1, time: '20:00' },
      { day: 3, time: '20:00' },
    ],
    restTimer: true,
    startKg: 94,
    targetKg: 100,
    heightCm: 197,
    aiProvider: 'anthropic',
  };
}
