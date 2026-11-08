import { useEffect, useState } from 'preact/hooks';
import { Carnet, type CarnetTab } from './screens/Carnet';
import { Point } from './screens/Point';
import { ProgramScreen } from './screens/Program';
import { SessionScreen } from './screens/Session';
import { SettingsScreen } from './screens/Settings';
import { Today } from './screens/Today';
import { IBook, IToday } from './ui/icons';
import { ToastHost } from './ui/kit';
import { go, parseRoute as parse, type Route } from './router';

export function App() {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const f = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    window.addEventListener('popstate', f);
    return () => {
      window.removeEventListener('hashchange', f);
      window.removeEventListener('popstate', f);
    };
  }, []);

  if (route === 'seance') {
    return (
      <>
        <SessionScreen />
        <ToastHost />
      </>
    );
  }

  const main = route === 'today' || route.startsWith('carnet');
  return (
    <div class="app">
      {route === 'today' && <Today />}
      {route.startsWith('carnet') && <Carnet tab={(route.split('/')[1] as CarnetTab) ?? 'seances'} />}
      {route === 'programme' && <ProgramScreen />}
      {route === 'reglages' && <SettingsScreen />}
      {route === 'point' && <Point />}
      {main && (
        <nav class="tabbar" aria-label="Navigation principale">
          <button aria-current={route === 'today' ? 'page' : undefined} onClick={() => route !== 'today' && go('today')}>
            <IToday /> Aujourd'hui
          </button>
          <button aria-current={route.startsWith('carnet') ? 'page' : undefined} onClick={() => !route.startsWith('carnet') && go('carnet')}>
            <IBook /> Carnet
          </button>
        </nav>
      )}
      <ToastHost />
    </div>
  );
}
