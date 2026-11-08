/**
 * Analyse IA automatique : lancée sans confirmation dès que les données changent
 * (ouverture de « Le point », fin de séance). Le résultat est mis en cache par
 * empreinte des faits : rouvrir l'écran ne relance pas d'appel si rien n'a changé.
 */
import { useEffect, useState } from 'preact/hooks';
import { aiAvailable, askPoint, type PointAnswer, type PointMode } from './ai';
import { computeFacts, type Facts } from './facts';
import { activities, local, program, settings, weights, workouts } from './store';

export interface CoachNote extends PointAnswer {
  mode: PointMode;
  sig: string;
  at: number;
  question?: string;
}

const listeners = new Set<() => void>();
const running = new Map<string, Promise<CoachNote | null>>();
let lastError = '';

function emit() {
  for (const l of listeners) l();
}

export function currentFacts(): Facts {
  return computeFacts(program(), workouts(), weights(), activities(), settings());
}

export function signature(f: Facts, mode: PointMode, question = ''): string {
  const { generatedAt: _ignored, ...rest } = f;
  return `${mode}|${settings().aiProvider}|${question}|${JSON.stringify(rest)}`;
}

export async function cachedNote(mode: PointMode): Promise<CoachNote | undefined> {
  return local.get<CoachNote>(`coach:${mode}`);
}

export function coachError(): string {
  return lastError;
}

/** Lance l'analyse si l'IA est joignable et si les faits ont changé (ou si force). */
export function runCoach(mode: PointMode, opts: { force?: boolean; question?: string } = {}): Promise<CoachNote | null> {
  const key = `${mode}|${opts.question ?? ''}`;
  const existing = running.get(key);
  if (existing) return existing;
  const p = (async () => {
    if (!aiAvailable().ok) return null;
    const facts = currentFacts();
    if (facts.workouts.totalDone === 0 && !opts.question) return null;
    const sig = signature(facts, mode, opts.question);
    const cached = await cachedNote(mode);
    if (!opts.force && cached?.sig === sig) return cached;
    try {
      const a = await askPoint(facts, opts.question ? 'question' : mode, settings().aiProvider, opts.question);
      const note: CoachNote = { ...a, mode, sig, at: Date.now(), question: opts.question };
      await local.set(`coach:${mode}`, note);
      lastError = '';
      return note;
    } catch (e) {
      lastError = (e as Error).message;
      return null;
    }
  })().finally(() => {
    running.delete(key);
    emit();
  });
  running.set(key, p);
  emit();
  return p;
}

export function isRunning(mode: PointMode): boolean {
  return [...running.keys()].some((k) => k.startsWith(`${mode}|`));
}

/** Note IA en cache pour un mode, rafraîchie à chaque fin d'analyse. */
export function useCoach(mode: PointMode, auto = false) {
  const [note, setNote] = useState<CoachNote | undefined>();
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      cachedNote(mode).then((n) => alive && setNote(n));
      tick((x) => x + 1);
    };
    listeners.add(refresh);
    refresh();
    if (auto) void runCoach(mode);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, [mode, auto]);
  return { note, loading: isRunning(mode), error: lastError };
}
