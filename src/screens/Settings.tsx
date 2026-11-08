import { useEffect, useRef, useState } from 'preact/hooks';
import { downloadBackup, importBackup } from '../lib/backup';
import { requestPersistence } from '../lib/db';
import { DAYS, dateLong } from '../lib/format';
import { saveSettings, settings, useStore } from '../lib/store';
import { cloudConfig, fullResync, sendCode, setCloudConfig, signOut, syncNow, useSync, verifyCode } from '../lib/sync';
import type { Settings } from '../lib/types';
import { back } from '../router';
import { IBack, ICheck, IClose } from '../ui/icons';
import { Seg, Stepper, Switch, toast } from '../ui/kit';

export function SettingsScreen() {
  useStore();
  const s = settings();
  const set = (patch: Partial<Settings>) => saveSettings({ ...s, ...patch });

  return (
    <div class="screen">
      <header class="topbar">
        <button class="icon-btn" aria-label="Retour" onClick={() => back()}>
          <IBack />
        </button>
      </header>
      <h1 class="h1" style={{ marginTop: '12px' }}>
        Réglages
      </h1>

      <section class="section">
        <h2 class="kicker" style={{ marginBottom: '12px' }}>
          <span class="idx">01</span> Basket
        </h2>
        <div class="rows">
          {s.basket.map((b, i) => (
            <div class="row">
              <select
                class="input"
                style={{ flex: 1.3 }}
                aria-label="Jour"
                value={b.day}
                onChange={(e) => set({ basket: s.basket.map((x, j) => (j === i ? { ...x, day: Number((e.target as HTMLSelectElement).value) } : x)) })}
              >
                {DAYS.map((d, k) => (
                  <option value={k}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                ))}
              </select>
              <input
                class="input"
                style={{ flex: 1 }}
                type="time"
                aria-label="Heure"
                value={b.time}
                onChange={(e) => set({ basket: s.basket.map((x, j) => (j === i ? { ...x, time: (e.target as HTMLInputElement).value } : x)) })}
              />
              <button class="mini" aria-label="Retirer le créneau" onClick={() => set({ basket: s.basket.filter((_, j) => j !== i) })}>
                <IClose />
              </button>
            </div>
          ))}
        </div>
        <button class="btn btn-soft btn-sm" style={{ marginTop: '12px' }} onClick={() => set({ basket: [...s.basket, { day: 5, time: '10:00' }] })}>
          Ajouter un créneau
        </button>
        <p class="muted tiny" style={{ marginTop: '10px' }}>
          Le match du dimanche s'active semaine par semaine depuis le planning.
        </p>
      </section>

      <section class="section">
        <h2 class="kicker" style={{ marginBottom: '6px' }}>
          <span class="idx">02</span> Séance
        </h2>
        <div class="row">
          <div class="grow">
            <div class="title">Minuteur de repos</div>
            <div class="muted tiny">Démarre après chaque série validée</div>
          </div>
          <Switch checked={s.restTimer} label="Minuteur de repos" onChange={(v) => set({ restTimer: v })} />
        </div>
      </section>

      <section class="section">
        <h2 class="kicker" style={{ marginBottom: '12px' }}>
          <span class="idx">03</span> Poids
        </h2>
        <div class="grid2">
          <div class="field">
            <span>Départ</span>
            <Stepper compact value={s.startKg} step={0.5} min={30} max={250} unit="kg" label="Poids de départ" onChange={(v) => v != null && set({ startKg: v })} />
          </div>
          <div class="field">
            <span>Objectif</span>
            <Stepper compact value={s.targetKg} step={0.5} min={30} max={250} unit="kg" label="Objectif" onChange={(v) => v != null && set({ targetKg: v })} />
          </div>
        </div>
      </section>

      <Cloud />

      <section class="section">
        <h2 class="kicker" style={{ marginBottom: '12px' }}>
          <span class="idx">05</span> Le point
        </h2>
        <Seg
          label="Fournisseur IA"
          value={s.aiProvider}
          options={[
            ['anthropic', 'Anthropic'],
            ['openai', 'OpenAI'],
          ]}
          onChange={(v) => set({ aiProvider: v })}
        />
        <p class="muted tiny" style={{ marginTop: '10px' }}>
          Les clés API restent sur le serveur (fonction Supabase). Aucun appel sans action de ta part.
        </p>
      </section>

      <Data />

      <p class="muted tiny" style={{ margin: '30px 0 10px', textAlign: 'center' }}>
        Club 74 · version {__APP_VERSION__}
      </p>
    </div>
  );
}

