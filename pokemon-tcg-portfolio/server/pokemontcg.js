// Losse kaarten via pokemontcg.io. Deze API levert per kaart de Cardmarket-
// prijzen (trend, avg1/7/30, low, reverse holo) plus set-naam, nummer en
// afbeelding — handig om een exacte kaart (set + nummer) te herkennen.
const API = 'https://api.pokemontcg.io/v2/cards';
const SELECT = 'id,name,number,rarity,set,images,cardmarket';

const cache = new Map(); // id -> { card, at }
const TTL_MS = 30 * 60 * 1000;

async function call(params) {
  const url = `${API}?${new URLSearchParams(params)}`;
  const headers = {};
  if (process.env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = process.env.POKEMONTCG_API_KEY;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`pokemontcg.io HTTP ${res.status}`);
  const json = await res.json();
  for (const card of json.data ?? []) cache.set(card.id, { card, at: Date.now() });
  return json.data ?? [];
}

const esc = (s) => String(s).replace(/["\\]/g, '');

const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function cardPrice(card, variant = 'normal') {
  const p = card?.cardmarket?.prices;
  if (!p) return null;
  const r = variant === 'reverse';
  const prices = {
    trend: num(r ? p.reverseHoloTrend : p.trendPrice),
    avg: num(r ? p.reverseHoloSell : p.averageSellPrice),
    low: num(r ? p.reverseHoloLow : p.lowPrice),
    avg1: num(r ? p.reverseHoloAvg1 : p.avg1),
    avg7: num(r ? p.reverseHoloAvg7 : p.avg7),
    avg30: num(r ? p.reverseHoloAvg30 : p.avg30),
  };
  if (r && prices.trend == null && prices.avg == null) return cardPrice(card, 'normal');
  return { ...prices, updatedAt: card.cardmarket.updatedAt ?? null };
}

export function toCandidate(card) {
  return {
    source: 'ptcg',
    ref: card.id,
    name: `${card.name} (${card.set?.ptcgoCode ?? card.set?.id ?? ''} ${card.number})`.replace('( ', '('),
    setName: card.set?.name ?? null,
    number: card.number,
    rarity: card.rarity ?? null,
    kind: 'single',
    productType: 'Single',
    image: card.images?.small ?? null,
    imageLarge: card.images?.large ?? null,
    url: card.cardmarket?.url ?? null,
    price: cardPrice(card, 'normal'),
  };
}

// name: "Charizard ex", number: "125" of "125/165", setName: "151"
export async function searchCards({ name, number, setName, limit = 12 }) {
  if (!name) return [];
  const parts = [`name:"${esc(name)}"`];
  const nr = number ? String(number).split('/')[0].replace(/^0+(?=\d)/, '').trim() : '';
  if (nr) parts.push(`number:"${esc(nr)}"`);
  let cards = [];
  try {
    if (setName) cards = await call({ q: [...parts, `set.name:"${esc(setName)}"`].join(' '), pageSize: limit, select: SELECT });
    if (!cards.length) cards = await call({ q: parts.join(' '), pageSize: limit, select: SELECT, orderBy: '-set.releaseDate' });
    if (!cards.length && nr) cards = await call({ q: parts[0], pageSize: limit, select: SELECT, orderBy: '-set.releaseDate' });
  } catch (err) {
    console.error('[pokemontcg] zoeken mislukt:', err.message);
    return [];
  }
  return cards.map(toCandidate);
}

export async function getCards(ids, { force = false } = {}) {
  const out = new Map();
  const missing = [];
  for (const id of new Set(ids)) {
    const hit = cache.get(id);
    if (hit && !force && Date.now() - hit.at < TTL_MS) out.set(id, hit.card);
    else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += 25) {
    const chunk = missing.slice(i, i + 25);
    try {
      const cards = await call({ q: `(${chunk.map((id) => `id:"${esc(id)}"`).join(' OR ')})`, pageSize: 250, select: SELECT });
      for (const c of cards) out.set(c.id, c);
    } catch (err) {
      console.error('[pokemontcg] prijzen ophalen mislukt:', err.message);
      // val terug op verouderde cache
      for (const id of chunk) if (cache.has(id)) out.set(id, cache.get(id).card);
    }
  }
  return out;
}
