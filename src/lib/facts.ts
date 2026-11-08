/**
 * Moteur de faits pour « Le point ».
 * Calcule localement des faits chiffrés ; c'est la seule matière transmise à l'IA,
 * et la base du bilan local affiché sans connexion.
 */
import { dateShort, isoDay, num, signed } from './format';
import { exerciseHistory, exercisesWithHistory } from './history';
import { addDays, mondayOf, weekKey, weeklyAverages } from './planning';
import { allAtTop, setsAt, suggest, totalReps, workingWeight, type Perf } from './progression';
import type { Activity, Program, Settings, WeightEntry, Workout } from './types';

export interface PerfSummary {
  date: string;
  weight: number;
  reps: number[];
}

export interface ExerciseFact {
  id: string;
  name: string;
  sessions: number;
  first: PerfSummary;
  last: PerfSummary;
  previous?: PerfSummary;
  /** Variation de charge depuis la première séance de la période. */
  weightChange: number;
  /** Reps gagnées à charge identique depuis la séance précédente (null si charges différentes). */
  repsChangeSamePrevious: number | null;
  /** Nombre de séances consécutives à charge identique sans progression du total de reps (≥ 3 = stagnation). */
  flatSessions: number;
  allSetsAtTop: boolean;
  nextSuggestion: string;
}

export interface Facts {
  generatedAt: string;
  windowWeeks: number;
  workouts: {
    totalDone: number;
    inWindow: number;
    perWeek: { week: string; count: number }[];
    last?: { date: string; template: string; durationMin: number | null; notes?: string };
  };
  exercises: ExerciseFact[];
  bodyweight: {
    start: number;
    target: number;
    weeklyAverages: { week: string; avg: number; count: number }[];
    changeOverWindow: number | null;
  };
  activities: { basket: number; match: number; jogging: number };
  missing: string[];
}

const summary = (p: Perf, repCount: number): PerfSummary => {
  const w = workingWeight(p);
  return { date: isoDay(p.date), weight: w, reps: setsAt(p, w, repCount).map((s) => s.reps) };
};

function flatCount(perfs: Perf[], sets: number): number {
  let n = 1;
  for (let i = perfs.length - 1; i > 0; i--) {
    const a = perfs[i];
    const b = perfs[i - 1];
    const w = workingWeight(a);
    if (w !== workingWeight(b)) break;
    if (totalReps(setsAt(a, w, sets)) > totalReps(setsAt(b, w, sets))) break;
    n++;
  }
  return n;
}

export function computeFacts(
  program: Program,
  workouts: Workout[],
  weights: WeightEntry[],
  activities: Activity[],
  settings: Settings,
  now = new Date(),
  windowWeeks = 6,
): Facts {
  const since = addDays(mondayOf(now), -7 * (windowWeeks - 1)).getTime();
  const done = workouts.filter((w) => w.status === 'done').sort((a, b) => a.startedAt - b.startedAt);
  const inWindow = done.filter((w) => w.startedAt >= since);

  const perWeek: { week: string; count: number }[] = [];
  for (let i = windowWeeks - 1; i >= 0; i--) {
    const mon = addDays(mondayOf(now), -7 * i);
    const k = weekKey(mon);
    perWeek.push({ week: k, count: inWindow.filter((w) => weekKey(w.startedAt) === k).length });
  }

  const slotCfg = (exId: string) => {
    for (const t of Object.values(program.templates)) {
      for (const s of t.slots) if (s.exerciseId === exId || s.alternatives.includes(exId)) return s;
    }
    return undefined;
  };

  const exercises: ExerciseFact[] = [];
  for (const id of exercisesWithHistory(done)) {
    const all = exerciseHistory(done, id);
    const perfs = all.filter((p) => p.date >= since);
    if (!perfs.length) continue;
    const slot = slotCfg(id);
    const cfg = {
      sets: slot?.sets ?? perfs[perfs.length - 1].sets.length,
      repMin: slot?.repMin ?? 8,
      repMax: slot?.repMax ?? 12,
      increment: program.exercises[id]?.increment ?? 2.5,
    };
    const last = perfs[perfs.length - 1];
    const prev = all.length > 1 ? all[all.length - 2] : undefined;
    const lw = workingWeight(last);
    const sameW = prev && workingWeight(prev) === lw;
    exercises.push({
      id,
      name: program.exercises[id]?.name ?? id,
      sessions: perfs.length,
      first: summary(perfs[0], cfg.sets),
      last: summary(last, cfg.sets),
      previous: prev ? summary(prev, cfg.sets) : undefined,
      weightChange: lw - workingWeight(perfs[0]),
      repsChangeSamePrevious: sameW ? totalReps(setsAt(last, lw, cfg.sets)) - totalReps(setsAt(prev!, lw, cfg.sets)) : null,
      flatSessions: flatCount(all, cfg.sets),
      allSetsAtTop: allAtTop(last, cfg),
      nextSuggestion: suggest(all, cfg).message,
    });
  }

  const avgs = weeklyAverages(weights).filter((w) => w.monday >= isoDay(since));
  const changeOverWindow = avgs.length >= 2 ? Math.round((avgs[avgs.length - 1].avg - avgs[0].avg) * 10) / 10 : null;

  const actsIn = activities.filter((a) => a.date >= isoDay(since));
  const count = (k: Activity['kind']) => actsIn.filter((a) => a.kind === k).length;

  const missing: string[] = [];
  if (done.length < 2) missing.push('Moins de deux séances de musculation enregistrées.');
  if (avgs.length < 2) missing.push('Moins de deux semaines de pesées.');
  if (exercises.every((e) => e.sessions < 2)) missing.push("Aucun exercice n'a encore deux séances dans la période.");

  const lastW = done[done.length - 1];
  return {
    generatedAt: now.toISOString(),
    windowWeeks,
    workouts: {
      totalDone: done.length,
      inWindow: inWindow.length,
      perWeek,
      last: lastW
        ? {
            date: isoDay(lastW.startedAt),
            template: lastW.template,
            durationMin: lastW.endedAt ? Math.round((lastW.endedAt - lastW.startedAt) / 60000) : null,
            notes: lastW.notes || undefined,
          }
        : undefined,
    },
    exercises: exercises.sort((a, b) => b.sessions - a.sessions),
    bodyweight: {
      start: settings.startKg,
      target: settings.targetKg,
      weeklyAverages: avgs.map(({ week, avg, count }) => ({ week, avg, count })),
      changeOverWindow,
    },
    activities: { basket: count('basket'), match: count('match'), jogging: count('jogging') },
    missing,
  };
}

