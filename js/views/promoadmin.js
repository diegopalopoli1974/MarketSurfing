// CU-13 Gestionar Promociones (Colaborador nivel 2 / Administrador): alta, modificación y baja de promociones
// del comercio y de medios de pago con todos los campos del modelo (sección 4.6). Extiende CU-10 en EP_PrecioRegistrado.
import { HELP } from '../ui/help.js';
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, field, steps, setBusy, confirmDialog, chip, segmented, modal } from '../ui/components.js';
import { pickProduct } from '../ui/picker.js';
import * as Cat from '../data/catalog.js';
import * as PR from '../core/promos.js';
import { session, collabLevel, isAdmin } from '../app/session.js';
import { DAYS } from '../core/engine.js';
import { dayKey, PAYMENT_ISSUERS } from '../data/demo-seed.js';
import { storePicker } from './catalog.js';

const canEdit = (p) => !p.demo && (isAdmin() || p.authorId === session.reporterId);

/**
 * Formulario de promoción. preset: valores iniciales (edición o extensión desde CU-10).
 * onSaved(promo) se llama al registrarla.
 */
export function promoForm({ preset = {}, onSaved = () => {} } = {}) {
  const st = {
    cls: preset.type === 'payment' ? 'payment' : 'store',
    scope: preset.storeId ? 'store' : 'chain',
    chainId: preset.chainId || (preset.storeId ? Cat.store(preset.storeId)?.chainId : Cat.chains()[0]?.id),
    store: preset.storeId ? Cat.store(preset.storeId) : null,
    target: preset.productId ? 'product' : preset.generic ? 'generic' : preset.category ? 'category' : preset.id ? 'all' : 'product',
    productId: preset.productId || null,
    generic: preset.generic || null,
    days: preset.days ? [...preset.days] : [],
  };
  const p0 = PR.normalize({ type: preset.type || 'pct', ...preset });
  const num = (v, attrs = {}) => h('input', { type: 'number', class: 'input', inputmode: 'decimal', value: v ?? '', ...attrs });
  const txt = (v, attrs = {}) => h('input', { class: 'input', value: v ?? '', ...attrs });
  const sel = (opts, v, attrs = {}) => h('select', { class: 'input', ...attrs }, opts.map(([k, l]) => h('option', { value: k, selected: k === (v ?? '') }, l)));

  // alcance
  const chainSel = sel(Cat.chains().sort((a, b) => a.name.localeCompare(b.name, 'es')).map((c) => [c.id, c.name]), st.chainId, { onchange: (e) => ((st.chainId = e.target.value), preview()) });
  const storeBox = h('div', {}, storePicker((s) => ((st.store = s), preview()), st.store));
  const scopeSeg = segmented('pscope', [
    { value: 'chain', label: 'Toda la cadena', tip: 'Vale en todas las sucursales de la cadena' },
    { value: 'store', label: 'Una sucursal', tip: 'Vale sólo en la sucursal elegida' },
  ], st.scope, (v) => ((st.scope = v), drawScope(), preview()));
  const scopeBox = h('div');
  const drawScope = () => clear(scopeBox).append(st.scope === 'chain' ? field('Cadena', chainSel) : field('Sucursal', storeBox));

  // promoción del comercio
  const prodBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: async () => {
    const r = await pickProduct({ title: st.target === 'generic' ? 'Producto (cualquier marca)' : 'Producto', allowGeneric: st.target === 'generic' });
    if (!r) return;
    st.productId = st.target === 'product' ? r.productId || Cat.productsByGeneric(r.generic)[0].id : null;
    st.generic = st.target === 'generic' ? r.generic : null;
    drawTarget();
    preview();
  } });
  const category = sel(Cat.categories().map((c) => [c, c]), preset.category, { onchange: () => preview() });
  const targetSeg = segmented('ptarget', [
    { value: 'product', label: 'Un producto', tip: 'Una marca y presentación concretas' },
    { value: 'generic', label: 'Cualquier marca', tip: 'Todas las marcas equivalentes de un producto' },
    { value: 'category', label: 'Una categoría', tip: 'Todos los productos de una categoría' },
    { value: 'all', label: 'Toda la tienda', tip: 'Cualquier producto del comercio' },
  ], st.target, (v) => ((st.target = v), (st.productId = null), (st.generic = null), drawTarget(), preview()));
  const targetBox = h('div');
  const drawTarget = () => {
    clear(prodBtn).append(icon('search', { size: 18 }), st.productId ? Cat.product(st.productId).name : st.generic ? PR.targetLabel({ generic: st.generic }, Cat) : 'Elegir producto');
    clear(targetBox).append(st.target === 'product' || st.target === 'generic' ? prodBtn : st.target === 'category' ? field('Categoría', category) : h('p', { class: 'muted small' }, 'Aplica a todos los productos del comercio.'));
  };
  const mech = sel(Object.entries(PR.MECHANICS), p0.type === 'payment' ? 'pct' : p0.type, { onchange: () => (drawMech(), preview()) });
  const n = num(p0.n ?? 2, { min: 2, max: 10, 'aria-label': 'Llevás' });
  const m = num(p0.m ?? 1, { min: 1, max: 9, 'aria-label': 'Pagás' });
  const pct = num(p0.pct ?? 20, { min: 1, max: 90, 'aria-label': 'Porcentaje' });
  const price = num(p0.price ?? '', { min: 1, step: '0.01', 'aria-label': 'Precio por unidad' });
  const minQty = num(p0.type !== 'payment' && preset.id ? p0.minQty : '', { min: 1, max: 50, placeholder: 'automática' });
  const maxUnits = num(p0.maxUnits ?? '', { min: 1, max: 99, placeholder: 'sin tope' });
  const mechBox = h('div', { class: 'grid3' });
  const drawMech = () => {
    clear(mechBox);
    if (mech.value === 'nxm') mechBox.append(field('Llevás (N)', n), field('Pagás (M)', m));
    else if (mech.value === 'second' || mech.value === 'pct') mechBox.append(field(mech.value === 'second' ? '% de descuento en la 2da unidad' : '% de descuento', pct));
    else mechBox.append(field('Precio por unidad ($)', price));
    mechBox.append(field('Cantidad mínima', minQty, null, 'Vacío = la propia de la mecánica (N en NxM, 2 en segunda unidad, 1 en el resto).'), field('Máx. unidades con promoción', maxUnits, null, 'Unidades por compra; las que superen el tope se cobran a precio de lista.'));
  };
  const storeBoxAll = h('div', { class: 'stack' }, field('Aplica a', h('div', { class: 'stack' }, targetSeg, targetBox)), field('Mecánica', mech), mechBox);

  // promoción de medio de pago
  const issuer = sel([['', 'Emisor…'], ...Object.keys(PAYMENT_ISSUERS).map((k) => [k, k])], p0.issuer);
  const kind = sel([['', 'Cualquier tipo'], ...Object.entries(PR.KINDS)], p0.kind);
  const network = sel([['', 'Cualquier red'], ...PR.NETWORKS.map((x) => [x, x])], p0.network);
  const ppct = num(p0.type === 'payment' ? p0.pct : 20, { min: 1, max: 90 });
  const cap = num(p0.cap ?? '', { min: 1, placeholder: 'sin tope' });
  const capPeriod = sel(Object.entries(PR.CAP_PERIODS), p0.capPeriod || 'compra');
  const minPurchase = num(p0.minPurchase ?? '', { min: 1, placeholder: 'sin mínimo' });
  const mode = sel(Object.entries(PR.MODES), p0.mode || 'caja');
  const payBox = h('div', { class: 'stack' }, h('div', { class: 'grid3' }, field('Emisor', issuer), field('Tipo de medio', kind), field('Red', network, null, 'Sólo para tarjetas.')), h('div', { class: 'grid3' }, field('% de descuento', ppct), field('Tope de descuento ($)', cap), field('Período del tope', capPeriod, null, 'Por compra, por semana (lunes a domingo) o por mes calendario.')), h('div', { class: 'grid2' }, field('Compra mínima ($)', minPurchase), field('Modalidad', mode)));

  // comunes
  const daysBox = h('div', { class: 'chips' });
  const drawDays = () => {
    clear(daysBox);
    [1, 2, 3, 4, 5, 6, 0].forEach((d) => daysBox.append(chip(PR.DAYS_SHORT[d], { title: DAYS[d], active: st.days.includes(d), onClick: () => ((st.days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d]), drawDays(), preview()) })));
  };
  const from = h('input', { type: 'date', class: 'input', value: p0.from || dayKey() });
  const until = h('input', { type: 'date', class: 'input', value: p0.until || '' });
  const membership = txt(p0.membership, { list: 'ms-memb', maxlength: 60, placeholder: 'Ninguno' });
  const condition = txt(p0.condition, { maxlength: 120, placeholder: 'Ninguna (ej.: presentando la app del comercio)' });
  const known = h('datalist', { id: 'ms-memb' }, [...new Set(Cat.promos().map((p) => p.membership).filter(Boolean))].map((x) => h('option', { value: x })));

  const clsBox = h('div');
  const clsSeg = segmented('pcls', [
    { value: 'store', label: 'Del comercio', tip: 'Ofertas sobre productos: NxM, segunda unidad, porcentaje o precio especial' },
    { value: 'payment', label: 'De medio de pago', tip: 'Descuento o reintegro de un banco, billetera o tarjeta' },
  ], st.cls, (v) => ((st.cls = v), drawCls(), preview()));
  const drawCls = () => clear(clsBox).append(st.cls === 'store' ? storeBoxAll : payBox);
  const out = h('p', { class: 'promo-preview', 'aria-live': 'polite' });
  const err = h('p', { class: 'form-error', role: 'alert' });

  const build = () => {
    const base = {
      id: preset.id || `man-${Date.now().toString(36)}`,
      chainId: st.scope === 'chain' ? st.chainId : null,
      storeId: st.scope === 'store' ? st.store?.id || null : null,
      days: st.days.length ? [...st.days].sort((a, b) => a - b) : null,
      from: from.value || null,
      until: until.value || null,
      membership: membership.value.trim() || null,
      condition: condition.value.trim() || null,
      source: preset.source && preset.id ? preset.source : 'manual',
      author: preset.author || session.account.displayName,
      authorId: preset.authorId || session.reporterId,
      createdAt: preset.createdAt || Date.now(),
      updatedAt: preset.id ? Date.now() : null,
    };
    if (st.cls === 'payment')
      return { ...base, type: 'payment', issuer: issuer.value, kind: kind.value || null, network: network.value || null, pct: +ppct.value, cap: cap.value ? +cap.value : null, capPeriod: capPeriod.value, minPurchase: minPurchase.value ? +minPurchase.value : null, mode: mode.value };
    const t = mech.value;
    const defMin = t === 'nxm' ? +n.value : t === 'second' ? 2 : 1;
    return {
      ...base,
      type: t,
      productId: st.target === 'product' ? st.productId : null,
      generic: st.target === 'generic' ? st.generic : null,
      category: st.target === 'category' ? category.value : null,
      ...(t === 'nxm' ? { n: +n.value, m: +m.value } : {}),
      ...(t === 'second' || t === 'pct' ? { pct: +pct.value } : {}),
      ...(t === 'price' ? { price: +price.value } : {}),
      minQty: minQty.value ? +minQty.value : defMin,
      maxUnits: maxUnits.value ? +maxUnits.value : null,
    };
  };
  // Paso 3: validación (E-1)
  const validate = (p) => {
    if (p.chainId == null && p.storeId == null) return 'Elegí la cadena o la sucursal';
    if (p.from && p.until && p.until < p.from) return 'La fecha «hasta» no puede ser anterior a «desde»';
    if (p.until && p.until < dayKey()) return 'La promoción ya estaría vencida: revisá la fecha «hasta»';
    if (p.type === 'payment') {
      if (!p.issuer) return 'Elegí el emisor';
      if (!(p.pct >= 1 && p.pct <= 90)) return 'El porcentaje debe estar entre 1 y 90';
      if (p.network && (p.kind === 'billetera' || p.kind === 'efectivo')) return 'La red sólo corresponde a tarjetas';
      if (p.cap != null && !(p.cap > 0)) return 'El tope debe ser mayor a cero';
      if (p.minPurchase != null && !(p.minPurchase > 0)) return 'La compra mínima debe ser mayor a cero';
      return null;
    }
    if ((st.target === 'product' && !p.productId) || (st.target === 'generic' && !p.generic)) return 'Elegí el producto';
    if (p.type === 'nxm' && !(p.n >= 2 && p.n <= 10 && p.m >= 1 && p.m < p.n)) return 'En NxM, N debe estar entre 2 y 10 y M ser menor que N';
    if ((p.type === 'pct' || p.type === 'second') && !(p.pct >= 1 && p.pct <= 100)) return 'El porcentaje debe estar entre 1 y 100';
    if (p.type === 'price' && !(p.price > 0)) return 'Ingresá el precio especial por unidad';
    const defMin = p.type === 'nxm' ? p.n : p.type === 'second' ? 2 : 1;
    if (p.minQty < defMin) return `La cantidad mínima no puede ser menor que ${defMin} para esta mecánica`;
    if (p.maxUnits != null && p.maxUnits < p.minQty) return 'El máximo de unidades no puede ser menor que la cantidad mínima';
    return null;
  };
  const preview = () => {
    const p = build();
    out.textContent = `Vista previa: ${PR.label(p, Cat)}`;
  };
  [n, m, pct, price, minQty, maxUnits, issuer, kind, network, ppct, cap, capPeriod, minPurchase, mode, from, until, membership, condition, category].forEach((x) => x.addEventListener('input', preview));

  const save = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: async () => {
    err.textContent = '';
    const p = build();
    const e = validate(p);
    if (e) return (err.textContent = e); // E-1: vuelve al paso 2
    setBusy(save, true, 'Guardando…');
    await Cat.addPromo(p); // paso 4
    await Cat.logReport({ kind: 'manual', what: 'promoción', promoId: p.id, reporter: session.reporterId, author: session.account.displayName, label: PR.label(p, Cat) }); // paso 5
    setBusy(save, false);
    toast(preset.id ? 'Promoción modificada' : 'Promoción registrada: ya se aplica en las búsquedas', 'ok', 5000); // paso 6
    onSaved(p);
  } }, icon('check'), preset.id ? 'Guardar cambios' : 'Registrar promoción');

  drawScope();
  drawTarget();
  drawMech();
  drawDays();
  drawCls();
  preview();
  return h(
    'div',
    { class: 'stack' },
    field('Clase de promoción', preset.id || preset.fixedClass ? h('strong', {}, st.cls === 'payment' ? 'De medio de pago' : 'Del comercio') : clsSeg),
    field('Alcance', h('div', { class: 'stack' }, scopeSeg, scopeBox)),
    clsBox,
    field('Días de la semana', daysBox, null, 'Vacío = todos los días.'),
    h('div', { class: 'grid2' }, field('Vigente desde', from), field('Vigente hasta', until, null, 'Vacío = sin fecha de fin.')),
    h('div', { class: 'grid2' }, field('Requiere ser socio de', membership, null, 'Programa de fidelidad del comercio o del banco. Sólo se aplica a quien lo tenga en su perfil.'), field('Otra condición', condition, null, 'Se muestra al usuario; la app no puede verificarla.')),
    known,
    out,
    err,
    h('div', { class: 'row end' }, save)
  );
}

