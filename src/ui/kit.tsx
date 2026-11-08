import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { num, parseNum } from '../lib/format';
import { IClose, IMinus, IPlus } from './icons';

/** Chiffre qui défile vers le haut ou le bas quand la valeur change. */
export function Roll({ value, text }: { value: number | null; text?: string }) {
  const prev = useRef<number | null>(value);
  const dir = useRef<'up' | 'down'>('up');
  if (prev.current !== value) {
    dir.current = (value ?? 0) >= (prev.current ?? 0) ? 'up' : 'down';
    prev.current = value;
  }
  return (
    <span key={String(value)} class={`roll ${dir.current === 'down' ? 'down' : ''}`}>
      {text ?? (value == null ? '—' : num(value))}
    </span>
  );
}

interface StepperProps {
  value: number | null;
  step: number;
  min?: number;
  max?: number;
  unit: string;
  label: string;
  compact?: boolean;
  /** Ouvre la saisie libre au premier rendu (aucune référence connue). */
  placeholder?: string;
  onChange: (v: number | null) => void;
}

export function Stepper({ value, step, min = 0, max = 999, unit, label, compact, placeholder, onChange }: StepperProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Focus dès l'apparition du champ (clavier numérique immédiat).
  const focusRef = (el: HTMLInputElement | null) => {
    if (el && document.activeElement !== el) el.focus();
  };

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  const bump = (d: number) => {
    tap();
    if (value == null) {
      setDraft('');
      setEditing(true);
      return;
    }
    onChange(clamp(value + d));
  };
  const commit = () => {
    const v = parseNum(draft);
    if (v != null) onChange(clamp(v));
    setEditing(false);
  };

  return (
    <div class={`stepper ${compact ? 'compact' : ''}`} role="group" aria-label={label}>
      <button type="button" class="sb" aria-label={`${label} : moins ${num(step)}`} onClick={() => bump(-step)}>
        <IMinus />
      </button>
      <div class="val">
        {editing ? (
          <input
            ref={focusRef}
            class="v-input"
            inputMode="decimal"
            enterKeyHint="done"
            aria-label={label}
            placeholder={placeholder ?? '0'}
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button
            type="button"
            class={`v ${value == null ? 'is-empty' : ''}`}
            aria-label={`${label} : ${value == null ? 'à saisir' : num(value)} ${unit}. Toucher pour saisir.`}
            onClick={() => {
              setDraft(value == null ? '' : num(value));
              setEditing(true);
            }}
          >
            <Roll value={value} text={value == null ? (placeholder ?? 'Saisir') : undefined} />
          </button>
        )}
        <span class="u">{unit}</span>
      </div>
      <button type="button" class="sb" aria-label={`${label} : plus ${num(step)}`} onClick={() => bump(step)}>
        <IPlus />
      </button>
    </div>
  );
}

export function Sheet({ title, kicker, onClose, children }: { title: string; kicker?: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          <div>
            {kicker && <div class="kicker">{kicker}</div>}
            <h2 class="h2" style={{ marginTop: kicker ? '6px' : 0 }}>
              {title}
            </h2>
          </div>
          <button class="icon-btn" aria-label="Fermer" onClick={onClose}>
            <IClose />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" class="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Retour haptique léger quand il existe (Android) ; sans effet sur iOS. */
export function tap(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* rien */
  }
}

let toastFn: ((s: string) => void) | null = null;
export function toast(s: string) {
  toastFn?.(s);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    toastFn = (s) => {
      setMsg(s);
      clearTimeout(t.current);
      t.current = setTimeout(() => setMsg(null), 2600);
    };
    return () => {
      toastFn = null;
    };
  }, []);
  return msg ? (
    <div class="toast" role="status" key={msg}>
      {msg}
    </div>
  ) : null;
}

/** Courbe simple : points + moyenne optionnelle. Surfaces plates, trait net. */
export function LineChart({
  points,
  line,
  height = 150,
  unit = '',
  target,
}: {
  points: { x: number; y: number }[];
  line?: { x: number; y: number }[];
  height?: number;
  unit?: string;
  target?: number;
}) {
  if (points.length === 0) return <p class="empty small">Pas encore de données.</p>;
  const W = 340;
  const H = height;
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const all = [...points, ...(line ?? [])];
  const xs = all.map((p) => p.x);
  let ys = all.map((p) => p.y);
  if (target != null) ys = [...ys, target];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y1 - y0 < 2) {
    y0 -= 1;
    y1 += 1;
  }
  const yPad = (y1 - y0) * 0.12;
  y0 -= yPad;
  y1 += yPad;
  const sx = (x: number) => pad.l + (x1 === x0 ? (W - pad.l - pad.r) / 2 : ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r));
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const path = (ps: { x: number; y: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [y0 + yPad, (y0 + y1) / 2, y1 - yPad];
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Courbe">
      {ticks.map((t) => (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgba(35,35,35,.12)" stroke-width="1" />
          <text x={pad.l - 6} y={sy(t) + 4} text-anchor="end">
            {num(t, 1)}
          </text>
        </g>
      ))}
      {target != null && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={sy(target)} y2={sy(target)} stroke="#d54d38" stroke-width="1.5" stroke-dasharray="4 4" />
          <text x={W - pad.r} y={sy(target) - 5} text-anchor="end" style={{ fill: '#b93d2a', fontWeight: 700 }}>
            {num(target)} {unit}
          </text>
        </g>
      )}
      {line && line.length > 1 && <path d={path(line)} fill="none" stroke="#164e9f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />}
      {!line && points.length > 1 && <path d={path(points)} fill="none" stroke="#164e9f" stroke-width="2.5" stroke-linejoin="round" />}
      {points.map((p) => (
        <circle cx={sx(p.x)} cy={sy(p.y)} r={line ? 2.5 : 3.5} fill={line ? 'rgba(35,35,35,.45)' : '#164e9f'} />
      ))}
    </svg>
  );
}

export function Close({ onClick, label = 'Fermer' }: { onClick: () => void; label?: string }) {
  return (
    <button class="icon-btn" aria-label={label} onClick={onClick}>
      <IClose />
    </button>
  );
}