/** Bilan factuel local : 2 à 4 phrases, chiffres exacts, aucune extrapolation. */
export function localSummary(f: Facts): string[] {
  const out: string[] = [];
  if (f.workouts.totalDone < 2) {
    out.push('Pas encore assez de séances pour dégager une tendance.');
    const wk = f.bodyweight.weeklyAverages;
    if (wk.length) out.push(`Moyenne de poids cette semaine : ${num(wk[wk.length - 1].avg)} kg.`);
    return out;
  }

  // Progression la plus nette à charge identique
  const gains = f.exercises
    .filter((e) => (e.repsChangeSamePrevious ?? 0) > 0)
    .sort((a, b) => (b.repsChangeSamePrevious ?? 0) - (a.repsChangeSamePrevious ?? 0));
  const loads = f.exercises.filter((e) => e.weightChange > 0).sort((a, b) => b.weightChange - a.weightChange);
  if (loads[0]) {
    const e = loads[0];
    out.push(`${e.name} : ${signed(e.weightChange, 'kg')} depuis le ${dateShort(e.first.date)} (${num(e.first.weight)} → ${num(e.last.weight)} kg).`);
  }
  if (gains[0] && gains[0].id !== loads[0]?.id) {
    const e = gains[0];
    const n = e.repsChangeSamePrevious!;
    out.push(`${e.name} : +${n} répétition${n > 1 ? 's' : ''} à charge identique depuis la dernière séance.`);
  }

  const flat = f.exercises.filter((e) => e.flatSessions >= 3).sort((a, b) => b.flatSessions - a.flatSessions);
  if (flat[0]) {
    const e = flat[0];
    out.push(`${e.name} : performances stables depuis ${e.flatSessions} séances à ${num(e.last.weight)} kg.`);
  }

  const last4 = f.workouts.perWeek.slice(-4).reduce((a, w) => a + w.count, 0);
  const { basket, match } = f.activities;
  const sport = [basket && `${basket} entraînement${basket > 1 ? 's' : ''} de basket`, match && `${match} match${match > 1 ? 's' : ''}`].filter(Boolean).join(' et ');
  out.push(`${last4} séance${last4 > 1 ? 's' : ''} de musculation sur les 4 dernières semaines` + (sport ? ` ; ${sport} sur ${f.windowWeeks} semaines.` : '.'));

  const wk = f.bodyweight.weeklyAverages;
  if (wk.length >= 2 && f.bodyweight.changeOverWindow != null) {
    out.push(`Poids moyen : ${num(wk[wk.length - 1].avg)} kg, ${signed(f.bodyweight.changeOverWindow, 'kg')} sur ${wk.length} semaines.`);
  }

  return out.slice(0, 4);
}
