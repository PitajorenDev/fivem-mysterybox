import { useEffect, useState } from 'react';
import { api, usePortfolio, money } from './api.js';
import { Change } from './components/ui.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Totals from './pages/Totals.jsx';
import AddItems from './pages/AddItems.jsx';
import ItemModal from './components/ItemModal.jsx';
import Login from './Login.jsx';

const ROUTES = {
  portfolio: { label: 'Portfolio', icon: '🗂️' },
  totaal: { label: 'Totaal', icon: '💶' },
  toevoegen: { label: 'Toevoegen', icon: '📸' },
};

function useHashRoute() {
  const get = () => (window.location.hash.replace('#/', '') || 'portfolio');
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route in ROUTES ? route : 'portfolio';
}

const THEMES = {
  auto: { icon: '🌓', label: 'Thema: automatisch (volgt je toestel)' },
  light: { icon: '☀️', label: 'Thema: licht' },
  dark: { icon: '🌙', label: 'Thema: donker' },
};
const NEXT_THEME = { auto: 'dark', dark: 'light', light: 'auto' };

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'auto';
    } catch {
      return 'auto';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
  }, [theme]);
  return [theme, () => setTheme((t) => NEXT_THEME[t] ?? 'auto')];
}

// Toont het inlogscherm als de server een wachtwoord vraagt
export default function App() {
  useTheme();
  const [auth, setAuth] = useState(null); // null = laden, true = ok, false = inloggen
  useEffect(() => {
    api.auth().then((a) => setAuth(!a.required || a.ok)).catch(() => setAuth(true));
    const need = () => setAuth(false);
    window.addEventListener('auth-required', need);
    return () => window.removeEventListener('auth-required', need);
  }, []);
  if (auth === null) return <div className="loading">Laden…</div>;
  if (!auth) return <Login onLoggedIn={() => setAuth(true)} />;
  return <Main />;
}

function Main() {
  const [theme, cycleTheme] = useTheme();
  const route = useHashRoute();
  const { data, live, updatedAt, error, setData } = usePortfolio();
  const [status, setStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
  }, [updatedAt]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await api.refresh());
    } finally {
      setRefreshing(false);
    }
  };

  const summary = data?.summary;
  const openItem = data?.items.find((i) => i.id === openId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <div className="brand-name">TCG Portfolio</div>
            <div className="brand-sub">
              <span className={`live-dot ${live ? 'on' : ''}`} /> {live ? 'Live' : 'Offline'}
              {status?.cardmarket?.priceGuideDate && (
                <> · Cardmarket {new Date(status.cardmarket.priceGuideDate).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</>
              )}
            </div>
          </div>
        </div>
        {summary && (
          <div className="topbar-total">
            <div className="tt-value">{money(summary.totalValue)}</div>
            <Change value={summary.change24h ?? summary.change7d} label={summary.change24h != null ? '24u' : '7d'} />
          </div>
        )}
        <button className="btn ghost icon" onClick={cycleTheme} title={THEMES[theme].label} aria-label={THEMES[theme].label}>
          {THEMES[theme].icon}
        </button>
        <button className="btn ghost icon" onClick={refresh} disabled={refreshing} title="Prijzen nu verversen">
          {refreshing ? '⏳' : '🔄'}
        </button>
      </header>

      <nav className="tabs">
        {Object.entries(ROUTES).map(([key, r]) => (
          <a key={key} href={`#/${key}`} className={route === key ? 'active' : ''}>
            <span aria-hidden="true">{r.icon}</span> {r.label}
          </a>
        ))}
      </nav>

      {status?.cardmarket?.lastError && !status.cardmarket.prices && (
        <div className="banner warn">
          ⚠️ Cardmarket-prijzen konden niet geladen worden ({status.cardmarket.lastError}). De app probeert het automatisch opnieuw.
        </div>
      )}
      {error && <div className="banner warn">⚠️ {error}</div>}

      <main>
        {!data ? (
          <div className="loading">Laden…</div>
        ) : route === 'portfolio' ? (
          <Portfolio items={data.items} summary={summary} onOpen={setOpenId} />
        ) : route === 'totaal' ? (
          <Totals summary={summary} items={data.items} onOpen={setOpenId} />
        ) : (
          <AddItems recognition={status?.recognition} />
        )}
      </main>

      {openItem && <ItemModal item={openItem} onClose={() => setOpenId(null)} />}
    </div>
  );
}
