// CU-10 Cargar Comercios, Productos y Precios en forma manual (Colaborador nivel 2 / Administrador).
// El alta de comercio (A-1) y de producto (A-2) se hace dentro de la carga del precio y vuelve al paso 2 con lo nuevo elegido.
import { HELP } from '../ui/help.js';
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, field, steps, setBusy, confirmDialog, chip, modal } from '../ui/components.js';
import { pickProduct } from '../ui/picker.js';
import * as Cat from '../data/catalog.js';
import * as Geo from '../core/geo.js';
import { session, collabLevel, isAdmin } from '../app/session.js';
import { money, DAYS_SHORT, DAYS } from '../core/engine.js';
import { dayKey } from '../data/demo-seed.js';

const UNITS = [
  ['g', 'gramos (g)'],
  ['kg', 'kilos (kg)'],
  ['ml', 'mililitros (ml)'],
  ['l', 'litros (L)'],
  ['u', 'unidades (u)'],
];

const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function eanCheckDigit(d) {
  let sum = 0;
  const body = d.slice(0, -1);
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}
export function validEan(code) {
  const d = String(code || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(d.length)) return false;
  return eanCheckDigit(d) === Number(d.at(-1));
}
function internalEan() {
  // prefijo 29 = código interno (no colisiona con productos reales)
  const body = '29' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
  const tmp = body + '0';
  return body + eanCheckDigit(tmp);
}

async function log(entry) {
  await Cat.logReport({ kind: 'manual', reporter: session.reporterId, author: session.account.displayName, ...entry });
}

export async function render({ query }) {
  if (collabLevel() < 2)
    return h('div', { class: 'page' }, pageHeader('Cargar catálogo', { help: HELP.catalog }), empty('lock', 'Función para Colaboradores nivel 2', 'La carga manual de comercios, productos y precios la hacen los Colaboradores nivel 2 y el Administrador. El nivel 2 lo otorga el Administrador desde «Seguridad y cuenta».'), steps('CU-10 · precondición'));
  let tab = query.get('t') === 'mias' ? 'mias' : 'precio';
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div');
  const draw = () => {
    clear(tabs);
    for (const [id, label, ic, tip] of [
      ['precio', 'Cargar precio', 'ticket', 'Registrar el precio (y la promoción) de un producto en un comercio; si el comercio o el producto no existen, los das de alta en el mismo paso'],
      ['mias', isAdmin() ? 'Cargas manuales' : 'Mis cargas', 'list', 'Ver y eliminar lo que se cargó a mano'],
    ])
      tabs.append(h('button', { role: 'tab', class: ['tab', tab === id && 'active'], 'aria-selected': tab === id ? 'true' : 'false', 'data-tip': tip, onclick: () => ((tab = id), draw()) }, icon(ic, { size: 18 }), label));
    Promise.resolve(tab === 'precio' ? priceForm() : myLoads(draw)).then((el) => clear(body).append(el));
  };
  draw();
  return h('div', { class: 'page' }, pageHeader('Cargar catálogo', { subtitle: 'Precios, comercios y productos cargados a mano', help: HELP.catalog }), tabs, body, steps('CU-10 · pasos 1–7 · A-1 · A-2 · A-3 · E-1 · E-2'));
}

