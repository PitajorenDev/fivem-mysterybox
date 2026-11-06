// Test met nep-Cardmarket-bestanden in het formaat van de publieke export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-'));
process.env.DATA_DIR = dir;
fs.mkdirSync(path.join(dir, 'cache'), { recursive: true });
const w = (n, o) => fs.writeFileSync(path.join(dir, 'cache', `${n}.json`), JSON.stringify(o));
w('singles', { version: 1, createdAt: '2026-11-06T02:00:00+0100', products: [
  { idProduct: 1, name: 'Charizard ex', categoryName: 'Pokémon Single', idCategory: 51, idExpansion: 5402 },
] });
w('nonSingles', { version: 1, createdAt: '2026-11-06T02:00:00+0100', products: [
  { idProduct: 10, name: 'Scarlet & Violet 151 Elite Trainer Box', categoryName: 'Elite Trainer Boxes', idCategory: 1, idExpansion: 5402 },
  { idProduct: 11, name: 'Scarlet & Violet 151 Ultra Premium Collection', categoryName: 'Box Sets', idCategory: 2, idExpansion: 5402 },
  { idProduct: 12, name: 'Evolving Skies Booster Box', categoryName: 'Booster Boxes', idCategory: 3, idExpansion: 3000 },
] });
w('priceGuide', { version: 1, createdAt: '2026-11-06T02:00:00+0100', priceGuides: [
  { idProduct: 1, avg: 30, low: 25, trend: 32, avg1: 31, avg7: 30, avg30: 28, 'avg-holo': null, 'low-holo': null, 'trend-holo': null },
  { idProduct: 10, avg: 90, low: 80, trend: 95, avg1: 94, avg7: 88, avg30: 85 },
  { idProduct: 11, avg: 140, low: 130, trend: 150, avg1: 149, avg7: 155, avg30: 160 },
] });

const cm = await import('./cardmarket.js');
cm.loadFromCache();
const store = await import('./store.js');
const pf = await import('./portfolio.js');

test('herkent producttypes', () => {
  assert.equal(cm.getProduct(10).productType, 'ETB');
  assert.equal(cm.getProduct(11).productType, 'UPC');
  assert.equal(cm.getProduct(12).productType, 'Booster Box');
  assert.equal(cm.getProduct(1).productType, 'Single');
});

test('zoeken met afkortingen', () => {
  assert.equal(cm.searchCardmarket('151 etb', { kind: 'sealed' })[0].ref, '10');
  assert.equal(cm.searchCardmarket('151 UPC', { kind: 'sealed' })[0].ref, '11');
  assert.equal(cm.searchCardmarket('evolving skies booster box')[0].ref, '12');
});

test('prijzen + reverse fallback', () => {
  assert.equal(cm.getCardmarketPrice(10).trend, 95);
  assert.equal(cm.getCardmarketPrice(1, 'reverse').trend, 32);
});

test('portfolio waardering', async () => {
  store.addItem({ source: 'cardmarket', ref: '10', name: 'ETB', kind: 'sealed', productType: 'ETB', quantity: 2, purchasePrice: 50, variant: 'normal' });
  store.addItem({ source: 'cardmarket', ref: '11', name: 'UPC', kind: 'sealed', productType: 'UPC', quantity: 1, purchasePrice: 120, variant: 'normal' });
  await pf.refreshItemPrices();
  const s = pf.computeSummary();
  assert.equal(s.totalValue, 95 * 2 + 150);
  assert.equal(s.totalInvested, 220);
  assert.equal(s.profit, 120);
  const etb = store.listItems().map(pf.valueItem).find((i) => i.ref === '10');
  assert.equal(etb.changePurchase, 90);
  assert.equal(etb.change7d, 7.95);
});
