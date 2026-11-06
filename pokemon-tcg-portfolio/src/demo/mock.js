// Demo-modus: vervangt de server door een nep-API in de browser, zodat de app
// zonder server (bv. als los HTML-bestand) uit te proberen is.
// Alle prijzen zijn VOORBEELDWAARDEN en bewegen gesimuleerd.
window.__TCG_DEMO__ = true;

const CATALOG = [
  // sealed
  ['cm', 101, 'Scarlet & Violet 151 Elite Trainer Box', 'ETB', 'sealed', '151', 95],
  ['cm', 102, 'Scarlet & Violet 151 Ultra Premium Collection', 'UPC', 'sealed', '151', 150],
  ['cm', 103, 'Scarlet & Violet 151 Booster Bundle', 'Booster Bundle', 'sealed', '151', 45],
  ['cm', 104, 'Evolving Skies Booster Box', 'Booster Box', 'sealed', 'Evolving Skies', 820],
  ['cm', 105, 'Prismatic Evolutions Elite Trainer Box', 'ETB', 'sealed', 'Prismatic Evolutions', 135],
  ['cm', 106, 'Prismatic Evolutions Booster Bundle', 'Booster Bundle', 'sealed', 'Prismatic Evolutions', 75],
  ['cm', 107, 'Paldean Fates Elite Trainer Box', 'ETB', 'sealed', 'Paldean Fates', 85],
  ['cm', 108, 'Surging Sparks Booster Box', 'Booster Box', 'sealed', 'Surging Sparks', 185],
  ['cm', 109, 'Journey Together Elite Trainer Box', 'ETB', 'sealed', 'Journey Together', 60],
  ['cm', 110, 'Destined Rivals Booster Box', 'Booster Box', 'sealed', 'Destined Rivals', 210],
  ['cm', 111, 'Crown Zenith Elite Trainer Box', 'ETB', 'sealed', 'Crown Zenith', 70],
  ['cm', 112, 'Celebrations Ultra Premium Collection', 'UPC', 'sealed', 'Celebrations', 220],
  ['cm', 113, 'Charizard ex Premium Collection', 'Collection Box', 'sealed', 'Obsidian Flames', 55],
  ['cm', 114, 'Paldean Fates Tin', 'Tin', 'sealed', 'Paldean Fates', 28],
  // losse kaarten
  ['ptcg', 'sv3pt5-199', 'Charizard ex (MEW 199)', 'Single', 'single', '151', 95],
  ['ptcg', 'sv3pt5-205', 'Mew ex (MEW 205)', 'Single', 'single', '151', 45],
  ['ptcg', 'swsh7-215', 'Umbreon VMAX (EVS 215)', 'Single', 'single', 'Evolving Skies', 1350],
  ['ptcg', 'sv8-238', 'Pikachu ex (SSP 238)', 'Single', 'single', 'Surging Sparks', 330],
  ['ptcg', 'swsh11-186', 'Giratina V (LOR 186)', 'Single', 'single', 'Lost Origin', 650],
  ['ptcg', 'sv8pt5-167', 'Eevee ex (PRE 167)', 'Single', 'single', 'Prismatic Evolutions', 120],
].map(([source, ref, name, productType, kind, setName, base]) => ({
  source: source === 'cm' ? 'cardmarket' : 'ptcg',
  ref: String(ref),
  name,
  productType,
  kind,
  setName,
  base,
}));

const DAY = 864e5;
const round2 = (n) => Math.round(n * 100) / 100;
const key = (p) => `${p.source}:${p.ref}`;
const byKey = new Map(CATALOG.map((p) => [key(p), p]));

// Deterministische pseudo-random zodat de geschiedenis er steeds hetzelfde uitziet
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// 120 dagen prijsgeschiedenis per product, eindigend op de basisprijs
const priceHist = new Map();
for (const p of CATALOG) {
  const pts = [];
  let v = p.base;
  for (let d = 0; d < 120; d++) {
    pts.unshift({ t: new Date(Date.now() - d * DAY).toISOString(), p: round2(v) });
    v = v / (1 + (rand() - 0.47) * 0.035);
  }
  priceHist.set(key(p), pts);
}
const current = (k) => priceHist.get(k).at(-1).p;
const priceAgo = (k, days) => {
  const h = priceHist.get(k);
  const cutoff = Date.now() - days * DAY;
  for (let i = h.length - 1; i >= 0; i--) if (Date.parse(h[i].t) <= cutoff) return h[i].p;
  return h[0].p;
};
const avg = (k, days) => {
  const h = priceHist.get(k).filter((x) => Date.parse(x.t) >= Date.now() - days * DAY);
  return round2(h.reduce((s, x) => s + x.p, 0) / (h.length || 1));
};
const pricesFor = (k) => ({
  trend: current(k),
  low: round2(current(k) * 0.9),
  avg: round2(current(k) * 0.98),
  avg1: avg(k, 1),
  avg7: avg(k, 7),
  avg30: avg(k, 30),
  updatedAt: new Date().toISOString(),
});