// ---------- Selector de sucursal ----------
function storePicker(onPick, selected, onNew) {
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar por cadena, barrio, localidad o dirección', 'data-tip': 'Escribí parte del nombre de la cadena, el barrio o la dirección' });
  const list = h('ul', { class: 'pick-list compact' });
  const chosen = h('p', { class: 'loc-chosen' }, selected ? `Elegido: ${selected.name}` : 'Ningún comercio elegido');
  const show = (stores) => {
    clear(list);
    for (const s of stores)
      list.append(h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: () => {
        chosen.textContent = `Elegido: ${s.name} — ${s.address}`;
        clear(list);
        q.value = '';
        onPick(s);
      } }, icon('store', { size: 18 }), h('span', {}, h('strong', {}, s.name), h('small', {}, `${s.address}${s.barrio ? ` · ${s.barrio}` : ''}${s.dist != null ? ` · ${Geo.fmtDistance(s.dist)}` : ''}`)))));
    if (!stores.length && q.value.trim()) list.append(h('li', { class: 'muted pad' }, 'No está en el catálogo: usá «Nuevo comercio».'));
  };
  q.addEventListener('input', () => {
    const n = norm(q.value.trim());
    show(n ? Cat.stores().filter((s) => norm(`${s.name} ${s.barrio} ${s.address}`).includes(n)).slice(0, 20) : []);
  });
  const near = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-tip': 'Lista las sucursales más cercanas a tu ubicación actual', onclick: async () => {
    try {
      const p = await Geo.gpsPosition();
      show(Cat.stores().map((s) => ({ ...s, dist: Geo.distanceKm(p, s) })).sort((a, b) => a.dist - b.dist).slice(0, 10));
    } catch (e) {
      toast(e.message, 'error');
    }
  } }, icon('gps', { size: 16 }), 'Más cercanos');
  const pick = (s) => {
    chosen.textContent = `Elegido: ${s.name} — ${s.address}`;
    clear(list);
    q.value = '';
    onPick(s);
  };
  const el = h('div', { class: 'stack' }, q, h('div', { class: 'row' }, near, onNew ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-tip': 'El comercio no está en el catálogo: darlo de alta y seguir con el precio (A-1)', onclick: () => onNew(pick) }, icon('plus', { size: 16 }), 'Nuevo comercio') : null), list, chosen);
  return el;
}

// ---------- Precio ----------
function priceForm() {
  const st = { store: null, product: null, days: [] };
  const prodBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-block', 'data-tip': 'Buscá el producto por nombre, marca o código de barras', onclick: async () => {
    const r = await pickProduct({ allowGeneric: false, title: 'Producto' });
    if (!r) return;
    st.product = Cat.product(r.productId);
    clear(prodBtn).append(icon('edit', { size: 18 }), st.product.name);
    refreshCurrent();
  } }, icon('search', { size: 18 }), 'Elegir producto');
  const current = h('p', { class: 'muted small' });
  const refreshCurrent = async () => {
    if (!st.store || !st.product) return (current.textContent = '');
    const c = await Cat.currentPrice(st.store.id, st.product.id);
    current.textContent = c ? `Precio vigente: ${money(c.price)} (${c.date}, fuente: ${c.source})` : 'Sin precio vigente en este comercio.';
  };
  const price = h('input', { type: 'number', class: 'input', min: 1, step: '0.01', inputmode: 'decimal' });
  const date = h('input', { type: 'date', class: 'input', value: dayKey(), max: dayKey() });
  const promo = h('select', { class: 'input' }, [
    h('option', { value: '' }, 'Sin promoción'),
    ...['2x1', '3x2', '4x3', '2da al 50 %', '2da al 70 %', '2da al 80 %', '10 %', '15 %', '20 %', '25 %', '30 %', '35 %', '40 %'].map((x) => h('option', { value: x }, x)),
  ]);
  const daysBox = h('div', { class: 'chips' });
  const drawDays = () => {
    clear(daysBox);
    [1, 2, 3, 4, 5, 6, 0].forEach((d) => daysBox.append(chip(DAYS_SHORT[d], { title: DAYS[d], active: st.days.includes(d), onClick: () => ((st.days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d]), drawDays()) })));
  };
  drawDays();
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: async () => {
    err.textContent = '';
    const v = Number(price.value);
    if (!st.store) return (err.textContent = 'Elegí el comercio');
    if (!st.product) return (err.textContent = 'Elegí el producto');
    if (!(v > 0 && v < 50_000_000)) return (err.textContent = 'Ingresá un precio válido');
    const prev = await Cat.currentPrice(st.store.id, st.product.id);
    if (date.value > dayKey()) return (err.textContent = 'La fecha no puede ser futura');
    if (prev && (v < prev.price * 0.3 || v > prev.price * 3)) {
      if (!(await confirmDialog('Precio muy distinto', `El precio vigente es ${money(prev.price)}. ¿Confirmás ${money(v)}?`, { ok: 'Sí, es correcto' }))) return;
    }
    setBusy(save, true, 'Guardando…');
    await Cat.recordPrice({ storeId: st.store.id, productId: st.product.id, price: Math.round(v), source: 'manual', date: date.value || dayKey() });
    if (promo.value) {
      const p = parsePromo(promo.value);
      await Cat.addPromo({ id: `man-${st.store.id}-${st.product.id}`, storeId: st.store.id, chainId: null, productId: st.product.id, days: st.days.length ? [...st.days].sort() : null, manual: true, label: `${p.label} en ${st.product.name}${st.days.length ? ` (${st.days.sort().map((d) => DAYS_SHORT[d]).join(', ')})` : ''}`, ...p });
    }
    await log({ what: 'precio', storeId: st.store.id, productId: st.product.id, label: `${st.product.name} · ${money(v)} en ${st.store.name}${promo.value ? ` · ${promo.value}` : ''}` });
    setBusy(save, false);
    toast('Precio registrado como nueva versión. Quedó en «Mis cargas».', 'ok');
    price.value = '';
    promo.value = '';
    refreshCurrent();
  } }, icon('check'), 'Guardar precio');
  return card(
    h('h2', { class: 'h3' }, 'Registrar un precio'),
    field('Comercio', storePicker((s) => ((st.store = s), refreshCurrent()), null, (pick) => newEntityModal('Nuevo comercio', (done) => storeForm(done), pick))),
    field('Producto', h('div', { class: 'stack' }, prodBtn, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', 'data-tip': 'El producto o la marca no están en el catálogo: darlos de alta y seguir con el precio (A-2)', onclick: () => newEntityModal('Nuevo producto', (done) => productForm(done), (p) => ((st.product = p), clear(prodBtn).append(icon('edit', { size: 18 }), p.name), refreshCurrent())) }, icon('plus', { size: 16 }), 'Nuevo producto'))), null, 'Buscá el producto; si no existe, dalo de alta con «Nuevo producto».'),
    current,
    h('div', { class: 'grid2' }, field('Precio de lista ($)', price, null, 'El precio de góndola por unidad, sin descuentos.'), field('Fecha del precio', date, null, 'Cuándo viste o confirmaste el precio. No puede ser futura.')),
    field('Promoción (opcional)', promo, null, 'Oferta del comercio para este producto. Se aplica en las búsquedas a partir de ahora.'),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Días de la promoción (vacío = todos)'), daysBox),
    err,
    h('div', { class: 'row end' }, save)
  );
}

function parsePromo(v) {
  let m;
  if ((m = v.match(/^(\d)x(\d)$/))) return { type: 'nxm', n: +m[1], m: +m[2], label: v };
  if ((m = v.match(/^2da al (\d+)/))) return { type: 'second', pct: +m[1], label: `2da unidad al ${m[1]} %` };
  m = v.match(/^(\d+)/);
  return { type: 'pct', pct: +m[1], label: `${m[1]} % de descuento` };
}

// ---------- Comercio ----------
function storeForm(afterSave) {
  const chains = Cat.chains().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const chainSel = h('select', { class: 'input' }, [...chains.map((c) => h('option', { value: c.id }, c.name)), h('option', { value: '__new' }, '+ Nueva cadena o comercio independiente…')]);
  const newChain = h('input', { class: 'input', maxlength: 40, placeholder: 'Ej.: Supermercado El Sol' });
  const newChainWrap = h('div', { hidden: true }, field('Nombre de la cadena o comercio', newChain));
  chainSel.addEventListener('change', () => (newChainWrap.hidden = chainSel.value !== '__new'));
  const branch = h('input', { class: 'input', maxlength: 50, placeholder: 'Ej.: Caseros Centro' });
  const addr = h('input', { class: 'input', maxlength: 100, placeholder: 'Ej.: Bouchard 2855, Caseros', enterkeyhint: 'search' });
  const locOut = h('p', { class: 'loc-chosen' }, 'Sin ubicar todavía');
  const results = h('ul', { class: 'pick-list compact' });
  let point = null;
  const setPoint = (p, label) => {
    point = { lat: p.lat, lng: p.lng };
    locOut.textContent = `Ubicado: ${label} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
    clear(results);
  };
  const geocode = async () => {
    if (addr.value.trim().length < 5) return toast('Escribí la dirección: calle, altura y localidad', 'info');
    clear(results).append(h('li', { class: 'muted pad' }, 'Buscando…'));
    try {
      const r = await Geo.searchAddressOnline(addr.value);
      clear(results);
      for (const x of r) results.append(h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: () => setPoint(x, x.name) }, icon('pin', { size: 18 }), h('span', {}, x.name))));
    } catch (e) {
      clear(results).append(h('li', { class: 'form-error pad' }, e.message));
    }
  };
  addr.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), geocode()));
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: async () => {
    err.textContent = '';
    let chainId = chainSel.value;
    let chain = Cat.chain(chainId);
    if (chainId === '__new') {
      const name = newChain.value.trim();
      if (name.length < 2) return (err.textContent = 'Escribí el nombre de la cadena o comercio');
      const existing = Cat.chains().find((c) => norm(c.name) === norm(name));
      if (existing) chain = existing;
      else {
        chain = { id: `man-${slug(name)}-${Date.now().toString(36)}`, name, factor: 1, manual: true };
        await Cat.addChains([chain]);
      }
      chainId = chain.id;
    }
    if (!point) return (err.textContent = 'Ubicá el comercio por dirección o con tu GPS');
    if (point.lat > -21 || point.lat < -56 || point.lng > -53 || point.lng < -74) return (err.textContent = 'La ubicación está fuera de Argentina');
    const dup = Cat.stores().find((s) => s.chainId === chainId && Geo.distanceKm(point, s) < 0.05);
    if (dup) return (err.textContent = `Ya existe «${dup.name}» a menos de 50 m`);
    const addrText = addr.value.trim() || 'Ubicada por GPS';
    const locality = addrText.split(',').slice(1).join(',').trim();
    const store = { id: `man-${crypto.randomUUID().slice(0, 8)}`, chainId, name: `${chain.name} ${branch.value.trim() || locality || ''}`.trim(), lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)), address: addrText.split(',')[0], barrio: locality, manual: true, createdBy: session.reporterId, createdAt: Date.now() };
    await Cat.addStores([store]);
    await log({ what: 'comercio', storeId: store.id, label: `${store.name} — ${addrText}` });
    toast(`Comercio «${store.name}» agregado`, 'ok', 4000);
    afterSave?.(store);
  } }, icon('check'), 'Guardar comercio');
  return h(
    'div',
    { class: 'stack' },
    field('Cadena', chainSel, null, 'Si es una sucursal de una cadena conocida, elegila: así comparte las promociones bancarias de la cadena.'),
    newChainWrap,
    field('Nombre de la sucursal (opcional)', branch, 'Si lo dejás vacío se usa la localidad'),
    field('Dirección', addr, 'Calle y altura, localidad. Presioná Enter o «Ubicar».', 'Se busca en el servicio oficial Georef y en OpenStreetMap (requiere conexión).'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-secondary', onclick: geocode, 'data-tip': 'Busca la dirección escrita y te deja elegir el resultado correcto' }, icon('search', { size: 18 }), 'Ubicar dirección'), h('button', { type: 'button', class: 'btn btn-ghost', 'data-tip': 'Usa tu posición actual (ideal si estás en el local)', onclick: async () => {
      try {
        const p = await Geo.gpsPosition();
        setPoint(p, `mi ubicación (±${Math.round(p.accuracy)} m)`);
      } catch (e) {
        toast(e.message, 'error');
      }
    } }, icon('gps', { size: 18 }), 'Estoy en el local')),
    results,
    locOut,
    err,
    h('div', { class: 'row end' }, save)
  );
}

// ---------- Producto ----------
function productForm(afterSave) {
  const gens = Cat.generics().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const cats = Cat.categories();
  let mode = 'existing';
  const genQ = h('input', { class: 'input', type: 'search', placeholder: 'Ej.: sal fina, leche entera…' });
  const genList = h('ul', { class: 'pick-list compact' });
  let generic = null;
  const genChosen = h('p', { class: 'loc-chosen' }, 'Ningún genérico elegido');
  genQ.addEventListener('input', () => {
    const n = norm(genQ.value.trim());
    clear(genList);
    if (!n) return;
    for (const g of gens.filter((g) => norm(`${g.name} ${g.category}`).includes(n)).slice(0, 15))
      genList.append(h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: () => {
        generic = g;
        genChosen.textContent = `Genérico: ${g.name} ${g.presentation} (${g.category}) · ${g.count} marca(s)`;
        clear(genList);
      } }, icon('layers', { size: 18 }), h('span', {}, h('strong', {}, `${g.name} ${g.presentation}`), h('small', {}, `${g.category} · ${g.count} marca(s)`)))));
  });
  const gName = h('input', { class: 'input', maxlength: 60, placeholder: 'Ej.: Sal marina' });
  const gCat = h('select', { class: 'input' }, [...cats.map((c) => h('option', { value: c }, c)), h('option', { value: '__new' }, '+ Otra categoría…')]);
  const gCatNew = h('input', { class: 'input', maxlength: 30, placeholder: 'Nombre de la categoría', hidden: true });
  gCat.addEventListener('change', () => (gCatNew.hidden = gCat.value !== '__new'));
  const gQty = h('input', { type: 'number', class: 'input', min: 0.001, step: 'any', inputmode: 'decimal', placeholder: '500' });
  const gUnit = h('select', { class: 'input' }, UNITS.map(([v, l]) => h('option', { value: v }, l)));
  const existingBox = h('div', { class: 'stack' }, field('Producto genérico existente', genQ, null, 'El genérico agrupa las marcas equivalentes (misma categoría, presentación y unidad) para poder compararlas y sustituirlas.'), genList, genChosen);
  const newBox = h('div', { class: 'stack', hidden: true }, field('Nombre genérico (sin marca)', gName), h('div', { class: 'grid2' }, field('Categoría', gCat), field('Cantidad', gQty)), gCatNew, field('Unidad', gUnit));
  const modeSel = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const [v, l, tip] of [
    ['existing', 'Marca nueva de un producto existente', 'Por ejemplo, otra marca de «Sal fina 500 g»'],
    ['new', 'Producto nuevo', 'Un producto que todavía no existe en ninguna marca'],
  ]) {
    const id = `pmode-${v}`;
    modeSel.append(h('div', { class: 'seg-opt' }, h('input', { type: 'radio', name: 'pmode', id, checked: v === mode, onchange: () => ((mode = v), (existingBox.hidden = v !== 'existing'), (newBox.hidden = v !== 'new')) }), h('label', { for: id, 'data-tip': tip }, l)));
  }
  const brand = h('input', { class: 'input', maxlength: 40, placeholder: 'Ej.: Celusal (o «Sin marca»)' });
  const ean = h('input', { class: 'input mono', inputmode: 'numeric', maxlength: 14, placeholder: '7790000000000' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: async () => {
    err.textContent = '';
    const b = brand.value.trim() || 'Sin marca';
    let code = ean.value.replace(/\D/g, '');
    if (code && !validEan(code)) return (err.textContent = 'El código de barras no es válido (dígito verificador incorrecto)');
    if (code && Cat.product(code)) return (err.textContent = `Ese código ya existe: ${Cat.product(code).name}`);
    if (!code) code = internalEan();
    let base;
    if (mode === 'existing') {
      if (!generic) return (err.textContent = 'Elegí el producto genérico');
      const ref = Cat.productsByGeneric(generic.key)[0];
      if (Cat.productsByGeneric(generic.key).some((p) => norm(p.brand) === norm(b))) return (err.textContent = `La marca «${b}» ya existe para ese producto`);
      base = { generic: ref.generic, genericName: ref.genericName, category: ref.category, presentation: ref.presentation, qty: ref.qty, unit: ref.unit };
    } else {
      const name = gName.value.trim();
      const cat = gCat.value === '__new' ? gCatNew.value.trim() : gCat.value;
      const qty = Number(gQty.value);
      if (name.length < 3) return (err.textContent = 'Escribí el nombre genérico del producto');
      if (!cat) return (err.textContent = 'Indicá la categoría');
      if (!(qty > 0)) return (err.textContent = 'Indicá la cantidad de la presentación');
      const unit = gUnit.value;
      const presentation = `${String(qty).replace('.', ',')} ${unit === 'l' ? 'L' : unit}`;
      const key = `man-${slug(name)}-${slug(presentation)}`;
      if (Cat.productsByGeneric(key).length) return (err.textContent = 'Ese producto ya existe: usá «Marca nueva de un producto existente»');
      base = { generic: key, genericName: name, category: cat, presentation, qty, unit };
    }
    const product = { id: code, ...base, brand: b, name: b === 'Sin marca' ? `${base.genericName} ${base.presentation}` : `${base.genericName} ${b} ${base.presentation}`, basePrice: 0, brandMult: 1, manual: true, createdBy: session.reporterId, createdAt: Date.now() };
    await Cat.addProducts([product]);
    await log({ what: 'producto', productId: product.id, label: `${product.name} (EAN ${product.id})` });
    toast(`Producto «${product.name}» agregado`, 'ok', 4000);
    afterSave?.(product);
  } }, icon('check'), 'Guardar producto');
  return h('div', { class: 'stack' }, modeSel, existingBox, newBox, field('Marca', brand), field('Código de barras (opcional)', ean, 'Si no lo cargás se genera un código interno.', 'EAN-13 de la etiqueta. Se valida el dígito verificador.'), err, h('div', { class: 'row end' }, save));
}

/** A-1 / A-2: alta de comercio o producto en un diálogo; al guardar vuelve al paso 2 con lo nuevo elegido. */
function newEntityModal(title, build, onDone) {
  let m;
  const content = build((entity) => {
    m.close();
    onDone(entity);
  });
  m = modal({ title, wide: true, content: h('div', {}, content, steps(title === 'Nuevo comercio' ? 'CU-10 · A-1' : 'CU-10 · A-2')) });
}

// ---------- Mis cargas ----------
async function myLoads(redraw) {
  const all = await Cat.manualLog();
  const mine = isAdmin() ? all : all.filter((x) => x.reporter === session.reporterId);
  const wrap = card(h('h2', { class: 'h3' }, isAdmin() ? 'Cargas manuales (todas)' : 'Mis cargas'));
  if (!mine.length) {
    wrap.append(h('p', { class: 'muted' }, 'Todavía no hay cargas.'));
    return wrap;
  }
  wrap.append(
    h(
      'ul',
      { class: 'log' },
      mine.slice(0, 100).map((x) => {
        const canDelete = (x.what === 'comercio' && Cat.store(x.storeId)) || (x.what === 'producto' && Cat.product(x.productId));
        return h(
          'li',
          { class: 'row space' },
          h('span', {}, h('strong', {}, `${x.what[0].toUpperCase()}${x.what.slice(1)}`), ` · ${x.label}`, h('br'), h('small', { class: 'muted' }, `${new Date(x.ts).toLocaleString('es-AR')}${isAdmin() ? ` · ${x.author || ''}` : ''}`)),
          canDelete
            ? h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': x.what === 'comercio' ? 'Elimina el comercio y sus precios vigentes' : 'Elimina el producto y sus precios vigentes', onclick: async () => {
                if (!(await confirmDialog('Eliminar', `¿Eliminar ${x.what} «${x.label}»? Se borran también sus precios vigentes.`, { ok: 'Eliminar', danger: true }))) return;
                if (x.what === 'comercio') await Cat.deleteStore(x.storeId);
                else await Cat.deleteProduct(x.productId);
                toast('Eliminado', 'ok');
                redraw();
              } }, icon('trash', { size: 16 }), 'Eliminar')
            : null
        );
      })
    )
  );
  return wrap;
}
