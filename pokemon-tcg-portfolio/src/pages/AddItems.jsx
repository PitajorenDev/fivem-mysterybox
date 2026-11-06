import { useRef, useState } from 'react';
import { api, money, shrinkImage } from '../api.js';
import { CONDITIONS, LANGUAGES } from '../components/ItemModal.jsx';

let seq = 0;
const PRODUCT_TYPES = ['ETB', 'UPC', 'Booster Box', 'Booster Bundle', 'Booster Pack', 'Tin', 'Collection Box', 'Blister', 'Sealed', 'Single'];

export default function AddItems({ recognition }) {
  const [pending, setPending] = useState([]); // herkende items die nog bevestigd moeten worden
  const [scanning, setScanning] = useState(0);
  const [errors, setErrors] = useState([]);
  const [added, setAdded] = useState([]);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const onFiles = async (files) => {
    const list = [...files];
    setErrors([]);
    setScanning((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        try {
          const blob = await shrinkImage(file);
          const preview = URL.createObjectURL(blob);
          const res = await api.recognize(blob);
          if (!res.results.length) {
            setErrors((e) => [...e, `Geen Pokémon-product herkend op "${file.name}".`]);
          }
          setPending((p) => [
            ...p,
            ...res.results.map((r) => ({ key: ++seq, photo: res.photo, preview, ...r })),
          ]);
        } catch (e) {
          setErrors((er) => [...er, `${file.name}: ${e.message}`]);
        } finally {
          setScanning((n) => n - 1);
        }
      }),
    );
  };

  const done = (key, item) => {
    setPending((p) => p.filter((x) => x.key !== key));
    if (item) setAdded((a) => [item, ...a].slice(0, 10));
  };

  return (
    <>
      <section className="card scan-card">
        <h2>📸 Toevoegen via foto</h2>
        <p className="muted">
          Fotografeer je ETB, UPC, booster box of kaarten — ook meerdere items op één foto. Ze worden herkend en gekoppeld aan de
          Cardmarket-prijs.
        </p>
        {recognition === false && (
          <div className="banner warn">
            Foto-herkenning staat uit: zet <code>ANTHROPIC_API_KEY</code> in je <code>.env</code>. Handmatig zoeken hieronder werkt wel.
          </div>
        )}
        <div className="scan-buttons">
          <button className="btn primary big" onClick={() => cameraRef.current.click()} disabled={recognition === false}>
            📷 Foto maken
          </button>
          <button className="btn big" onClick={() => galleryRef.current.click()} disabled={recognition === false}>
            🖼️ Uit galerij
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {scanning > 0 && <div className="scanning"><span className="spinner" /> {scanning} foto{scanning > 1 ? "'s" : ''} analyseren…</div>}
        {errors.map((e, i) => <div key={i} className="banner warn">{e}</div>)}
      </section>

      {pending.map((p) => (
        <PendingItem key={p.key} entry={p} onDone={(item) => done(p.key, item)} />
      ))}

      {added.length > 0 && (
        <section className="card">
          <h2>✅ Toegevoegd</h2>
          <ul className="added-list">
            {added.map((a) => (
              <li key={a.id}>{a.quantity}× {a.name} — <strong>{money(a.value)}</strong></li>
            ))}
          </ul>
          <a href="#/portfolio" className="link">Naar portfolio →</a>
        </section>
      )}

      <ManualSearch onAdded={(item) => setAdded((a) => [item, ...a].slice(0, 10))} />
    </>
  );
}

