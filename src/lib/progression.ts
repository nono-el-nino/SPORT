/**
 * Double progression déterministe.
 *
 * 1. Tant que toutes les séries n'atteignent pas le haut de la fourchette :
 *    même charge, on cherche +1 rep par série.
 * 2. Toutes les séries au maximum + exécution maîtrisée → hausse de charge.
 * 3. Qualité non renseignée → hausse proposée en option (confirmation)
 *    ou automatique après une seconde séance réussie à la même charge.
 * 4. Performances en baisse → jamais de hausse.
 * 5. Deux baisses comparables consécutives → allègement proposé (option).
 * 6. Rien n'est imposé : la charge préremplie reste celle de la dernière séance
 *    sauf règle 2/3 ; les hausses et allègements optionnels passent par un geste.
 *
 * L'historique est propre à chaque exercice (les variantes ont le leur).
 */
import { num } from './format';
import type { Quality } from './types';

export interface PerfSet {
  weight: number | null;
  reps: number;
}

export interface Perf {
  date: number;
  sets: PerfSet[];
  quality?: Quality;
}

export interface ProgConfig {
  sets: number;
  repMin: number;
  repMax: number;
  increment: number;
}

export type SuggestionKind = 'first' | 'increase' | 'confirm' | 'hold' | 'decline' | 'deload' | 'top-bodyweight';

export interface Suggestion {
  kind: SuggestionKind;
  /** Charge préremplie. null = aucune référence, saisie libre. */
  weight: number | null;
  /** Répétitions visées, une valeur par série. */
  reps: number[];
  /** Phrase courte affichée en séance. */
  message: string;
  /** Option explicite (hausse confirmée ou allègement). */
  option?: { weight: number; label: string };
  /** Dernière performance de référence. */
  last?: Perf;
}

const kgs = (w: number) => `${num(w)} kg`;

/** Charge de travail d'une séance : la plus lourde utilisée. */
export function workingWeight(p: Perf): number {
  let w = 0;
  for (const s of p.sets) if (s.weight != null && s.weight > w) w = s.weight;
  return w;
}

/** Séries réalisées à la charge de travail, limitées au nombre prévu. */
export function setsAt(p: Perf, w: number, count: number): PerfSet[] {
  return p.sets.filter((s) => (s.weight ?? 0) === w).slice(0, count);
}

export function totalReps(sets: PerfSet[]): number {
  return sets.reduce((a, s) => a + s.reps, 0);
}

export function allAtTop(p: Perf, cfg: ProgConfig): boolean {
  const w = workingWeight(p);
  const s = setsAt(p, w, cfg.sets);
  return s.length >= cfg.sets && s.every((x) => x.reps >= cfg.repMax);
}

/** Séances comparables = même charge de travail et même nombre de séries complètes. */
function comparable(a: Perf, b: Perf, cfg: ProgConfig): boolean {
  const wa = workingWeight(a);
  return wa === workingWeight(b) && setsAt(a, wa, cfg.sets).length === setsAt(b, wa, cfg.sets).length;
}

/** Nombre de baisses consécutives (comparables) se terminant à la dernière séance. */
export function consecutiveDeclines(perfs: Perf[], cfg: ProgConfig): number {
  let n = 0;
  for (let i = perfs.length - 1; i > 0; i--) {
    const cur = perfs[i];
    const prev = perfs[i - 1];
    if (!comparable(cur, prev, cfg)) break;
    const w = workingWeight(cur);
    if (totalReps(setsAt(cur, w, cfg.sets)) < totalReps(setsAt(prev, w, cfg.sets))) n++;
    else break;
  }
  return n;
}

export function roundTo(w: number, step: number): number {
  if (!step || step <= 0) return Math.round(w * 100) / 100;
  return Math.round(Math.round(w / step) * step * 100) / 100;
}

function repsLabel(reps: number[]): string {
  const uniq = [...new Set(reps)];
  return uniq.length === 1 ? `${uniq[0]} reps` : `${reps.join(' · ')} reps`;
}

