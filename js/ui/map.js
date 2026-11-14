// Mapa con calles y barrios de fondo (teselas de OpenStreetMap, proyección Web Mercator).
// Sin conexión se dibuja igual: anillos de distancia, comercios y zonas sobre un fondo liso.
import { h, s, icon } from './dom.js';
import { fmtDistance } from '../core/geo.js';

const TILE = 256;
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

const worldPx = (lat, lng, z) => {
  const n = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
};
const fromWorld = (x, y, z) => {
  const n = TILE * 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
};
const metersPerPx = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/**
 * center: { lat, lng } (punto del usuario o de la zona)
 * radiusKm: radio a encuadrar (y anillo de borde si showRadius)
 * markers: [{ id, lat, lng, fill?, label?, name?, incomplete?, missing?, title, selected?, order? }]
 * zones: [{ lat, lng, radiusKm, label }] — círculos de zonas
 * labels: 'all' | 'top' | 'none' — nombres de comercio junto a los marcadores
 * onSelect(id) · onPick({ lat, lng }) (tocar el mapa para marcar un punto)
 */
export function svgMap({ center, radiusKm = 3, markers = [], zones = [], onSelect, onPick, caption, labels = 'top', showCenter = true, showRadius = true, centerLabel = 'Tu ubicación' }) {
  const narrow = window.innerWidth < 600;
  const W = narrow ? 380 : 640;
  const H = narrow ? 340 : 420;
  const fitZoom = () => {
    for (let z = 18; z >= 3; z--) if ((radiusKm * 1000) / metersPerPx(center.lat, z) <= (Math.min(W, H) / 2) * 0.92) return z;
    return 3;
  };
  let z = fitZoom();
  let c = worldPx(center.lat, center.lng, z);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: ['map-svg', onPick ? 'pickable' : ''].join(' '), role: 'img', 'aria-label': caption || 'Mapa' });
  const wrap = h('figure', { class: 'map' });
  const status = h('span', { class: 'map-attrib' }, '© ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap'));
  let tilesFailed = 0;

  const proj = (p) => {
    const w = worldPx(p.lat, p.lng, z);
    return { x: w.x - c.x + W / 2, y: w.y - c.y + H / 2 };
  };

  const draw = () => {
    while (svg.firstChild) svg.firstChild.remove();
    svg.append(s('rect', { x: 0, y: 0, width: W, height: H, class: 'map-bg' }));
    // teselas
    const tl = { x: c.x - W / 2, y: c.y - H / 2 };
    const n = 2 ** z;
    const tiles = s('g', { class: 'map-tiles' });
    for (let tx = Math.floor(tl.x / TILE); tx <= Math.floor((tl.x + W) / TILE); tx++)
      for (let ty = Math.floor(tl.y / TILE); ty <= Math.floor((tl.y + H) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const img = s('image', { href: TILE_URL(z, ((tx % n) + n) % n, ty), x: tx * TILE - tl.x, y: ty * TILE - tl.y, width: TILE + 0.5, height: TILE + 0.5, preserveAspectRatio: 'none' });
        img.addEventListener('error', () => {
          img.remove();
          if (++tilesFailed === 1) wrap.classList.add('offline');
        });
        tiles.append(img);
      }
    svg.append(tiles);
    // anillos de distancia alrededor del centro
    const mpp = metersPerPx(center.lat, z);
    const cp = proj(center);
    if (showRadius) {
      const step = radiusKm <= 2 ? 0.5 : radiusKm <= 5 ? 1 : radiusKm <= 10 ? 2 : 5;
      for (let r = step; r <= radiusKm * 1.001; r += step) {
        const rr = (r * 1000) / mpp;
        svg.append(s('circle', { cx: cp.x, cy: cp.y, r: rr, class: Math.abs(r - radiusKm) < 1e-6 ? 'map-ring map-ring-edge' : 'map-ring' }));
        svg.append(s('text', { x: cp.x + 4, y: cp.y - rr - 3, class: 'map-ring-label', text: fmtDistance(r) }));
      }
    }
    // zonas
    for (const zn of zones) {
      const p = proj(zn);
      svg.append(s('circle', { cx: p.x, cy: p.y, r: (zn.radiusKm * 1000) / mpp, class: 'map-zone' }), s('circle', { cx: p.x, cy: p.y, r: 4, class: 'map-zone-center' }));
      if (zn.label) svg.append(s('text', { x: p.x + 7, y: p.y - 6, class: 'map-label', text: zn.label }));
    }
    if (showCenter) svg.append(s('circle', { cx: cp.x, cy: cp.y, r: 14, class: 'map-me-halo' }), s('circle', { cx: cp.x, cy: cp.y, r: 6, class: 'map-me' }, s('title', { text: centerLabel })));
    // marcadores: incompletos debajo; los mejores arriba
    const ordered = [...markers].sort((a, b) => (a.incomplete === b.incomplete ? (a.order ?? 0) - (b.order ?? 0) : a.incomplete ? -1 : 1));
    const labelSet = new Set(labels === 'all' ? markers.map((m) => m.id) : labels === 'top' ? [...markers].filter((m) => !m.incomplete && (m.selected || m.label !== '' && m.label != null)).sort((a, b) => (b.order ?? 0) - (a.order ?? 0)).slice(0, narrow ? 5 : 8).map((m) => m.id) : []);
    const labelLayer = s('g', { class: 'map-labels' });
    for (const m of ordered) {
      const p = proj(m);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const g = s('g', { class: ['map-marker', m.selected ? 'selected' : '', m.incomplete ? 'incomplete' : ''].join(' '), tabindex: 0, role: 'button', 'aria-label': m.title, onclick: (e) => (e.stopPropagation(), onSelect?.(m.id)), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect?.(m.id)) });
      g.append(s('title', { text: m.title }));
      g.append(s('circle', { cx: p.x, cy: p.y, r: 20, class: 'map-hit' }));
      g.append(s('circle', { cx: p.x, cy: p.y, r: m.selected ? 14 : 12, fill: m.incomplete ? 'var(--surface)' : m.fill || 'var(--accent)', class: 'map-dot' }));
      g.append(s('text', { x: p.x, y: p.y + 4, class: m.incomplete ? 'map-dot-text dark' : 'map-dot-text', text: m.incomplete ? '!'.repeat(Math.min(3, m.missing || 1)) : m.label ?? '' }));
      svg.append(g);
      if (labelSet.has(m.id) && m.name) labelLayer.append(s('text', { x: p.x + 16, y: p.y + 4, class: 'map-label', text: m.name }));
    }
    svg.append(labelLayer);
    svg.append(s('text', { x: 8, y: H - 8, class: 'map-note', text: showRadius ? `Radio ${fmtDistance(radiusKm)}` : '' }));
  };

  // arrastrar para mover; tocar sin arrastrar para marcar un punto (onPick)
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false, k: W / svg.getBoundingClientRect().width };
    svg.setPointerCapture?.(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) * drag.k;
    const dy = (e.clientY - drag.y) * drag.k;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    c = { x: drag.cx - dx, y: drag.cy - dy };
    draw();
  });
  svg.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d || d.moved || !onPick || e.target.closest?.('.map-marker')) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    onPick(fromWorld(c.x - W / 2 + px, c.y - H / 2 + py, z));
  });
  svg.addEventListener('pointercancel', () => (drag = null));

  const setZoom = (nz) => {
    nz = Math.max(3, Math.min(18, nz));
    if (nz === z) return;
    const ll = fromWorld(c.x, c.y, z);
    z = nz;
    c = worldPx(ll.lat, ll.lng, z);
    draw();
  };
  draw();
  const zoomBtns = h(
    'div',
    { class: 'map-zoom' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Acercar', 'data-tip': 'Acercar', onclick: () => setZoom(z + 1) }, icon('plus', { size: 18 })),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Alejar', 'data-tip': 'Alejar', onclick: () => setZoom(z - 1) }, '−'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Volver a centrar', 'data-tip': 'Volver a centrar', onclick: () => ((z = fitZoom()), (c = worldPx(center.lat, center.lng, z)), draw()) }, icon('gps', { size: 18 }))
  );
  wrap.append(svg, zoomBtns, status, caption ? h('figcaption', {}, caption) : null);
  return wrap;
}
