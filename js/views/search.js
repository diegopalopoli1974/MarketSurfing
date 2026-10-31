// CU-03 Optimizar Compra (día, comercio y medios de pago) — extendido por CU-04; continúa con CU-06.
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
import { openDelivery } from './delivery.js';

const { money, DAYS, DAYS_SHORT } = E;

export async function render({ query }) {
  const lists = L.activeLists();
  if (!lists.length) return h('div', { class: 'page' }, pageHeader('Buscar la mejor compra'), empty('list', 'Necesitás una lista', 'La búsqueda se hace sobre una lista de compras (precondición del caso de uso).', h('a', { class: 'btn btn-primary', href: '#/listas/nueva' }, icon('plus'), 'Crear lista')));
  const profile = UD.get('profile');
  const st = {
    listId: query.get('lista') && L.getList(query.get('lista')) ? query.get('lista') : lists[0].id,
    radiusKm: profile.prefs.radiusKm || 3,
    daysMode: 'week',
    usePayments: profile.payments.length > 0,
    multi: false,
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
    { value: 'today', label: 'Hoy' },
    { value: 'mine', label: 'Mis días' },
    { value: 'week', label: 'Toda la semana' },
  ], st.daysMode, (v) => {
    if (v === 'mine' && !hasMyDays) {
      toast('No cargaste días disponibles en tu perfil; se usará toda la semana', 'info', 5000);
    }
    st.daysMode = v;
  });
  const payChk = h('input', { type: 'checkbox', checked: st.usePayments, disabled: !profile.payments.length, onchange: (e) => (st.usePayments = e.target.checked) });
  const costKm = h('input', { type: 'number', class: 'input', min: 0, max: 5000, step: 50, value: st.costPerKm, inputmode: 'numeric', onchange: (e) => (st.costPerKm = Math.max(0, Number(e.target.value) || 0)) });
  const costWrap = h('div', { class: 'indent', hidden: true }, field('Costo de traslado por km ($)', costKm, 'Pondera la distancia al repartir la compra.'));
  const multiChk = h('input', { type: 'checkbox', onchange: (e) => ((st.multi = e.target.checked), (costWrap.hidden = !st.multi)) });
  const goBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', onclick: () => ((st.excludedItems = []), run(true)) }, icon('wave'), 'Buscar');

  let lastPoint = null;

  async function run(askLocation) {
    clear(results).append(spinner('Calculando la mejor ola…'));
    // Pasos 2-3 (A-1 manual)
    if (askLocation || !lastPoint) {
      try {
        lastPoint = await loc.resolve();
      } catch (e) {
        // E-1: ubicación no válida -> vuelve al paso 1
        clear(results).append(h('div', { class: 'card error', role: 'alert' }, h('strong', {}, 'Ubicación no válida'), h('p', {}, e.message), steps('CU-03 · E-1')));
        return;
      }
    }
    const list = L.getList(st.listId);
    const items = L.currentItems(list).filter((it) => !st.excludedItems.includes(it.generic));
    if (!items.length) return clear(results).append(empty('alert', 'No quedan productos para calcular', null));
    const days = st.daysMode === 'today' ? [new Date().getDay()] : st.daysMode === 'mine' && hasMyDays ? profile.availability.buy : [0, 1, 2, 3, 4, 5, 6];
    try {
      // Pasos 4-7 (A-2 si es multi-comercio)
      const res = await E.optimize({ items, point: lastPoint, radiusKm: st.radiusKm, days, usePayments: st.usePayments, payments: profile.payments, excluded: profile.excluded, multi: st.multi, costPerKm: st.costPerKm });
      showResults(res, items, list);
    } catch (e) {
      if (e.code === 'E-2') {
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
                const { current, history } = buildPrices(Cat.products().filter((p) => !p.sepa), near, Object.fromEntries(Cat.chains().map((c) => [c.id, c])));
                await Cat.addRawPrices(current, history);
                toast('Se generaron 14 sucursales de demostración cerca', 'ok');
                run(false);
              } }, 'Generar sucursales demo cerca')
            ),
            steps('CU-03 · E-2')
          )
        );
        return;
      }
      clear(results).append(h('div', { class: 'card error' }, e.message));
    }
  }

  function showResults(res, items, list) {
    clear(results);
    const dayChoice = { value: 'best' };
    const header = h('div', { class: 'res-head' }, h('h2', {}, 'Resultados'), h('small', { class: 'muted' }, `${res.ctx.stores.length} comercio(s) · ${res.days.length} día(s) · ${res.elapsedMs} ms · ${lastPoint.label}`));
    const excludedNote = st.excludedItems.length ? h('p', { class: 'notice' }, icon('info'), `Calculado sin ${st.excludedItems.length} producto(s) faltante(s). `, h('button', { class: 'link', onclick: () => ((st.excludedItems = []), run(false)) }, 'Volver a incluirlos')) : null;
    results.append(header, excludedNote);
    if (st.multi) return showMulti(res, items, list);

    const body = h('div');
    const chipsRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'Día a comparar' });
    const renderChips = () => {
      clear(chipsRow);
      chipsRow.append(chip(h('span', {}, icon('star', { size: 16 }), ' Mejor día de cada comercio'), { active: dayChoice.value === 'best', onClick: () => ((dayChoice.value = 'best'), renderChips(), renderBody()) }));
      for (const d of res.days) {
        const info = res.byDay.get(d);
        const isBest = res.bestOverall && res.bestOverall.day === d;
        chipsRow.append(chip(h('span', {}, `${DAYS_SHORT[d]} `, h('small', {}, info.min != null ? money(info.min) : 's/d'), isBest ? h('b', { class: 'wave-badge', title: 'Mejor día de la semana' }, ' ★') : null), { active: dayChoice.value === d, onClick: () => ((dayChoice.value = d), renderChips(), renderBody()), title: DAYS[d] }));
      }
    };

    const renderBody = () => {
      clear(body);
      const isBest = dayChoice.value === 'best';
      const rows = res.ctx.stores.map((s) => {
        const b = isBest ? res.byStore.get(s.id) || res.matrix.get(s.id).get(res.days[0]) : res.matrix.get(s.id).get(dayChoice.value);
        return { s, b };
      });
      const complete = rows.filter((r) => r.b.complete).sort((a, b) => a.b.total - b.b.total || a.s.dist - b.s.dist);
      const incomplete = rows.filter((r) => !r.b.complete).sort((a, b) => a.b.missing.length - b.b.missing.length || a.s.dist - b.s.dist);
      const min = complete[0]?.b.total;
      const max = complete.at(-1)?.b.total;

      if (isBest && res.bestOverall) {
        const bs = Cat.store(res.bestOverall.storeId);
        body.append(h('div', { class: 'banner good' }, icon('wave'), h('div', {}, h('strong', {}, `La mejor ola: ${DAYS[res.bestOverall.day]} en ${bs.name}`), h('span', {}, `${money(res.bestOverall.total)} · ahorrás ${money(max - res.bestOverall.total)} frente al más caro`))));
      } else if (!isBest) {
        const best = res.byDay.get(dayChoice.value).best;
        if (best) body.append(h('div', { class: 'banner' }, icon('calendar'), h('div', {}, h('strong', {}, `El ${DAYS[dayChoice.value].toLowerCase()} conviene ir a ${Cat.store(best.storeId).name}`), h('span', {}, money(best.total)))));
      }
      if (!complete.length) body.append(h('p', { class: 'notice' }, icon('alert'), 'Ningún comercio tiene todos los productos. Revisá los faltantes y recalculá sin ellos.'));

      const rank = new Map(complete.map((r, i) => [r.s.id, i + 1]));
      const markers = rows.map(({ s, b }) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        incomplete: !b.complete,
        missing: b.missing.length,
        fill: b.complete ? E.priceColor(b.total, min, max).color : null,
        label: rank.get(s.id),
        order: rank.get(s.id) ? 1000 - rank.get(s.id) : 0,
        title: b.complete ? `${rank.get(s.id)}. ${s.name}: ${money(b.total)}` : `${s.name}: faltan ${b.missing.length} producto(s)`,
      }));
      body.append(svgMap({ center: lastPoint, radiusKm: st.radiusKm, markers, onSelect: (id) => openDetail(id), caption: 'Verde: más barato · Rojo: más caro · «!»: faltan productos (no comparable)' }), legend(min, max));

      const table = h('ol', { class: 'res-list' });
      for (const { s, b } of complete) {
        const col = E.priceColor(b.total, min, max);
        const saving = max - b.total;
        table.append(
          h(
            'li',
            {},
            h(
              'button',
              { class: 'res-row', onclick: () => openDetail(s.id) },
              h('span', { class: 'res-rank', style: { background: col.color } }, String(rank.get(s.id))),
              h('span', { class: 'res-main' }, h('strong', {}, s.name), h('small', {}, `${fmtDistance(s.dist)}${isBest ? ` · mejor día: ${DAYS[b.day]}` : ''}${b.payment.label ? ` · ${b.payment.issuer}` : ''}`)),
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
              { class: 'res-row incomplete', onclick: () => openMissing(s, b) },
              h('span', { class: 'res-rank incomplete', 'aria-hidden': 'true' }, '!'),
              h('span', { class: 'res-main' }, h('strong', {}, s.name), h('small', {}, `${fmtDistance(s.dist)} · total no comparable`)),
              h('span', { class: 'res-total' }, h('span', { class: 'bangs', 'aria-label': `Faltan ${b.missing.length} productos` }, '!'.repeat(b.missing.length)), h('small', {}, 'Ver faltantes'))
            )
          )
        );
      }
      body.append(table);
    };

    // Paso 9: detalle de un comercio con su mejor día
    const openDetail = (storeId) => {
      const s = res.ctx.stores.find((x) => x.id === storeId);
      const row = res.matrix.get(storeId);
      const b = dayChoice.value === 'best' ? res.byStore.get(storeId) : row.get(dayChoice.value);
      if (!b || !b.complete) return openMissing(s, row.get(dayChoice.value === 'best' ? res.days[0] : dayChoice.value));
      const dayRows = res.days.map((d) => row.get(d)).filter((x) => x.complete);
      const minDay = Math.min(...dayRows.map((x) => x.total));
      basketModal({
        title: s.name,
        subtitle: `${DAYS[b.day]} · ${fmtDistance(s.dist)} · ${s.address}`,
        parts: [{ store: s, basket: b }],
        extra: dayRows.length > 1 ? h('div', { class: 'day-strip' }, h('h3', { class: 'h4' }, 'Total por día en este comercio'), h('ul', { class: 'bars' }, dayRows.map((x) => h('li', { class: x.total === minDay ? 'best' : '' }, h('span', {}, DAYS_SHORT[x.day]), h('span', { class: 'bar', style: { width: `${Math.max(8, (minDay / x.total) * 100)}%` } }), h('strong', {}, money(x.total)))))) : null,
        reference: { storeId, day: b.day },
        res,
        items,
        list,
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
    renderBody();
    results.append(chipsRow, body, steps('CU-03 · pasos 1–10 · A-1 · A-3 · A-4 (EP_ResultadosCalculados → CU-04) · E-1 · E-2'));
  }

  function showMulti(res, items, list) {
    // A-2: modalidad multi-comercio, comparando los días bajo esa modalidad
    const plans = res.days.map((d) => res.multi.get(d)).filter(Boolean);
    const complete = plans.filter((p) => p.complete).sort((a, b) => a.total - b.total || a.day - b.day);
    const best = complete[0];
    let sel = best?.day ?? res.days[0];
    const body = h('div');
    const draw = () => {
      clear(body);
      const plan = res.multi.get(sel);
      const single = res.byDay.get(sel).best;
      if (best) body.append(h('div', { class: 'banner good' }, icon('wave'), h('div', {}, h('strong', {}, best.parts.length > 1 ? `Máximo ahorro: ${DAYS[best.day]} repartiendo en ${best.parts.length} comercios` : `Máximo ahorro: ${DAYS[best.day]} — con este costo de traslado conviene un solo comercio`), h('span', {}, `${money(best.total)} + traslado estimado ${money(best.travel)}`))));
      const list2 = h('ul', { class: 'bars big' });
      const minT = Math.min(...complete.map((p) => p.total + p.travel));
      for (const p of plans) {
        list2.append(h('li', { class: [p.day === sel && 'sel', p === best && 'best'] }, h('button', { class: 'bar-btn', onclick: () => ((sel = p.day), draw()) }, h('span', {}, DAYS_SHORT[p.day]), p.complete ? h('span', { class: 'bar', style: { width: `${Math.max(8, (minT / (p.total + p.travel)) * 100)}%` } }) : h('span', { class: 'bangs' }, '!'.repeat(p.missing.length)), h('strong', {}, p.complete ? money(p.total) : 'incompleto'), h('small', {}, `${p.parts.length} com.`))));
      }
      body.append(h('h3', { class: 'h4' }, 'Comparación de días (repartiendo la compra)'), list2);
      const markers = res.ctx.stores.map((s) => {
        const idx = plan.parts.findIndex((p) => p.storeId === s.id);
        return { id: s.id, lat: s.lat, lng: s.lng, fill: idx >= 0 ? 'var(--accent)' : 'var(--muted-dot)', label: idx >= 0 ? idx + 1 : '', order: idx >= 0 ? 100 : 0, title: idx >= 0 ? `${idx + 1}. ${s.name}` : s.name, selected: idx >= 0 };
      });
      body.append(svgMap({ center: lastPoint, radiusKm: st.radiusKm, markers, caption: `Comercios a visitar el ${DAYS[sel].toLowerCase()} (numerados)` }));
      const savingVsSingle = single ? single.total - plan.total - plan.travel : null;
      body.append(
        card(
          h('h3', {}, `${DAYS[sel]}: ${plan.parts.length} comercio(s)`),
          h('p', {}, `Total productos ${money(plan.total)} · traslado estimado ${money(plan.travel)}`),
          single ? h('p', { class: savingVsSingle > 0 ? 'good' : 'muted' }, savingVsSingle > 0 ? `Frente a comprar todo en ${Cat.store(single.storeId).name} (${money(single.total)}) ahorrás ${money(savingVsSingle)} incluyendo el traslado.` : `Comprar todo en ${Cat.store(single.storeId).name} (${money(single.total)}) cuesta lo mismo o menos considerando el traslado.`) : null,
          plan.missing.length ? h('p', { class: 'notice' }, icon('alert'), `Sin oferta en el radio: ${plan.missing.map((m) => L.itemLabel(m)).join(', ')}`) : null,
          h('button', { class: 'btn btn-primary', onclick: () => basketModal({ title: `Compra repartida · ${DAYS[sel]}`, subtitle: `${plan.parts.length} comercio(s)`, parts: plan.parts.map((p) => ({ store: res.ctx.stores.find((s) => s.id === p.storeId), basket: { ...p, day: sel } })), reference: { storeId: plan.parts[0].storeId, day: sel }, res, items, list, travel: plan.travel }) }, 'Ver detalle')
        )
      );
    };
    draw();
    results.append(body, steps('CU-03 · A-2 (modalidad varios comercios)'));
  }

  function basketModal({ title, subtitle, parts, extra, reference, res, items, list, travel }) {
    const content = h('div', { class: 'basket' }, subtitle ? h('p', { class: 'muted' }, subtitle) : null, extra || null);
    let grand = 0;
    for (const { store, basket } of parts) {
      grand += basket.total;
      content.append(
        h(
          'section',
          { class: 'basket-store' },
          parts.length > 1 ? h('h3', { class: 'h4' }, `${store.name} · ${fmtDistance(store.dist)}`) : null,
          h(
            'table',
            { class: 'tbl' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Producto'), h('th', { class: 'num' }, 'Cant.'), h('th', { class: 'num' }, 'Precio'), h('th', { class: 'num' }, 'Subtotal'))),
            h(
              'tbody',
              {},
              basket.lines.map((l) => {
                const p = Cat.product(l.productId);
                return h('tr', {}, h('td', {}, p.name, l.promo ? h('small', { class: 'promo' }, l.promo) : null, l.verified ? h('small', { class: 'verified' }, '✓ verificado por ticket') : null), h('td', { class: 'num' }, String(l.qty)), h('td', { class: 'num' }, money(l.unit)), h('td', { class: 'num' }, l.net < l.gross ? h('span', {}, h('s', { class: 'muted' }, money(l.gross)), h('br'), money(l.net)) : money(l.net)));
              })
            ),
            h('tfoot', {}, h('tr', {}, h('td', { colspan: 3 }, 'Subtotal con ofertas'), h('td', { class: 'num' }, money(basket.subtotal))), basket.payment.discount ? h('tr', { class: 'good' }, h('td', { colspan: 3 }, basket.payment.label), h('td', { class: 'num' }, `−${money(basket.payment.discount)}`)) : null, h('tr', { class: 'total' }, h('td', { colspan: 3 }, 'Total'), h('td', { class: 'num' }, money(basket.total))))
          )
        )
      );
    }
    if (parts.length > 1) content.append(h('p', { class: 'total-line' }, `Total: ${money(grand)} + traslado ${money(travel || 0)}`));
    const rep = Promise.all(parts.map((p) => Cat.reputation(p.store.id)));
    const repEl = h('p', { class: 'muted small' });
    rep.then((r) => (repEl.textContent = `Reputación y ética de promociones (informativa, no altera el ranking): ${r.map((x, i) => `${parts[i].store.name} ${x.score}/100`).join(' · ')}`));
    content.append(repEl);
    const m = modal({
      title,
      wide: true,
      content,
      actions: [
        {
          label: 'Ahorrar más cambiando marcas',
          onClick: async (close) => {
            close();
            // A-4: punto de extensión EP_ResultadosCalculados -> CU-04
            const changed = await openBrandOptimizer({ list, items, ctx: res.ctx, reference });
            if (changed) run(false); // vuelve al paso 5 con la lista actualizada
          },
        },
        {
          label: 'Confirmar opción',
          kind: 'primary',
          onClick: (close) => {
            close();
            confirmOption(parts, reference.day, list);
          },
        },
      ],
    });
    return m;
  }

  // Paso 10: confirmar; continuar en el comercio o con CU-06
  function confirmOption(parts, day, list) {
    modal({
      title: 'Opción confirmada',
      content: h(
        'div',
        {},
        h('p', {}, `${DAYS[day]}: ${parts.map((p) => p.store.name).join(' + ')}.`),
        h(
          'ul',
          { class: 'menu plain' },
          parts.map((p) => {
            const c = Cat.chain(p.store.chainId);
            return h(
              'li',
              {},
              h('div', { class: 'row space' }, h('strong', {}, p.store.name), h('div', { class: 'row' }, h('a', { class: 'btn btn-ghost btn-sm', href: `https://www.openstreetmap.org/?mlat=${p.store.lat}&mlon=${p.store.lng}#map=17/${p.store.lat}/${p.store.lng}`, target: '_blank', rel: 'noopener noreferrer' }, icon('map', { size: 16 }), 'Cómo llegar'), c?.online ? h('button', { class: 'btn btn-secondary btn-sm', onclick: () => openDelivery({ store: p.store, basket: p.basket, list }) }, icon('cart', { size: 16 }), 'Comprar online') : h('small', { class: 'muted' }, 'Sin canal online')))
            );
          })
        ),
        steps('CU-03 · paso 10 → CU-06')
      ),
      actions: [{ label: 'Listo', kind: 'primary', value: true }],
    });
  }

  return h(
    'div',
    { class: 'page' },
    pageHeader('Buscar la mejor compra', { subtitle: 'Día, comercio y medios de pago en una sola búsqueda' }),
    card(
      field('Lista', listSel),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Radio: ', radiusOut), radius),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Días a evaluar'), daysSeg, !hasMyDays ? h('small', { class: 'hint' }, h('a', { href: '#/perfil' }, 'Cargá tus días disponibles'), ' para usar «Mis días».') : null),
      h('label', { class: 'check' }, payChk, h('span', {}, `Aplicar descuentos de mis medios de pago (${profile.payments.length})`, !profile.payments.length ? h('small', { class: 'hint' }, ' — ', h('a', { href: '#/perfil' }, 'cargalos en tu perfil')) : null)),
      h('label', { class: 'check' }, multiChk, h('span', {}, 'Repartir la compra en varios comercios', h('small', { class: 'hint block' }, 'Asigna cada producto al comercio más barato de cada día, ponderando la distancia.'))),
      costWrap,
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
