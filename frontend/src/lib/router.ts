import { useEffect, useState } from 'react';

export type Route = 'survey' | 'results';

export const ROUTE_HASH: Record<Route, string> = {
  survey: '#/',
  results: '#/results',
};

export function routeFromHash(hash: string): Route {
  const normalized = hash.replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase();
  return normalized === 'results' ? 'results' : 'survey';
}

/** ハッシュベースの最小ルーティング（SWA でもフォールバック設定なしで動く） */
export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'survey' : routeFromHash(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: Route) => {
    if (window.location.hash !== ROUTE_HASH[next]) {
      window.location.hash = ROUTE_HASH[next];
    }
    setRoute(next);
  };

  return [route, navigate];
}
