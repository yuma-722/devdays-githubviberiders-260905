import { ResultsView } from './components/ResultsView';
import { SurveyForm } from './components/SurveyForm';
import { ROUTE_HASH, useHashRoute, type Route } from './lib/router';

const NAV: { route: Route; label: string }[] = [
  { route: 'survey', label: 'アンケートに回答' },
  { route: 'results', label: '集計結果' },
];

export function App() {
  const [route, navigate] = useHashRoute();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <header className="masthead">
        <div className="masthead__inner">
          <a className="brand" href={ROUTE_HASH.survey} aria-label="Dev Days Tokyo 事後アンケート トップ">
            <span className="brand__sign" aria-hidden="true">
              DD
            </span>
            <span className="brand__text">
              <span className="brand__event">Dev Days Tokyo</span>
              <span className="brand__title">事後アンケート</span>
            </span>
          </a>
          <nav className="nav" aria-label="ページ">
            {NAV.map((item) => (
              <a
                key={item.route}
                className="nav__link"
                href={ROUTE_HASH[item.route]}
                aria-current={route === item.route ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.route);
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {route === 'survey' ? <SurveyForm /> : <ResultsView />}
      </main>

      <footer className="footer">
        <p>
          GitHub Vibe Riders — <span lang="en">Dev Days Tokyo</span>「GitHub Copilot app に入門！」
        </p>
      </footer>
    </div>
  );
}