// ------------------------------------------------------------ portfolio
const STORE_KEY = 'tcg-demo-items-v1';
const seedItems = () =>
  [
    ['cardmarket:101', 3, 62, 210],
    ['cardmarket:104', 1, 310, 600],
    ['cardmarket:105', 2, 70, 120],
    ['cardmarket:102', 1, 120, 300],
    ['cardmarket:106', 4, 38, 90],
    ['ptcg:sv3pt5-199', 1, 60, 250],
    ['ptcg:swsh7-215', 1, 900, 400],
  ].map(([k, quantity, purchasePrice, daysAgo], i) => {
    const p = byKey.get(k);
    return {
      id: `demo-${i}`,
      addedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
      purchaseDate: new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10),
      source: p.source,
      ref: p.ref,
      name: p.name,
      setName: p.setName,
      kind: p.kind,
      productType: p.productType,
      variant: 'normal',
      quantity,
      purchasePrice,
      condition: p.kind === 'single' ? 'NM' : 'Sealed',
      language: 'English',
    };
  });

let items;
try {
  items = JSON.parse(localStorage.getItem(STORE_KEY)) || seedItems();
} catch {
  items = seedItems();
}
const persist = () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items.map(({ photo, ...rest }) => (photo?.startsWith('blob:') ? rest : { ...rest, photo }))));
  } catch {}
};

const pct = (now, then) => (now != null && then ? round2(((now - then) / then) * 100) : null);

