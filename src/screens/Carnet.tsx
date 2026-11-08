import { useState } from 'preact/hooks';
import { dateLong, dateShort, duration, isoDay, monthShort, monthYear, num, signed, toDate } from '../lib/format';
import { exerciseHistory, exercisesWithHistory } from '../lib/history';
import { weeklyAverages } from '../lib/planning';
import { setsAt, suggest, workingWeight } from '../lib/progression';
import { workoutStats } from '../lib/session';
import { activities, program, remove, saveActivity, saveWeight, saveWorkout, settings, useStore, weights, workouts } from '../lib/store';
import type { Activity, Workout } from '../lib/types';
import { go } from '../router';
import { IChevron } from '../ui/icons';
import { LineChart, Seg, Sheet, Stepper, toast } from '../ui/kit';

export type CarnetTab = 'seances' | 'exercices' | 'poids';

export function Carnet({ tab }: { tab: CarnetTab }) {
  useStore();
  const setTab = (t: CarnetTab) => go(t === 'seances' ? 'carnet' : (`carnet/${t}` as 'carnet/poids'), true);
  return (
    <div class="screen">
      <header class="topbar">
        <h1 class="h1">Carnet</h1>
      </header>

      <button class="btn btn-soft point-btn" style={{ marginTop: '14px' }} onClick={() => go('point')}>
        <span class="mark" aria-hidden="true">
          ●
        </span>
        <span class="lbl">
          Le point
          <span class="s">Bilan chiffré de tes dernières semaines</span>
        </span>
        <IChevron />
      </button>

      <div style={{ margin: '22px 0 4px' }}>
        <Seg
          label="Vue du carnet"
          value={tab}
          options={[
            ['seances', 'Séances'],
            ['exercices', 'Charges'],
            ['poids', 'Poids'],
          ]}
          onChange={setTab}
        />
      </div>

      {tab === 'seances' && <Sessions />}
      {tab === 'exercices' && <Exercises />}
      {tab === 'poids' && <Weight />}
    </div>
  );
}

type Item = { kind: 'w'; date: number; w: Workout } | { kind: 'a'; date: number; a: Activity };