export async function render() {
  if (collabLevel() < 2)
    return h('div', { class: 'page' }, pageHeader('Gestionar promociones', { help: HELP.promoadmin }), empty('lock', 'Función para Colaboradores nivel 2', 'Las promociones las cargan los Colaboradores nivel 2 y el Administrador.'), steps('CU-13 · precondición'));
  const body = h('div');
  const draw = () => clear(body).append(listCard(draw));
  draw();
  return h(
    'div',
    { class: 'page' },
    pageHeader('Gestionar promociones', { subtitle: 'Alta, modificación y baja de promociones del comercio y de medios de pago', help: HELP.promoadmin }),
    card(h('button', { class: 'btn btn-primary btn-block', onclick: () => openForm({}, draw) }, icon('plus'), 'Nueva promoción')),
    body,
    steps('CU-13 · pasos 1–6 · A-1 · A-2 · E-1')
  );
}

function openForm(preset, redraw) {
  let mdl;
  mdl = modal({ title: preset.id ? 'Modificar promoción' : 'Nueva promoción', wide: true, content: promoForm({ preset, onSaved: () => (mdl.close(), redraw()) }) });
}

function listCard(redraw) {
  const mine = Cat.promos().filter(canEdit).map(PR.normalize).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  if (!mine.length) return card(h('p', { class: 'muted' }, isAdmin() ? 'No hay promociones cargadas por usuarios.' : 'Todavía no cargaste promociones.'));
  return card(
    h('h2', { class: 'h3' }, isAdmin() ? 'Promociones cargadas por usuarios' : 'Mis promociones'),
    h(
      'ul',
      { class: 'log' },
      mine.map((p) =>
        h(
          'li',
          { class: 'row space' },
          h('span', {}, h('strong', {}, p.storeId ? Cat.store(p.storeId)?.name || 'Sucursal eliminada' : Cat.chains().find((c) => c.id === p.chainId)?.name || p.chainId), ` · ${PR.label(p, Cat)}`, h('br'), h('small', { class: 'muted' }, `${PR.SOURCES[p.source] || p.source}${p.author ? ` · ${p.author}` : ''}${p.createdAt ? ` · ${new Date(p.createdAt).toLocaleDateString('es-AR')}` : ''}`)),
          h(
            'span',
            { class: 'row' },
            h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Modificar los datos (A-1)', onclick: () => openForm(p, redraw) }, icon('edit', { size: 16 }), 'Modificar'),
            h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Dar de baja la promoción (A-2)', onclick: async () => {
              if (!(await confirmDialog('Dar de baja', `¿Dar de baja «${PR.label(p, Cat)}»? Deja de aplicarse en las búsquedas.`, { ok: 'Dar de baja', danger: true }))) return;
              await Cat.removePromo(p.id);
              await Cat.logReport({ kind: 'manual', what: 'baja de promoción', reporter: session.reporterId, author: session.account.displayName, label: PR.label(p, Cat) });
              toast('Promoción dada de baja', 'ok');
              redraw();
            } }, icon('trash', { size: 16 }), 'Dar de baja')
          )
        )
      )
    )
  );
}
