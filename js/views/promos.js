// CU-12 Consultar Promociones: calendario de promociones de medios de pago (cadena × día) y promociones de los comercios,
// con todos sus datos y, para cada una, si el Comprador puede usarla según su perfil (medios de pago y programas de socios).
import { HELP } from '../ui/help.js';
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, segmented, field, steps } from '../ui/components.js';
import * as Cat from '../data/catalog.js';
import * as PR from '../core/promos.js';
import * as UD from '../core/userdata.js';
import { DAYS } from '../core/engine.js';
import { dayKey } from '../data/demo-seed.js';

const ORDER_DAYS = [1, 2, 3, 4, 5, 6, 0];

export async function render({ query }) {
  const profile = UD.get('profile');
  const ctx = { memberships: new Set(profile.memberships || []), payments: profile.payments };
  const st = { cls: query.get('t') === 'comercio' ? 'store' : 'payment', chainId: '', day: '', text: '', onlyMine: false };
  const chainName = (p) => (p.storeId ? Cat.store(p.storeId)?.name || 'Sucursal' : Cat.chains().find((c) => c.id === p.chainId)?.name || p.chainId);
  const chainOfPromo = (p) => p.chainId || Cat.store(p.storeId)?.chainId;
  // Paso 4: ¿puede usarla el Comprador? (motivo si no)
  const usable = (p) => {
    if (p.membership && !ctx.memberships.has(p.membership)) return `requiere ser socio (${p.membership})`;
    if (PR.isPayment(p) && !PR.matchingMedium(p, ctx.payments)) return `no tenés ${p.issuer}${p.kind ? ` (${PR.KINDS[p.kind].toLowerCase()}${p.network ? ` ${p.network}` : ''})` : ''} en tu perfil`;
    return null;
  };

  const out = h('div', { 'aria-live': 'polite' });
  const chainSel = h('select', { class: 'input', onchange: (e) => ((st.chainId = e.target.value), draw()) }, [h('option', { value: '' }, 'Todas las cadenas'), ...Cat.chains().sort((a, b) => a.name.localeCompare(b.name, 'es')).map((c) => h('option', { value: c.id }, c.name))]);
  const daySel = h('select', { class: 'input', onchange: (e) => ((st.day = e.target.value), draw()) }, [h('option', { value: '' }, 'Todos los días'), ...ORDER_DAYS.map((d) => h('option', { value: String(d) }, DAYS[d]))]);
  const text = h('input', { class: 'input', type: 'search', placeholder: 'Producto, categoría o emisor', oninput: (e) => ((st.text = e.target.value.trim().toLowerCase()), draw()) });
  const mine = h('label', { class: 'check', 'data-tip': 'Muestra sólo las promociones que podés usar con los medios de pago y programas de socios de tu perfil' }, h('input', { type: 'checkbox', onchange: (e) => ((st.onlyMine = e.target.checked), draw()) }), h('span', {}, 'Sólo las que puedo usar'));
  const clsSeg = segmented('pcls', [
    { value: 'payment', label: 'Medios de pago', icon: 'card', tip: 'Descuentos y reintegros de bancos, billeteras y tarjetas, por cadena y día' },
    { value: 'store', label: 'De los comercios', icon: 'ticket', tip: 'Ofertas sobre productos: NxM, segunda unidad, porcentaje o precio especial' },
  ], st.cls, (v) => ((st.cls = v), draw()));

  function draw() {
    // Pasos 3 a 5
    const today = dayKey();
    const all = Cat.promos()
      .map(PR.normalize)
      .filter((p) => (st.cls === 'payment' ? PR.isPayment(p) : !PR.isPayment(p)))
      .filter((p) => !p.until || p.until >= today)
      .filter((p) => !st.chainId || chainOfPromo(p) === st.chainId)
      .filter((p) => st.day === '' || !p.days || p.days.includes(+st.day))
      .filter((p) => !st.text || `${PR.label(p, Cat)} ${chainName(p)}`.toLowerCase().includes(st.text))
      .filter((p) => !st.onlyMine || !usable(p));
    clear(out);
    if (!all.length) {
      out.append(empty('search', 'No hay promociones que coincidan', 'Probá con otros filtros.'), steps('CU-12 · E-1'));
      return;
    }
    if (st.cls === 'payment') out.append(calendar(all));
    const groups = new Map();
    for (const p of all) {
      const k = chainName(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    for (const [name, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')))
      out.append(
        card(
          h('h2', { class: 'h4' }, name),
          h(
            'ul',
            { class: 'promo-list' },
            list.map((p) => {
              const why = usable(p);
              return h('li', { class: why ? 'no' : 'yes' }, h('span', { class: 'promo-state', 'aria-hidden': 'true' }, why ? '✗' : '✓'), h('span', {}, PR.label(p, Cat), h('small', { class: 'block muted' }, `${why ? `No la podés usar: ${why}` : 'La podés usar'} · fuente: ${PR.SOURCES[p.source] || p.source}${p.author ? ` (${p.author})` : ''}${p.storeId ? ' · sólo esta sucursal' : ' · todas las sucursales de la cadena'}`)));
            })
          )
        )
      );
    out.append(steps('CU-12 · pasos 1–5 · A-1 · A-2 · E-1'));
  }

  /** Calendario cadena × día de las promociones de medios de pago (como una grilla de tarifas). */
  function calendar(list) {
    const chains = [...new Set(list.map(chainOfPromo))].map((id) => Cat.chains().find((c) => c.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return h(
      'div',
      { class: 'matrix-wrap' },
      h(
        'table',
        { class: 'tbl matrix' },
        h('caption', {}, 'Promociones de medios de pago por cadena y día · en negrita las que podés usar · el detalle completo está debajo'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Cadena'), ORDER_DAYS.map((d) => h('th', { scope: 'col' }, DAYS[d].slice(0, 3))))),
        h(
          'tbody',
          {},
          chains.map((c) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, c.name),
              ORDER_DAYS.map((d) => {
                const ps = list.filter((p) => chainOfPromo(p) === c.id && (!p.days || p.days.includes(d)));
                return h('td', { class: 'cal-cell' }, ps.map((p) => h('div', { class: usable(p) ? 'cal-item muted' : 'cal-item mine', title: PR.label(p, Cat) }, `${p.pct} % ${p.issuer}`, p.cap ? h('small', { class: 'block' }, `tope $${p.cap.toLocaleString('es-AR')} ${PR.CAP_PERIODS[p.capPeriod]}`) : null)));
              })
            )
          )
        )
      )
    );
  }

  draw();
  return h(
    'div',
    { class: 'page' },
    pageHeader('Promociones', { subtitle: 'De medios de pago y de los comercios, con días, topes y condiciones', help: HELP.promos }),
    card(clsSeg, h('div', { class: 'grid3' }, field('Cadena', chainSel), field('Día', daySel), field('Buscar', text)), mine, h('p', { class: 'small' }, '¿Te falta un medio de pago o un programa de socios? ', h('a', { href: '#/perfil' }, 'Cargalo en tu perfil'), '.')),
    out
  );
}