function Cloud() {
  const sync = useSync();
  const cfg = cloudConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await f();
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status: Record<string, string> = {
    off: 'Non connecté',
    idle: sync.lastSync ? `Synchronisé · ${dateLong(sync.lastSync)} ${new Date(sync.lastSync).toTimeString().slice(0, 5)}` : 'Connecté',
    syncing: 'Synchronisation…',
    offline: 'Hors ligne · reprise au retour du réseau',
    error: `En attente · ${sync.lastError}`,
  };

  return (
    <section class="section">
      <h2 class="kicker" style={{ marginBottom: '12px' }}>
        <span class="idx">04</span> Compte et synchronisation
      </h2>
      <p class="small" style={{ marginBottom: '14px' }}>
        {sync.email ? <b>{sync.email}</b> : null}
        {sync.email ? ' · ' : ''}
        <span class="muted">{status[sync.state]}</span>
      </p>

      {!sync.configured && (
        <>
          <p class="muted small" style={{ marginBottom: '12px' }}>
            Renseigne ton projet Supabase (URL et clé publique « anon »). Les données restent sur l'appareil tant que ce n'est pas fait.
          </p>
          <label class="field">
            <span>URL du projet</span>
            <input class="input" inputMode="url" placeholder="https://xxxx.supabase.co" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Clé publique (anon)</span>
            <input class="input" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
          </label>
          <button class="btn btn-primary btn-block" disabled={!url || !key} onClick={() => run(() => setCloudConfig({ url, anonKey: key }), 'Projet enregistré.')}>
            Enregistrer
          </button>
        </>
      )}

      {sync.configured && !sync.email && (
        <div class="stack">
          <label class="field" style={{ marginBottom: 0 }}>
            <span>E-mail</span>
            <input class="input" type="email" autoComplete="email" inputMode="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
          </label>
          {!sent ? (
            <button class="btn btn-primary btn-block" disabled={!email.includes('@') || busy} onClick={() => run(async () => { await sendCode(email.trim()); setSent(true); }, 'Code envoyé par e-mail.')}>
              Recevoir un code
            </button>
          ) : (
            <>
              <label class="field" style={{ marginBottom: 0 }}>
                <span>Code reçu</span>
                <input class="input tab" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
              </label>
              <button class="btn btn-primary btn-block" disabled={code.length < 6 || busy} onClick={() => run(() => verifyCode(email.trim(), code), 'Connecté. Historique synchronisé.')}>
                Se connecter
              </button>
              <button class="btn btn-ghost btn-block" onClick={() => setSent(false)}>
                Renvoyer un code
              </button>
            </>
          )}
          <button class="btn btn-ghost btn-sm" onClick={() => setCloudConfig(null)}>
            Changer de projet Supabase
          </button>
        </div>
      )}

      {sync.email && (
        <div class="stack">
          <button class="btn btn-soft btn-block" disabled={busy || sync.state === 'syncing'} onClick={() => run(syncNow)}>
            Synchroniser maintenant
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button class="btn btn-ghost btn-sm" onClick={() => run(fullResync, 'Resynchronisation complète terminée.')}>
              Tout resynchroniser
            </button>
            <button
              class="btn btn-ghost btn-sm"
              style={{ color: 'var(--red-lo)' }}
              onClick={() => confirm('Se déconnecter ? Les données restent sur cet appareil.') && run(signOut)}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Data() {
  const file = useRef<HTMLInputElement>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);
  return (
    <section class="section">
      <h2 class="kicker" style={{ marginBottom: '12px' }}>
        <span class="idx">06</span> Données
      </h2>
      <div class="grid2">
        <button class="btn btn-soft" onClick={downloadBackup}>
          Exporter
        </button>
        <button class="btn btn-soft" onClick={() => file.current?.click()}>
          Importer
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          try {
            const n = await importBackup(await f.text());
            toast(n ? `${n} élément${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} ou mis à jour.` : 'Rien de nouveau dans ce fichier.');
          } catch (err) {
            toast((err as Error).message);
          }
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <p class="muted tiny" style={{ marginTop: '10px' }}>
        Export JSON intégral. L'import fusionne : il ajoute ou met à jour, il n'efface rien.
      </p>
      <div class="row" style={{ marginTop: '8px' }}>
        <div class="grow">
          <div class="title">Stockage protégé</div>
          <div class="muted tiny">{persisted ? 'Le navigateur conserve les données.' : 'Sur iPhone, installe l’app sur l’écran d’accueil pour protéger les données.'}</div>
        </div>
        {!persisted && (
          <button class="btn btn-soft btn-sm" onClick={async () => setPersisted(await requestPersistence())}>
            Activer
          </button>
        )}
        {persisted && (
          <span class="check" aria-label="Activé">
            <ICheck />
          </span>
        )}
      </div>
    </section>
  );
}
