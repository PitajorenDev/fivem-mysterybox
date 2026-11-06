import { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { Change, LineChart, Thumb } from './ui.jsx';

export const CONDITIONS = ['Sealed', 'MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'];
export const LANGUAGES = ['English', 'Japanese', 'German', 'French', 'Italian', 'Spanish', 'Dutch', 'Korean', 'Chinese'];

export default function ItemModal({ item, onClose }) {
  const [form, setForm] = useState(() => ({
    quantity: item.quantity ?? 1,
    purchasePrice: item.purchasePrice ?? '',
    purchaseDate: item.purchaseDate ?? '',
    condition: item.condition ?? '',
    language: item.language ?? 'English',
    variant: item.variant ?? 'normal',
    manualPrice: item.manualPrice ?? '',
    notes: item.notes ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.updateItem(item.id, {
        ...form,
        quantity: Math.max(1, Number(form.quantity) || 1),
        purchasePrice: form.purchasePrice === '' ? null : Number(form.purchasePrice),
        manualPrice: form.manualPrice === '' ? null : Number(form.manualPrice),
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`"${item.name}" verwijderen uit je portfolio?`)) return;
    await api.deleteItem(item.id);
    onClose();
  };

  const p = item.prices;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={item.name}>
        <button className="modal-close" onClick={onClose} aria-label="Sluiten">✕</button>
        <div className="modal-head">
          <Thumb item={item} size={96} />
          <div>
            <h2>{item.name}</h2>
            <div className="item-meta">
              <span className="badge">{item.productType}</span>
              {item.setName && <span>{item.setName}</span>}
            </div>
            <div className="modal-price">
              {money(item.unitPrice)} <span className="muted small">p/st · {item.priceSource ?? 'geen prijs'}</span>
            </div>
            <div className="hero-changes">
              <Change value={item.change24h} label="24u" />
              <Change value={item.change7d} label="7d" />
              <Change value={item.change30d} label="30d" />
            </div>
          </div>
        </div>

        {p && (
          <div className="price-grid">
            <div><span>Trend</span>{money(p.trend)}</div>
            <div><span>Laagste</span>{money(p.low)}</div>
            <div><span>Gem. 1d</span>{money(p.avg1)}</div>
            <div><span>Gem. 7d</span>{money(p.avg7)}</div>
            <div><span>Gem. 30d</span>{money(p.avg30)}</div>
            <div><span>Totaal ×{item.quantity}</span><strong>{money(item.value)}</strong></div>
          </div>
        )}

        <LineChart series={item.history.map((h) => ({ t: h.t, v: h.p }))} height={160} valueLabel="Prijs p/st" />

        {item.url && (
          <a className="link" href={item.url} target="_blank" rel="noreferrer">Bekijk op Cardmarket ↗</a>
        )}

        <div className="form-grid">
          <label>Aantal<input className="input" type="number" min="1" value={form.quantity} onChange={set('quantity')} /></label>
          <label>Aankoopprijs p/st (€)<input className="input" type="number" step="0.01" min="0" value={form.purchasePrice} onChange={set('purchasePrice')} /></label>
          <label>Aankoopdatum<input className="input" type="date" value={form.purchaseDate} onChange={set('purchaseDate')} /></label>
          <label>Conditie
            <select className="input" value={form.condition} onChange={set('condition')}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Taal
            <select className="input" value={form.language} onChange={set('language')}>
              {LANGUAGES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {item.kind === 'single' && (
            <label>Variant
              <select className="input" value={form.variant} onChange={set('variant')}>
                <option value="normal">Normaal / Holo</option>
                <option value="reverse">Reverse Holo</option>
              </select>
            </label>
          )}
          <label>Eigen prijs p/st (optioneel)<input className="input" type="number" step="0.01" min="0" placeholder="Cardmarket" value={form.manualPrice} onChange={set('manualPrice')} /></label>
          <label className="full">Notities<textarea className="input" rows="2" value={form.notes} onChange={set('notes')} /></label>
        </div>
        {err && <div className="banner warn">{err}</div>}
        <div className="modal-actions">
          <button className="btn danger" onClick={remove}>Verwijderen</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  );
}
