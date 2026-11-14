// Modelo de promociones y reglas de aplicación (sección 4.6 del documento).
// Dos clases: promociones del comercio (sobre productos, genéricos, categorías o toda la tienda)
// y promociones de medios de pago (descuento o reintegro de un banco, billetera o tarjeta).

export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MECHANICS = {
  nxm: 'Llevá N, pagá M',
  second: 'Segunda unidad con descuento',
  pct: 'Porcentaje de descuento',
  price: 'Precio especial por unidad',
};
export const KINDS = { credito: 'Tarjeta de crédito', debito: 'Tarjeta de débito', billetera: 'Billetera virtual', efectivo: 'Efectivo' };
export const NETWORKS = ['Visa', 'Mastercard', 'American Express', 'Cabal'];
export const CAP_PERIODS = { compra: 'por compra', semana: 'por semana', mes: 'por mes' };
export const MODES = { caja: 'descuento en caja', reintegro: 'reintegro posterior' };
export const SOURCES = { demo: 'fuente de demostración', sepa: 'Precios Claros', gondola: 'reporte en góndola', ticket: 'ticket de compra', manual: 'carga manual' };

const money = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`;
const ddmm = (k) => (k ? k.split('-').reverse().slice(0, 2).join('/') : '');
export const isPayment = (p) => p.type === 'payment';

/** Valores por defecto de los campos opcionales (también normaliza promociones guardadas con el modelo anterior). */
export function normalize(p) {
  const q = { days: null, from: null, until: null, membership: null, condition: null, source: p.demo ? 'demo' : p.manual ? 'manual' : 'demo', ...p };
  if (isPayment(q)) {
    Object.assign(q, { kind: q.kind ?? null, network: q.network ?? null, cap: q.cap ?? null, capPeriod: q.capPeriod || 'compra', minPurchase: q.minPurchase ?? null, mode: q.mode || 'caja' });
  } else {
    Object.assign(q, { minQty: q.minQty ?? (q.type === 'nxm' ? q.n : q.type === 'second' ? 2 : 1), maxUnits: q.maxUnits ?? null });
  }
  return q;
}

export function targetLabel(p, Cat) {
  if (p.productId) return Cat?.product(p.productId)?.name || 'un producto';
  if (p.generic) {
    const g = Cat?.productsByGeneric(p.generic)[0];
    return g ? `${g.genericName} ${g.presentation} (cualquier marca)` : 'un producto genérico';
  }
  if (p.category) return `la categoría ${p.category}`;
  return 'toda la tienda';
}

/** Texto de la promoción generado a partir de sus campos (el mismo en todas las pantallas). */
export function label(p0, Cat) {
  const p = normalize(p0);
  const parts = [];
  if (isPayment(p)) {
    const showKind = p.kind && p.kind !== 'billetera' && p.kind !== 'efectivo';
    parts.push(`${p.pct} % con ${p.issuer}${showKind ? ` (${KINDS[p.kind].toLowerCase()}${p.network ? ` ${p.network}` : ''})` : p.network ? ` (${p.network})` : ''}`);
    parts.push(MODES[p.mode]);
    if (p.cap) parts.push(`tope ${money(p.cap)} ${CAP_PERIODS[p.capPeriod]}`);
    if (p.minPurchase) parts.push(`compra mínima ${money(p.minPurchase)}`);
  } else {
    const mech = p.type === 'nxm' ? `${p.n}x${p.m}` : p.type === 'second' ? `2da unidad con ${p.pct} % de descuento` : p.type === 'pct' ? `${p.pct} % de descuento` : `${money(p.price)} c/u`;
    parts.push(`${mech} en ${targetLabel(p, Cat)}`);
    const defMin = p.type === 'nxm' ? p.n : p.type === 'second' ? 2 : 1;
    if (p.minQty > defMin) parts.push(`llevando ${p.minQty} o más`);
    if (p.maxUnits) parts.push(`máx. ${p.maxUnits} unidades por compra`);
  }
  parts.push(p.days ? p.days.map((d) => DAYS_SHORT[d]).join(', ') : 'todos los días');
  if (p.membership) parts.push(`sólo socios (${p.membership})`);
  if (p.from || p.until) parts.push(p.from && p.until ? `del ${ddmm(p.from)} al ${ddmm(p.until)}` : p.until ? `hasta el ${ddmm(p.until)}` : `desde el ${ddmm(p.from)}`);
  if (p.condition) parts.push(`condición: ${p.condition}`);
  return parts.join(' · ');
}

/** Fecha (AAAA-MM-DD) del próximo día de la semana d, contando hoy. */
export function dateForDay(d, base = new Date()) {
  const t = new Date(base);
  t.setDate(t.getDate() + ((d - t.getDay() + 7) % 7));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** R1 — condiciones comunes: vigencia, día de la semana y programa de socios. Devuelve el motivo si no aplica. */
export function commonReason(p, day, ctx) {
  const date = dateForDay(day);
  if (p.from && date < p.from) return `vigente desde el ${ddmm(p.from)}`;
  if (p.until && date > p.until) return `venció el ${ddmm(p.until)}`;
  if (p.days && !p.days.includes(day)) return `sólo ${p.days.map((d) => DAYS_SHORT[d]).join(', ')}`;
  if (p.membership && !ctx.memberships?.has(p.membership)) return `requiere ser socio (${p.membership}); agregalo en tu perfil si lo sos`;
  return null;
}

/** R2 — la promoción del comercio alcanza al producto. */
export function targets(p, product) {
  if (p.productId) return p.productId === product.id;
  if (p.generic) return p.generic === product.generic;
  if (p.category) return p.category === product.category;
  return true;
}

/** R3 — costo de qty unidades con una promoción del comercio (null si no alcanza la cantidad mínima). */
export function promoCost(p, unit, qty) {
  if (qty < p.minQty) return null;
  const elig = p.maxUnits ? Math.min(qty, p.maxUnits) : qty;
  const rest = (qty - elig) * unit;
  let c;
  if (p.type === 'nxm') c = (elig - Math.floor(elig / p.n) * (p.n - p.m)) * unit;
  else if (p.type === 'second') c = elig * unit - Math.floor(elig / 2) * unit * (p.pct / 100);
  else if (p.type === 'pct') c = elig * unit * (1 - p.pct / 100);
  else if (p.type === 'price') c = elig * Math.min(unit, p.price);
  else return null;
  return c + rest;
}

/** Explica cada promoción del comercio para una línea: aplicada, no aplicable (con motivo) o superada por otra mejor. */
export function explainStore(promos, product, unit, qty, day, ctx) {
  const out = [];
  let best = null;
  for (const raw of promos) {
    if (isPayment(raw)) continue;
    const p = normalize(raw);
    if (!targets(p, product)) continue;
    let reason = commonReason(p, day, ctx);
    let cost = null;
    if (!reason) {
      cost = promoCost(p, unit, qty);
      if (cost == null) reason = `requiere llevar ${p.minQty} unidades (tu lista tiene ${qty})`;
      else if (cost >= unit * qty - 0.001) reason = 'no mejora el precio de lista';
    }
    const row = { promo: p, reason, cost };
    out.push(row);
    if (!reason && (!best || cost < best.cost - 0.001)) best = row;
  }
  for (const r of out) if (!r.reason && r !== best) r.reason = 'no se acumula: se aplicó otra promoción con mayor ahorro';
  return { rows: out, best };
}

/** Medio del perfil compatible con la promoción (mismo emisor y, si la promoción lo exige, mismo tipo y red). */
export function matchingMedium(p, payments) {
  if (p.issuer === 'Efectivo') return { issuer: 'Efectivo', kind: 'efectivo' }; // el efectivo siempre está disponible
  return payments.find((m) => m.issuer === p.issuer && (!p.kind || !m.kind || m.kind === p.kind) && (!p.network || !m.network || m.network === p.network));
}

/** Tope ya usado en el período (semana o mes de la fecha evaluada), según los reintegros registrados en los tickets propios. */
export function capUsed(p, chainId, day, ctx) {
  if (!p.cap || p.capPeriod === 'compra' || !ctx.tickets?.length) return 0;
  const date = dateForDay(day);
  let start;
  let end;
  if (p.capPeriod === 'mes') {
    start = `${date.slice(0, 7)}-01`;
    end = `${date.slice(0, 7)}-31`;
  } else {
    const t = new Date(`${date}T12:00`);
    const monday = new Date(t);
    monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const k = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    start = k(monday);
    end = k(sunday);
  }
  return ctx.tickets.filter((tk) => tk.payment === p.issuer && tk.payDiscount && tk.date >= start && tk.date <= end && ctx.chainOf(tk.storeId) === chainId).reduce((a, tk) => a + tk.payDiscount, 0);
}

/** R5 — explica cada promoción de medios de pago de la sucursal para un subtotal y elige la de mayor descuento. */
export function explainPayment(promos, subtotal, day, chainId, ctx) {
  const out = [];
  let best = null;
  for (const raw of promos) {
    if (!isPayment(raw)) continue;
    const p = normalize(raw);
    let reason = commonReason(p, day, ctx);
    let discount = 0;
    let remaining = null;
    if (!reason && !ctx.usePayments) reason = 'descuentos de medios de pago desactivados en la búsqueda';
    if (!reason && !matchingMedium(p, ctx.payments || [])) reason = `no tenés ${p.issuer}${p.kind ? ` (${KINDS[p.kind].toLowerCase()}${p.network ? ` ${p.network}` : ''})` : ''} en tu perfil`;
    if (!reason && p.minPurchase && subtotal < p.minPurchase) reason = `compra mínima ${money(p.minPurchase)} (esta compra: ${money(subtotal)})`;
    if (!reason) {
      discount = subtotal * (p.pct / 100);
      if (p.cap) {
        remaining = Math.max(0, p.cap - capUsed(p, chainId, day, ctx));
        if (remaining <= 0) reason = `tope ${CAP_PERIODS[p.capPeriod]} agotado según tus tickets`;
        discount = Math.min(discount, remaining);
      }
      discount = Math.round(discount);
    }
    const row = { promo: p, reason, discount: reason ? 0 : discount, remaining };
    out.push(row);
    if (!reason && (!best || row.discount > best.discount)) best = row;
  }
  for (const r of out) if (!r.reason && r !== best) r.reason = 'se paga con un solo medio: se eligió el de mayor descuento';
  return { rows: out, best };
}
