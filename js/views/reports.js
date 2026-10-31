// CU-11 Consultar Reportes de Mercado (RF-16 índice por marca, RF-21 analítica agregada y anonimizada).
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, segmented, field, spinner, steps } from '../ui/components.js';
import { locationControl } from '../ui/location.js';
import { lineChart, barChart } from '../ui/charts.js';
import { svgMap } from '../ui/map.js';
import * as Cat from '../data/catalog.js';
import * as L from '../app/listsvc.js';
import { distanceKm } from '../core/geo.js';
import { pctFmt, money } from '../core/engine.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;

function monthKeys(n) {
  const d = new Date();
  const out = [];
  for (let i = n; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Serie mensual promedio por producto dentro de la zona (agregada, sin datos personales). */
async function monthlySeries(productId, zoneIds, months) {
  const recs = (await Cat.historyForProduct(productId)).filter((r) => zoneIds.has(r.storeId));
  const by = new Map(months.map((m) => [m, []]));
  for (const r of recs) by.get(r.date.slice(0, 7))?.push(r.price);
  return { values: months.map((m) => (by.get(m).length ? by.get(m).reduce((a, b) => a + b, 0) / by.get(m).length : null)), n: recs.filter((r) => by.has(r.date.slice(0, 7))).length };
}

export async function render() {
  const st = { type: 'marca', months: 12, radiusKm: 5 };
  const inLists = L.activeLists().flatMap((l) => L.currentItems(l).map((i) => i.generic));
  const gens = Cat.generics().filter((g) => g.count > 1).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  st.generic = gens.find((g) => inLists.includes(g.key))?.key || gens[0]?.key;

  const out = h('div', { 'aria-live': 'polite' });
  const loc = locationControl({ name: 'loc-rep', label: 'Zona del reporte' });
  const genSel = h('select', { class: 'input', onchange: (e) => (st.generic = e.target.value) }, gens.map((g) => h('option', { value: g.key, selected: g.key === st.generic }, `${g.name} ${g.presentation}`)));
  const genField = field('Producto', genSel);
  const period = h('select', { class: 'input', onchange: (e) => (st.months = Number(e.target.value)) }, [3, 6, 12].map((m) => h('option', { value: m, selected: m === st.months }, `${m} meses`)));
  const radius = h('input', { type: 'number', class: 'input', min: 1, max: 30, value: st.radiusKm, inputmode: 'numeric', onchange: (e) => (st.radiusKm = Math.min(30, Math.max(1, +e.target.value || 5))) });

  const go = async () => {
    clear(out).append(spinner('Calculando índices…'));
    let point;
    try {
      point = await loc.resolve(); // pasos 2-3 (A-1 zona manual)
    } catch (e) {
      clear(out).append(h('div', { class: 'card error' }, e.message));
      return;
    }
    let zone = Cat.stores().filter((s) => distanceKm(point, s) <= st.radiusKm);
    let limited = null;
    if (zone.length < 3) {
      // A-2: ampliar la zona disponible y marcar la limitación
      const sorted = Cat.stores().map((s) => ({ s, d: distanceKm(point, s) })).sort((a, b) => a.d - b.d);
      zone = sorted.slice(0, 8).map((x) => x.s);
      limited = `Pocas sucursales en ${st.radiusKm} km: se usaron las ${zone.length} más cercanas (hasta ${Math.round(sorted[Math.min(7, sorted.length - 1)].d)} km). Baja confiabilidad.`;
    }
    const zoneIds = new Set(zone.map((s) => s.id));
    const months = monthKeys(st.months);
    const updated = (await Cat.meta.get('lastSync')) || '—';
    if (st.type === 'marca') await brandReport(point, zoneIds, months, limited, updated);
    else if (st.type === 'rubro') await categoryReport(zoneIds, months, limited, updated);
    else await promoMap(point, zone, limited, updated);
  };

  async function brandReport(point, zoneIds, months, limited, updated) {
    const prods = Cat.productsByGeneric(st.generic);
    const series = [];
    let n = 0;
    for (const p of prods) {
      const m = await monthlySeries(p.id, zoneIds, months);
      n += m.n;
      const first = m.values.find((v) => v != null);
      series.push({ name: p.brand, product: p, values: m.values.map((v) => (v != null && first ? (v / first) * 100 : null)), raw: m.values });
    }
    const valid = series.filter((x) => x.values.filter((v) => v != null).length >= 2);
    const lim = [limited, valid.length < series.length || n < 20 ? 'Historia o muestra insuficiente para algunas marcas: período ajustado a los datos disponibles.' : null].filter(Boolean);
    const ranking = valid.map((x) => ({ ...x, last: x.values.filter((v) => v != null).at(-1) })).sort((a, b) => a.last - b.last);
    const g = Cat.productsByGeneric(st.generic)[0];
    const table = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Marca'), h('th', { class: 'num' }, 'Índice'), h('th', { class: 'num' }, 'Suba'), h('th', { class: 'num' }, 'Precio'))), h('tbody', {}, ranking.map((r, i) => h('tr', { class: i === 0 ? 'best' : '' }, h('td', {}, i === 0 ? '★' : String(i + 1)), h('td', {}, r.name), h('td', { class: 'num' }, r.last.toFixed(1)), h('td', { class: 'num' }, pctFmt(r.last - 100)), h('td', { class: 'num' }, money(r.raw.filter((v) => v != null).at(-1)))))));
    clear(out).append(
      card(
        h('h2', { class: 'h3' }, `Evolución de precios: ${g.genericName} ${g.presentation}`),
        h('p', { class: 'muted small' }, `Índice base 100 = primer mes con datos · ${months.length - 1} meses · ${zoneIds.size} sucursales`),
        lim.map((t) => h('p', { class: 'notice warn' }, icon('alert'), t)),
        valid.length ? lineChart({ series: valid.map((v) => ({ name: v.name, values: v.values })), labels: months.map(monthLabel), yFormat: (v) => v.toFixed(0), baseline: 100, ariaLabel: 'Índice de precios por marca' }) : h('p', {}, 'Sin datos suficientes.'),
        ranking.length ? h('div', { class: 'banner good' }, icon('star'), h('div', {}, h('strong', {}, `Marca más estable: ${ranking[0].name}`), h('span', {}, `Subió ${pctFmt(ranking[0].last - 100)} en el período${ranking.length > 1 ? `, contra ${pctFmt(ranking.at(-1).last - 100)} de ${ranking.at(-1).name}` : ''}.`))) : null,
        h('details', { open: true }, h('summary', {}, 'Ranking de menor suba (tabla)'), table),
        ranking.length ? h('p', { class: 'small' }, '¿Querés premiar a la marca más estable? ', h('a', { href: '#/listas' }, 'Cambiala en tus listas'), ' con «Cambiar marca».') : null,
        h('p', { class: 'muted small' }, `Actualizado: ${updated} · muestra: ${n.toLocaleString('es-AR')} precios observados · datos agregados y anónimos`)
      )
    );
  }

  async function categoryReport(zoneIds, months, limited, updated) {
    const byCat = new Map();
    let n = 0;
    for (const p of Cat.products()) {
      const m = await monthlySeries(p.id, zoneIds, months);
      const vals = m.values.filter((v) => v != null);
      if (vals.length < 2) continue;
      n += m.n;
      if (!byCat.has(p.category)) byCat.set(p.category, []);
      byCat.get(p.category).push(vals.at(-1) / vals[0] - 1);
    }
    const rows = [...byCat.entries()].map(([label, arr]) => ({ label, value: (arr.reduce((a, b) => a + b, 0) / arr.length) * 100, note: `(${arr.length} prod.)` })).sort((a, b) => b.value - a.value);
    const avg = rows.length ? rows.reduce((a, r) => a + r.value, 0) / rows.length : 0;
    clear(out).append(
      card(
        h('h2', { class: 'h3' }, `Variación de precios por rubro (${months.length - 1} meses)`),
        limited ? h('p', { class: 'notice warn' }, icon('alert'), limited) : null,
        rows.length ? barChart({ rows, format: (v) => pctFmt(v), ariaLabel: 'Variación por rubro' }) : h('p', {}, 'Sin datos suficientes.'),
        rows.length ? h('p', {}, `Promedio de la zona: ${pctFmt(avg)}. Mayor suba: ${rows[0].label}; menor suba: ${rows.at(-1).label}.`) : null,
        h('p', { class: 'muted small' }, `Actualizado: ${updated} · muestra: ${n.toLocaleString('es-AR')} precios · ${zoneIds.size} sucursales · agregado y anónimo`)
      )
    );
  }

  async function promoMap(point, zone, limited, updated) {
    const { prices } = await Cat.currentForStores(zone.map((s) => s.id));
    const byProduct = new Map();
    for (const r of prices.values()) {
      if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
      byProduct.get(r.productId).push(r.price);
    }
    const median = new Map([...byProduct.entries()].map(([k, arr]) => [k, [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)]]));
    const rows = zone.map((s) => {
      const mine = [...prices.values()].filter((r) => r.storeId === s.id);
      const diff = mine.length ? (mine.reduce((a, r) => a + r.price / median.get(r.productId), 0) / mine.length - 1) * 100 : 0;
      return { s, diff, promos: Cat.promosForStore(s.id).length, n: mine.length };
    });
    const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.diff)));
    // divergente azul (más barato) ↔ gris ↔ rojo (más caro)
    const color = (d) => {
      const t = Math.max(-1, Math.min(1, d / maxAbs));
      const mid = [140, 139, 135];
      const end = t < 0 ? [42, 120, 214] : [227, 73, 72];
      const u = Math.abs(t);
      return `rgb(${mid.map((m, i) => Math.round(m + (end[i] - m) * u)).join(',')})`;
    };
    const radiusKm = Math.max(st.radiusKm, ...zone.map((s) => distanceKm(point, s))) || st.radiusKm;
    clear(out).append(
      card(
        h('h2', { class: 'h3' }, 'Mapa de promociones y precios diferenciados'),
        limited ? h('p', { class: 'notice warn' }, icon('alert'), limited) : null,
        svgMap({ center: point, radiusKm: Math.min(30, Math.ceil(radiusKm)), markers: rows.map((r) => ({ id: r.s.id, lat: r.s.lat, lng: r.s.lng, fill: color(r.diff), label: r.promos, title: `${r.s.name}: ${r.promos} promociones · ${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(1)} % vs. mediana` })), caption: 'Número = promociones vigentes · color: azul más barato, gris en la mediana, rojo más caro' }),
        h('div', { class: 'legend' }, h('span', {}, `−${maxAbs.toFixed(0)} %`), h('span', { class: 'legend-bar diverging' }), h('span', {}, `+${maxAbs.toFixed(0)} %`)),
        h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Sucursal'), h('th', { class: 'num' }, 'Promos'), h('th', { class: 'num' }, 'Dif. vs mediana'))), h('tbody', {}, rows.sort((a, b) => a.diff - b.diff).map((r) => h('tr', {}, h('td', {}, r.s.name), h('td', { class: 'num' }, String(r.promos)), h('td', { class: 'num' }, `${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(1)} %`))))),
        h('p', { class: 'muted small' }, `Actualizado: ${updated} · ${prices.size.toLocaleString('es-AR')} precios vigentes · agregado y anónimo`)
      )
    );
  }

  const typeSeg = segmented('rtype', [
    { value: 'marca', label: 'Por marca' },
    { value: 'rubro', label: 'Por rubro' },
    { value: 'mapa', label: 'Mapa' },
  ], st.type, (v) => ((st.type = v), (genField.hidden = v !== 'marca')));

  return h(
    'div',
    { class: 'page' },
    pageHeader('Reportes de mercado', { subtitle: 'Índices por marca, variación por rubro y promociones por zona' }),
    card(typeSeg, genField, h('div', { class: 'grid2' }, field('Período', period), field('Radio de la zona (km)', radius)), loc.el, h('button', { class: 'btn btn-primary btn-block', onclick: go }, icon('chart'), 'Ver reporte')),
    out,
    steps('CU-11 · pasos 1–6 · A-1 · A-2')
  );
}
