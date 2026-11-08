import { useState } from 'preact/hooks';
import { aiAvailable } from '../lib/ai';
import { currentFacts, runCoach, useCoach } from '../lib/coach';
import { localSummary } from '../lib/facts';
import { dateLong, dateShort } from '../lib/format';
import { entryComparisons } from '../lib/session';
import { program, useStore, workouts } from '../lib/store';
import { back } from '../router';
import { IBack } from '../ui/icons';
import { Seg } from '../ui/kit';

export function Point() {
  useStore();
  const [mode, setMode] = useState<'semaine' | 'seance'>('semaine');
  const [question, setQuestion] = useState('');
  const coach = useCoach(mode, true);
  const qa = useCoach('question');

  const prog = program();
  const ws = workouts();
  const facts = currentFacts();
  const lastDone = ws.find((w) => w.status === 'done');

  const local =
    mode === 'semaine'
      ? localSummary(facts)
      : lastDone
        ? entryComparisons(ws, lastDone)
            .slice(0, 4)
            .map((c) => `${prog.exercises[c.exerciseId]?.name ?? c.exerciseId} : ${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}`)
        : ['Aucune séance terminée.'];

  const av = aiAvailable();

  return (
    <div class="screen">
      <header class="topbar">
        <button class="icon-btn" aria-label="Retour" onClick={() => back('carnet')}>
          <IBack />
        </button>
      </header>
      <div class="kicker" style={{ marginTop: '12px' }}>
        <span class="idx">●</span> {dateLong(new Date())}
      </div>
      <h1 class="h1" style={{ marginTop: '6px', fontSize: '64px' }}>
        Le point
      </h1>

      <div style={{ marginTop: '18px' }}>
        <Seg
          label="Période"
          value={mode}
          options={[
            ['semaine', 'Dernières semaines'],
            ['seance', 'Dernière séance'],
          ]}
          onChange={setMode}
        />
      </div>

      <CoachCard note={coach.note} loading={coach.loading} error={coach.error} available={av} onRetry={() => runCoach(mode, { force: true })} />

      <div class="point-card">
        <div class="point-src">
          <i /> Chiffres · calculés sur l'appareil
        </div>
        {local.map((l) => (
          <p class="small">{l}</p>
        ))}
      </div>

      {av.ok && (
        <section class="section">
          <h2 class="kicker" style={{ marginBottom: '12px' }}>
            <span class="idx">?</span> Une question
          </h2>
          <textarea class="input" value={question} maxLength={600} placeholder="Comment relancer le couché ?" onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)} />
          <button class="btn btn-primary btn-block" style={{ marginTop: '12px' }} disabled={!question.trim() || qa.loading} onClick={() => runCoach('question', { question: question.trim(), force: true })}>
            {qa.loading ? 'Réflexion…' : 'Demander'}
          </button>
          {qa.note && (
            <div class="point-card">
              <div class="point-src">
                <i class="ai" /> {qa.note.question}
              </div>
              {qa.note.text
                .split(/\n+/)
                .filter(Boolean)
                .map((p) => (
                  <p>{p}</p>
                ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function CoachCard({
  note,
  loading,
  error,
  available,
  onRetry,
}: {
  note?: { text: string; at: number };
  loading: boolean;
  error: string;
  available: { ok: boolean; reason?: string };
  onRetry?: () => void;
}) {
  if (!available.ok && !note) return <p class="muted tiny" style={{ marginTop: '14px' }}>{available.reason}</p>;
  return (
    <div class="point-card">
      <div class="point-src" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i class="ai" /> Coach{note ? ` · ${dateShort(note.at)}` : ''}
        </span>
        {onRetry && available.ok && (
          <button class="btn btn-ghost btn-sm" style={{ minHeight: '28px', padding: '0 4px' }} disabled={loading} onClick={onRetry}>
            {loading ? 'Analyse…' : 'Relancer'}
          </button>
        )}
      </div>
      {note ? (
        note.text
          .split(/\n+/)
          .filter(Boolean)
          .map((p) => <p>{p}</p>)
      ) : loading ? (
        <p class="muted">Analyse en cours…</p>
      ) : (
        <p class="muted small">{error || 'Pas encore de séance à analyser.'}</p>
      )}
      {note && error && <p class="tiny" style={{ color: 'var(--red-lo)', marginTop: '8px' }}>{error}</p>}
    </div>
  );
}
