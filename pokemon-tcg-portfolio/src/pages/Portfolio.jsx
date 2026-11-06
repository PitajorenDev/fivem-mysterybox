import { useMemo, useState } from 'react';
import { money } from '../api.js';
import { Change, Sparkline, Thumb } from '../components/ui.jsx';

const FILTERS = [
  { key: 'all', label: 'Alles' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'single', label: 'Kaarten' },
];

const SORTS = {
  value: { label: 'Waarde', fn: (a, b) => (b.value ?? 0) - (a.value ?? 0) },
  change: { label: 'Stijging 7d', fn: (a, b) => (b.change7d ?? -1e9) - (a.change7d ?? -1e9) },
  profit: { label: 'Winst', fn: (a, b) => (b.changePurchase ?? -1e9) - (a.changePurchase ?? -1e9) },
  name: { label: 'Naam', fn: (a, b) => a.name.localeCompare(b.name) },
  added: { label: 'Nieuwste', fn: (a, b) => b.addedAt.localeCompare(a.addedAt) },
};

export default function Portfolio({ items, summary, onOpen }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('value');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => filter === 'all' || i.kind === filter)
      .filter((i) => !term || `${i.name} ${i.setName ?? ''} ${i.productType}`.toLowerCase().includes(term))
      .sort(SORTS[sort].fn);
  }, [items, filter, sort, q]);

  if (!items.length) {
    return (
      <div className="empty">
        <div className="empty-icon">📦</div>
        <h2>Je portfolio is nog leeg</h2>
        <p>Maak een foto van je ETB's, UPC's of kaarten en ze worden automatisch herkend en gewaardeerd via Cardmarket.</p>
        <a className="btn primary" href="#toevoegen">📸 Eerste item toevoegen</a>
      </div>
    );
  }

  return (
    <>
      <section className="stat-row">
        <div className="stat">
          <div className="stat-label">Huidige waarde</div>
          <div className="stat-value">{money(summary.totalValue)}</div>
          <Change value={summary.change24h} label="24u" />
        </div>
        <div className="stat">
          <div className="stat-label">Winst / verlies</div>
          <div className={`stat-value ${summary.profit >= 0 ? 'pos' : 'neg'}`}>{money(summary.profit)}</div>
          <Change value={summary.profitPct} label="t.o.v. aankoop" />
        </div>
        <div className="stat hide-sm">
          <div className="stat-label">Items</div>
          <div className="stat-value">{summary.itemCount}</div>
          <Change value={summary.change7d} label="7d" />
        </div>
      </section>

      <div className="toolbar">
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="input search" placeholder="Zoeken…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sorteren">
          {Object.entries(SORTS).map(([k, s]) => (
            <option key={k} value={k}>{s.label}</option>
          ))}
        </select>
      </div>

      <ul className="item-list">
        {shown.map((it) => (
          <li key={it.id}>
            <button className="item-row" onClick={() => onOpen(it.id)}>
              <Thumb item={it} />
              <div className="item-main">
                <div className="item-name">{it.name}</div>
                <div className="item-meta">
                  <span className="badge">{it.productType}</span>
                  {it.setName && <span>{it.setName}</span>}
                  <span>×{it.quantity}</span>
                  {it.unitPrice != null && <span>{money(it.unitPrice)} p/st</span>}
                </div>
              </div>
              <Sparkline points={it.history} />
              <div className="item-value">
                <div className="item-price">{money(it.value)}</div>
                <Change value={it.change7d ?? it.change24h} label={it.change7d != null ? '7d' : it.change24h != null ? '24u' : ''} />
                {it.changePurchase != null && (
                  <div className="item-sub">
                    <Change value={it.changePurchase} label="sinds aankoop" />
                  </div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="muted center">Geen items gevonden.</p>}
    </>
  );
}
