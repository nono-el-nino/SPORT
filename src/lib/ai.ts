/**
 * Client du module « Le point ». Aucune clé ici : l'appel passe par la fonction Edge
 * Supabase « le-point », qui détient les secrets OpenAI / Anthropic.
 * N'est appelé que sur action explicite de l'utilisateur.
 */
import type { Facts } from './facts';
import { accessToken, cloudConfig } from './sync';

export type PointMode = 'semaine' | 'seance' | 'question';

export interface PointAnswer {
  text: string;
  provider: string;
  model: string;
}

export function aiAvailable(): { ok: boolean; reason?: string } {
  if (!cloudConfig()) return { ok: false, reason: 'Cloud non configuré : bilan local uniquement.' };
  if (!accessToken()) return { ok: false, reason: 'Connecte-toi dans les réglages pour demander une analyse.' };
  if (!navigator.onLine) return { ok: false, reason: 'Hors ligne : bilan local uniquement.' };
  return { ok: true };
}

export async function askPoint(facts: Facts, mode: PointMode, provider: 'anthropic' | 'openai', question?: string): Promise<PointAnswer> {
  const c = cloudConfig();
  const token = accessToken();
  if (!c || !token) throw new Error('Connexion requise.');
  const res = await fetch(`${c.url}/functions/v1/le-point`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ facts, mode, provider, question: question?.trim() || undefined }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j as PointAnswer;
}