function Sessions() {
  const ws = workouts().filter((w) => w.status === 'done');
  const acts = activities();
  const [open, setOpen] = useState<Item | null>(null);
  const items: Item[] = [
    ...ws.map((w) => ({ kind: 'w' as const, date: w.startedAt, w })),
    ...acts.map((a) => ({ kind: 'a' as const, date: toDate(a.date).getTime() + 1, a })),
  ].sort((x, y) => y.date - x.date);

  if (!items.length) return <p class="empty">Aucune séance enregistrée. La première apparaîtra ici dès qu'elle sera terminée.</p>;

  const groups: { label: string; items: Item[] }[] = [];
  for (const it of items) {
    const label = monthYear(it.date);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }
  const prog = program();

  return (
    <>
      {groups.map((g) => (
        <section>
          <h2 class="kicker month">{g.label}</h2>
          <div class="rows" style={{ borderTopColor: 'var(--rule-strong)' }}>
            {g.items.map((it) => {
              if (it.kind === 'w') {
                const st = workoutStats(it.w);
                return (
                  <button class="log-row" onClick={() => setOpen(it)}>
                    <span class="log-date">
                      <b>{toDate(it.date).getDate()}</b>
                      <span>{monthShort(it.date)}</span>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span class="title" style={{ display: 'block', fontWeight: 500 }}>
                        {prog.templates[it.w.template].title}
                      </span>
                      <span class="muted small">
                        {duration(st.ms)} · {st.sets} séries{it.w.short ? ' · court' : ''}
                        {it.w.notes ? ' · note' : ''}
                      </span>
                    </span>
                    <span class="tag">{it.w.template}</span>
                  </button>
                );
              }
              const a = it.a;
              const label = a.kind === 'basket' ? 'Basket' : a.kind === 'match' ? 'Match' : 'Jogging';
              return (
                <button class="log-row" onClick={() => setOpen(it)}>
                  <span class="log-date">
                    <b>{toDate(a.date).getDate()}</b>
                    <span>{monthShort(a.date)}</span>
                  </span>
                  <span>
                    <span class="title" style={{ display: 'block', fontWeight: 500 }}>
                      {label}
                    </span>
                    {(a.durationMin || a.distanceKm) && (
                      <span class="muted small">
                        {[a.durationMin && `${a.durationMin} min`, a.distanceKm && `${num(a.distanceKm)} km`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span class={`tag ${a.kind === 'basket' ? 'red' : a.kind === 'match' ? 'ink' : 'outline'}`}>{a.kind === 'basket' ? '●' : a.kind === 'match' ? '▲' : '≡'}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {open?.kind === 'w' && <WorkoutSheet w={open.w} onClose={() => setOpen(null)} />}
      {open?.kind === 'a' && <ActivitySheet a={open.a} onClose={() => setOpen(null)} />}
    </>
  );
}

function WorkoutSheet({ w, onClose }: { w: Workout; onClose: () => void }) {
  const prog = program();
  const [notes, setNotes] = useState(w.notes ?? '');
  const st = workoutStats(w);
  return (
    <Sheet title={`Séance ${w.template}`} kicker={dateLong(w.startedAt)} onClose={onClose}>
      <p class="muted small" style={{ marginBottom: '14px' }}>
        {duration(st.ms)} · {st.sets} séries · {num(st.volume)} kg soulevés{w.short ? ' · format court' : ''}
      </p>
      <table class="perf">
        <thead>
          <tr>
            <th>Exercice</th>
            <th class="r">Séries</th>
          </tr>
        </thead>
        <tbody>
          {w.entries.map((e) => (
            <tr>
              <td style={{ paddingRight: '10px' }}>{prog.exercises[e.exerciseId]?.name ?? e.exerciseId}</td>
              <td class="r">
                {e.skipped ? (
                  <span class="muted">passé</span>
                ) : (
                  e.sets
                    .filter((s) => s.done)
                    .map((s) => `${num(s.weight ?? 0)} × ${s.reps}`)
                    .join(' · ') || <span class="muted">—</span>
                )}
                {e.quality === 'limit' && <span class="muted"> · limite</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label class="field" style={{ marginTop: '18px' }}>
        <span>Note</span>
        <textarea class="input" value={notes} onInput={(ev) => setNotes((ev.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="stack">
        <button
          class="btn btn-primary btn-block"
          disabled={notes === (w.notes ?? '')}
          onClick={async () => {
            await saveWorkout({ ...w, notes: notes.trim() || undefined });
            toast('Note enregistrée.');
          }}
        >
          Enregistrer la note
        </button>
        <button
          class="btn btn-ghost btn-block"
          style={{ color: 'var(--red-lo)' }}
          onClick={async () => {
            if (!confirm('Supprimer définitivement cette séance de l’historique ?')) return;
            await remove('workouts', w.id);
            onClose();
          }}
        >
          Supprimer la séance
        </button>
      </div>
    </Sheet>
  );
}

function ActivitySheet({ a, onClose }: { a: Activity; onClose: () => void }) {
  const [dur, setDur] = useState<number | null>(a.durationMin ?? null);
  const label = a.kind === 'basket' ? 'Basket' : a.kind === 'match' ? 'Match' : 'Jogging';
  return (
    <Sheet title={label} kicker={dateLong(a.date)} onClose={onClose}>
      <div class="field">
        <span>Durée</span>
        <Stepper value={dur} step={5} min={0} max={300} unit="min" label="Durée" placeholder="—" onChange={setDur} />
      </div>
      <div class="stack">
        <button
          class="btn btn-primary btn-block"
          onClick={async () => {
            await saveActivity({ ...a, durationMin: dur ?? undefined });
            onClose();
          }}
        >
          Enregistrer
        </button>
        <button
          class="btn btn-ghost btn-block"
          style={{ color: 'var(--red-lo)' }}
          onClick={async () => {
            await remove('activities', a.id);
            onClose();
          }}
        >
          Supprimer
        </button>
      </div>
    </Sheet>
  );
}

function Exercises() {
  const prog = program();
  const ws = workouts();
  const [open, setOpen] = useState<string | null>(null);
  const ids = exercisesWithHistory(ws);
  if (!ids.length) return <p class="empty">Les charges et répétitions apparaîtront après la première séance.</p>;

  const rows = ids
    .map((id) => ({ id, h: exerciseHistory(ws, id) }))
    .sort((a, b) => b.h[b.h.length - 1].date - a.h[a.h.length - 1].date);

  return (
    <div class="rows" style={{ marginTop: '18px', borderTopColor: 'var(--rule-strong)' }}>
      {rows.map(({ id, h }) => {
        const last = h[h.length - 1];
        const first = h[0];
        const d = workingWeight(last) - workingWeight(first);
        return (
          <button class="ex-card" onClick={() => setOpen(id)}>
            <span class="nm">{prog.exercises[id]?.name ?? id}</span>
            <span class="wt">
              {num(workingWeight(last))}
              <span class="small" style={{ fontFamily: 'var(--text)', fontWeight: 500 }}>
                {' '}
                kg
              </span>
            </span>
            <span class="muted small">
              {h.length} séance{h.length > 1 ? 's' : ''} · {last.sets.map((s) => s.reps).join(', ')} reps
            </span>
            <span class={`small ${d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : 'muted'}`} style={{ textAlign: 'right' }}>
              {h.length > 1 ? `${signed(d, 'kg')} depuis le ${dateShort(first.date)}` : 'première séance'}
            </span>
          </button>
        );
      })}
      {open && <ExerciseSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ExerciseSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const prog = program();
  const h = exerciseHistory(workouts(), id);
  const slot = Object.values(prog.templates)
    .flatMap((t) => t.slots)
    .find((s) => s.exerciseId === id || s.alternatives.includes(id));
  const cfg = { sets: slot?.sets ?? 2, repMin: slot?.repMin ?? 8, repMax: slot?.repMax ?? 12, increment: prog.exercises[id]?.increment ?? 2.5 };
  const sg = suggest(h, cfg);
  return (
    <Sheet title={prog.exercises[id]?.name ?? id} kicker="Progression" onClose={onClose}>
      <div class="advice">{sg.message}</div>
      <div class="kicker" style={{ margin: '18px 0 8px' }}>
        Charge de travail
      </div>
      <LineChart points={h.map((p) => ({ x: p.date, y: workingWeight(p) }))} unit="kg" />
      <table class="perf" style={{ marginTop: '16px' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Charge</th>
            <th class="r">Reps</th>
          </tr>
        </thead>
        <tbody>
          {[...h].reverse().map((p) => {
            const w = workingWeight(p);
            return (
              <tr>
                <td>{dateShort(p.date)}</td>
                <td class="w">{num(w)}</td>
                <td class="r">
                  {setsAt(p, w, 99)
                    .map((s) => s.reps)
                    .join(' · ')}
                  {p.quality === 'limit' ? ' · limite' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Sheet>
  );
}

function Weight() {
  const s = settings();
  const ws = weights();
  const avgs = weeklyAverages(ws);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState<number | null>(ws[ws.length - 1]?.kg ?? s.startKg);
  const lastAvg = avgs[avgs.length - 1];
  const prevAvg = avgs[avgs.length - 2];

  return (
    <div style={{ marginTop: '22px' }}>
      <div class="weight-row">
        <div>
          <div class="big-num">
            {lastAvg ? num(lastAvg.avg, 1) : '—'}
            <span class="unit">kg</span>
          </div>
          <div class="muted small" style={{ marginTop: '8px' }}>
            Moyenne de la dernière semaine pesée
            {prevAvg && lastAvg ? ` · ${signed(Math.round((lastAvg.avg - prevAvg.avg) * 10) / 10, 'kg')} vs semaine précédente` : ''}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '18px' }}>
        <LineChart
          points={ws.map((w) => ({ x: toDate(w.date).getTime(), y: w.kg }))}
          line={avgs.map((a) => ({ x: toDate(a.monday).getTime() + 3 * 86400000, y: a.avg }))}
          target={s.targetKg}
          unit="kg"
          height={170}
        />
        <p class="muted tiny" style={{ marginTop: '6px' }}>
          Points : pesées · trait bleu : moyenne hebdomadaire · pointillés : objectif
        </p>
      </div>

      <div style={{ margin: '18px 0' }}>
        {adding ? (
          <div class="stack">
            <Stepper value={v} step={0.1} min={30} max={250} unit="kg" label="Poids du jour" onChange={setV} />
            <button
              class="btn btn-primary btn-block btn-xl"
              disabled={v == null}
              onClick={async () => {
                await saveWeight(Math.round((v as number) * 10) / 10, isoDay());
                setAdding(false);
                toast('Pesée enregistrée.');
              }}
            >
              Enregistrer
            </button>
          </div>
        ) : (
          <button class="btn btn-soft btn-block" onClick={() => setAdding(true)}>
            Ajouter une pesée
          </button>
        )}
      </div>

      {avgs.length > 0 && (
        <table class="perf">
          <thead>
            <tr>
              <th>Semaine du</th>
              <th>Moyenne</th>
              <th class="r">Pesées</th>
            </tr>
          </thead>
          <tbody>
            {[...avgs].reverse().map((a) => (
              <tr>
                <td>{dateShort(a.monday)}</td>
                <td class="w">{num(a.avg, 1)}</td>
                <td class="r muted">{a.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