function valueItem(it) {
  const k = `${it.source}:${it.ref}`;
  const known = priceHist.has(k);
  const prices = known ? pricesFor(k) : null;
  const manual = it.manualPrice != null && it.manualPrice !== '';
  const market = prices?.trend ?? null;
  const unitPrice = manual ? Number(it.manualPrice) : market;
  const qty = Number(it.quantity) || 1;
  const purchase = it.purchasePrice != null && it.purchasePrice !== '' ? Number(it.purchasePrice) : null;
  const value = unitPrice != null ? round2(unitPrice * qty) : null;
  const invested = purchase != null ? round2(purchase * qty) : null;
  return {
    ...it,
    url: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(it.name)}`,
    unitPrice: unitPrice != null ? round2(unitPrice) : null,
    priceSource: manual ? 'handmatig' : known ? 'Cardmarket (demo)' : null,
    prices,
    value,
    invested,
    profit: value != null && invested != null ? round2(value - invested) : null,
    changePurchase: pct(unitPrice, purchase),
    change24h: known ? pct(market, priceAgo(k, 1)) : null,
    change7d: known ? pct(market, priceAgo(k, 7)) : null,
    change30d: known ? pct(market, priceAgo(k, 30)) : null,
    history: known ? priceHist.get(k).slice(-90) : [],
  };
}

function totalHistory() {
  const out = [];
  for (let d = 119; d >= 0; d--) {
    const t = Date.now() - d * DAY;
    let v = 0;
    let inv = 0;
    for (const it of items) {
      if (Date.parse(it.addedAt) > t) continue;
      const k = `${it.source}:${it.ref}`;
      const qty = Number(it.quantity) || 1;
      inv += (Number(it.purchasePrice) || 0) * qty;
      if (it.manualPrice != null && it.manualPrice !== '') v += Number(it.manualPrice) * qty;
      else if (priceHist.has(k)) v += priceAgo(k, d) * qty;
    }
    if (inv || v) out.push({ t: new Date(t).toISOString(), v: round2(v), i: round2(inv) });
  }
  return out;
}

function summary() {
  const vals = items.map(valueItem);
  let totalValue = 0, totalInvested = 0, valueWithCost = 0, base7 = 0, ago7 = 0;
  const byType = {};
  for (const it of vals) {
    const v = it.value ?? 0;
    totalValue += v;
    if (it.invested != null) {
      totalInvested += it.invested;
      valueWithCost += v;
    }
    if (it.change7d != null && it.value != null) {
      base7 += it.value;
      ago7 += it.value / (1 + it.change7d / 100);
    }
    const t = (byType[it.productType] ||= { type: it.productType, count: 0, value: 0, invested: 0 });
    t.count += Number(it.quantity) || 1;
    t.value += v;
    t.invested += it.invested ?? 0;
  }
  const history = totalHistory();
  const dayAgo = history.length > 1 ? history.at(-2).v : null;
  const movers = vals
    .filter((i) => i.change7d != null)
    .sort((a, b) => b.change7d - a.change7d)
    .map(({ id, name, kind, productType, image, photo, change7d, unitPrice }) => ({ id, name, kind, productType, image, photo, change7d, unitPrice }));
  return {
    items: vals,
    summary: {
      totalValue: round2(totalValue),
      totalInvested: round2(totalInvested),
      profit: round2(valueWithCost - totalInvested),
      profitPct: pct(valueWithCost, totalInvested),
      change24h: pct(totalValue, dayAgo),
      change7d: base7 ? pct(base7, ago7) : null,
      itemCount: vals.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
      byType: Object.values(byType).map((t) => ({ ...t, value: round2(t.value), invested: round2(t.invested) })).sort((a, b) => b.value - a.value),
      topGainers: movers.slice(0, 5),
      topLosers: movers.slice(-5).reverse().filter((m) => m.change7d < 0),
      history,
      lastRefresh: new Date().toISOString(),
    },
  };
}

// ------------------------------------------------------------ zoeken & "herkenning"
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const SYN = { etb: 'elite trainer box', upc: 'ultra premium collection', bb: 'booster box', bundle: 'booster bundle' };

function candidate(p) {
  return { source: p.source, ref: p.ref, name: p.name, setName: p.setName, kind: p.kind, productType: p.productType, image: null, url: null, price: pricesFor(key(p)) };
}

function search(q, kind) {
  const tokens = norm(q).split(' ').map((t) => SYN[t] ?? t).join(' ').split(' ').filter(Boolean);
  if (!tokens.length) return [];
  return CATALOG.filter((p) => !kind || p.kind === kind)
    .map((p) => {
      const n = norm(`${p.name} ${p.setName} ${p.productType}`);
      const hits = tokens.filter((t) => n.split(' ').includes(t) || n.includes(t)).length;
      return { p, score: hits / tokens.length };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => candidate(x.p));
}

function fakeRecognize() {
  const count = rand() < 0.35 ? 2 : 1;
  const picks = [...CATALOG].sort(() => rand() - 0.5).slice(0, count);
  return picks.map((p) => ({
    detected: {
      kind: p.kind,
      product_type: p.productType,
      name: p.kind === 'single' ? p.name.replace(/ \(.*\)$/, '') : p.name,
      set_name: p.setName,
      card_number: p.kind === 'single' ? (p.name.match(/(\d+)\)$/) || [])[1] || '' : '',
      language: 'English',
      quantity: 1,
      search_query: p.name,
      confidence: round2(0.8 + rand() * 0.18),
    },
    candidates: [candidate(p), ...search(p.setName, p.kind).filter((c) => c.ref !== p.ref).slice(0, 3)],
  }));
}

// ------------------------------------------------------------ live updates
const listeners = new Set();
const broadcast = () => {
  const data = JSON.stringify(summary());
  for (const l of listeners) l({ data });
};

// Elke 4 seconden bewegen een paar prijzen een beetje: "live" koersen
setInterval(() => {
  for (const p of CATALOG) {
    if (rand() > 0.4) continue;
    const h = priceHist.get(key(p));
    const last = h.at(-1);
    last.p = round2(last.p * (1 + (rand() - 0.5) * 0.012));
    last.t = new Date().toISOString();
  }
  broadcast();
}, 4000);

class DemoEventSource {
  constructor() {
    this.handlers = {};
    setTimeout(() => this.onopen?.(), 50);
  }
  addEventListener(type, fn) {
    if (type !== 'portfolio') return;
    this.fn = fn;
    listeners.add(fn);
  }
  close() {
    listeners.delete(this.fn);
  }
}
window.EventSource = DemoEventSource;

// ------------------------------------------------------------ fetch-vervanger
const reply = (status, body) =>
  new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const realFetch = window.fetch.bind(window);
let nextId = 1;

window.fetch = async (input, opts = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.startsWith('/api/')) return realFetch(input, opts);
  const method = (opts.method || 'GET').toUpperCase();
  const path = url.pathname;
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
  await wait(120);

  if (path === '/api/auth') return reply(200, { required: false, ok: true });
  if (path === '/api/status') {
    return reply(200, { recognition: true, refreshMinutes: 0, cardmarket: { products: CATALOG.length, prices: CATALOG.length, priceGuideDate: new Date().toISOString(), lastError: null } });
  }
  if (path === '/api/portfolio') return reply(200, summary());
  if (path === '/api/refresh') return reply(200, summary());
  if (path === '/api/search') return reply(200, { results: search(url.searchParams.get('q') || '', url.searchParams.get('kind') || '') });
  if (path === '/api/recognize') {
    const file = opts.body instanceof FormData ? opts.body.get('photo') : null;
    await wait(1600);
    return reply(200, { photo: file ? URL.createObjectURL(file) : null, results: fakeRecognize() });
  }
  if (path === '/api/items' && method === 'POST') {
    const item = { id: `new-${Date.now()}-${nextId++}`, addedAt: new Date().toISOString(), variant: 'normal', quantity: 1, ...body };
    items.push(item);
    persist();
    broadcast();
    return reply(201, valueItem(item));
  }
  const m = path.match(/^\/api\/items\/(.+)$/);
  if (m) {
    const it = items.find((i) => i.id === m[1]);
    if (!it) return reply(404, { error: 'Niet gevonden' });
    if (method === 'PATCH') {
      Object.assign(it, body);
      persist();
      broadcast();
      return reply(200, valueItem(it));
    }
    if (method === 'DELETE') {
      items = items.filter((i) => i.id !== m[1]);
      persist();
      broadcast();
      return reply(204);
    }
  }
  return reply(404, { error: 'Onbekende demo-route' });
};

// Demo resetten (knop in de banner)
window.__TCG_DEMO_RESET__ = () => {
  items = seedItems();
  persist();
  broadcast();
};
