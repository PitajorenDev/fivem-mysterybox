import { useEffect, useState, useCallback } from 'react';

async function request(url, opts = {}) {
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  if (res.status === 401 && !url.startsWith('/api/login')) window.dispatchEvent(new Event('auth-required'));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  auth: () => request('/api/auth'),
  login: (password) => request('/api/login', json('POST', { password })),
  portfolio: () => request('/api/portfolio'),
  status: () => request('/api/status'),
  refresh: () => request('/api/refresh', { method: 'POST' }),
  search: (params) => request(`/api/search?${new URLSearchParams(params)}`),
  addItem: (item) => request('/api/items', json('POST', item)),
  updateItem: (id, patch) => request(`/api/items/${id}`, json('PATCH', patch)),
  deleteItem: (id) => request(`/api/items/${id}`, { method: 'DELETE' }),
  recognize: (blob) => {
    const fd = new FormData();
    fd.append('photo', blob, 'photo.jpg');
    return request('/api/recognize', { method: 'POST', body: fd });
  },
  uploadPhoto: (blob) => {
    const fd = new FormData();
    fd.append('photo', blob, 'photo.jpg');
    return request('/api/photo', { method: 'POST', body: fd });
  },
};

// Portfolio + live updates via Server-Sent Events
export function usePortfolio() {
  const [data, setData] = useState(null);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState(null);

  const apply = useCallback((d) => {
    setData(d);
    setUpdatedAt(new Date());
  }, []);

  const reload = useCallback(() => api.portfolio().then(apply).catch((e) => setError(e.message)), [apply]);

  useEffect(() => {
    reload();
    const es = new EventSource('/api/stream');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('portfolio', (e) => apply(JSON.parse(e.data)));
    // vangnet: ook periodiek herladen
    const t = setInterval(reload, 60_000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, [reload, apply]);

  return { data, live, updatedAt, error, reload, setData: apply };
}

// Verklein foto's in de browser (sneller uploaden, ook HEIC->JPEG via canvas)
export async function shrinkImage(file, max = 1800) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  } catch {
    return file;
  }
}

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
export const money = (v) => (v == null ? '—' : eur.format(v));
export const pctText = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('nl-NL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);
