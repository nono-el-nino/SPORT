import { useState } from 'preact/hooks';
import { clock, num, uid } from '../lib/format';
import { estimateMinutes } from '../lib/session';
import { program, saveProgram, useStore } from '../lib/store';
import type { Program, Slot, TemplateId } from '../lib/types';
import { back } from '../router';
import { IBack, IClose, IDown, IUp } from '../ui/icons';
import { Seg, Sheet, Stepper, Switch, toast } from '../ui/kit';

function clone(p: Program): Program {
  return JSON.parse(JSON.stringify(p));
}

export function ProgramScreen() {
  useStore();
  const prog = program();
  const [tpl, setTpl] = useState<TemplateId>('A');
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const t = prog.templates[tpl];

  const move = async (i: number, d: -1 | 1) => {
    const p = clone(prog);
    const s = p.templates[tpl].slots;
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    await saveProgram(p);
  };

  return (
    <div class="screen">
      <header class="topbar">
        <button class="icon-btn" aria-label="Retour" onClick={() => back()}>
          <IBack />
        </button>
      </header>
      <h1 class="h1" style={{ marginTop: '12px' }}>
        Programme
      </h1>
      <p class="muted small" style={{ marginTop: '6px' }}>
        Modifications appliquées aux prochaines séances. L'historique n'est jamais modifié.
      </p>
      <div style={{ margin: '18px 0' }}>
        <Seg
          label="Séance"
          value={tpl}
          options={[
            ['A', 'Séance A'],
            ['B', 'Séance B'],
          ]}
          onChange={setTpl}
        />
      </div>

      <label class="field">
        <span>Intitulé</span>
        <input
          class="input"
          value={t.title}
          onChange={async (e) => {
            const p = clone(prog);
            p.templates[tpl].title = (e.target as HTMLInputElement).value.trim() || t.title;
            await saveProgram(p);
          }}
        />
      </label>

      <div class="section-head" style={{ marginTop: '18px', marginBottom: '6px' }}>
        <span class="kicker">
          {t.slots.length} exercices · ≈ {estimateMinutes(t.slots)} min
        </span>
        <span class="muted tiny">
          <span class="core-dot" />
          format court
        </span>
      </div>
      <div style={{ borderTop: '1px solid var(--rule-strong)' }}>
        {t.slots.map((s, i) => (
          <div class="slot-row">
            <span class="n">{String(i + 1).padStart(2, '0')}</span>
            <button class="open" onClick={() => setEdit(s.id)}>
              <div style={{ fontWeight: 500 }}>
                {s.core && <span class="core-dot" aria-label="Prioritaire" />}
                {prog.exercises[s.exerciseId]?.name}
              </div>
              <div class="muted small">
                {s.sets} × {s.repMin}–{s.repMax} · {clock(s.restSec)} · +{num(prog.exercises[s.exerciseId]?.increment ?? 0)} kg
                {s.alternatives.length ? ` · ${s.alternatives.length} variante${s.alternatives.length > 1 ? 's' : ''}` : ''}
              </div>
            </button>
            <span class="moves">
              <button class="mini" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
                <IUp />
              </button>
              <button class="mini" aria-label="Descendre" disabled={i === t.slots.length - 1} onClick={() => move(i, 1)}>
                <IDown />
              </button>
            </span>
          </div>
        ))}
      </div>
      <button class="btn btn-soft btn-block" style={{ marginTop: '18px' }} onClick={() => setAdding(true)}>
        Ajouter un exercice
      </button>

      {edit && <SlotSheet tpl={tpl} slotId={edit} onClose={() => setEdit(null)} />}
      {adding && (
        <NameSheet
          title="Nouvel exercice"
          onClose={() => setAdding(false)}
          onSave={async (name) => {
            const p = clone(prog);
            const id = findOrCreateExercise(p, name);
            const slot: Slot = { id: uid(), exerciseId: id, alternatives: [], sets: 2, repMin: 8, repMax: 12, restSec: 90, core: false };
            p.templates[tpl].slots.push(slot);
            await saveProgram(p);
            setAdding(false);
            setEdit(slot.id);
          }}
        />
      )}
    </div>
  );
}

