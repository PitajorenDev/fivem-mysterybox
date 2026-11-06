import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import express from 'express';
import multer from 'multer';

import { UPLOAD_DIR, addItem, updateItem, deleteItem, getItem } from './store.js';
import { loadFromCache, refreshCardmarket, searchCardmarket, cardmarketStatus, getProduct, cardmarketUrl } from './cardmarket.js';
import { searchCards } from './pokemontcg.js';
import { recognizePhoto, recognitionEnabled } from './recognize.js';
import { refreshItemPrices, valueItem, computeSummary } from './portfolio.js';
import { listItems } from './store.js';

const PORT = Number(process.env.PORT) || 3001;
const REFRESH_MIN = Number(process.env.PRICE_REFRESH_MINUTES) || 30;

const app = express();
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

// ------------------------------------------------------------ live updates (SSE)
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

const portfolioPayload = () => ({
  items: listItems().map(valueItem),
  summary: computeSummary(),
});

async function refreshAll({ force = false } = {}) {
  await refreshCardmarket();
  await refreshItemPrices({ force });
  broadcast('portfolio', portfolioPayload());
}

// ------------------------------------------------------------ API
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Er ging iets mis' });
  });

app.get('/api/status', (_req, res) => {
  res.json({ cardmarket: cardmarketStatus(), recognition: recognitionEnabled(), refreshMinutes: REFRESH_MIN });
});

app.get('/api/portfolio', (_req, res) => res.json(portfolioPayload()));

app.post('/api/refresh', wrap(async (_req, res) => {
  await refreshAll({ force: true });
  res.json(portfolioPayload());
}));

// Zoeken: kind = single | sealed | (leeg = alles)
app.get('/api/search', wrap(async (req, res) => {
  const { q = '', kind, number, set } = req.query;
  if (!q.trim()) return res.json({ results: [] });
  const tasks = [];
  if (kind !== 'single') tasks.push(Promise.resolve(searchCardmarket(q, { kind: 'sealed', limit: 15 })));
  if (kind !== 'sealed') {
    tasks.push(searchCards({ name: q, number, setName: set }));
    tasks.push(Promise.resolve(searchCardmarket([q, set, number].filter(Boolean).join(' '), { kind: 'single', limit: 10 })));
  }
  const results = (await Promise.all(tasks)).flat();
  res.json({ results });
}));

// Foto -> herkende producten + kandidaten uit Cardmarket
app.post('/api/recognize', upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Geen (geldige) foto ontvangen' });
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[req.file.mimetype] || 'jpg';
  const photoName = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, photoName), req.file.buffer);
  const photo = `/uploads/${photoName}`;

  const detected = await recognizePhoto(req.file.buffer, req.file.mimetype);
  const results = await Promise.all(
    detected.map(async (d) => {
      let candidates = [];
      if (d.kind === 'single') {
        candidates = await searchCards({ name: d.name, number: d.card_number, setName: d.set_name });
        if (!candidates.length) candidates = searchCardmarket(`${d.name} ${d.set_name}`, { kind: 'single', limit: 8 });
      } else {
        candidates = searchCardmarket(d.search_query || `${d.set_name} ${d.name}`, { kind: 'sealed', limit: 8 });
        if (!candidates.length) candidates = searchCardmarket(d.name, { kind: 'sealed', limit: 8 });
      }
      return { detected: d, candidates };
    }),
  );
  res.json({ photo, results });
}));

// Losse foto uploaden (bij handmatig toevoegen)
app.post('/api/photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Geen (geldige) foto ontvangen' });
  const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.file.buffer);
  res.json({ photo: `/uploads/${name}` });
});

const EDITABLE = ['name', 'setName', 'quantity', 'purchasePrice', 'purchaseDate', 'condition', 'language', 'variant', 'notes', 'manualPrice', 'photo', 'productType'];
const pickEditable = (body) => Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]]));

app.post('/api/items', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Naam is verplicht' });
  if (!['cardmarket', 'ptcg', 'manual'].includes(b.source)) return res.status(400).json({ error: 'Onbekende bron' });
  const product = b.source === 'cardmarket' ? getProduct(b.ref) : null;
  const item = addItem({
    source: b.source,
    ref: b.ref != null ? String(b.ref) : null,
    kind: b.kind === 'single' ? 'single' : 'sealed',
    productType: b.productType || product?.productType || (b.kind === 'single' ? 'Single' : 'Sealed'),
    image: b.image ?? null,
    url: b.url ?? (product ? cardmarketUrl(product) : null),
    variant: 'normal',
    quantity: 1,
    condition: b.kind === 'single' ? 'NM' : 'Sealed',
    language: 'English',
    ...pickEditable(b),
  });
  await refreshItemPrices();
  broadcast('portfolio', portfolioPayload());
  res.status(201).json(valueItem(item));
}));

app.patch('/api/items/:id', wrap(async (req, res) => {
  const item = updateItem(req.params.id, pickEditable(req.body || {}));
  if (!item) return res.status(404).json({ error: 'Niet gevonden' });
  await refreshItemPrices();
  broadcast('portfolio', portfolioPayload());
  res.json(valueItem(item));
}));

app.delete('/api/items/:id', wrap(async (req, res) => {
  const item = getItem(req.params.id);
  if (!deleteItem(req.params.id)) return res.status(404).json({ error: 'Niet gevonden' });
  if (item?.photo?.startsWith('/uploads/')) {
    fs.rm(path.join(UPLOAD_DIR, path.basename(item.photo)), { force: true }, () => {});
  }
  await refreshItemPrices();
  broadcast('portfolio', portfolioPayload());
  res.status(204).end();
}));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

// Productie: serveer de gebouwde frontend
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ------------------------------------------------------------ start
loadFromCache();
app.listen(PORT, () => {
  console.log(`Pokémon TCG Portfolio draait op http://localhost:${PORT}`);
  const lan = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  for (const n of lan) console.log(`  Op je gsm (zelfde wifi): http://${n.address}:${PORT}`);
  if (!recognitionEnabled()) console.log('  ! Geen ANTHROPIC_API_KEY: foto-herkenning staat uit (handmatig zoeken werkt wel).');
});

refreshAll().catch((e) => console.error(e));
setInterval(() => refreshAll().catch((e) => console.error(e)), REFRESH_MIN * 60 * 1000);
