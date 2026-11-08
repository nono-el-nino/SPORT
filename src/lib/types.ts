export type TemplateId = 'A' | 'B';

export interface Exercise {
  id: string;
  name: string;
  /** Pas d'ajustement de charge, en kg. */
  increment: number;
}

export interface Slot {
  id: string;
  /** Exercice principal. */
  exerciseId: string;
  /** Variantes proposées si la machine est prise. Historique indépendant. */
  alternatives: string[];
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  /** Conservé dans le format court. */
  core: boolean;
}

export interface SessionTemplate {
  id: TemplateId;
  title: string;
  slots: Slot[];
}

export interface Program {
  exercises: Record<string, Exercise>;
  templates: Record<TemplateId, SessionTemplate>;
}

export interface SetLog {
  weight: number | null;
  reps: number | null;
  done: boolean;
  at?: number;
}

/** Qualité d'exécution, facultative. */
export type Quality = 'ok' | 'limit';

export interface EntryLog {
  slotId: string;
  exerciseId: string;
  sets: SetLog[];
  target: { sets: number; repMin: number; repMax: number; restSec: number };
  skipped?: boolean;
  quality?: Quality;
  /** Suggestion affichée au moment de la séance (mémoire du raisonnement). */
  suggestion?: string;
}

export type WorkoutStatus = 'active' | 'done' | 'abandoned';

export interface Workout {
  id: string;
  template: TemplateId;
  short: boolean;
  startedAt: number;
  endedAt?: number;
  status: WorkoutStatus;
  entries: EntryLog[];
  current: number;
  notes?: string;
}

export type ActivityKind = 'basket' | 'match' | 'jogging';

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** YYYY-MM-DD */
  date: string;
  durationMin?: number;
  distanceKm?: number;
  notes?: string;
}

export interface WeightEntry {
  /** = date, une pesée par jour (évite les doublons entre appareils). */
  id: string;
  date: string;
  kg: number;
}

export type PlanKind = 'A' | 'B' | 'match';

export interface Plan {
  id: string;
  date: string;
  kind: PlanKind;
}

export interface BasketSlot {
  /** 0 = lundi … 6 = dimanche */
  day: number;
  time: string;
}

export interface Settings {
  basket: BasketSlot[];
  restTimer: boolean;
  startKg: number;
  targetKg: number;
  heightCm: number;
  aiProvider: 'anthropic' | 'openai';
}

export type Collection = 'config' | 'workouts' | 'activities' | 'weights' | 'plans';

export interface Rec<T = unknown> {
  col: Collection;
  id: string;
  data: T;
  updatedAt: number;
  deleted?: boolean;
  /** 1 = modification locale non synchronisée */
  dirty?: 0 | 1;
}
