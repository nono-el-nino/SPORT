/**
 * Synchronisation Supabase, sans SDK : Auth (code à usage unique par e-mail) + PostgREST.
 *
 * - Les données vivent d'abord dans IndexedDB ; le cloud est une copie privée (RLS).
 * - Fusion « dernier écrit gagne » par enregistrement, côté client et côté serveur (RPC).
 * - Identifiants stables (UUID, date pour les pesées) : pas de doublons entre appareils.
 */
import { useEffect, useState } from 'preact/hooks';
import { dirtyRecords, local, markSynced, mergeRecords } from './store';
import type { Collection, Rec } from './types';

export interface CloudConfig {
  url: string;
  anonKey: string;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

let session: Session | null = null;
let config: CloudConfig | null = null;
let state: SyncState = 'off';
let lastSync: number | null = null;
let lastError = '';
const listeners = new Set<() => void>();

function setState(s: SyncState, err = '') {
  state = s;
  lastError = err;
  for (const l of listeners) l();
}

export function useSync() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((x) => x + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return { state, lastSync, lastError, email: session?.email ?? null, configured: !!config };
}

export function cloudConfig(): CloudConfig | null {
  return config;
}

export function accessToken(): string | null {
  return session?.access_token ?? null;
}

export async function initSync(): Promise<void> {
  const env = import.meta.env;
  const saved = await local.get<CloudConfig>('cloud');
  const url = saved?.url || env.VITE_SUPABASE_URL;
  const anonKey = saved?.anonKey || env.VITE_SUPABASE_ANON_KEY;
  config = url && anonKey ? { url: url.replace(/\/$/, ''), anonKey } : null;
  session = (await local.get<Session>('session')) ?? null;
  lastSync = (await local.get<number>('lastSync')) ?? null;
  setState(session && config ? 'idle' : 'off');
  // syncNow() ne fait rien tant qu'il n'y a pas de session.
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  void syncNow();
}

export async function setCloudConfig(c: CloudConfig | null) {
  config = c ? { url: c.url.trim().replace(/\/$/, ''), anonKey: c.anonKey.trim() } : null;
  await local.set('cloud', config ?? undefined);
  setState(session && config ? 'idle' : 'off');
}

function headers(auth = true): Record<string, string> {
  const h: Record<string, string> = { apikey: config!.anonKey, 'Content-Type': 'application/json' };
  if (auth && session) h.Authorization = `Bearer ${session.access_token}`;
  return h;
}

async function call(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  if (!config) throw new Error('Cloud non configuré.');
  if (auth) await ensureFresh();
  const res = await fetch(`${config.url}${path}`, { ...init, headers: { ...headers(auth), ...(init.headers as object) } });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = j.msg || j.message || j.error_description || j.error || msg;
    } catch {
      /* corps vide */
    }
    throw new Error(msg);
  }
  return res;
}

/* ——— Authentification par code e-mail ——— */

export async function sendCode(email: string): Promise<void> {
  await call('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email, create_user: true }) }, false);
}

export async function verifyCode(email: string, token: string): Promise<void> {
  const res = await call('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ type: 'email', email, token }) }, false);
  await storeSession(await res.json(), email);
  setState('idle');
  // Nouvel appareil : on récupère tout l'historique.
  await local.set('cursor', undefined);
  await syncNow();
}

async function storeSession(j: { access_token: string; refresh_token: string; expires_in: number; user?: { email?: string } }, email?: string) {
  session = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + j.expires_in * 1000,
    email: j.user?.email ?? email ?? session?.email ?? '',
  };
  await local.set('session', session);
}

async function ensureFresh() {
  if (!session || session.expires_at - Date.now() > 60_000) return;
  const res = await fetch(`${config!.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (res.ok) {
    await storeSession(await res.json());
  } else if (res.status === 400 || res.status === 401) {
    // Session révoquée : on se déconnecte proprement, les données locales restent.
    await signOut();
    throw new Error('Session expirée. Reconnecte-toi.');
  } else {
    throw new Error(`Rafraîchissement impossible (${res.status})`);
  }
}

export async function signOut(): Promise<void> {
  session = null;
  await local.set('session', undefined);
  setState('off');
}

/* ——— Synchronisation ——— */

interface Row {
  collection: Collection;
  id: string;
  data: unknown;
  updated_at: number;
  deleted: boolean;
  server_ts: string;
}

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Appelée après chaque écriture locale : synchronisation groupée quelques secondes plus tard. */
export function scheduleSync(delay = 2500) {
  if (!session || !config) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export function syncNow(): Promise<void> {
  if (!session || !config) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) {
      setState('offline');
      return;
    }
    setState('syncing');
    try {
      await pull();
      await push();
      lastSync = Date.now();
      await local.set('lastSync', lastSync);
      setState('idle');
    } catch (e) {
      setState(navigator.onLine ? 'error' : 'offline', (e as Error).message);
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

async function pull() {
  let cursor = (await local.get<string>('cursor')) ?? '1970-01-01T00:00:00Z';
  for (;;) {
    const q = `/rest/v1/club74_records?select=collection,id,data,updated_at,deleted,server_ts&server_ts=gt.${encodeURIComponent(cursor)}&order=server_ts.asc&limit=500`;
    const rows = (await (await call(q)).json()) as Row[];
    if (!rows.length) break;
    const incoming: Rec[] = rows.map((r) => ({ col: r.collection, id: r.id, data: r.data, updatedAt: Number(r.updated_at), deleted: r.deleted }));
    await mergeRecords(incoming, true);
    cursor = rows[rows.length - 1].server_ts;
    await local.set('cursor', cursor);
    if (rows.length < 500) break;
  }
}

async function push() {
  const dirty = dirtyRecords();
  for (let i = 0; i < dirty.length; i += 200) {
    const batch = dirty.slice(i, i + 200);
    const items = batch.map((r) => ({ collection: r.col, id: r.id, data: r.data, updated_at: r.updatedAt, deleted: !!r.deleted }));
    // Le serveur n'écrase une ligne que si la version envoyée est plus récente.
    await call('/rest/v1/rpc/club74_push', { method: 'POST', body: JSON.stringify({ items }) });
    await markSynced(batch);
  }
}

/** Repart de zéro : récupère tout le cloud puis renvoie tout le local non synchronisé. */
export async function fullResync(): Promise<void> {
  await local.set('cursor', undefined);
  await syncNow();
}