function findOrCreateExercise(p: Program, name: string): string {
  const n = name.trim();
  const existing = Object.values(p.exercises).find((e) => e.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing.id;
  const id = uid();
  p.exercises[id] = { id, name: n, increment: 2.5 };
  return id;
}

function SlotSheet({ tpl, slotId, onClose }: { tpl: TemplateId; slotId: string; onClose: () => void }) {
  useStore();
  const prog = program();
  const slot = prog.templates[tpl].slots.find((s) => s.id === slotId);
  const [altName, setAltName] = useState('');
  if (!slot) return null;
  const ex = prog.exercises[slot.exerciseId];

  const patch = async (f: (p: Program, s: Slot) => void) => {
    const p = clone(prog);
    const s = p.templates[tpl].slots.find((x) => x.id === slotId)!;
    f(p, s);
    if (s.repMin > s.repMax) s.repMax = s.repMin;
    await saveProgram(p);
  };

  return (
    <Sheet title={ex?.name ?? 'Exercice'} kicker={`Séance ${tpl}`} onClose={onClose}>
      <label class="field">
        <span>Nom</span>
        <input class="input" value={ex?.name} onChange={(e) => patch((p) => (p.exercises[slot.exerciseId].name = (e.target as HTMLInputElement).value.trim() || ex.name))} />
      </label>
      <div class="grid2">
        <div class="field">
          <span>Séries</span>
          <Stepper compact value={slot.sets} step={1} min={1} max={8} unit="séries" label="Séries" onChange={(v) => patch((_, s) => (s.sets = v ?? s.sets))} />
        </div>
        <div class="field">
          <span>Repos</span>
          <Stepper compact value={slot.restSec} step={15} min={0} max={600} unit="sec" label="Repos en secondes" onChange={(v) => patch((_, s) => (s.restSec = v ?? s.restSec))} />
        </div>
        <div class="field">
          <span>Reps min</span>
          <Stepper compact value={slot.repMin} step={1} min={1} max={50} unit="reps" label="Reps minimum" onChange={(v) => patch((_, s) => (s.repMin = v ?? s.repMin))} />
        </div>
        <div class="field">
          <span>Reps max</span>
          <Stepper compact value={slot.repMax} step={1} min={1} max={50} unit="reps" label="Reps maximum" onChange={(v) => patch((_, s) => (s.repMax = Math.max(s.repMin, v ?? s.repMax)))} />
        </div>
      </div>
      <div class="field">
        <span>Incrément de charge</span>
        <Stepper compact value={ex?.increment ?? 2.5} step={0.25} min={0} max={20} unit="kg" label="Incrément" onChange={(v) => patch((p) => (p.exercises[slot.exerciseId].increment = v ?? 2.5))} />
      </div>
      <div class="row" style={{ borderTop: '1px solid var(--rule)' }}>
        <div class="grow">
          <div class="title">Prioritaire</div>
          <div class="muted tiny">Conservé dans le format court</div>
        </div>
        <Switch checked={slot.core} label="Prioritaire" onChange={(v) => patch((_, s) => (s.core = v))} />
      </div>

      <div class="kicker" style={{ margin: '22px 0 8px' }}>
        Variantes · historique propre
      </div>
      <div class="rows">
        {slot.alternatives.map((id) => (
          <div class="row">
            <span class="grow title">{prog.exercises[id]?.name ?? id}</span>
            <button
              class="mini"
              aria-label="Choisir comme exercice principal"
              title="Principal"
              onClick={() =>
                patch((_, s) => {
                  s.alternatives = [s.exerciseId, ...s.alternatives.filter((a) => a !== id)];
                  s.exerciseId = id;
                })
              }
            >
              <IUp />
            </button>
            <button class="mini" aria-label="Retirer la variante" onClick={() => patch((_, s) => (s.alternatives = s.alternatives.filter((a) => a !== id)))}>
              <IClose />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <input class="input" list="ex-names" placeholder="Ajouter une variante" value={altName} onInput={(e) => setAltName((e.target as HTMLInputElement).value)} />
        <datalist id="ex-names">
          {Object.values(prog.exercises).map((e) => (
            <option value={e.name} />
          ))}
        </datalist>
        <button
          class="btn btn-primary"
          disabled={!altName.trim()}
          onClick={async () => {
            await patch((p, s) => {
              const id = findOrCreateExercise(p, altName);
              if (id !== s.exerciseId && !s.alternatives.includes(id)) s.alternatives.push(id);
            });
            setAltName('');
          }}
        >
          Ajouter
        </button>
      </div>

      <button
        class="btn btn-ghost btn-block"
        style={{ color: 'var(--red-lo)', marginTop: '22px' }}
        onClick={async () => {
          if (!confirm('Retirer cet exercice de la séance ? Son historique est conservé.')) return;
          const p = clone(prog);
          p.templates[tpl].slots = p.templates[tpl].slots.filter((s) => s.id !== slotId);
          await saveProgram(p);
          toast('Exercice retiré. Historique conservé.');
          onClose();
        }}
      >
        Retirer de la séance
      </button>
    </Sheet>
  );
}

function NameSheet({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (name: string) => void }) {
  const [v, setV] = useState('');
  const prog = program();
  return (
    <Sheet title={title} onClose={onClose}>
      <label class="field">
        <span>Nom</span>
        <input class="input" list="ex-names-new" autoFocus value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
        <datalist id="ex-names-new">
          {Object.values(prog.exercises).map((e) => (
            <option value={e.name} />
          ))}
        </datalist>
      </label>
      <button class="btn btn-primary btn-block btn-xl" disabled={!v.trim()} onClick={() => onSave(v)}>
        Ajouter
      </button>
    </Sheet>
  );
}
