import '@fontsource/alumni-sans/latin-700.css';
import '@fontsource/alumni-sans/latin-800.css';
import '@fontsource/alumni-sans/latin-900.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './styles/app.css';
import { render } from 'preact';
import { App } from './app';
import { requestPersistence } from './lib/db';
import { initStore, setLocalChangeHook } from './lib/store';
import { initSync, scheduleSync } from './lib/sync';

async function boot() {
  const root = document.getElementById('app')!;
  try {
    await initStore();
  } catch (e) {
    root.innerHTML = `<p style="padding:24px;font-family:sans-serif">Stockage local indisponible (${(e as Error).message}). Navigation privée ?</p>`;
    return;
  }
  setLocalChangeHook(() => scheduleSync());
  history.replaceState('root', '');
  render(<App />, root);
  void initSync();
  // Installée sur l'écran d'accueil, l'app obtient généralement la persistance.
  void requestPersistence();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }
}

void boot();