export function suggest(history: Perf[], cfg: ProgConfig): Suggestion {
  const perfs = history.filter((p) => p.sets.length > 0);
  if (perfs.length === 0) {
    return {
      kind: 'first',
      weight: null,
      reps: Array(cfg.sets).fill(cfg.repMin),
      message: `Première fois. Choisis une charge pour ${cfg.repMin} à ${cfg.repMax} reps.`,
    };
  }

  const last = perfs[perfs.length - 1];
  const prev = perfs.length > 1 ? perfs[perfs.length - 2] : undefined;
  const w = workingWeight(last);
  const lastSets = setsAt(last, w, cfg.sets);
  const complete = lastSets.length >= cfg.sets;
  const top = allAtTop(last, cfg);
  const declined = prev !== undefined && comparable(last, prev, cfg) && totalReps(lastSets) < totalReps(setsAt(prev, w, cfg.sets));
  const nSets = cfg.sets;

  // Poids du corps : la charge ne s'incrémente pas automatiquement.
  if (top && !declined && w === 0) {
    return {
      kind: 'top-bodyweight',
      weight: 0,
      reps: Array(nSets).fill(cfg.repMax),
      message: `${nSets} × ${cfg.repMax} validées au poids du corps. Ajoute du lest si possible.`,
      last,
    };
  }

  if (top && !declined) {
    const next = roundTo(w + cfg.increment, cfg.increment);
    const base = `${nSets} × ${cfg.repMax} validées à ${kgs(w)}.`;
    if (last.quality === 'ok') {
      return { kind: 'increase', weight: next, reps: Array(nSets).fill(cfg.repMin), message: `${base} Essaie ${kgs(next)}.`, last };
    }
    if (last.quality === 'limit') {
      return {
        kind: 'hold',
        weight: w,
        reps: Array(nSets).fill(cfg.repMax),
        message: `Exécution limite à ${kgs(w)}. Même charge, mêmes reps, plus propres.`,
        last,
      };
    }
    // Qualité non renseignée : seconde séance réussie à la même charge → hausse.
    if (prev && workingWeight(prev) === w && allAtTop(prev, cfg) && prev.quality !== 'limit') {
      return {
        kind: 'increase',
        weight: next,
        reps: Array(nSets).fill(cfg.repMin),
        message: `${base} Deux séances de suite. Essaie ${kgs(next)}.`,
        last,
      };
    }
    return {
      kind: 'confirm',
      weight: w,
      reps: Array(nSets).fill(cfg.repMax),
      message: `${base} Exécution maîtrisée ? Passe à ${kgs(next)}.`,
      option: { weight: next, label: `Passer à ${kgs(next)}` },
      last,
    };
  }

  if (declined) {
    const prevSets = setsAt(prev!, w, cfg.sets);
    const target = Array.from({ length: nSets }, (_, i) => Math.max(cfg.repMin, prevSets[i]?.reps ?? cfg.repMin));
    if (consecutiveDeclines(perfs, cfg) >= 2 && w > 0) {
      const lighter = roundTo(w * 0.9, cfg.increment);
      const deload = lighter < w ? lighter : roundTo(w - cfg.increment, cfg.increment);
      return {
        kind: 'deload',
        weight: w,
        reps: target,
        message: `Deux baisses de suite à ${kgs(w)}. Garde la charge ou allège à ${kgs(deload)}.`,
        option: { weight: deload, label: `Alléger à ${kgs(deload)}` },
        last,
      };
    }
    return {
      kind: 'decline',
      weight: w,
      reps: target,
      message: `Moins de reps que la fois d'avant. Même charge. Vise ${repsLabel(target)}.`,
      last,
    };
  }

  // Cas courant : on garde la charge et on ajoute une rep par série.
  const target = Array.from({ length: nSets }, (_, i) => {
    const r = lastSets[i]?.reps;
    if (r == null) return cfg.repMin;
    return Math.min(cfg.repMax, Math.max(cfg.repMin, r + 1));
  });
  const message = complete
    ? `Même charge. Vise ${repsLabel(target)}.`
    : `Dernière séance incomplète. Même charge. Vise ${repsLabel(target)}.`;
  return { kind: 'hold', weight: w, reps: target, message, last };
}

/** Écart de charge entre deux séances, pour « +2,5 kg depuis la dernière séance ». */
export function weightDelta(history: Perf[]): number | null {
  const p = history.filter((x) => x.sets.length);
  if (p.length < 2) return null;
  return workingWeight(p[p.length - 1]) - workingWeight(p[p.length - 2]);
}
