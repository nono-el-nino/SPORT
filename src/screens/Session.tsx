import { useEffect, useRef, useState } from 'preact/hooks';
import { clock, dateShort, duration, num } from '../lib/format';
import { exerciseHistory } from '../lib/history';
import { allAtTop, workingWeight } from '../lib/progression';
import {
  activeSetIndex,
  entryComparisons,
  entryDone,
  nextOpenEntry,
  setEntry,
  suggestionFor,
  swapExercise,
  updateSet,
  validateSet,
  workoutStats,
} from '../lib/session';
import { runCoach } from '../lib/coach';
import { activeWorkout, program, saveWorkout, settings, useStore, workouts } from '../lib/store';
import type { EntryLog, Workout } from '../lib/types';
import { go } from '../router';
import { IArrow, ICheck, IClose, IList, ISkip, ISwap } from '../ui/icons';
import { Sheet, Stepper, tap, toast } from '../ui/kit';

export function SessionScreen() {
  useStore();
  const w = activeWorkout();
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!w) go('today', true);
  }, [!w]);

  if (!w) return null;
  if (finishing) return <Finish w={w} onBack={() => setFinishing(false)} />;
  return <Live w={w} onFinish={() => setFinishing(true)} />;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Live({ w, onFinish }: { w: Workout; onFinish: () => void }) {
  const prog = program();
  const all = workouts();
  const st = settings();
  const idx = Math.min(w.current, w.entries.length - 1);
  const e = w.entries[idx];
  const ex = prog.exercises[e.exerciseId];
  const slot = prog.templates[w.template].slots.find((s) => s.id === e.slotId);
  const sug = suggestionFor(prog, all, e, w.id);
  const hist = exerciseHistory(all, e.exerciseId, w.id);
  const last = hist[hist.length - 1];

  const active = activeSetIndex(e);
  const [sel, setSel] = useState<number | null>(null);
  const editIdx = sel ?? active;
  const editing = editIdx >= 0 ? e.sets[editIdx] : null;

  const [alts, setAlts] = useState(false);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [menu, setMenu] = useState<null | 'pause' | 'list'>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const now = useNow(restEnd ? 250 : 15000);

  // Changement d'exercice : on referme les panneaux.
  useEffect(() => {
    setSel(null);
    setAlts(false);
  }, [idx, e.exerciseId]);

  const save = (nw: Workout) => saveWorkout(nw);

  const goTo = (i: number) => {
    if (i === idx || i < 0) return;
    setDir(i > idx ? 'fwd' : 'back');
    void save({ ...w, current: i });
  };

  const validate = async () => {
    if (editIdx < 0 || !editing || editing.weight == null || editing.reps == null) return;
    tap(14);
    const wasDone = editing.done;
    await save(validateSet(w, idx, editIdx));
    setSel(null);
    if (!wasDone && st.restTimer) {
      const lastSet = editIdx === e.sets.length - 1;
      const rest = e.target.restSec;
      if (!lastSet || nextOpenEntry(w, idx) >= 0) {
        setRestTotal(rest);
        setRestEnd(Date.now() + rest * 1000);
      }
    }
  };

  const next = () => {
    const n = nextOpenEntry(w, idx);
    if (n < 0) onFinish();
    else goTo(n);
  };

  const skip = async () => {
    tap();
    const nw = setEntry(w, idx, { skipped: true });
    const n = nextOpenEntry(nw, idx);
    if (n < 0) {
      await save(nw);
      onFinish();
    } else {
      setDir('fwd');
      await save({ ...nw, current: n });
    }
  };

  const unskip = () => save(setEntry(w, idx, { skipped: false }));

  const swap = async (exerciseId: string) => {
    if (exerciseId === e.exerciseId) return setAlts(false);
    if (e.sets.some((s) => s.done) && !confirm('Les séries déjà validées sur cet exercice seront retirées. Changer quand même ?')) return;
    tap();
    await save(swapExercise(prog, all, w, idx, exerciseId));
    setAlts(false);
    toast(`${prog.exercises[exerciseId]?.name ?? 'Variante'} : historique propre.`);
  };

  const applyOption = async (weight: number) => {
    tap();
    let nw = w;
    const first = e.sets.findIndex((s) => !s.done);
    if (first >= 0) nw = updateSet(nw, idx, first, { weight });
    await save(nw);
  };

  const allDone = entryDone(e);
  const remaining = e.sets.filter((s) => !s.done).length;
  const doneSets = e.sets.filter((s) => s.done && s.reps != null).map((s) => ({ weight: s.weight, reps: s.reps as number }));
  const topNow =
    !e.skipped && doneSets.length > 0 && allAtTop({ date: 0, sets: doneSets }, { sets: e.target.sets, repMin: e.target.repMin, repMax: e.target.repMax, increment: 0 });
  const restLeft = restEnd ? (restEnd - now) / 1000 : 0;
  const openLeft = w.entries.filter((x) => !entryDone(x)).length;
  const altIds = slot ? [slot.exerciseId, ...slot.alternatives] : [e.exerciseId];
  if (!altIds.includes(e.exerciseId)) altIds.unshift(e.exerciseId);

  let primary: { label: string; action: () => void; disabled?: boolean };
  if (e.skipped) primary = { label: openLeft ? 'Exercice suivant' : 'Terminer la séance', action: next };
  else if (editIdx >= 0 && editing) {
    const missing = editing.weight == null;
    primary = {
      label: missing ? 'Indique la charge' : editing.done ? `Enregistrer la série ${editIdx + 1}` : `Valider la série ${editIdx + 1}`,
      action: validate,
      disabled: missing || editing.reps == null,
    };
  } else primary = { label: openLeft ? 'Exercice suivant' : 'Terminer la séance', action: next };

  return (
    <div class="session">
      <header class="session-top">
        <button class="icon-btn" aria-label="Pause" onClick={() => setMenu('pause')}>
          <IClose />
        </button>
        <div class="mid">
          <b>Séance {w.template}{w.short ? ' · court' : ''}</b>
          <span>{duration(now - w.startedAt)}</span>
        </div>
        <button class="icon-btn" aria-label="Liste des exercices" onClick={() => setMenu('list')}>
          <IList />
        </button>
      </header>

      <nav class="track" aria-label="Progression de la séance">
        {w.entries.map((x, i) => (
          <button class={i === idx ? 'cur' : x.skipped ? 'skipped' : entryDone(x) ? 'done' : ''} aria-label={`Exercice ${i + 1}`} aria-current={i === idx ? 'step' : undefined} onClick={() => goTo(i)}>
            <i />
          </button>
        ))}
      </nav>

      <div class={`ex-stage ${dir === 'back' ? 'back' : ''}`} key={`${idx}-${e.exerciseId}`}>
        <div class="ex-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div class="ex-numrow">
              <span class="ex-num">
                {String(idx + 1).padStart(2, '0')} / {String(w.entries.length).padStart(2, '0')}
              </span>
              {altIds.length > 1 && (
                <button class="btn btn-soft btn-sm" aria-expanded={alts} onClick={() => setAlts(!alts)}>
                  <ISwap /> Machine prise ?
                </button>
              )}
            </div>
            <h1 class="ex-name">{ex?.name ?? e.exerciseId}</h1>
            <div class="ex-target">
              {e.target.sets} × {e.target.repMin}–{e.target.repMax} reps · repos {clock(e.target.restSec)}
              {!e.skipped && !allDone && remaining > 0 && <> · {remaining} série{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''}</>}
            </div>
          </div>
        </div>

        {altIds.length > 1 && (
          <>
            <div class={`alts ${alts ? 'open' : ''}`}>
              <div>
                <div class="alts-inner">
                  {altIds.map((id) => {
                    const h = exerciseHistory(all, id, w.id);
                    const lp = h[h.length - 1];
                    return (
                      <button class={`alt-btn ${id === e.exerciseId ? 'current' : ''}`} tabIndex={alts ? 0 : -1} onClick={() => swap(id)}>
                        <span>{prog.exercises[id]?.name ?? id}</span>
                        <span class="meta">{lp ? `${num(workingWeight(lp))} kg · ${dateShort(lp.date)}` : 'Jamais faite'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {e.skipped ? (
          <div class="advice warn">
            Exercice passé.
            <div class="opt">
              <button class="btn btn-soft btn-sm" onClick={unskip}>
                Le faire quand même
              </button>
            </div>
          </div>
        ) : (
          <>
            <div class={`advice ${sug.kind === 'deload' || sug.kind === 'decline' ? 'warn' : ''}`}>
              {sug.message}
              {sug.option && !allDone && (
                <div class="opt">
                  <button class="btn btn-soft btn-sm" onClick={() => applyOption(sug.option!.weight)}>
                    {sug.option.label}
                  </button>
                </div>
              )}
            </div>
            <p class="lastperf">
              {last ? (
                <>
                  Dernière fois · {dateShort(last.date)} ·{' '}
                  <b>
                    {num(workingWeight(last))} kg × {last.sets.filter((s) => (s.weight ?? 0) === workingWeight(last)).map((s) => s.reps).join(', ')}
                  </b>
                </>
              ) : (
                'Première fois avec cet exercice : aucune référence.'
              )}
            </p>

            <div class="sets">
              {e.sets.map((s, i) => {
                const isEdit = i === editIdx;
                const cls = s.done ? 'done' : isEdit ? 'active' : 'pending';
                return (
                  <button class={`set-row ${cls}`} aria-current={isEdit ? 'true' : undefined} onClick={() => setSel(i === editIdx ? null : i)}>
                    <span class="sn">{i + 1}</span>
                    <span class="sv">
                      {s.weight == null ? '—' : num(s.weight)}
                      <small>kg</small> × {s.reps ?? '—'}
                      {!s.done && <small>{isEdit ? ' en cours' : ' cible'}</small>}
                    </span>
                    {s.done ? (
                      <span class="check" aria-label="Validée">
                        <ICheck />
                      </span>
                    ) : (
                      <span class="state">{isEdit ? '' : ''}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {allDone && topNow && <Quality e={e} onChange={(q) => save(setEntry(w, idx, { quality: q }))} />}
          </>
        )}
      </div>

      <div class="dock">
        {restEnd && (
          <div class="rest" role="timer" aria-live="off">
            <span class={`t ${restLeft < 0 ? 'over' : ''}`}>{restLeft >= 0 ? clock(restLeft) : `+${clock(-restLeft)}`}</span>
            <span class="bar">
              <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, restLeft / Math.max(1, restTotal)))})` }} />
            </span>
            <button class="btn btn-ghost btn-sm" onClick={() => setRestEnd((x) => (x ?? Date.now()) + 15000)}>
              +15 s
            </button>
            <button class="btn btn-soft btn-sm" onClick={() => setRestEnd(null)}>
              Fin
            </button>
          </div>
        )}
        {editing && !e.skipped && (
              <div class="editor">
                <div>
                  <div class="lbl">Charge</div>
                  <Stepper
                    compact
                    value={editing.weight}
                    step={ex?.increment ?? 2.5}
                    unit="kg"
                    label="Charge"
                    placeholder="Saisir"
                    onChange={(v) => save(updateSet(w, idx, editIdx, { weight: v }))}
                  />
                </div>
                <div>
                  <div class="lbl">Reps</div>
                  <Stepper compact value={editing.reps} step={1} min={0} max={100} unit="reps" label="Répétitions" onChange={(v) => save(updateSet(w, idx, editIdx, { reps: v }))} />
                </div>
              </div>
            )}

        <button class="btn btn-primary btn-xl btn-block" disabled={primary.disabled} onClick={primary.action}>
          {primary.label}
          {!primary.disabled && (primary.label.startsWith('Exercice') || primary.label.startsWith('Terminer')) && <IArrow />}
        </button>
        <div class="dock-sub">
          {!e.skipped && !allDone ? (
            <button class="btn btn-ghost btn-sm" onClick={skip}>
              <ISkip /> Passer l'exercice
            </button>
          ) : (
            <span />
          )}
          {openLeft > 0 && !(allDone || e.skipped) ? (
            <button class="btn btn-ghost btn-sm" onClick={next}>
              Suivant <IArrow />
            </button>
          ) : openLeft === 0 ? (
            <span />
          ) : (
            <button class="btn btn-ghost btn-sm" onClick={onFinish}>
              Terminer
            </button>
          )}
        </div>
      </div>

      {menu === 'pause' && (
        <Sheet title="Pause" kicker={`Séance ${w.template}`} onClose={() => setMenu(null)}>
          <p class="muted" style={{ marginBottom: '16px' }}>
            Tout est enregistré. La séance reste ouverte et reprend là où tu l'as laissée.
          </p>
          <div class="stack">
            <button class="btn btn-primary btn-block btn-xl" onClick={() => go('today')}>
              Reprendre plus tard
            </button>
            <button
              class="btn btn-soft btn-block"
              onClick={() => {
                setMenu(null);
                onFinish();
              }}
            >
              Terminer maintenant
            </button>
            <button
              class="btn btn-ghost btn-block"
              style={{ color: 'var(--red-lo)' }}
              onClick={async () => {
                if (!confirm('Abandonner la séance ? Elle ne comptera ni dans l’historique ni dans l’alternance A/B.')) return;
                await saveWorkout({ ...w, status: 'abandoned', endedAt: Date.now() });
                go('today', true);
              }}
            >
              Abandonner la séance
            </button>
          </div>
        </Sheet>
      )}

      {menu === 'list' && (
        <Sheet title="Exercices" kicker={`Séance ${w.template}`} onClose={() => setMenu(null)}>
          <div class="rows">
            {w.entries.map((x, i) => {
              const done = x.sets.filter((s) => s.done).length;
              return (
                <button
                  class="row"
                  onClick={() => {
                    goTo(i);
                    setMenu(null);
                  }}
                >
                  <span class="num" style={{ fontSize: '22px', fontWeight: 800, width: '28px', color: i === idx ? 'var(--red)' : 'var(--ink-3)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span class="grow title">{prog.exercises[x.exerciseId]?.name ?? x.exerciseId}</span>
                  <span class="muted small">{x.skipped ? 'passé' : `${done}/${x.sets.length}`}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Quality({ e, onChange }: { e: EntryLog; onChange: (q: EntryLog['quality']) => void }) {
  return (
    <div class="quality">
      <span>
        Toutes les séries au maximum.
        <br />
        <span class="muted small">Exécution maîtrisée ?</span>
      </span>
      <span class="btns">
        <button class="chip" aria-pressed={e.quality === 'ok'} onClick={() => onChange(e.quality === 'ok' ? undefined : 'ok')}>
          Oui
        </button>
        <button class="chip" aria-pressed={e.quality === 'limit'} onClick={() => onChange(e.quality === 'limit' ? undefined : 'limit')}>
          Limite
        </button>
      </span>
    </div>
  );
}

function Finish({ w, onBack }: { w: Workout; onBack: () => void }) {
  const prog = program();
  const all = workouts();
  const [notes, setNotes] = useState(w.notes ?? '');
  const st = workoutStats(w);
  const comps = entryComparisons(all, w);
  const saving = useRef(false);

  const finish = async () => {
    if (saving.current) return;
    saving.current = true;
    tap(16);
    const hasSets = st.sets > 0;
    await saveWorkout({ ...w, notes: notes.trim() || undefined, status: hasSets ? 'done' : 'abandoned', endedAt: Date.now() });
    toast(hasSets ? 'Séance enregistrée.' : 'Aucune série validée : séance non comptée.');
    // Bilan du coach en arrière-plan, affiché sur « Aujourd'hui ».
    if (hasSets) void runCoach('seance');
    go('today', true);
  };

  return (
    <div class="session screen">
      <header class="session-top">
        <button class="icon-btn" aria-label="Retour à la séance" onClick={onBack}>
          <IClose />
        </button>
        <div class="mid">
          <b>Séance {w.template}</b>
        </div>
        <span />
      </header>
      <div class="kicker" style={{ marginTop: '18px' }}>
        <span class="idx">Fin</span> {prog.templates[w.template].title}
      </div>
      <h1 class="h1" style={{ marginTop: '8px' }}>
        Bilan de séance
      </h1>
      <div class="stats">
        <div>
          <div class="num">{Math.round(st.ms / 60000)}</div>
          <div class="muted tiny">minutes</div>
        </div>
        <div>
          <div class="num">{st.sets}</div>
          <div class="muted tiny">séries</div>
        </div>
        <div>
          <div class="num">{st.volume >= 1000 ? num(Math.round(st.volume / 100) / 10) : st.volume}</div>
          <div class="muted tiny">{st.volume >= 1000 ? 'tonnes soulevées' : 'kg soulevés'}</div>
        </div>
      </div>
      <div class="rows">
        {comps.map((c) => (
          <div class="row">
            <span class="grow title">{prog.exercises[c.exerciseId]?.name ?? c.exerciseId}</span>
            <span class={`small ${c.tone === 'up' ? 'delta-up' : c.tone === 'down' ? 'delta-down' : 'muted'}`} style={{ textAlign: 'right' }}>
              {c.text}
            </span>
          </div>
        ))}
        {w.entries
          .filter((x) => x.skipped)
          .map((x) => (
            <div class="row">
              <span class="grow title muted">{prog.exercises[x.exerciseId]?.name ?? x.exerciseId}</span>
              <span class="small muted">passé</span>
            </div>
          ))}
      </div>
      <label class="field" style={{ marginTop: '22px' }}>
        <span>Note (facultatif)</span>
        <textarea class="input" value={notes} placeholder="Sensations, machine réglée en 4…" onInput={(ev) => setNotes((ev.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="dock">
        <button class="btn btn-primary btn-xl btn-block" onClick={finish}>
          Enregistrer la séance <ICheck />
        </button>
        <div class="dock-sub">
          <button class="btn btn-ghost btn-sm" onClick={onBack}>
            Retour à la séance
          </button>
          <span />
        </div>
      </div>
    </div>
  );
}
