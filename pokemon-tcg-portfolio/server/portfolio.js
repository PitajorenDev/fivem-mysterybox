// Berekent de actuele waarde van elk item en van de hele portfolio.
import { listItems, getDb, recordPrice, recordTotal, round2, save } from './store.js';
import { getCardmarketPrice, getProduct, cardmarketUrl } from './cardmarket.js';
import { getCards, cardPrice } from './pokemontcg.js';

const PRICE_FIELD = () => process.env.PRICE_FIELD || 'trend';

export const priceKey = (item) => `${item.source}:${item.ref}:${item.variant || 'normal'}`;

// Laatst opgehaalde marktprijzen per priceKey
const live = new Map();
let lastRefresh = null;

function pickUnit(prices) {
  if (!prices) return null;
  const order = [PRICE_FIELD(), 'trend', 'avg', 'avg30', 'avg7', 'low'];
  for (const k of order) if (prices[k] != null && prices[k] > 0) return prices[k];
  return null;
}

const pct = (now, then) => (now != null && then ? round2(((now - then) / then) * 100) : null);

// Haalt voor alle items de nieuwste prijs op en legt ze vast in de geschiedenis.
export async function refreshItemPrices({ force = false } = {}) {
  const items = listItems();
  const ptcgIds = items.filter((i) => i.source === 'ptcg').map((i) => i.ref);
  const cards = ptcgIds.length ? await getCards(ptcgIds, { force }) : new Map();
  const now = new Date();
  let changed = false;

  for (const item of items) {
    const key = priceKey(item);
    let prices = null;
    if (item.source === 'cardmarket') prices = getCardmarketPrice(item.ref, item.variant);
    else if (item.source === 'ptcg' && cards.has(item.ref)) {
      const card = cards.get(item.ref);
      prices = cardPrice(card, item.variant);
      if (!item.image && card.images?.small) {
        item.image = card.images.small;
        changed = true;
      }
    }
    if (!prices) continue;
    const prev = live.get(key);
    const unit = pickUnit(prices);
    if (!prev || pickUnit(prev) !== unit) changed = true;
    live.set(key, prices);
    recordPrice(key, unit, now);
  }

  const summary = computeSummary();
  recordTotal(summary.totalValue, summary.totalInvested, now);
  lastRefresh = now.toISOString();
  save();
  return changed;
}

function historyFor(key) {
  return getDb().priceHistory[key] ?? [];
}

// Prijs ongeveer `hours` geleden uit onze eigen geschiedenis
function priceAgo(hist, hours) {
  const cutoff = Date.now() - hours * 3600 * 1000;
  for (let i = hist.length - 1; i >= 0; i--) if (Date.parse(hist[i].t) <= cutoff) return hist[i].p;
  return null;
}

export function valueItem(item) {
  const key = priceKey(item);
  const prices = live.get(key) ?? null;
  const hist = historyFor(key);
  const market = pickUnit(prices) ?? (hist.length ? hist[hist.length - 1].p : null);
  const unitPrice = item.manualPrice != null && item.manualPrice !== '' ? Number(item.manualPrice) : market;
  const qty = Number(item.quantity) || 1;
  const purchase = item.purchasePrice != null && item.purchasePrice !== '' ? Number(item.purchasePrice) : null;
  const value = unitPrice != null ? round2(unitPrice * qty) : null;
  const invested = purchase != null ? round2(purchase * qty) : null;

  const product = item.source === 'cardmarket' ? getProduct(item.ref) : null;

  return {
    ...item,
    url: item.url ?? (product ? cardmarketUrl(product) : null),
    unitPrice: unitPrice != null ? round2(unitPrice) : null,
    priceSource: item.manualPrice != null && item.manualPrice !== '' ? 'handmatig' : prices ? 'Cardmarket' : hist.length ? 'Cardmarket (laatst bekend)' : null,
    prices,
    value,
    invested,
    profit: value != null && invested != null ? round2(value - invested) : null,
    changePurchase: pct(unitPrice, purchase),
    change24h: pct(market, priceAgo(hist, 20)),
    change7d: pct(market, prices?.avg7 ?? priceAgo(hist, 24 * 7)),
    change30d: pct(market, prices?.avg30 ?? priceAgo(hist, 24 * 30)),
    history: hist.slice(-90),
  };
}

export function computeSummary() {
  const items = listItems().map(valueItem);
  let totalValue = 0;
  let totalInvested = 0;
  let valueWithCost = 0;
  let value7dAgo = 0;
  let value7dBase = 0;
  const byType = {};

  for (const it of items) {
    const v = it.value ?? 0;
    totalValue += v;
    if (it.invested != null) {
      totalInvested += it.invested;
      valueWithCost += v;
    }
    if (it.change7d != null && it.value != null) {
      value7dBase += it.value;
      value7dAgo += it.value / (1 + it.change7d / 100);
    }
    const t = (byType[it.productType || 'Overig'] ||= { type: it.productType || 'Overig', count: 0, value: 0, invested: 0 });
    t.count += Number(it.quantity) || 1;
    t.value += v;
    t.invested += it.invested ?? 0;
  }

  const history = getDb().totalHistory;
  const dayAgo = (() => {
    const cutoff = Date.now() - 20 * 3600 * 1000;
    for (let i = history.length - 1; i >= 0; i--) if (Date.parse(history[i].t) <= cutoff) return history[i].v;
    return null;
  })();

  const movers = items
    .filter((i) => i.change7d != null)
    .sort((a, b) => b.change7d - a.change7d)
    .map(({ id, name, kind, productType, image, photo, change7d, unitPrice }) => ({ id, name, kind, productType, image, photo, change7d, unitPrice }));

  return {
    totalValue: round2(totalValue),
    totalInvested: round2(totalInvested),
    profit: round2(valueWithCost - totalInvested),
    profitPct: pct(valueWithCost, totalInvested),
    change24h: pct(totalValue, dayAgo),
    change7d: value7dBase ? pct(value7dBase, value7dAgo) : null,
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    byType: Object.values(byType)
      .map((t) => ({ ...t, value: round2(t.value), invested: round2(t.invested) }))
      .sort((a, b) => b.value - a.value),
    topGainers: movers.slice(0, 5),
    topLosers: movers.slice(-5).reverse().filter((m) => m.change7d < 0),
    history: history.slice(-365),
    lastRefresh,
  };
}
