import { useState } from 'preact/hooks';
import { go } from '../router';
import { DAYS_SHORT, dateLong, isoDay, num, signed, toDate } from '../lib/format';
import { exerciseHistory } from '../lib/history';
import { buildWeek, goalProgress, nextTemplate, weekKey, weeklyAverages, type DayItem, type DayPlan } from '../lib/planning';
import { suggest } from '../lib/progression';
import { estimateMinutes, startWorkout } from '../lib/session';
import {
  activeWorkout,
  activities,
  newId,
  plans,
  program,
  remove,
  saveActivity,
  savePlan,
  saveWeight,
  saveWorkout,
  settings,
  useStore,
  weights,
  workouts,
} from '../lib/store';
import { useSync } from '../lib/sync';
import { aiAvailable } from '../lib/ai';
import { runCoach, useCoach } from '../lib/coach';
import { CoachCard } from './Point';
import type { Activity, PlanKind } from '../lib/types';
import { IArrow, IProgram, ISettings } from '../ui/icons';
import { Seg, Sheet, Stepper, Switch, tap, toast } from '../ui/kit';

export function Today() {
  useStore();
  const sync = useSync();
  const coach = useCoach('seance');
  const prog = program();
  const ws = workouts();
  const active = activeWorkout();
  const tpl = active?.template ?? nextTemplate(ws);
  const t = prog.templates[tpl];
  const [short, setShort] = useState(false);
  const [day, setDay] = useState<DayPlan | null>(null);
  const [weighing, setWeighing] = useState(false);

  const slots = t.slots.filter((s) => !short || s.core);
  const now = new Date();

  const start = async () => {
    tap(12);
    if (!active) await saveWorkout(startWorkout(prog, ws, tpl, short));
    go('seance');
  };

  const doneCount = active ? active.entries.filter((e) => e.skipped || (e.sets.length && e.sets.every((s) => s.done))).length : 0;

  const week = buildWeek(now, settings(), ws, activities(), plans());
  const wts = weights();
  const avgs = weeklyAverages(wts);
  const lastW = wts[wts.length - 1];
  const thisWeek = avgs.find((a) => a.week === weekKey(now));
  const s = settings();
  const current = thisWeek?.avg ?? lastW?.kg ?? null;
  const prog01 = current != null ? goalProgress(current, s.startKg, s.targetKg) : 0;

  return (
    <div class="screen">
      <header class="topbar">
        <div class="wordmark" aria-label="Club 74">
          <span class="lanes-mini" aria-hidden="true" />
          Club 74
        </div>
        <div class="top-actions">
          <button class="icon-btn" aria-label="Programme" onClick={() => go('programme')}>
            <IProgram />
          </button>
          <button class="icon-btn" aria-label="Réglages" onClick={() => go('reglages')}>
            <ISettings />
          </button>
        </div>
      </header>

      <section class="hero" aria-labelledby="next-title">
        <div class="kicker" style={{ marginTop: '10px' }}>
          {active ? 'Séance en cours' : 'Prochaine séance'} <span aria-hidden="true">·</span> <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{dateLong(now)}</span>
        </div>
        <div class="hero-grid">
          <div class="hero-letter" aria-hidden="true">
            {tpl}
          </div>
          <div class="hero-side">
            <div class="lanes" aria-hidden="true" />
            <h1 class="hero-title" id="next-title">
              <span class="sr-only">Séance {tpl} — </span>
              {t.title}
            </h1>
            <div class="muted small">
              {active
                ? `${doneCount} / ${active.entries.length} exercices faits`
                : `${slots.length} exercices · ≈ ${estimateMinutes(slots)} min`}
            </div>
          </div>
        </div>

        {!active && (
          <ol class="hero-list">
            {t.slots.map((sl, i) => {
              const off = short && !sl.core;
              const ex = prog.exercises[sl.exerciseId];
              const sg = suggest(exerciseHistory(ws, sl.exerciseId), { sets: sl.sets, repMin: sl.repMin, repMax: sl.repMax, increment: ex?.increment ?? 2.5 });
              return (
                <li class={off ? 'off' : ''}>
                  <span class="n">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    {ex?.name ?? sl.exerciseId}
                    <span class="muted tiny"> · {sl.sets} × {sl.repMin}–{sl.repMax}</span>
                  </span>
                  <span class="w">{off ? '—' : sg.weight != null ? `${num(sg.weight)}` : ''}</span>
                </li>
              );
            })}
          </ol>
        )}

        {active ? (
          <div style={{ marginTop: '22px' }}>
            <button class="btn btn-primary btn-xl btn-block" onClick={start}>
              Reprendre la séance {tpl} <IArrow />
            </button>
          </div>
        ) : (
          <div class="start-row">
            <button class="btn btn-primary btn-xl" onClick={start}>
              Commencer <IArrow />
            </button>
            <button class="btn btn-soft btn-xl" aria-pressed={short} onClick={() => setShort(!short)} style={short ? { background: 'var(--ink)', color: 'var(--ivory)', boxShadow: 'inset 0 3px 8px rgba(0,0,0,.45)' } : undefined}>
              Court
            </button>
          </div>
        )}
        {short && !active && <p class="muted small" style={{ marginTop: '10px' }}>Format court : exercices prioritaires seulement.</p>}
      </section>

      <section class="section" aria-labelledby="week-title">
        <div class="section-head">
          <h2 class="kicker" id="week-title">
            <span class="idx">01</span> Semaine
          </h2>
          <span class="muted tiny">{weekKey(now).split('-W')[1] ? `S${Number(weekKey(now).split('-W')[1])}` : ''}</span>
        </div>
        <div class="week">
          {week.map((d) => {
            const isToday = d.date === isoDay(now);
            const past = d.date < isoDay(now);
            return (
              <button class={`day ${isToday ? 'today' : ''} ${past ? 'past' : ''}`} onClick={() => setDay(d)} aria-label={`${dateLong(d.date)} : ${d.items.map((i) => `${i.label} ${i.done ? 'fait' : 'prévu'}`).join(', ') || 'rien'}`}>
                <span class="dl">{DAYS_SHORT[d.dow]}</span>
                <span class="dn">{toDate(d.date).getDate()}</span>
                <span class="marks">
                  {d.items.map((i) => (
                    <Pic item={i} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div class="legend" aria-hidden="true">
          <span>
            <i class="pic pic-session done">A</i>Séance
          </span>
          <span>
            <i class="pic pic-basket done" />Basket
          </span>
          <span>
            <i class="pic pic-match" />Match
          </span>
          <span>
            <i class="pic pic-jog" />Jogging
          </span>
          <span>Contour = prévu</span>
        </div>
      </section>

      <section class="section" aria-labelledby="weight-title">
        <div class="section-head">
          <h2 class="kicker" id="weight-title">
            <span class="idx">02</span> Poids
          </h2>
          <button class="btn btn-soft btn-sm" onClick={() => setWeighing(true)}>
            Pesée
          </button>
        </div>
        <div class="weight-row">
          <div>
            <div class="big-num">
              {current != null ? num(current, 1) : '—'}
              <span class="unit">kg</span>
            </div>
            <div class="muted small" style={{ marginTop: '8px' }}>
              {thisWeek ? `Moyenne de la semaine · ${thisWeek.count} pesée${thisWeek.count > 1 ? 's' : ''}` : lastW ? `Dernière pesée · ${dateLong(lastW.date)}` : 'Aucune pesée'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div class="num" style={{ fontSize: '40px', fontWeight: 800, lineHeight: 0.9, color: 'var(--blue)' }}>
              {num(s.targetKg)}
            </div>
            <div class="muted tiny">objectif</div>
          </div>
        </div>
        <div class="goal-track" role="progressbar" aria-valuemin={s.startKg} aria-valuemax={s.targetKg} aria-valuenow={current ?? s.startKg} aria-label="Progression vers l'objectif">
          <div class="goal-fill" style={{ width: `${Math.max(3, prog01 * 100)}%` }} />
        </div>
        <div class="goal-scale">
          <span>départ {num(s.startKg)} kg</span>
          <span>{current != null ? `${signed(Math.round((current - s.startKg) * 10) / 10, 'kg')} · reste ${num(Math.max(0, Math.round((s.targetKg - current) * 10) / 10))} kg` : ''}</span>
        </div>
      </section>

      {(coach.note || coach.loading) && (
        <section class="section" aria-labelledby="coach-title">
          <div class="section-head" style={{ marginBottom: 0 }}>
            <h2 class="kicker" id="coach-title">
              <span class="idx">03</span> Coach
            </h2>
            <button class="btn btn-ghost btn-sm" onClick={() => go('point')}>
              Le point
            </button>
          </div>
          <CoachCard note={coach.note} loading={coach.loading} error={coach.error} available={aiAvailable()} onRetry={() => runCoach('seance', { force: true })} />
        </section>
      )}

      {sync.state === 'error' && <p class="muted tiny" style={{ marginTop: '18px' }}>Synchronisation en attente : {sync.lastError}</p>}

      {day && <DaySheet day={day} onClose={() => setDay(null)} />}
      {weighing && <WeightSheet initial={lastW?.kg ?? s.startKg} onClose={() => setWeighing(false)} />}
    </div>
  );
}

function Pic({ item }: { item: DayItem }) {
  const cls = item.done ? 'done' : 'planned';
  if (item.kind === 'A' || item.kind === 'B') return <i class={`pic pic-session ${cls}`}>{item.kind}</i>;
  if (item.kind === 'basket') return <i class={`pic pic-basket ${cls}`} />;
  if (item.kind === 'match') return <i class={`pic pic-match ${cls}`} />;
  return <i class="pic pic-jog" />;
}

function DaySheet({ day, onClose }: { day: DayPlan; onClose: () => void }) {
  useStore();
  const acts = activities().filter((a) => a.date === day.date);
  const pls = plans().filter((p) => p.date === day.date);
  const s = settings();
  const basketSlots = s.basket.filter((b) => b.day === day.dow);
  const basketDone = acts.find((a) => a.kind === 'basket');
  const matchDone = acts.find((a) => a.kind === 'match');
  const matchPlan = pls.find((p) => p.kind === 'match');
  const sessionPlan = pls.find((p) => p.kind === 'A' || p.kind === 'B');
  const joggings = acts.filter((a) => a.kind === 'jogging');
  const doneSessions = workouts().filter((w) => w.status === 'done' && isoDay(w.startedAt) === day.date);
  const [jog, setJog] = useState<number | null>(null);

  const toggleAct = async (kind: Activity['kind'], existing?: Activity) => {
    tap();
    if (existing) await remove('activities', existing.id);
    else await saveActivity({ id: newId(), kind, date: day.date });
  };
  const toggleMatchPlan = async () => {
    if (matchPlan) await remove('plans', matchPlan.id);
    else await savePlan({ id: newId(), date: day.date, kind: 'match' });
  };
  const setSession = async (k: 'none' | 'A' | 'B') => {
    if (sessionPlan) await remove('plans', sessionPlan.id);
    if (k !== 'none') await savePlan({ id: newId(), date: day.date, kind: k as PlanKind });
  };

  return (
    <Sheet title={dateLong(day.date)} kicker="Planning" onClose={onClose}>
      <div class="rows">
        {doneSessions.map((w) => (
          <div class="row">
            <span class="grow title">Séance {w.template} réalisée</span>
            <span class="tag">{w.template}</span>
          </div>
        ))}
        <div class="row">
          <div class="grow">
            <div class="title">Basket{basketSlots.length ? ` · ${basketSlots.map((b) => b.time).join(', ')}` : ''}</div>
            <div class="muted tiny">{basketSlots.length ? 'Entraînement récurrent' : 'Hors créneau habituel'}</div>
          </div>
          <span class="muted tiny">Fait</span>
          <Switch checked={!!basketDone} label="Basket fait" onChange={() => toggleAct('basket', basketDone)} />
        </div>
        <div class="row">
          <div class="grow title">Match prévu</div>
          <Switch checked={!!matchPlan} label="Match prévu" onChange={toggleMatchPlan} />
        </div>
        <div class="row">
          <div class="grow title">Match joué</div>
          <Switch checked={!!matchDone} label="Match joué" onChange={() => toggleAct('match', matchDone)} />
        </div>
        {joggings.map((j) => (
          <div class="row">
            <div class="grow title">Jogging{j.durationMin ? ` · ${j.durationMin} min` : ''}</div>
            <button class="btn btn-ghost btn-sm" onClick={() => remove('activities', j.id)}>
              Retirer
            </button>
          </div>
        ))}
      </div>

      <div class="field" style={{ marginTop: '20px' }}>
        <span>Musculation prévue</span>
        <Seg
          label="Séance prévue"
          value={(sessionPlan?.kind as 'A' | 'B' | undefined) ?? 'none'}
          options={[
            ['none', 'Aucune'],
            ['A', 'Séance A'],
            ['B', 'Séance B'],
          ]}
          onChange={setSession}
        />
      </div>

      <div class="field">
        <span>Jogging</span>
        {jog == null ? (
          <button class="btn btn-soft btn-block" onClick={() => setJog(30)}>
            Ajouter un jogging
          </button>
        ) : (
          <div class="stack">
            <Stepper value={jog} step={5} min={5} unit="min" label="Durée du jogging" onChange={(v) => setJog(v ?? 30)} />
            <button
              class="btn btn-primary btn-block"
              onClick={async () => {
                await saveActivity({ id: newId(), kind: 'jogging', date: day.date, durationMin: jog });
                setJog(null);
                toast('Jogging enregistré.');
              }}
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function WeightSheet({ initial, onClose }: { initial: number; onClose: () => void }) {
  const [v, setV] = useState<number | null>(initial);
  const [date, setDate] = useState(isoDay());
  return (
    <Sheet title="Pesée" kicker="Poids du jour" onClose={onClose}>
      <Stepper value={v} step={0.1} min={30} max={250} unit="kg" label="Poids" onChange={setV} />
      <label class="field" style={{ marginTop: '14px' }}>
        <span>Date</span>
        <input class="input" type="date" value={date} max={isoDay()} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      <button
        class="btn btn-primary btn-xl btn-block"
        disabled={v == null}
        onClick={async () => {
          await saveWeight(Math.round((v as number) * 10) / 10, date);
          tap(12);
          toast('Pesée enregistrée.');
          onClose();
        }}
      >
        Enregistrer {v != null ? `${num(v, 1)} kg` : ''}
      </button>
    </Sheet>
  );
}
