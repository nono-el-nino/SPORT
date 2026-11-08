export type Route = 'today' | 'carnet' | 'carnet/exercices' | 'carnet/poids' | 'seance' | 'programme' | 'reglages' | 'point';

const ROUTES: Route[] = ['carnet', 'carnet/exercices', 'carnet/poids', 'seance', 'programme', 'reglages', 'point'];

export function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'today';
}

export function go(r: Route, replace = false) {
  const url = r === 'today' ? location.pathname + location.search : `#/${r}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new Event('hashchange'));
}

/** Retour arrière si possible, sinon vers la destination donnée. */
export function back(fallback: Route = 'today') {
  if (history.length > 1 && history.state !== 'root') history.back();
  else go(fallback, true);
}
