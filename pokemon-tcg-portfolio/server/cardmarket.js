// Koppeling met Cardmarket.
//
// Cardmarket publiceert dagelijks een publieke productcatalogus en price guide
// (dezelfde prijzen als "Trend", "30-days average" enz. op de productpagina).
// Pokémon = game id 6. Hiervoor is geen account of API-sleutel nodig.
//
// We houden de bestanden in ./data/cache en checken periodiek of er een nieuwe
// versie is (via ETag), zodat waardes automatisch meebewegen.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './store.js';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const FILES = {
  priceGuide: `${BASE}/priceGuide/price_guide_6.json`,
  singles: `${BASE}/productList/products_singles_6.json`,
  nonSingles: `${BASE}/productList/products_nonsingles_6.json`,
};

const state = {
  products: new Map(), // idProduct -> product
  prices: new Map(), // idProduct -> price guide row
  searchIndex: [], // [{ norm, product }]
  priceGuideDate: null,
  lastCheck: null,
  lastError: null,
};

export const cardmarketStatus = () => ({
  products: state.products.size,
  prices: state.prices.size,
  priceGuideDate: state.priceGuideDate,
  lastCheck: state.lastCheck,
  lastError: state.lastError,
});

// ---------------------------------------------------------------- download

async function fetchCached(name, url) {
  const file = path.join(CACHE_DIR, `${name}.json`);
  const metaFile = file + '.meta';
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  } catch {}
  const haveFile = fs.existsSync(file);
  const headers = {};
  if (haveFile && meta.etag) headers['If-None-Match'] = meta.etag;

  const res = await fetch(url, { headers });
  if (res.status === 304 && haveFile) return { changed: false, json: null, file };
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text);
  fs.writeFileSync(file, text);
  fs.writeFileSync(metaFile, JSON.stringify({ etag: res.headers.get('etag'), at: new Date().toISOString() }));
  return { changed: true, json, file };
}

