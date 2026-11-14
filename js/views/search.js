// CU-03 Optimizar Compra (día, comercio y medios de pago) — extendido por CU-04 en EP_ResultadosCalculados.
import { HELP } from '../ui/help.js';
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, modal, segmented, chip, spinner, steps, field } from '../ui/components.js';
import { locationControl } from '../ui/location.js';
import { svgMap } from '../ui/map.js';
import * as E from '../core/engine.js';
import * as L from '../app/listsvc.js';
import * as Cat from '../data/catalog.js';
import * as UD from '../core/userdata.js';
import { fmtDistance } from '../core/geo.js';
import { buildStoresAround, buildPrices } from '../data/demo-seed.js';
import { openBrandOptimizer } from './brands.js';

const { money, DAYS, DAYS_SHORT } = E;
const km = (x) => `${x.toFixed(1).replace('.', ',')} km`;

export async function render({ query }) {
  const lists = L.activeLists();
  if (!lists.length) return h('div', { class: 'page' }, pageHeader('Buscar la mejor compra', { help: HELP.search }), empty('list', 'Necesitás una lista', 'La búsqueda se hace sobre una lista de compras (precondición del caso de uso).', h('a', { class: 'btn btn-primary', href: '#/listas/nueva' }, icon('plus'), 'Crear lista')));
  const profile = UD.get('profile');
  const st = {
    listId: query.get('lista') && L.getList(query.get('lista')) ? query.get('lista') : lists[0].id,
    radiusKm: profile.prefs.radiusKm || 3,
    daysMode: 'week',
    usePayments: profile.payments.length > 0,
    multi: false,
    splitDays: false,
    maxStores: profile.prefs.maxStores ?? 3,
    maxKm: profile.prefs.maxKm ?? 10,
    costPerKm: profile.prefs.costPerKm ?? 250,
    excludedItems: [], // A-3: productos quitados para recalcular (no modifica la lista)
  };

  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const loc = locationControl({ name: 'loc-search', label: 'Ubicación' });

  // Paso 1: parámetros
  const listSel = h('select', { class: 'input', onchange: (e) => (st.listId = e.target.value) }, lists.map((l) => h('option', { value: l.id, selected: l.id === st.listId }, `${L.currentVersion(l).name} (${L.currentItems(l).length})`)));
  const radiusOut = h('output', {}, `${st.radiusKm} km`);
  const radius = h('input', { type: 'range', min: 1, max: 15, step: 1, value: st.radiusKm, class: 'range', 'aria-label': 'Radio en kilómetros', oninput: (e) => ((st.radiusKm = Number(e.target.value)), (radiusOut.textContent = `${st.radiusKm} km`)) });
  const hasMyDays = profile.availability.buy.length > 0;
  const daysSeg = segmented('days', [
    { value: 'today', label: 'Hoy', tip: 'Calcula sólo con las ofertas y descuentos de hoy' },
    { value: 'mine', label: 'Mis días', tip: 'Usa los días para comprar que cargaste en tu perfil' },
    { value: 'week', label: 'Toda la semana', tip: 'Compara los 7 días y te dice cuál conviene («la mejor ola»)' },
  ], st.daysMode, (v) => {
    if (v === 'mine' && !hasMyDays) toast('No cargaste días disponibles en tu perfil; se usará toda la semana', 'info', 5000);
    st.daysMode = v;
  });
  const payChk = h('input', { type: 'checkbox', checked: st.usePayments, disabled: !profile.payments.length, onchange: (e) => (st.usePayments = e.target.checked) });

  // A-2: opciones del reparto
  const num = (value, min, max, step, onChange, label) => h('input', { type: 'number', class: 'input', min, max, step, value, inputmode: 'decimal', 'aria-label': label, onchange: (e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min))) });
  const splitOpts = h(
    'div',
    { class: 'indent stack', hidden: true },
    h(
      'div',
      { class: 'grid3' },
      field('Máximo de comercios', num(st.maxStores, 2, 5, 1, (v) => (st.maxStores = v), 'Máximo de comercios'), null, 'Cantidad máxima de comercios a visitar (contando cada visita si repartís también en días).'),
      field('Distancia máxima a recorrer (km)', num(st.maxKm, 1, 60, 1, (v) => (st.maxKm = v), 'Distancia máxima'), null, 'Kilómetros totales del recorrido: salida desde tu ubicación, paso por cada comercio y regreso.'),
      field('Costo de traslado por km ($)', num(st.costPerKm, 0, 5000, 50, (v) => (st.costPerKm = v), 'Costo por km'), null, 'Cuánto te «cuesta» cada km recorrido. Se suma al total para decidir si conviene ir a un comercio más.')
    ),
    h('label', { class: 'check', 'data-tip': 'Permite que el reparto use comercios de distintos días (por ejemplo, almacén el martes y carnes el jueves) según promociones y medios de pago' }, h('input', { type: 'checkbox', onchange: (e) => (st.splitDays = e.target.checked) }), h('span', {}, 'Repartir también en distintos días', h('small', { class: 'hint block' }, 'Cada día es un recorrido aparte; el máximo de comercios cuenta todas las visitas.'))),
    h(
      'details',
      { class: 'explain' },
      h('summary', {}, icon('info', { size: 16 }), ' ¿Cómo se pondera el traslado? (ejemplo)'),
      h('p', {}, 'Para cada combinación posible se calcula: ', h('strong', {}, 'total de los productos (con ofertas y descuentos) + km del recorrido × costo por km'), '. El recorrido sale de tu ubicación, pasa por los comercios en el orden más corto y vuelve. Se elige la combinación más baja que respete el máximo de comercios y de km.'),
      h('p', {}, h('strong', {}, 'Ejemplo: '), 'comprando todo en el comercio A (a 1 km) pagás $ 50.000 y recorrés 2 km (ida y vuelta). Si el aceite y el café están $ 1.800 más baratos en B, y pasar por B alarga el recorrido de 2 a 5 km (3 km más):'),
      h('ul', { class: 'bullets' }, h('li', {}, 'con $ 250 por km: 3 km × $ 250 = $ 750 de traslado < $ 1.800 de ahorro → conviene ir también a B (ahorro neto $ 1.050).'), h('li', {}, 'con $ 700 por km: 3 km × $ 700 = $ 2.100 > $ 1.800 → conviene comprar todo en A.'), h('li', {}, 'con $ 0 por km: el traslado no pesa y cada producto va al comercio más barato, siempre dentro del máximo de comercios y de km.'))
    )
  );
  const multiChk = h('input', { type: 'checkbox', onchange: (e) => ((st.multi = e.target.checked), (splitOpts.hidden = !st.multi)) });
  const goBtn = h('button', { 'data-tip': 'Calcula precios finales por comercio y día; puede pedir permiso de ubicación', class: 'btn btn-primary btn-lg btn-block', onclick: () => ((st.excludedItems = []), run(true)) }, icon('wave'), 'Buscar');

  let lastPoint = null;

  async function run(askLocation) {
    clear(results).append(spinner('Calculando la mejor ola…'));
    // Pasos 2-3 (A-1 manual)
    if (askLocation || !lastPoint) {
      try {
        lastPoint = await loc.resolve();
      } catch (e) {
        clear(results).append(h('div', { class: 'card error', role: 'alert' }, h('strong', {}, 'Ubicación no válida'), h('p', {}, e.message), steps('CU-03 · E-1')));
        return;
      }
    }
    const list = L.getList(st.listId);
    const items = L.currentItems(list).filter((it) => !st.excludedItems.includes(it.generic));
    if (!items.length) return clear(results).append(empty('alert', 'No quedan productos para calcular', null));
    const days = st.daysMode === 'today' ? [new Date().getDay()] : st.daysMode === 'mine' && hasMyDays ? profile.availability.buy : [0, 1, 2, 3, 4, 5, 6];
    profile.prefs.maxStores = st.maxStores;
    profile.prefs.maxKm = st.maxKm;
    profile.prefs.costPerKm = st.costPerKm;
    UD.save('profile').catch(() => {});
    await new Promise((r) => setTimeout(r, 30)); // deja ver el indicador antes del cálculo
    try {
      // Pasos 4-7 (A-2 si reparte la compra)
      const res = await E.optimize({ items, point: lastPoint, radiusKm: st.radiusKm, days, usePayments: st.usePayments, payments: profile.payments, excluded: profile.excluded, multi: st.multi, splitDays: st.splitDays, maxStores: st.maxStores, maxKm: st.maxKm, costPerKm: st.costPerKm });
      const reps = new Map(await Promise.all(res.ctx.stores.map(async (s) => [s.id, await Cat.reputation(s.id)])));
      showResults(res, items, list, reps);
    } catch (e) {
      if (e.code === 'E-2') return showNoStores();
      console.error(e);
      clear(results).append(h('div', { class: 'card error' }, e.message));
    }
  }

  function showNoStores() {
    clear(results).append(
      h(
        'div',
        { class: 'card warn', role: 'alert' },
        h('strong', {}, 'No hay comercios habilitados en el radio'),
        h('p', {}, 'Podés ampliar el radio, revisar los comercios excluidos en tu perfil' + (lastPoint.source === 'gps' ? ' o, para probar la app, generar sucursales de demostración cerca tuyo.' : '.')),
        h(
          'div',
          { class: 'row' },
          st.radiusKm < 15 ? h('button', { class: 'btn btn-secondary', onclick: () => ((st.radiusKm = Math.min(15, st.radiusKm + 3)), (radius.value = st.radiusKm), (radiusOut.textContent = `${st.radiusKm} km`), run(false)) }, 'Ampliar radio') : null,
          h('button', { class: 'btn btn-ghost', onclick: async () => {
            const near = buildStoresAround(lastPoint.lat, lastPoint.lng, String(Date.now() % 100000));
            await Cat.addStores(near);
            const { current, series } = buildPrices(Cat.products().filter((p) => !p.sepa && !p.manual), near, Object.fromEntries(Cat.chains().map((c) => [c.id, c])));
            await Cat.addRawPrices(current, series);
            toast('Se generaron 14 sucursales de demostración cerca', 'ok');
            run(false);
          } }, 'Generar sucursales demo cerca')
        ),
        steps('CU-03 · E-2')
      )
    );
  }

  const shortName = (s) => (s.name.length > 26 ? s.name.slice(0, 25) + '…' : s.name);
  const promoCount = (b) => b.lines.filter((l) => l.promo).length;
  const benefitsText = (b) => [promoCount(b) ? `${promoCount(b)} oferta(s)` : null, b.payment.discount ? `${b.payment.issuer}: −${money(b.payment.discount)}` : null].filter(Boolean).join(' · ');

  function showResults(res, items, list, reps) {
    clear(results);
    const header = h('div', { class: 'res-head' }, h('h2', {}, 'Resultados'), h('small', { class: 'muted' }, `${res.ctx.stores.length} comercio(s) · ${res.days.length} día(s) · ${res.elapsedMs} ms · ${lastPoint.label}`));
    const excludedNote = st.excludedItems.length ? h('p', { class: 'notice' }, icon('info'), `Calculado sin ${st.excludedItems.length} producto(s) faltante(s). `, h('button', { class: 'link', onclick: () => ((st.excludedItems = []), run(false)) }, 'Volver a incluirlos')) : null;
    results.append(header, excludedNote);
    if (st.multi) return showSplit(res, items, list, reps);

    const dayChoice = { value: 'best' };
    let view = window.matchMedia('(min-width: 900px)').matches ? 'tabla' : 'mapa';
    const body = h('div');
    const chipsRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'Día a comparar' });
    const viewSeg = segmented('resview', [
      { value: 'mapa', label: 'Mapa y lista', icon: 'map', tip: 'Comercios en el mapa y lista ordenada por total' },
      { value: 'tabla', label: 'Tabla comercio × día', icon: 'calendar', tip: 'Todos los totales por comercio y día, como una grilla de tarifas' },
    ], view, (v) => ((view = v), (chipsRow.hidden = v === 'tabla'), renderBody()));
    const renderChips = () => {
      clear(chipsRow);
      chipsRow.append(chip(h('span', {}, icon('star', { size: 16 }), ' Mejor día de cada comercio'), { title: 'Para cada comercio, muestra el total de su día más conveniente', active: dayChoice.value === 'best', onClick: () => ((dayChoice.value = 'best'), renderChips(), renderBody()) }));
      for (const d of res.days) {
        const info = res.byDay.get(d);
        const isBest = res.bestOverall && res.bestOverall.day === d;
        chipsRow.append(chip(h('span', {}, `${DAYS_SHORT[d]} `, h('small', {}, info.min != null ? money(info.min) : 's/d'), isBest ? h('b', { class: 'wave-badge', title: 'Mejor día de la semana' }, ' ★') : null), { active: dayChoice.value === d, onClick: () => ((dayChoice.value = d), renderChips(), renderBody()), title: DAYS[d] }));
      }
    };

    const banner = () => {
      const allComplete = res.ctx.stores.map((s) => res.byStore.get(s.id)).filter(Boolean);
      const worst = Math.max(...allComplete.map((b) => b.total));
      if (dayChoice.value === 'best' || view === 'tabla') {
        if (!res.bestOverall) return null;
        const bs = Cat.store(res.bestOverall.storeId);
        return h('div', { class: 'banner good' }, icon('wave'), h('div', {}, h('strong', {}, `La mejor ola: ${DAYS[res.bestOverall.day]} en ${bs.name}`), h('span', {}, `${money(res.bestOverall.total)} · ahorrás ${money(worst - res.bestOverall.total)} frente al más caro${benefitsText(res.bestOverall) ? ` · ${benefitsText(res.bestOverall)}` : ''}`)));
      }
      const best = res.byDay.get(dayChoice.value).best;
      return best ? h('div', { class: 'banner' }, icon('calendar'), h('div', {}, h('strong', {}, `El ${DAYS[dayChoice.value].toLowerCase()} conviene ir a ${Cat.store(best.storeId).name}`), h('span', {}, money(best.total)))) : null;
    };

    const renderBody = () => {
      clear(body).append(banner());
      if (view === 'tabla') return body.append(matrixTable(res, reps, (storeId, day) => openDetail(storeId, day)));
      const isBest = dayChoice.value === 'best';
      const rows = res.ctx.stores.map((s) => ({ s, b: isBest ? res.byStore.get(s.id) || res.matrix.get(s.id).get(res.days[0]) : res.matrix.get(s.id).get(dayChoice.value) }));
      const complete = rows.filter((r) => r.b.complete).sort((a, b) => a.b.total - b.b.total || a.s.dist - b.s.dist);
      const incomplete = rows.filter((r) => !r.b.complete).sort((a, b) => a.b.missing.length - b.b.missing.length || a.s.dist - b.s.dist);
      const min = complete[0]?.b.total;
      const max = complete.at(-1)?.b.total;
      if (!complete.length) body.append(h('p', { class: 'notice' }, icon('alert'), 'Ningún comercio tiene todos los productos. Revisá los faltantes y recalculá sin ellos.'));
      const rank = new Map(complete.map((r, i) => [r.s.id, i + 1]));
      const markers = rows.map(({ s, b }) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        name: shortName(s),
        incomplete: !b.complete,
        missing: b.missing.length,
        fill: b.complete ? E.priceColor(b.total, min, max).color : null,
        label: rank.get(s.id),
        order: rank.get(s.id) ? 1000 - rank.get(s.id) : 0,
        title: b.complete ? `${rank.get(s.id)}. ${s.name}: ${money(b.total)}` : `${s.name}: faltan ${b.missing.length} producto(s)`,
      }));
      body.append(svgMap({ center: lastPoint, radiusKm: st.radiusKm, markers, labels: 'top', onSelect: (id) => openDetail(id), caption: 'Verde: más barato · Rojo: más caro · «!»: faltan productos (no comparable) · se muestran los nombres de los mejores; tocá cualquier punto para ver su detalle' }), legend(min, max));

      const table = h('ol', { class: 'res-list' });
      for (const { s, b } of complete) {
        const col = E.priceColor(b.total, min, max);
        const saving = max - b.total;
        const rep = reps.get(s.id);
        table.append(
          h(
            'li',
            {},
            h(
              'button',
              { class: 'res-row', onclick: () => openDetail(s.id), 'data-tip': 'Ver el detalle de precios, ofertas y descuentos de este comercio' },
              h('span', { class: 'res-rank', style: { background: col.color } }, String(rank.get(s.id))),
              h(
                'span',
                { class: 'res-main' },
                h('strong', {}, s.name),
                h('small', {}, `${s.address}${s.barrio ? `, ${s.barrio}` : ''} · ${fmtDistance(s.dist)}${isBest ? ` · mejor día: ${DAYS[b.day]}` : ''}`),
                h('small', { class: 'res-benefits' }, benefitsText(b) || 'Sin ofertas ni descuentos aplicables', ` · reputación ${rep.score}/100`)
              ),
              h('span', { class: 'res-total' }, h('strong', {}, money(b.total)), h('small', { class: saving > 0 ? 'good' : 'muted' }, saving > 0 ? `${col.t < 0.01 ? '▼ ' : ''}−${money(saving)} · ${E.pctFmt((saving / max) * 100, 0)}` : col.t > 0.99 && complete.length > 1 ? '▲ el más caro' : '—'))
            )
          )
        );
      }
      for (const { s, b } of incomplete) {
        table.append(
          h(
            'li',
            {},
            h(
              'button',
              { class: 'res-row incomplete', onclick: () => openMissing(s, b), 'data-tip': 'Le faltan productos: tocá para verlos y recalcular sin ellos' },
              h('span', { class: 'res-rank incomplete', 'aria-hidden': 'true' }, '!'),
              h('span', { class: 'res-main' }, h('strong', {}, s.name), h('small', {}, `${s.address}${s.barrio ? `, ${s.barrio}` : ''} · ${fmtDistance(s.dist)} · total no comparable`)),
              h('span', { class: 'res-total' }, h('span', { class: 'bangs', 'aria-label': `Faltan ${b.missing.length} productos` }, '!'.repeat(b.missing.length)), h('small', {}, 'Ver faltantes'))
            )
          )
        );
      }
      body.append(table);
    };

    // Paso 9: detalle de un comercio en su mejor día (o en el día elegido)
    const openDetail = (storeId, forcedDay) => {
      const s = res.ctx.stores.find((x) => x.id === storeId);
      const row = res.matrix.get(storeId);
      const b = forcedDay != null ? row.get(forcedDay) : dayChoice.value === 'best' ? res.byStore.get(storeId) : row.get(dayChoice.value);
      if (!b || !b.complete) return openMissing(s, b || row.get(res.days[0]));
      const dayRows = res.days.map((d) => row.get(d)).filter((x) => x.complete);
      const minDay = Math.min(...dayRows.map((x) => x.total));
      basketModal({
        title: s.name,
        subtitle: `${DAYS[b.day]} · ${fmtDistance(s.dist)} · ${s.address}${s.barrio ? `, ${s.barrio}` : ''}`,
        parts: [{ store: s, basket: b }],
        extra: dayRows.length > 1 ? h('div', { class: 'day-strip' }, h('h3', { class: 'h4' }, 'Total por día en este comercio'), h('ul', { class: 'bars' }, dayRows.map((x) => h('li', { class: x.total === minDay ? 'best' : '' }, h('span', {}, DAYS_SHORT[x.day]), h('span', { class: 'bar', style: { width: `${Math.max(8, (minDay / x.total) * 100)}%` } }), h('strong', {}, money(x.total)))))) : null,
        reference: { storeId, day: b.day },
        res,
        items,
        list,
        reps,
      });
    };

    const openMissing = (s, b) => {
      // A-3: consultar faltantes y recalcular sin ellos
      modal({
        title: `Faltantes en ${s.name}`,
        content: h('div', {}, h('p', {}, 'Este comercio no tiene estos productos (o fueron reportados sin stock), por eso su total no se compara con los demás:'), h('ul', { class: 'missing' }, b.missing.map((m) => h('li', {}, h('span', { class: 'bang' }, '!'), L.itemLabel(m)))), steps('CU-03 · A-3')),
        actions: [
          { label: 'Cerrar', value: null },
          {
            label: 'Recalcular sin estos productos',
            kind: 'primary',
            onClick: (close) => {
              close();
              st.excludedItems = [...new Set([...st.excludedItems, ...b.missing.map((m) => m.generic)])];
              run(false); // vuelve al paso 5
            },
          },
        ],
      });
    };

    renderChips();
    chipsRow.hidden = view === 'tabla';
    renderBody();
    results.append(viewSeg, chipsRow, body, steps('CU-03 · pasos 1–10 · A-1 · A-3 · A-4 (EP_ResultadosCalculados → CU-04) · E-1 · E-2'));
  }

  /** Tabla comercio × día: cada celda es el total de la canasta; la mejor celda de cada fila en negrita y la mejor general con ★. */
  function matrixTable(res, reps, onCell) {
    const all = [];
    for (const s of res.ctx.stores) for (const d of res.days) {
      const b = res.matrix.get(s.id).get(d);
      if (b.complete) all.push(b.total);
    }
    const min = Math.min(...all);
    const max = Math.max(...all);
    const rows = res.ctx.stores
      .map((s) => ({ s, best: res.byStore.get(s.id) }))
      .sort((a, b) => (a.best && b.best ? a.best.total - b.best.total : a.best ? -1 : b.best ? 1 : a.s.dist - b.s.dist));
    const bestCol = new Map(res.days.map((d) => [d, res.byDay.get(d).best?.storeId]));
    return h(
      'div',
      { class: 'matrix-wrap' },
      h(
        'table',
        { class: 'tbl matrix' },
        h('caption', {}, 'Total de la canasta por comercio y día · verde más barato, rojo más caro · ★ mejor combinación · tocá una celda para ver el detalle'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Comercio'), res.days.map((d) => h('th', { scope: 'col', class: 'num' }, DAYS_SHORT[d], h('small', { class: 'block muted' }, res.byDay.get(d).min != null ? money(res.byDay.get(d).min) : 's/d'))))),
        h(
          'tbody',
          {},
          rows.map(({ s, best }) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, h('strong', {}, s.name), h('small', { class: 'block muted' }, `${fmtDistance(s.dist)} · rep. ${reps.get(s.id).score}`)),
              res.days.map((d) => {
                const b = res.matrix.get(s.id).get(d);
                if (!b.complete) return h('td', { class: 'num cell-inc', title: `Faltan ${b.missing.length} producto(s)` }, h('button', { class: 'cell-btn', onclick: () => onCell(s.id, d) }, '!'.repeat(Math.min(3, b.missing.length))));
                const col = E.priceColor(b.total, min, max);
                const isRowBest = best && best.day === d;
                const isTop = res.bestOverall && res.bestOverall.storeId === s.id && res.bestOverall.day === d;
                return h('td', { class: ['num', isRowBest && 'row-best', bestCol.get(d) === s.id && 'col-best'] }, h('button', { class: 'cell-btn', style: { borderColor: col.color }, onclick: () => onCell(s.id, d), title: `${s.name} · ${DAYS[d]}: ${money(b.total)}${benefitsText(b) ? ` (${benefitsText(b)})` : ''}` }, h('span', { class: 'cell-dot', style: { background: col.color } }), isTop ? '★ ' : '', money(b.total), b.payment.discount || promoCount(b) ? h('small', { class: 'block muted' }, [promoCount(b) ? `${promoCount(b)} of.` : null, b.payment.discount ? b.payment.issuer : null].filter(Boolean).join(' · ')) : null));
              })
            )
          )
        )
      )
    );
  }

  // A-2: reparto de la compra en varios comercios (y opcionalmente en días)
  function showSplit(res, items, list, reps) {
    const { best, byDay } = res.multi;
    const singleBest = res.bestOverall;
    let plan = best;
    const body = h('div');
    if (!best) {
      results.append(h('div', { class: 'card warn', role: 'alert' }, h('strong', {}, 'Ningún comercio queda dentro de la distancia máxima'), h('p', {}, `Con ${st.maxKm} km de recorrido total (ida y vuelta) no se llega a ningún comercio del radio. Aumentá la distancia máxima a recorrer.`), steps('CU-03 · A-2 · E-3')));
      return;
    }
    const draw = () => {
      clear(body);
      const singleDay = !st.splitDays ? res.byDay.get(plan.days[0])?.best : singleBest;
      const net = singleDay ? singleDay.total - plan.total - plan.travel : null;
      body.append(
        h(
          'div',
          { class: 'banner good' },
          icon('wave'),
          h(
            'div',
            {},
            h('strong', {}, plan.parts.length > 1 ? `Repartiendo en ${plan.parts.length} visita(s)${st.splitDays ? ` en ${plan.days.length} día(s)` : ` el ${DAYS[plan.days[0]].toLowerCase()}`}: ${money(plan.total)}` : `Con este costo de traslado conviene un solo comercio: ${money(plan.total)}`),
            h('span', {}, `Recorrido ${km(plan.km)} (traslado estimado ${money(plan.travel)}) · topes: ${st.maxStores} comercios y ${st.maxKm} km`, net != null ? ` · ${net > 0 ? `ahorrás ${money(net)} frente a comprar todo en ${Cat.store(singleDay.storeId).name}${st.splitDays ? ` el ${DAYS[singleDay.day].toLowerCase()}` : ''}, ya descontado el traslado` : `comprar todo en ${Cat.store(singleDay.storeId).name} cuesta lo mismo o menos`}` : '')
          )
        )
      );
      if (byDay) {
        // comparación de días bajo la modalidad repartida
        const plans = res.days.map((d) => byDay.get(d)).filter(Boolean);
        const minT = Math.min(...plans.filter((p) => p.complete).map((p) => p.score));
        body.append(
          h('h3', { class: 'h4' }, 'Comparación de días (repartiendo la compra)'),
          h(
            'ul',
            { class: 'bars big' },
            plans.map((p) => h('li', { class: [p === plan && 'sel', p === best && 'best'] }, h('button', { class: 'bar-btn', onclick: () => ((plan = p), draw()) }, h('span', {}, DAYS_SHORT[p.days[0]]), p.complete ? h('span', { class: 'bar', style: { width: `${Math.max(8, (minT / p.score) * 100)}%` } }) : h('span', { class: 'bangs' }, '!'.repeat(p.missing.length)), h('strong', {}, p.complete ? money(p.total + p.travel) : 'incompleto'), h('small', {}, `${p.parts.length} com. · ${km(p.km)}`))))
          )
        );
      }
      const order = new Map();
      plan.routes.forEach((r) => r.order.forEach((id, i) => order.set(`${id}|${r.day}`, i + 1)));
      const inPlan = new Set(plan.parts.map((p) => p.storeId));
      const markers = res.ctx.stores.map((s) => {
        const visit = plan.parts.find((p) => p.storeId === s.id);
        const n = visit ? order.get(`${s.id}|${visit.day}`) : null;
        return { id: s.id, lat: s.lat, lng: s.lng, name: visit ? `${st.splitDays ? DAYS_SHORT[visit.day] + ' · ' : ''}${shortName(s)}` : shortName(s), fill: visit ? 'var(--accent)' : 'var(--muted-dot)', label: n ?? '', order: visit ? 100 : 0, title: visit ? `${n}. ${s.name}` : s.name, selected: inPlan.has(s.id) };
      });
      body.append(svgMap({ center: lastPoint, radiusKm: st.radiusKm, markers, labels: 'top', caption: 'Comercios a visitar, numerados en el orden del recorrido más corto' }));
      // detalle por día y comercio
      for (const r of plan.routes.sort((a, b) => a.day - b.day)) {
        const parts = r.order.map((id) => plan.parts.find((p) => p.storeId === id && p.day === r.day));
        body.append(
          card(
            h('h3', { class: 'h4' }, `${DAYS[r.day]} · recorrido ${km(r.km)}`),
            h('p', { class: 'muted small' }, ['Salida', ...parts.map((p) => Cat.store(p.storeId).name), 'regreso'].join(' → ')),
            h(
              'ol',
              { class: 'res-list' },
              parts.map((p, i) =>
                h('li', {}, h('button', { class: 'res-row', onclick: () => basketModal({ title: `${Cat.store(p.storeId).name} · ${DAYS[p.day]}`, subtitle: `${p.lines.length} producto(s)`, parts: [{ store: res.ctx.stores.find((s) => s.id === p.storeId), basket: p }], reference: { storeId: p.storeId, day: p.day }, res, items, list, reps }) }, h('span', { class: 'res-rank', style: { background: 'var(--accent)' } }, String(i + 1)), h('span', { class: 'res-main' }, h('strong', {}, Cat.store(p.storeId).name), h('small', {}, `${p.lines.length} producto(s): ${p.lines.slice(0, 4).map((l) => Cat.product(l.productId).genericName).join(', ')}${p.lines.length > 4 ? '…' : ''}`), h('small', { class: 'res-benefits' }, benefitsText(p) || 'Sin ofertas ni descuentos aplicables')), h('span', { class: 'res-total' }, h('strong', {}, money(p.total)))))
              )
            )
          )
        );
      }
      if (plan.missing.length) body.append(h('p', { class: 'notice' }, icon('alert'), `Sin oferta en los comercios elegibles: ${plan.missing.map((m) => L.itemLabel(m)).join(', ')}`));
      body.append(h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: () => basketModal({ title: 'Compra repartida', subtitle: `${plan.parts.length} visita(s) · recorrido ${km(plan.km)}`, parts: plan.parts.map((p) => ({ store: res.ctx.stores.find((s) => s.id === p.storeId), basket: p })), reference: { storeId: plan.parts[0].storeId, day: plan.parts[0].day }, res, items, list, travel: plan.travel, reps }) }, 'Ver detalle completo')));
    };
    draw();
    results.append(body, steps('CU-03 · A-2 (repartir la compra)'));
  }

  function basketModal({ title, subtitle, parts, extra, reference, res, items, list, travel, reps }) {
    const content = h('div', { class: 'basket' }, subtitle ? h('p', { class: 'muted' }, subtitle) : null, extra || null);
    let grand = 0;
    const myIssuers = new Set(profile.payments.map((p) => p.issuer));
    for (const { store, basket } of parts) {
      grand += basket.total;
      const otherPay = Cat.promosForStore(store.id).filter((pr) => pr.type === 'payment' && (!pr.days || pr.days.includes(basket.day)) && !myIssuers.has(pr.issuer));
      content.append(
        h(
          'section',
          { class: 'basket-store' },
          parts.length > 1 ? h('h3', { class: 'h4' }, `${store.name} · ${DAYS[basket.day]} · ${fmtDistance(store.dist)}`) : null,
          h(
            'table',
            { class: 'tbl' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Producto'), h('th', { class: 'num' }, 'Cant.'), h('th', { class: 'num' }, 'Precio'), h('th', { class: 'num' }, 'Subtotal'))),
            h(
              'tbody',
              {},
              basket.lines.map((l) => {
                const p = Cat.product(l.productId);
                return h('tr', {}, h('td', {}, p.name, l.promo ? h('small', { class: 'promo' }, `Oferta: ${l.promo}`) : null, l.verified ? h('small', { class: 'verified' }, '✓ verificado por ticket') : null), h('td', { class: 'num' }, String(l.qty)), h('td', { class: 'num' }, money(l.unit)), h('td', { class: 'num' }, l.net < l.gross ? h('span', {}, h('s', { class: 'muted' }, money(l.gross)), h('br'), money(l.net)) : money(l.net)));
              })
            ),
            h(
              'tfoot',
              {},
              h('tr', {}, h('td', { colspan: 3 }, 'Subtotal con ofertas'), h('td', { class: 'num' }, money(basket.subtotal))),
              basket.payment.discount ? h('tr', { class: 'good' }, h('td', { colspan: 3 }, `Medio de pago: ${basket.payment.issuer} — ${basket.payment.label}`), h('td', { class: 'num' }, `−${money(basket.payment.discount)}`)) : h('tr', {}, h('td', { colspan: 4, class: 'muted small' }, st.usePayments ? 'Ninguno de tus medios de pago tiene descuento en este comercio ese día.' : 'No se aplicaron descuentos de medios de pago (opción desactivada).')),
              h('tr', { class: 'total' }, h('td', { colspan: 3 }, 'Total'), h('td', { class: 'num' }, money(basket.total)))
            )
          ),
          h('p', { class: 'muted small' }, `Ahorro por ofertas: ${money(basket.gross - basket.subtotal)} · por medio de pago: ${money(basket.payment.discount)} · reputación del comercio ${reps.get(store.id).score}/100 (informativa, no altera el ranking)`),
          otherPay.length ? h('details', {}, h('summary', { class: 'small' }, `Otros descuentos de medios de pago ese día (${otherPay.length}) que no tenés en tu perfil`), h('ul', { class: 'bullets small' }, otherPay.map((pr) => h('li', {}, `${pr.issuer}: ${pr.label}`)))) : null
        )
      );
    }
    if (parts.length > 1) content.append(h('p', { class: 'total-line' }, `Total: ${money(grand)} + traslado ${money(travel || 0)}`));
    return modal({
      title,
      wide: true,
      content,
      actions: [
        {
          label: 'Ahorrar más cambiando marcas',
          tip: 'Propone marcas equivalentes más baratas para tu lista (CU-04). Nada se cambia sin tu aprobación.',
          onClick: async (close) => {
            close();
            // A-4: punto de extensión EP_ResultadosCalculados -> CU-04
            const changed = await openBrandOptimizer({ list, items, ctx: res.ctx, reference });
            if (changed) run(false); // vuelve al paso 5 con la lista actualizada
          },
        },
        { label: 'Confirmar opción', tip: 'Elegís esta opción: te mostramos cómo llegar a cada comercio', kind: 'primary', onClick: (close) => (close(), confirmOption(parts)) },
      ],
    });
  }

  // Paso 10: confirmar la opción y ver cómo llegar
  function confirmOption(parts) {
    modal({
      title: 'Opción confirmada',
      content: h(
        'div',
        {},
        h(
          'ul',
          { class: 'menu plain' },
          parts.map((p) => h('li', {}, h('div', { class: 'row space' }, h('span', {}, h('strong', {}, p.store.name), h('small', { class: 'block muted' }, `${DAYS[p.basket.day]} · ${p.store.address}${p.store.barrio ? `, ${p.store.barrio}` : ''} · ${money(p.basket.total)}`)), h('a', { class: 'btn btn-ghost btn-sm', href: `https://www.openstreetmap.org/directions?route=${lastPoint.lat}%2C${lastPoint.lng}%3B${p.store.lat}%2C${p.store.lng}`, target: '_blank', rel: 'noopener noreferrer', 'data-tip': 'Abre el recorrido en OpenStreetMap' }, icon('map', { size: 16 }), 'Cómo llegar'))))
        ),
        steps('CU-03 · paso 10')
      ),
      actions: [{ label: 'Listo', kind: 'primary', value: true }],
    });
  }

  return h(
    'div',
    { class: 'page' },
    pageHeader('Buscar la mejor compra', { subtitle: 'Día, comercio y medios de pago en una sola búsqueda', help: HELP.search }),
    card(
      field('Lista', listSel, null, 'La lista de compras sobre la que se calcula. Podés crear o editar listas en «Listas».'),
      h('div', { class: 'field', 'data-tip': 'Sólo se consideran comercios a esta distancia o menos de tu ubicación' }, h('span', { class: 'field-label' }, 'Radio: ', radiusOut), radius),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Días a evaluar'), daysSeg, !hasMyDays ? h('small', { class: 'hint' }, h('a', { href: '#/perfil' }, 'Cargá tus días disponibles'), ' para usar «Mis días».') : null),
      h('label', { class: 'check', 'data-tip': 'Suma los reintegros de bancos y billeteras que tengas cargados (respetando topes y días)' }, payChk, h('span', {}, `Aplicar descuentos de mis medios de pago (${profile.payments.length})`, !profile.payments.length ? h('small', { class: 'hint' }, ' — ', h('a', { href: '#/perfil' }, 'cargalos en tu perfil')) : null)),
      h('label', { class: 'check', 'data-tip': 'En vez de un solo comercio, reparte cada producto donde conviene, respetando un máximo de comercios y de km' }, multiChk, h('span', {}, 'Repartir la compra en varios comercios', h('small', { class: 'hint block' }, 'Con máximo de comercios y de km a recorrer; opcionalmente también en distintos días.'))),
      splitOpts,
      loc.el,
      profile.excluded.length ? h('p', { class: 'muted small' }, `Se omiten ${profile.excluded.length} cadena(s)/sucursal(es) excluidas en tu perfil.`) : null,
      goBtn
    ),
    results
  );
}

function legend(min, max) {
  if (min == null) return null;
  return h('div', { class: 'legend', 'aria-label': 'Escala de precios' }, h('span', {}, '▼ ', money(min)), h('span', { class: 'legend-bar' }), h('span', {}, money(max), ' ▲'), h('span', { class: 'legend-inc' }, h('b', {}, '!'), ' = producto faltante'));
}