// Eén herkend product: kies de juiste Cardmarket-match en bevestig
function PendingItem({ entry, onDone }) {
  const d = entry.detected;
  const [candidates, setCandidates] = useState(entry.candidates);
  const [selected, setSelected] = useState(entry.candidates[0] ?? null);
  const [query, setQuery] = useState(d.search_query || d.name);

  const research = async () => {
    const res = await api.search({ q: query, kind: d.kind, ...(d.kind === 'single' && d.card_number ? { number: d.card_number } : {}) });
    setCandidates(res.results);
    setSelected(res.results[0] ?? null);
  };

  return (
    <section className="card pending">
      <div className="pending-head">
        <img src={entry.preview} alt="" className="pending-photo" />
        <div>
          <div className="muted small">Herkend ({Math.round((d.confidence ?? 0) * 100)}% zeker)</div>
          <h3>{d.name}</h3>
          <div className="item-meta">
            <span className="badge">{d.product_type}</span>
            {d.set_name && <span>{d.set_name}</span>}
            {d.card_number && <span>#{d.card_number}</span>}
            <span>{d.language}</span>
          </div>
        </div>
      </div>

      <div className="search-again">
        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && research()} />
        <button className="btn" onClick={research}>Zoek opnieuw</button>
      </div>

      {candidates.length ? (
        <ul className="candidates">
          {candidates.map((c) => (
            <li key={`${c.source}:${c.ref}`}>
              <label className={selected === c ? 'selected' : ''}>
                <input type="radio" name={`c-${entry.key}`} checked={selected === c} onChange={() => setSelected(c)} />
                {c.image ? <img src={c.image} alt="" /> : <span className="cand-icon">{c.kind === 'single' ? '🃏' : '📦'}</span>}
                <span className="cand-name">
                  {c.name}
                  <span className="muted small">{[c.setName, c.productType, c.source === 'ptcg' ? 'via pokemontcg.io' : 'Cardmarket'].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="cand-price">{money(c.price?.trend ?? c.price?.avg ?? c.price?.low)}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Geen match gevonden op Cardmarket. Pas de zoekterm aan, of voeg toe met een eigen prijs.</p>
      )}

      <AddForm
        candidate={selected}
        fallbackName={d.name}
        defaults={{ quantity: d.quantity || 1, language: d.language || 'English', kind: d.kind, productType: d.product_type, setName: d.set_name, photo: entry.photo }}
        onAdded={onDone}
        onSkip={() => onDone(null)}
      />
    </section>
  );
}

function AddForm({ candidate, fallbackName, defaults, onAdded, onSkip }) {
  const kind = candidate?.kind ?? defaults.kind ?? 'sealed';
  const [f, setF] = useState({
    quantity: defaults.quantity ?? 1,
    purchasePrice: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    condition: kind === 'single' ? 'NM' : 'Sealed',
    language: defaults.language ?? 'English',
    variant: 'normal',
    manualPrice: '',
    name: fallbackName ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const base = candidate
        ? { source: candidate.source, ref: candidate.ref, name: candidate.name, setName: candidate.setName ?? defaults.setName, kind: candidate.kind, productType: candidate.productType, image: candidate.image, url: candidate.url }
        : (() => {
            const productType = f.productType ?? defaults.productType ?? 'ETB';
            return { source: 'manual', ref: null, name: f.name, setName: defaults.setName, kind: productType === 'Single' ? 'single' : 'sealed', productType };
          })();
      if (!base.name) throw new Error('Geef een naam op');
      const item = await api.addItem({
        ...base,
        photo: defaults.photo ?? null,
        quantity: Math.max(1, Number(f.quantity) || 1),
        purchasePrice: f.purchasePrice === '' ? null : Number(f.purchasePrice),
        purchaseDate: f.purchaseDate || null,
        condition: f.condition,
        language: f.language,
        variant: f.variant,
        manualPrice: f.manualPrice === '' ? null : Number(f.manualPrice),
      });
      onAdded(item);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="form-grid">
        {!candidate && <label className="full">Naam<input className="input" value={f.name} onChange={set('name')} /></label>}
        {!candidate && (
          <label>Type
            <select className="input" value={f.productType ?? defaults.productType ?? 'ETB'} onChange={set('productType')}>
              {PRODUCT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        )}
        <label>Aantal<input className="input" type="number" min="1" value={f.quantity} onChange={set('quantity')} /></label>
        <label>Aankoopprijs p/st (€)<input className="input" type="number" step="0.01" min="0" placeholder="bv. 49.99" value={f.purchasePrice} onChange={set('purchasePrice')} /></label>
        <label>Aankoopdatum<input className="input" type="date" value={f.purchaseDate} onChange={set('purchaseDate')} /></label>
        <label>Conditie
          <select className="input" value={f.condition} onChange={set('condition')}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label>Taal
          <select className="input" value={f.language} onChange={set('language')}>{LANGUAGES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        {kind === 'single' && (
          <label>Variant
            <select className="input" value={f.variant} onChange={set('variant')}>
              <option value="normal">Normaal / Holo</option>
              <option value="reverse">Reverse Holo</option>
            </select>
          </label>
        )}
        {!candidate && <label>Waarde p/st (€)<input className="input" type="number" step="0.01" min="0" value={f.manualPrice} onChange={set('manualPrice')} /></label>}
      </div>
      {err && <div className="banner warn">{err}</div>}
      <div className="modal-actions">
        {onSkip && <button className="btn ghost" onClick={onSkip}>Overslaan</button>}
        <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Toevoegen…' : '＋ Toevoegen aan portfolio'}</button>
      </div>
    </>
  );
}

function ManualSearch({ onAdded }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const res = await api.search({ q, ...(kind ? { kind } : {}) });
      setResults(res.results);
      setOpen(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>🔎 Handmatig zoeken op Cardmarket</h2>
      <form className="search-again" onSubmit={search}>
        <input className="input" placeholder='bv. "151 ETB", "Evolving Skies booster box", "Umbreon VMAX"' value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input narrow" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Soort">
          <option value="">Alles</option>
          <option value="sealed">Sealed</option>
          <option value="single">Kaarten</option>
        </select>
        <button className="btn primary" disabled={busy}>{busy ? '…' : 'Zoek'}</button>
      </form>

      {results && !results.length && <p className="muted">Niets gevonden.</p>}
      {results && (
        <ul className="candidates">
          {results.map((c, i) => (
            <li key={`${c.source}:${c.ref}`}>
              <label className={open === i ? 'selected' : ''} onClick={() => setOpen(open === i ? null : i)}>
                {c.image ? <img src={c.image} alt="" /> : <span className="cand-icon">{c.kind === 'single' ? '🃏' : '📦'}</span>}
                <span className="cand-name">
                  {c.name}
                  <span className="muted small">{[c.setName, c.productType, c.source === 'ptcg' ? 'via pokemontcg.io' : 'Cardmarket'].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="cand-price">{money(c.price?.trend ?? c.price?.avg ?? c.price?.low)}</span>
              </label>
              {open === i && (
                <div className="inline-form">
                  <AddForm candidate={c} defaults={{}} onAdded={(item) => { onAdded(item); setOpen(null); }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="manual-details">
        <summary>Item zonder Cardmarket-match toevoegen</summary>
        <AddForm candidate={null} defaults={{ kind: 'sealed' }} onAdded={onAdded} />
      </details>
    </section>
  );
}
