// Eenvoudige JSON-opslag in ./data. Genoeg voor een persoonlijke portfolio,
// geen database-installatie nodig.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'portfolio.json');

const empty = () => ({
  items: [],
  // prijsgeschiedenis per prijs-sleutel ("cm:123:normal" / "ptcg:sv3-125:reverse")
  priceHistory: {},
  // dagelijkse snapshots van de totale portfolio-waarde
  totalHistory: [],
});

let db = load();

function load() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 50);
}

export const getDb = () => db;

export function listItems() {
  return db.items;
}

export function getItem(id) {
  return db.items.find((i) => i.id === id);
}

export function addItem(data) {
  const item = {
    id: crypto.randomUUID(),
    addedAt: new Date().toISOString(),
    ...data,
  };
  db.items.push(item);
  save();
  return item;
}

export function updateItem(id, patch) {
  const item = getItem(id);
  if (!item) return null;
  Object.assign(item, patch, { id });
  save();
  return item;
}

export function deleteItem(id) {
  const before = db.items.length;
  db.items = db.items.filter((i) => i.id !== id);
  save();
  return db.items.length !== before;
}

// Bewaar een prijspunt; meerdere punten op dezelfde dag worden samengevoegd
// tot het laatste punt van die dag (zodat de grafiek niet ontploft).
export function recordPrice(key, price, at = new Date()) {
  if (price == null || Number.isNaN(price)) return;
  const hist = (db.priceHistory[key] ||= []);
  const day = at.toISOString().slice(0, 10);
  const last = hist[hist.length - 1];
  if (last && last.t.slice(0, 10) === day) {
    last.t = at.toISOString();
    last.p = price;
  } else {
    hist.push({ t: at.toISOString(), p: price });
  }
  if (hist.length > 1000) hist.splice(0, hist.length - 1000);
}

export function recordTotal(value, invested, at = new Date()) {
  const hist = db.totalHistory;
  const day = at.toISOString().slice(0, 10);
  const last = hist[hist.length - 1];
  const point = { t: at.toISOString(), v: round2(value), i: round2(invested) };
  if (last && last.t.slice(0, 10) === day) hist[hist.length - 1] = point;
  else hist.push(point);
}

export const round2 = (n) => Math.round(n * 100) / 100;
