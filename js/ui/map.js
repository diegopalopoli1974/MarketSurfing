// Mapa vectorial propio (sin teselas ni servicios externos): funciona sin conexión.
import { h, s, icon } from './dom.js';
import { fmtDistance } from '../core/geo.js';

/**
 * markers: [{ id, lat, lng, fill?, label?, incomplete?, missing?, title, selected? }]
 * onSelect(id)
 */
export function svgMap({ center, radiusKm, markers, onSelect, caption }) {
  const W = 360;
  const H = 300;
  let zoom = 1;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg', role: 'img', 'aria-label': caption || 'Mapa de comercios' });
  const wrap = h('figure', { class: 'map' });

  const draw = () => {
    while (svg.firstChild) svg.firstChild.remove();
    const scale = (Math.min(W, H) / 2 / (radiusKm * 1.08)) * zoom;
    const cos = Math.cos((center.lat * Math.PI) / 180);
    const proj = (p) => ({ x: W / 2 + (p.lng - center.lng) * cos * 111.32 * scale, y: H / 2 - (p.lat - center.lat) * 110.57 * scale });
    svg.append(s('rect', { x: 0, y: 0, width: W, height: H, class: 'map-bg' }));
    // anillos de distancia
    const step = radiusKm <= 2 ? 0.5 : radiusKm <= 5 ? 1 : radiusKm <= 10 ? 2 : 5;
    for (let r = step; r <= radiusKm * 1.001; r += step) {
      const rr = r * scale;
      svg.append(s('circle', { cx: W / 2, cy: H / 2, r: rr, class: r === radiusKm ? 'map-ring map-ring-edge' : 'map-ring' }));
      if (rr < W / 2 - 10) svg.append(s('text', { x: W / 2 + 4, y: H / 2 - rr - 3, class: 'map-ring-label', text: fmtDistance(r) }));
    }
    svg.append(s('line', { x1: W / 2, y1: 0, x2: W / 2, y2: H, class: 'map-axis' }), s('line', { x1: 0, y1: H / 2, x2: W, y2: H / 2, class: 'map-axis' }));
    // usuario
    svg.append(s('circle', { cx: W / 2, cy: H / 2, r: 14, class: 'map-me-halo' }), s('circle', { cx: W / 2, cy: H / 2, r: 6, class: 'map-me' }));
    // marcadores: primero incompletos, luego por etiqueta descendente para que los mejores queden arriba
    const ordered = [...markers].sort((a, b) => (a.incomplete === b.incomplete ? (b.order ?? 0) - (a.order ?? 0) : a.incomplete ? -1 : 1));
    for (const m of ordered) {
      const p = proj(m);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const g = s('g', { class: ['map-marker', m.selected ? 'selected' : '', m.incomplete ? 'incomplete' : ''].join(' '), tabindex: 0, role: 'button', 'aria-label': m.title, onclick: () => onSelect?.(m.id), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect?.(m.id)) });
      g.append(s('title', { text: m.title }));
      g.append(s('circle', { cx: p.x, cy: p.y, r: 22, class: 'map-hit' }));
      g.append(s('circle', { cx: p.x, cy: p.y, r: m.selected ? 14 : 12, fill: m.incomplete ? 'var(--surface)' : m.fill || 'var(--accent)', class: 'map-dot' }));
      g.append(s('text', { x: p.x, y: p.y + 4, class: m.incomplete ? 'map-dot-text dark' : 'map-dot-text', text: m.incomplete ? '!'.repeat(Math.min(3, m.missing || 1)) : m.label ?? '' }));
      svg.append(g);
    }
    svg.append(s('text', { x: 8, y: H - 8, class: 'map-note', text: `Radio ${fmtDistance(radiusKm)} · centro: tu ubicación` }));
  };
  draw();
  const zoomBtns = h(
    'div',
    { class: 'map-zoom' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Acercar', onclick: () => ((zoom = Math.min(4, zoom * 1.5)), draw()) }, icon('plus', { size: 18 })),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Alejar', onclick: () => ((zoom = Math.max(0.6, zoom / 1.5)), draw()) }, '−')
  );
  wrap.append(svg, zoomBtns, caption ? h('figcaption', {}, caption) : null);
  return wrap;
}
