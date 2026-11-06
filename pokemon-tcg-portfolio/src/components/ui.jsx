import { useMemo, useRef, useState } from 'react';
import { money, pctText } from '../api.js';

// Stijging/daling met pijl + teken, dus nooit alleen kleur
export function Change({ value, label }) {
  const cls = value == null ? 'flat' : value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const arrow = value == null ? '' : value > 0 ? '▲' : value < 0 ? '▼' : '■';
  return (
    <span className={`change ${cls}`} title={label}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {pctText(value)}
      {label && <span className="change-label"> {label}</span>}
    </span>
  );
}

export function Thumb({ item, size = 56 }) {
  const src = item.photo || item.image;
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{item.kind === 'single' ? '🃏' : '📦'}</span>}
    </div>
  );
}

export function Sparkline({ points, width = 90, height = 28 }) {
  if (!points || points.length < 2) return <svg width={width} height={height} className="spark" aria-hidden="true" />;
  const ys = points.map((p) => p.p ?? p.v);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const d = ys
    .map((y, i) => `${i ? 'L' : 'M'}${((i / (ys.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((y - min) / span) * (height - 6)).toFixed(1)}`)
    .join(' ');
  const up = ys[ys.length - 1] >= ys[0];
  return (
    <svg width={width} height={height} className={`spark ${up ? 'up' : 'down'}`} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Lijngrafiek met crosshair + tooltip. series: [{ t, v }]
export function LineChart({ series, secondary, height = 220, valueLabel = 'Waarde', secondaryLabel = 'Geïnvesteerd' }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const width = 640;
  const pad = { l: 8, r: 8, t: 22, b: 24 };

  const geo = useMemo(() => {
    if (!series?.length) return null;
    const all = [...series.map((s) => s.v), ...(secondary ? secondary.map((s) => s.v) : [])].filter((v) => v != null);
    let min = Math.min(...all);
    let max = Math.max(...all);
    if (min === max) {
      min = min * 0.9;
      max = max * 1.1 || 1;
    }
    const n = series.length;
    const x = (i) => pad.l + (n === 1 ? (width - pad.l - pad.r) / 2 : (i / (n - 1)) * (width - pad.l - pad.r));
    const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
    const path = (arr) => arr.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ');
    return { x, y, min, max, line: path(series), line2: secondary ? path(secondary) : null, area: `${path(series)} L${x(n - 1)},${height - pad.b} L${x(0)},${height - pad.b} Z` };
  }, [series, secondary, height]);

  if (!geo) return <div className="empty-chart">Nog geen geschiedenis — die bouwt zich vanzelf op bij elke prijsupdate.</div>;

  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const n = series.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (n - 1))));
    setHover(i);
  };

  const h = hover != null ? series[hover] : null;
  const fmtDate = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <div className="chart-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        className="chart"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${valueLabel} over tijd`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={width - pad.r} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} className="grid" />
        ))}
        <path d={geo.area} className="area" />
        {geo.line2 && <path d={geo.line2} className="line2" fill="none" />}
        <path d={geo.line} className="line" fill="none" />
        {series.length === 1 && <circle cx={geo.x(0)} cy={geo.y(series[0].v)} r="5" className="dot" />}
        <text x={pad.l + 2} y={pad.t - 4} className="axis-y">{money(geo.max)}</text>
        <text x={pad.l + 2} y={height - pad.b - 4} className="axis-y">{money(geo.min)}</text>
        <text x={pad.l} y={height - 6} className="axis">{fmtDate(series[0].t)}</text>
        <text x={width - pad.r} y={height - 6} className="axis" textAnchor="end">{fmtDate(series[series.length - 1].t)}</text>
        {h && (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={pad.t} y2={height - pad.b} className="crosshair" />
            <circle cx={geo.x(hover)} cy={geo.y(h.v)} r="5" className="dot" />
          </g>
        )}
      </svg>
      {h && (
        <div className="tooltip" style={{ left: `${(geo.x(hover) / width) * 100}%` }}>
          <div className="tt-date">{fmtDate(h.t)}</div>
          <div><strong>{money(h.v)}</strong> <span className="muted">{valueLabel}</span></div>
          {secondary?.[hover]?.v != null && <div className="muted">{money(secondary[hover].v)} {secondaryLabel}</div>}
        </div>
      )}
      {secondary && (
        <div className="legend">
          <span><i className="sw sw-main" /> {valueLabel}</span>
          <span><i className="sw sw-second" /> {secondaryLabel}</span>
        </div>
      )}
    </div>
  );
}
