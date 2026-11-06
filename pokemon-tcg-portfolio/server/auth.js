// Eenvoudige wachtwoordbeveiliging voor als de app online staat.
// Zet APP_PASSWORD in de omgeving; zonder APP_PASSWORD staat beveiliging uit (lokaal gebruik).
import crypto from 'node:crypto';

const COOKIE = 'tcg_session';
const enabled = () => Boolean(process.env.APP_PASSWORD);

const secret = () => process.env.SESSION_SECRET || crypto.createHash('sha256').update(`tcg:${process.env.APP_PASSWORD}`).digest('hex');
// Token verandert automatisch als je het wachtwoord wijzigt -> iedereen is dan uitgelogd
const expectedToken = () => crypto.createHmac('sha256', secret()).update(`session:${process.env.APP_PASSWORD}`).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export const isAuthed = (req) => !enabled() || safeEqual(readCookie(req, COOKIE) || '', expectedToken());

// max 10 pogingen per 15 minuten per IP
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { n: 0, t: now };
  if (now - a.t > 15 * 60 * 1000) {
    a.n = 0;
    a.t = now;
  }
  a.n += 1;
  attempts.set(ip, a);
  return a.n > 10;
}

export function mountAuth(app) {
  app.get('/api/auth', (req, res) => res.json({ required: enabled(), ok: isAuthed(req) }));

  app.post('/api/login', (req, res) => {
    if (!enabled()) return res.json({ ok: true });
    if (tooMany(req.ip)) return res.status(429).json({ error: 'Te veel pogingen, probeer het over 15 minuten opnieuw.' });
    if (!safeEqual(req.body?.password ?? '', process.env.APP_PASSWORD)) {
      return res.status(401).json({ error: 'Verkeerd wachtwoord' });
    }
    attempts.delete(req.ip);
    res.cookie(COOKIE, expectedToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 365 * 24 * 3600 * 1000,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // alles onder /api en /uploads afschermen
  app.use(['/api', '/uploads'], (req, res, next) => {
    if (isAuthed(req)) return next();
    res.status(401).json({ error: 'Niet ingelogd' });
  });
}
