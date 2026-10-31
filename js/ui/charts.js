// Gráficos SVG propios (sin librerías). Paleta categórica en orden fijo, línea 2px, una sola escala.
import { h, s } from './dom.js';

export const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

/**
 * series: [{ name, values: number|null[] }], labels: string[] (eje x)
 * Muestra crosshair + tooltip al pasar el dedo o el mouse.
 */
export function lineChart({ series, labels, yFormat = (v) => v.toFixed(0), baseline = null, ariaLabel }) {
  const W = 360;
  const H = 230;
  const M = { l: 40, r: 74, t: 12, b: 28 };
  const all = series.flatMap((x) => x.values).filter((v) => v != null);
  if (baseline != null) all.push(baseline);
  let min = Math.min(...all);
  let max = Math.max(...all);
  const pad = (max - min) * 0.08 || 5;
  min -= pad;
  max += pad;
  const X = (i) => M.l + (i * (W - M.l - M.r)) / Math.max(1, labels.length - 1);
  const Y = (v) => M.t + ((max - v) * (H - M.t - M.b)) / (max - min);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': ariaLabel || 'Gráfico de líneas' });
  // grilla y eje y
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: 'grid' }), s('text', { x: M.l - 6, y: Y(v) + 4, class: 'tick', 'text-anchor': 'end', text: yFormat(v) }));
  }
  if (baseline != null) svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(baseline), y2: Y(baseline), class: 'baseline' }));
  // eje x (cada tanto)
  const every = Math.ceil(labels.length / 6);
  labels.forEach((lb, i) => {
    if (i % every === 0 || i === labels.length - 1) svg.append(s('text', { x: X(i), y: H - 8, class: 'tick', 'text-anchor': 'middle', text: lb }));
  });
  // líneas
  const ends = [];
  series.forEach((ser, si) => {
    const color = `var(${SERIES_VARS[si % 8]})`;
    let d = '';
    ser.values.forEach((v, i) => {
      if (v == null) return;
      d += `${d && ser.values[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    });
    svg.append(s('path', { d, class: 'line', stroke: color }));
    const lastIdx = ser.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
    if (lastIdx != null) {
      svg.append(s('circle', { cx: X(lastIdx), cy: Y(ser.values[lastIdx]), r: 4, fill: color, class: 'end-dot' }));
      ends.push({ y: Y(ser.values[lastIdx]), name: ser.name, v: ser.values[lastIdx], color });
    }
  });
  // etiquetas directas (evita superposición)
  if (series.length <= 4) {
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    for (const e of ends) svg.append(s('text', { x: W - M.r + 8, y: e.y + 4, class: 'direct-label', text: `${e.name.slice(0, 11)} ${yFormat(e.v)}` }));
  }
  // capa interactiva
  const cross = s('line', { y1: M.t, y2: H - M.b, class: 'crosshair', visibility: 'hidden' });
  svg.append(cross);
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const overlay = s('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: 'overlay' });
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((px - M.l) / (W - M.l - M.r)) * (labels.length - 1))));
    cross.setAttribute('x1', X(i));
    cross.setAttribute('x2', X(i));
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(h('strong', {}, labels[i]), ...series.map((ser, si) => h('div', { class: 'tip-row' }, h('span', { class: 'sw', style: { background: `var(${SERIES_VARS[si % 8]})` } }), h('span', {}, ser.name), h('b', {}, ser.values[i] != null ? yFormat(ser.values[i]) : '—'))));
    const left = (X(i) / W) * r.width;
    tip.style.left = `${Math.min(r.width - 170, Math.max(0, left + 10))}px`;
  };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerdown', move);
  overlay.addEventListener('pointerleave', () => ((tip.hidden = true), cross.setAttribute('visibility', 'hidden')));
  svg.append(overlay);
  const legend = series.length > 1 ? h('ul', { class: 'chart-legend' }, series.map((ser, si) => h('li', {}, h('span', { class: 'sw', style: { background: `var(${SERIES_VARS[si % 8]})` } }), ser.name))) : null;
  return h('div', { class: 'chart-wrap' }, legend, h('div', { class: 'chart-box' }, svg, tip));
}

/** Barras horizontales con etiqueta de valor visible (una sola serie, un solo tono). */
export function barChart({ rows, format = (v) => v.toFixed(1), ariaLabel }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  return h(
    'ul',
    { class: 'hbars', role: 'img', 'aria-label': ariaLabel || 'Gráfico de barras' },
    rows.map((r) => h('li', { title: `${r.label}: ${format(r.value)}` }, h('span', { class: 'hb-label' }, r.label), h('span', { class: 'hb-track' }, h('span', { class: 'hb-bar', style: { width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` } })), h('span', { class: 'hb-value' }, format(r.value), r.note ? h('small', {}, ` ${r.note}`) : null)))
  );
}