function readCache(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${name}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- parsing

export const normalize = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Leidt het soort sealed product af uit de naam/categorie.
export function detectProductType(name = '', categoryName = '', isSingle = false) {
  if (isSingle) return 'Single';
  const n = `${name} ${categoryName}`.toLowerCase();
  if (n.includes('elite trainer box')) return 'ETB';
  if (n.includes('ultra premium collection') || n.includes('ultra-premium')) return 'UPC';
  if (n.includes('booster bundle')) return 'Booster Bundle';
  if (n.includes('booster box') || n.includes('display')) return 'Booster Box';
  if (n.includes('blister')) return 'Blister';
  if (n.includes('tin')) return 'Tin';
  if (n.includes('collection') || n.includes('box')) return 'Collection Box';
  if (n.includes('booster')) return 'Booster Pack';
  return 'Sealed';
}

function ingestProducts(json, isSingle) {
  const list = json?.products ?? (Array.isArray(json) ? json : []);
  for (const p of list) {
    if (!p?.idProduct) continue;
    const product = {
      idProduct: p.idProduct,
      name: p.name,
      categoryName: p.categoryName ?? '',
      idCategory: p.idCategory,
      idExpansion: p.idExpansion,
      expansionName: p.expansionName ?? p.expansion ?? null,
      isSingle,
      productType: detectProductType(p.name, p.categoryName, isSingle),
    };
    state.products.set(p.idProduct, product);
  }
}

function ingestPrices(json) {
  const list = json?.priceGuides ?? (Array.isArray(json) ? json : []);
  state.prices.clear();
  for (const row of list) if (row?.idProduct) state.prices.set(row.idProduct, row);
  state.priceGuideDate = json?.createdAt ?? new Date().toISOString();
}

function rebuildIndex() {
  state.searchIndex = [];
  for (const product of state.products.values()) {
    state.searchIndex.push({
      norm: normalize(`${product.name} ${product.expansionName ?? ''} ${product.categoryName}`),
      product,
    });
  }
}

export function loadFromCache() {
  const singles = readCache('singles');
  const nonSingles = readCache('nonSingles');
  const priceGuide = readCache('priceGuide');
  if (singles) ingestProducts(singles, true);
  if (nonSingles) ingestProducts(nonSingles, false);
  if (priceGuide) ingestPrices(priceGuide);
  rebuildIndex();
}

// Haalt (indien gewijzigd) nieuwe catalogus + prijzen op.
// Retourneert true als er nieuwe prijzen zijn.
export async function refreshCardmarket() {
  state.lastCheck = new Date().toISOString();
  try {
    // na elkaar i.p.v. tegelijk: houdt het geheugengebruik laag op kleine servers
    const singles = await fetchCached('singles', FILES.singles);
    const nonSingles = await fetchCached('nonSingles', FILES.nonSingles);
    const priceGuide = await fetchCached('priceGuide', FILES.priceGuide);
    if (singles.changed || nonSingles.changed) {
      state.products.clear();
      ingestProducts(singles.json ?? readCache('singles'), true);
      ingestProducts(nonSingles.json ?? readCache('nonSingles'), false);
      rebuildIndex();
    }
    if (priceGuide.changed) ingestPrices(priceGuide.json);
    state.lastError = null;
    return priceGuide.changed;
  } catch (err) {
    state.lastError = err.message;
    console.error('[cardmarket] refresh mislukt:', err.message);
    return false;
  }
}

// ---------------------------------------------------------------- prijzen

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// variant: 'normal' | 'reverse' (reverse holo / foil-prijzen in de price guide)
export function getCardmarketPrice(idProduct, variant = 'normal') {
  const row = state.prices.get(Number(idProduct));
  if (!row) return null;
  const suf = variant === 'reverse' ? '-holo' : '';
  const pick = (k) => num(row[`${k}${suf}`]);
  const prices = {
    trend: pick('trend'),
    avg: pick('avg'),
    low: pick('low'),
    avg1: pick('avg1'),
    avg7: pick('avg7'),
    avg30: pick('avg30'),
  };
  // geen reverse-prijs bekend? val terug op normaal
  if (variant === 'reverse' && prices.trend == null && prices.avg == null) {
    return getCardmarketPrice(idProduct, 'normal');
  }
  return { ...prices, updatedAt: state.priceGuideDate };
}

export const getProduct = (idProduct) => state.products.get(Number(idProduct)) ?? null;

export function cardmarketUrl(product) {
  const q = encodeURIComponent(product?.name ?? '');
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${q}`;
}

// ---------------------------------------------------------------- zoeken

const SYNONYMS = {
  etb: 'elite trainer box',
  upc: 'ultra premium collection',
  bb: 'booster box',
  display: 'booster box',
  bundle: 'booster bundle',
  '151': '151',
};

function expandQuery(q) {
  return normalize(q)
    .split(' ')
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t)
    .join(' ')
    .split(' ')
    .filter((t) => t.length > 1 || /\d/.test(t));
}

// kind: 'single' | 'sealed' | undefined
export function searchCardmarket(query, { kind, limit = 20 } = {}) {
  const tokens = [...new Set(expandQuery(query))];
  if (!tokens.length) return [];
  const results = [];
  for (const { norm, product } of state.searchIndex) {
    if (kind === 'single' && !product.isSingle) continue;
    if (kind === 'sealed' && product.isSingle) continue;
    const words = norm.split(' ');
    let hits = 0;
    for (const t of tokens) {
      if (words.includes(t)) hits += 1;
      else if (norm.includes(t)) hits += 0.6;
    }
    const score = hits / tokens.length;
    if (score < 0.6) continue;
    // kortere namen met dezelfde hits zijn waarschijnlijk exacter
    results.push({ product, score: score - words.length * 0.004 });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(({ product, score }) => ({
    source: 'cardmarket',
    ref: String(product.idProduct),
    name: product.name,
    setName: product.expansionName,
    kind: product.isSingle ? 'single' : 'sealed',
    productType: product.productType,
    category: product.categoryName,
    image: null,
    url: cardmarketUrl(product),
    price: getCardmarketPrice(product.idProduct, 'normal'),
    score: Math.round(score * 100) / 100,
  }));
}
