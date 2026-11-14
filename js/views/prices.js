// CU-02 Consultar Precios de un Producto: qué comercios lo tienen, a qué precio, con qué promoción y desde cuándo.
import { HELP } from '../ui/help.js';
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, segmented, field, spinner, steps } from '../ui/components.js';
import { pickProduct } from '../ui/picker.js';
import { locationControl } from '../ui/location.js';
import { svgMap } from '../ui/map.js';
import * as Cat from '../data/catalog.js';
import { distanceKm, fmtDistance } from '../core/geo.js';
import { money, priceColor, volumeCost, DAYS_SHORT } from '../core/engine.js';
import { collabLevel } from '../app/session.js';
import * as PR from '../core/promos.js';
import * as UD from '../core/userdata.js';

const SOURCE = { ticket: '✓ ticket', gondola: 'góndola', 'gondola-sim': 'góndola (demo)', manual: 'carga manual', demo: 'fuente abierta', sepa: 'Precios Claros' };

/** Promociones del comercio que alcanzan al producto (sin las de medios de pago). */
function promosFor(storeId, p) {
  return Cat.promosForStore(storeId).filter((pr) => !PR.isPayment(pr) && PR.targets(pr, p));
}

export async function render({ query }) {
  const st = { target: null, scope: query.get('producto') || query.get('generico') ? 'todos' : 'zona', radiusKm: 5 };
  if (query.get('producto') && Cat.product(query.get('producto'))) st.target = { productId: query.get('producto'), generic: Cat.product(query.get('producto')).generic };
  else if (query.get('generico') && Cat.productsByGeneric(query.get('generico')).length) st.target = { productId: null, generic: query.get('generico') };

  const label = (t) => {
    if (!t) return 'Elegir producto o «cualquier marca»';
    if (t.productId) return Cat.product(t.productId).name;
    const g = Cat.productsByGeneric(t.generic)[0];
    return `${g.genericName} ${g.presentation} · cualquier marca`;
  };
  const out = h('div', { 'aria-live': 'polite' });
  const prodBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-block', 'data-tip': 'Buscá por nombre, marca, categoría o código de barras', onclick: async () => {
    const r = await pickProduct({ title: 'Producto a consultar' });
    if (!r) return;
    st.target = r;
    clear(prodBtn).append(icon('edit', { size: 18 }), label(r));
  } }, icon('search', { size: 18 }), label(st.target));
  const loc = locationControl({ name: 'loc-prices', label: 'Ubicación' });
  const radius = h('input', { type: 'number', class: 'input', min: 1, max: 30, value: st.radiusKm, inputmode: 'numeric', onchange: (e) => (st.radiusKm = Math.min(30, Math.max(1, +e.target.value || 5))) });
  const zoneBox = h('div', { class: 'stack' }, field('Radio (km)', radius, null, 'Sólo se listan los comercios a esta distancia o menos.'), loc.el);
  const scope = segmented('pscope', [
    { value: 'zona', label: 'Cerca de una ubicación', tip: 'Comercios dentro de un radio, ordenados por precio y con su distancia' },
    { value: 'todos', label: 'Todos los comercios', tip: 'Todos los comercios del catálogo que tienen el producto, sin usar la ubicación' },
  ], st.scope, (v) => ((st.scope = v), (zoneBox.hidden = v === 'todos')));
  zoneBox.hidden = st.scope === 'todos';

  const go = async () => {
    if (!st.target) return clear(out).append(h('p', { class: 'form-error' }, 'Elegí el producto a consultar'));
    clear(out).append(spinner('Buscando precios…'));
    // Pasos 3-4 (A-1 manual; A-2 sin ubicación)
    let point = null;
    if (st.scope === 'zona') {
      try {
        point = await loc.resolve();
      } catch (e) {
        clear(out).append(h('div', { class: 'card error', role: 'alert' }, h('strong', {}, 'Ubicación no válida'), h('p', {}, e.message), steps('CU-02 · E-1')));
        return;
      }
    }
    const area = Cat.stores()
      .map((s) => ({ ...s, dist: point ? distanceKm(point, s) : null }))
      .filter((s) => !point || s.dist <= st.radiusKm);
    const areaIds = new Set(area.map((s) => s.id));
    // Paso 5: precios vigentes, promociones y faltantes
    const products = st.target.productId ? [Cat.product(st.target.productId)] : Cat.productsByGeneric(st.target.generic);
    const recs = (await Promise.all(products.map((p) => Cat.currentByProduct(p.id)))).flat().filter((r) => areaIds.has(r.storeId));
    const { outOfStock } = await Cat.currentForStores([...new Set(recs.map((r) => r.storeId))]);
    const today = new Date().getDay();
    const byStore = new Map();
    for (const r of recs) {
      const p = Cat.product(r.productId);
      const promos = promosFor(r.storeId, p);
      const todayCost = volumeCost(r.price, 1, p, promos, today, { memberships: new Set(UD.get('profile').memberships || []) });
      const row = { rec: r, p, promos, out: outOfStock.has(`${r.storeId}|${r.productId}`), store: area.find((s) => s.id === r.storeId) };
      const cur = byStore.get(r.storeId);
      if (!cur) byStore.set(r.storeId, { best: row, brands: [row] });
      else {
        cur.brands.push(row);
        if (r.price < cur.best.rec.price) cur.best = row;
      }
      row.today = todayCost;
    }
    const rows = [...byStore.values()].sort((a, b) => a.best.out - b.best.out || a.best.rec.price - b.best.rec.price || (a.best.store.dist ?? 0) - (b.best.store.dist ?? 0));
    if (!rows.length) {
      // E-2: ningún comercio tiene precio registrado
      clear(out).append(card(h('div', { class: 'banner bad' }, icon('alert'), h('div', {}, h('strong', {}, 'Ningún comercio tiene precio registrado'), h('span', {}, `${label(st.target)}${point ? ` dentro de ${st.radiusKm} km` : ''}. Probá con «cualquier marca», un radio mayor o «Todos los comercios».`))), collabLevel() >= 2 ? h('p', {}, h('a', { class: 'btn btn-secondary', href: '#/catalogo' }, icon('plus'), 'Cargar el precio a mano (CU-10)')) : null, steps('CU-02 · E-2')));
      return;
    }
    const prices = rows.filter((r) => !r.best.out).map((r) => r.best.rec.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    // Paso 6 (de a 25 comercios)
    const listEl = h('ol', { class: 'res-list' });
    let shown = 0;
    const moreBtn = h('button', { class: 'btn btn-ghost btn-block', onclick: () => showMore() });
    const showMore = () => {
      rows.slice(shown, shown + 25).forEach((r, k) => listEl.append(rowEl(r, shown + k)));
      shown = Math.min(rows.length, shown + 25);
      moreBtn.hidden = shown >= rows.length;
      moreBtn.textContent = `Ver más comercios (${rows.length - shown} restantes)`;
    };
    clear(out).append(
      card(
        h('h2', { class: 'h3' }, label(st.target)),
        h('p', { class: 'muted small' }, `Con precio registrado en ${rows.length} de ${area.length} comercio(s)${point ? ` dentro de ${st.radiusKm} km de ${point.label}` : ' del catálogo'} · ${area.length - rows.length} sin precio registrado · el precio es de lista; la promoción indica la oferta vigente.`),
        point
          ? svgMap({ center: point, radiusKm: st.radiusKm, labels: 'top', markers: rows.map((r, i) => ({ id: r.best.store.id, lat: r.best.store.lat, lng: r.best.store.lng, name: `${money(r.best.rec.price)} · ${r.best.store.name.slice(0, 20)}`, fill: r.best.out ? null : priceColor(r.best.rec.price, min, max).color, incomplete: r.best.out, missing: 1, label: i + 1, order: 1000 - i, title: `${r.best.store.name}: ${money(r.best.rec.price)}${r.best.out ? ' (sin stock reportado)' : ''}` })), caption: 'Verde: más barato · Rojo: más caro · «!»: faltante reportado' })
          : null,
        listEl,
        moreBtn,
        h('p', { class: 'small' }, '¿Querés saber dónde conviene comprar toda tu lista? Usá ', h('a', { href: '#/buscar' }, 'Buscar la mejor compra'), '.')
      ),
      steps('CU-02 · pasos 1–6 · A-1 · A-2 · E-1 · E-2')
    );
    showMore();
    function rowEl(r, i) {
      return (
            h(
              'li',
              {},
              h(
                'div',
                { class: ['res-row', r.best.out && 'incomplete'] },
                h('span', { class: ['res-rank', r.best.out && 'incomplete'], style: r.best.out ? null : { background: priceColor(r.best.rec.price, min, max).color } }, r.best.out ? '!' : String(i + 1)),
                h(
                  'span',
                  { class: 'res-main' },
                  h('strong', {}, r.best.store.name),
                  h('small', {}, `${r.best.store.address}${r.best.store.barrio ? `, ${r.best.store.barrio}` : ''}${r.best.store.dist != null ? ` · ${fmtDistance(r.best.store.dist)}` : ''}`),
                  !st.target.productId ? h('small', {}, `Más barata: ${r.best.p.brand}${r.brands.length > 1 ? ` · ${r.brands.length} marcas con precio` : ''}`) : null,
                  r.best.promos.length ? h('ul', { class: 'promo-lines' }, r.best.promos.map((pr) => h('li', { class: 'small res-benefits' }, PR.label(pr, Cat), h('span', { class: 'muted' }, ` (fuente: ${PR.SOURCES[PR.normalize(pr).source] || 'catálogo'})`)))) : h('small', { class: 'muted' }, 'Sin promociones registradas'),
                  h('small', { class: 'muted' }, `Precio del ${r.best.rec.date.split('-').reverse().join('/')} · fuente: ${SOURCE[r.best.rec.source] || r.best.rec.source}${r.best.out ? ' · faltante reportado en góndola' : ''}`)
                ),
                h('span', { class: 'res-total' }, h('strong', {}, money(r.best.rec.price)), r.best.today.cost < r.best.rec.price ? h('small', { class: 'good' }, `hoy ${money(r.best.today.cost)} c/u`) : null)
              )
            )
      );
    }
  };

  if (st.target) setTimeout(go, 0); // desde una lista: consulta directa en todos los comercios
  return h(
    'div',
    { class: 'page' },
    pageHeader('Precios por producto', { subtitle: 'Qué comercios lo tienen, a qué precio y con qué promoción', help: HELP.prices }),
    card(field('Producto', prodBtn, null, 'Una marca concreta o «cualquier marca» (muestra la más barata de cada comercio).'), scope, zoneBox, h('button', { class: 'btn btn-primary btn-block', onclick: go }, icon('search'), 'Consultar')),
    out,
    !st.target ? empty('search', 'Elegí un producto', 'Vas a ver todos los comercios que tienen precio registrado, ordenados del más barato al más caro.') : null
  );
}
