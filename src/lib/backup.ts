/** Export / import JSON intégral. L'import fusionne (dernier écrit gagne) : il ne supprime jamais rien. */
import { isoDay } from './format';
import { mergeRecords, rawRecords } from './store';
import type { Collection, Rec } from './types';

export const BACKUP_FORMAT = 'club74-backup';
const COLLECTIONS: Collection[] = ['config', 'workouts', 'activities', 'weights', 'plans'];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  records: Omit<Rec, 'dirty'>[];
}

export function buildBackup(): Backup {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    records: rawRecords().map(({ col, id, data, updatedAt, deleted }) => ({ col, id, data, updatedAt, deleted })),
  };
}

export function downloadBackup() {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `club74-${isoDay()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function parseBackup(text: string): Rec[] {
  const j = JSON.parse(text) as Partial<Backup>;
  if (j.format !== BACKUP_FORMAT || !Array.isArray(j.records)) throw new Error('Fichier non reconnu.');
  return j.records.filter(
    (r): r is Rec => !!r && COLLECTIONS.includes(r.col) && typeof r.id === 'string' && typeof r.updatedAt === 'number',
  );
}

/** Retourne le nombre d'enregistrements ajoutés ou mis à jour. */
export async function importBackup(text: string): Promise<number> {
  // Non marqués « propres » : ils partiront vers le cloud à la prochaine synchro.
  return mergeRecords(parseBackup(text), false);
}
