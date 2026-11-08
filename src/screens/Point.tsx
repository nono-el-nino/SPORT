import { useMemo, useState } from 'preact/hooks';
import { aiAvailable, askPoint, type PointAnswer, type PointMode } from '../lib/ai';
import { computeFacts, localSummary } from '../lib/facts';
import { dateLong } from '../lib/format';
import { entryComparisons } from '../lib/session';
import { activities, program, settings, useStore, weights, workouts } from '../lib/store';
import { back } from '../router';
import { IBack } from '../ui/icons';
import { Seg } from '../ui/kit';

export function Point() {
  useStore();
  const [mode, setMode] = useState<'semaine' | 'seance'>('semaine');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PointAnswer | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const prog = program();
  const ws = workouts();
  const facts = useMemo(() => computeFacts(prog, ws, weights(), activities(), settings()), [ws.length, weights().length, activities().length]);
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

  const ask = async () => {
    setLoading(true);
    setError('');
    try {
      const m: PointMode = question.trim() ? 'question' : mode;
      setAnswer(await askPoint(facts, m, settings().aiProvider, question));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
          onChange={(m) => {
            setMode(m);
            setAnswer(null);
          }}
        />
      </div>

      <div class="point-card">
        <div class="point-src">
          <i /> Bilan local · calculé sur l'appareil
        </div>
        {local.map((l) => (
          <p>{l}</p>
        ))}
      </div>

      <section class="section">
        <div class="section-head">
          <h2 class="kicker">
            <span class="idx">IA</span> Regard personnalisé
          </h2>
        </div>
        <label class="field">
          <span>Question (facultatif)</span>
          <textarea class="input" value={question} maxLength={600} placeholder="Pourquoi le couché stagne-t-il ?" onInput={(e) => setQuestion((e.target as HTMLTextAreaElement).value)} />
        </label>
        <button class="btn btn-primary btn-block btn-xl" disabled={!av.ok || loading} onClick={ask}>
          {loading ? 'Analyse…' : answer ? 'Relancer l’analyse' : 'Demander l’analyse'}
        </button>
        <p class="muted tiny" style={{ marginTop: '8px' }}>
          {av.ok ? 'Appel payant, uniquement sur ton action. Seuls les faits chiffrés ci-dessous sont transmis.' : av.reason}
        </p>
        {error && (
          <p class="small" style={{ color: 'var(--red-lo)', marginTop: '10px' }}>
            {error}
          </p>
        )}
        {answer && (
          <div class="point-card">
            <div class="point-src">
              <i class="ai" /> {answer.provider === 'openai' ? 'OpenAI' : 'Anthropic'} · {answer.model}
            </div>
            {answer.text
              .split(/\n+/)
              .filter(Boolean)
              .map((p) => (
                <p>{p}</p>
              ))}
          </div>
        )}
        <details style={{ marginTop: '18px' }}>
          <summary class="muted small" style={{ cursor: 'pointer' }}>
            Données transmises
          </summary>
          <pre class="tiny" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--text)', color: 'var(--ink-2)' }}>
            {JSON.stringify(facts, null, 1)}
          </pre>
        </details>
      </section>
    </div>
  );
}
