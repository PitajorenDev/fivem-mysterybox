import { useMemo, useState } from 'react';
import { money } from '../api.js';
import { Change, LineChart, Thumb } from '../components/ui.jsx';

const RANGES = [
  { key: 30, label: '1M' },
  { key: 90, label: '3M' },
  { key: 365, label: '1J' },
  { key: 0, label: 'Alles' },
];

export default function Totals({ summary, items, onOpen }) {
  const [range, setRange] = useState(90);

  const hist = useMemo(() => {
    const h = summary.history;
    if (!range) return h;
    const cutoff = Date.now() - range * 864e5;
    return h.filter((p) => Date.parse(p.t) >= cutoff);
  }, [summary.history, range]);

  const maxType = Math.max(1, ...summary.byType.map((t) => t.value));
  const best = [...items].filter((i) => i.value != null).sort((a, b) => b.value - a.value).slice(0, 5);

  return (
    <>
      <section className="hero">
        <div className="hero-label">Totale portfolio-waarde</div>
        <div className="hero-value">{money(summary.totalValue)}</div>
        <div className="hero-changes">
          <Change value={summary.change24h} label="24u" />
          <Change value={summary.change7d} label="7 dagen" />
          <Change value={summary.profitPct} label="sinds aankoop" />
        </div>
      </section>

      <section className="stat-row">
        <div className="stat">
          <div className="stat-label">Geïnvesteerd</div>
          <div className="stat-value">{money(summary.totalInvested)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Winst / verlies</div>
          <div className={`stat-value ${summary.profit >= 0 ? 'pos' : 'neg'}`}>
            {summary.profit > 0 ? '+' : ''}
            {money(summary.profit)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Aantal items</div>
          <div className="stat-value">{summary.itemCount}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Waardeverloop</h2>
          <div className="seg small">
            {RANGES.map((r) => (
              <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <LineChart series={hist.map((p) => ({ t: p.t, v: p.v }))} secondary={hist.map((p) => ({ t: p.t, v: p.i }))} />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Verdeling per type</h2>
          {summary.byType.length ? (
            <table className="bars">
              <tbody>
                {summary.byType.map((t) => (
                  <tr key={t.type}>
                    <th scope="row">
                      {t.type} <span className="muted">×{t.count}</span>
                    </th>
                    <td className="bar-cell">
                      <div className="bar" style={{ width: `${(t.value / maxType) * 100}%` }} title={money(t.value)} />
                    </td>
                    <td className="num">
                      {money(t.value)}
                      <div className="muted small">
                        {summary.totalValue ? Math.round((t.value / summary.totalValue) * 100) : 0}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Nog geen items.</p>
          )}
        </section>

        <section className="card">
          <h2>Meest waard</h2>
          <MiniList list={best} onOpen={onOpen} render={(i) => money(i.value)} />
        </section>

        <section className="card">
          <h2>Grootste stijgers (7d)</h2>
          <MiniList list={summary.topGainers.filter((m) => m.change7d > 0)} onOpen={onOpen} render={(i) => <Change value={i.change7d} />} />
        </section>

        <section className="card">
          <h2>Grootste dalers (7d)</h2>
          <MiniList list={summary.topLosers} onOpen={onOpen} render={(i) => <Change value={i.change7d} />} />
        </section>
      </div>
    </>
  );
}

function MiniList({ list, onOpen, render }) {
  if (!list.length) return <p className="muted">Nog niets te tonen.</p>;
  return (
    <ul className="mini-list">
      {list.map((i) => (
        <li key={i.id}>
          <button onClick={() => onOpen(i.id)}>
            <Thumb item={i} size={36} />
            <span className="mini-name">{i.name}</span>
            <span className="mini-val">{render(i)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
