// Motor analítico determinístico (RNF-01): mismas entradas -> mismo resultado. Sin patrocinios.
// RF-03 cálculo multidimensional de promociones, RF-04 optimización por día y comercio, RF-15 marcas.
import * as Cat from '../data/catalog.js';
import * as PR from './promos.js';
import { distanceKm } from './geo.js';

export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const TIERS = [
  { id: 'E', name: 'Excelencia', rank: 4 },
  { id: 'S', name: 'Superior', rank: 3 },
  { id: 'C', name: 'Clásica', rank: 2 },
  { id: 'B', name: 'Esencial', rank: 1 },
];
export const tierRank = (id) => TIERS.find((t) => t.id === id)?.rank || 0;
export const tierName = (id) => TIERS.find((t) => t.id === id)?.name || 'Sin gama';

const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Costo de qty unidades con la mejor promoción del comercio aplicable (reglas R1 a R4 de la sección 4.6):
 * vigencia, día, programa de socios, cantidad mínima y tope de unidades; las promociones no se acumulan entre sí.
 */
export function volumeCost(unit, qty, product, promos, day, ctx = {}) {
  const { best } = PR.explainStore(promos, product, unit, qty, day, ctx);
  return best ? { cost: Math.round(best.cost), label: PR.label(best.promo, Cat), promoId: best.promo.id } : { cost: Math.round(unit * qty), label: null, promoId: null };
}

/** Mejor línea de un ítem en una sucursal (si no hay marca fija, la equivalente más barata). */
export function lineFor(storeId, item, ctx, day) {
  const candidates = item.productId ? [Cat.product(item.productId)].filter(Boolean) : Cat.productsByGeneric(item.generic);
  const promos = ctx.promosByStore.get(storeId) || [];
  let best = null;
  for (const p of [...candidates].sort((a, b) => byId(a.id, b.id))) {
    const key = `${storeId}|${p.id}`;
    const rec = ctx.prices.get(key);
    if (!rec || ctx.outOfStock.has(key)) continue;
    const v = volumeCost(rec.price, item.qty, p, promos, day, ctx);
    if (!best || v.cost < best.net) best = { productId: p.id, unit: rec.price, qty: item.qty, gross: rec.price * item.qty, net: v.cost, promo: v.label, promoId: v.promoId, verified: rec.verified, date: rec.date };
  }
  return best;
}

/** Mejor descuento por medio de pago para un subtotal (regla R5: un único medio por compra, con días, compra mínima y tope). */
export function paymentDiscount(storeId, subtotal, day, ctx) {
  const st = Cat.store(storeId);
  const { best } = PR.explainPayment(ctx.promosByStore.get(storeId) || [], subtotal, day, st?.chainId, ctx);
  return best ? { discount: best.discount, label: PR.label(best.promo, Cat), issuer: best.promo.issuer, promoId: best.promo.id, remaining: best.remaining } : { discount: 0, label: null, issuer: null, promoId: null };
}

export function basketForStore(storeId, items, day, ctx) {
  const lines = [];
  const missing = [];
  for (const it of items) {
    const l = lineFor(storeId, it, ctx, day);
    if (l) lines.push({ ...l, item: it });
    else missing.push(it);
  }
  const gross = lines.reduce((a, l) => a + l.gross, 0);
  const subtotal = lines.reduce((a, l) => a + l.net, 0);
  const pay = paymentDiscount(storeId, subtotal, day, ctx);
  return { storeId, day, lines, missing, gross, subtotal, payment: pay, total: subtotal - pay.discount, complete: missing.length === 0 };
}

/** Prepara el contexto: sucursales en radio sin las excluidas, precios, faltantes y promociones. */
export async function buildContext({ point, radiusKm, excluded = [], usePayments, payments = [], memberships = [], tickets = [] }) {
  const exChains = new Set(excluded.filter((e) => e.kind === 'chain').map((e) => e.id));
  const exStores = new Set(excluded.filter((e) => e.kind === 'store').map((e) => e.id));
  const stores = Cat.stores()
    .map((s) => ({ ...s, dist: distanceKm(point, s) }))
    .filter((s) => s.dist <= radiusKm && !exChains.has(s.chainId) && !exStores.has(s.id))
    .sort((a, b) => a.dist - b.dist || byId(a.id, b.id));
  const { prices, outOfStock } = await Cat.currentForStores(stores.map((s) => s.id));
  const promosByStore = new Map(stores.map((s) => [s.id, Cat.promosForStore(s.id)]));
  return { point, radiusKm, stores, prices, outOfStock, promosByStore, usePayments, payments, issuers: new Set(payments.map((p) => p.issuer)), memberships: new Set(memberships), tickets, chainOf: (id) => Cat.store(id)?.chainId };
}

// ---------------- Reparto de la compra (CU-03 A-2) ----------------

/** Recorrido más corto que sale del punto, pasa por todos los comercios y vuelve (fuerza bruta, n ≤ 6). */
export function routeKm(point, stops) {
  if (!stops.length) return { km: 0, order: [] };
  const d0 = stops.map((s) => distanceKm(point, s));
  const dd = stops.map((a) => stops.map((b) => distanceKm(a, b)));
  let best = { km: Infinity, order: [] };
  const idx = stops.map((_, i) => i);
  const perm = (arr, l) => {
    if (l === arr.length) {
      let km = d0[arr[0]] + d0[arr[arr.length - 1]];
      for (let i = 1; i < arr.length; i++) km += dd[arr[i - 1]][arr[i]];
      if (km < best.km - 1e-9) best = { km, order: [...arr] };
      return;
    }
    for (let i = l; i < arr.length; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      perm(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  };
  perm(idx, 0);
  return { km: best.km, order: best.order.map((i) => stops[i]) };
}

/**
 * Reparte los productos entre «visitas» (comercio y día) minimizando: total con ofertas y descuentos + km recorridos × costo por km.
 * Restricciones: como máximo maxStores visitas y maxKm km recorridos en total (un recorrido por día: salida, comercios y regreso).
 * splitDays = false: todas las visitas el mismo día (se evalúa cada día y se elige el mejor).
 */
export function splitPlan(items, ctx, { days, splitDays = false, maxStores = 3, maxKm = 10, costPerKm = 250 }) {
  const stores = ctx.stores;
  const plan = (dayset) => {
    const visits = [];
    for (const d of dayset) stores.forEach((s, si) => visits.push({ si, day: d, key: `${s.id}|${d}` }));
    const cost = items.map((it) => visits.map((v) => lineFor(stores[v.si].id, it, ctx, v.day)));
    const maxNet = Math.max(1, ...cost.flat().filter(Boolean).map((l) => l.net));
    const PENALTY = maxNet * 50;
    const routeCache = new Map();
    const travelOf = (set) => {
      const byDay = new Map();
      for (const vi of set) {
        const v = visits[vi];
        if (!byDay.has(v.day)) byDay.set(v.day, []);
        byDay.get(v.day).push(stores[v.si]);
      }
      let km = 0;
      const routes = [];
      for (const [day, st] of byDay) {
        const key = `${day}:${st.map((x) => x.id).sort().join(',')}`;
        if (!routeCache.has(key)) routeCache.set(key, routeKm(ctx.point, st));
        const r = routeCache.get(key);
        km += r.km;
        routes.push({ day, km: r.km, order: r.order.map((x) => x.id) });
      }
      return { km, routes };
    };
    const evaluate = (set) => {
      const assign = items.map((_, i) => {
        let best = -1;
        for (const vi of set) {
          const l = cost[i][vi];
          if (l && (best < 0 || l.net < cost[i][best].net)) best = vi;
        }
        return best;
      });
      const used = [...new Set(assign.filter((x) => x >= 0))];
      const tr = travelOf(used);
      let score = Math.round(tr.km * costPerKm);
      const parts = [];
      for (const vi of used) {
        const v = visits[vi];
        const lines = assign.map((a, i) => (a === vi ? { ...cost[i][vi], item: items[i] } : null)).filter(Boolean);
        const subtotal = lines.reduce((a, l) => a + l.net, 0);
        const pay = paymentDiscount(stores[v.si].id, subtotal, v.day, ctx);
        score += subtotal - pay.discount;
        parts.push({ storeId: stores[v.si].id, day: v.day, lines, gross: lines.reduce((a, l) => a + l.gross, 0), subtotal, payment: pay, total: subtotal - pay.discount });
      }
      const missing = assign.filter((a) => a < 0).length;
      score += missing * PENALTY;
      return { set: used, parts, score, missing, km: tr.km, routes: tr.routes, assign, feasible: tr.km <= maxKm + 1e-9 };
    };
    // 1) la mejor visita única factible
    let cur = null;
    visits.forEach((_, vi) => {
      const e = evaluate([vi]);
      if (e.feasible && (!cur || e.score < cur.score)) cur = e;
    });
    // si ninguna visita entra en la distancia máxima, se informa la mejor compra en un solo comercio (sin tope de km)
    let relaxed = false;
    if (!cur) {
      visits.forEach((_, vi) => {
        const e = evaluate([vi]);
        if (!cur || e.missing < cur.missing || (e.missing === cur.missing && e.score < cur.score)) cur = e;
      });
      if (!cur) return null;
      relaxed = true;
    }
    // 2) agregar visitas mientras baje el puntaje y se respeten los topes
    const improve = () => {
      let changed = false;
      if (cur.set.length < maxStores) {
        let bestNext = null;
        visits.forEach((_, vi) => {
          if (cur.set.includes(vi)) return;
          const e = evaluate([...cur.set, vi]);
          if (e.feasible && e.set.length <= maxStores && e.score < cur.score - 1 && (!bestNext || e.score < bestNext.score)) bestNext = e;
        });
        if (bestNext) (cur = bestNext), (changed = true);
      }
      // 3) intercambiar una visita por otra si mejora
      let bestSwap = null;
      cur.set.forEach((out) => {
        visits.forEach((_, vi) => {
          if (cur.set.includes(vi)) return;
          const e = evaluate([...cur.set.filter((x) => x !== out), vi]);
          if (e.feasible && e.score < cur.score - 1 && (!bestSwap || e.score < bestSwap.score)) bestSwap = e;
        });
      });
      if (bestSwap) (cur = bestSwap), (changed = true);
      return changed;
    };
    for (let guard = 0; !relaxed && guard < 12 && improve(); guard++);
    const missingItems = items.filter((_, i) => cur.assign[i] < 0);
    const parts = cur.parts.sort((a, b) => a.day - b.day || b.total - a.total || byId(a.storeId, b.storeId));
    const total = parts.reduce((a, p) => a + p.total, 0);
    const travel = Math.round(cur.km * costPerKm);
    return { days: [...new Set(parts.map((p) => p.day))], parts, total, km: cur.km, travel, routes: cur.routes, missing: missingItems, complete: missingItems.length === 0, score: total + travel, relaxed };
  };
  if (splitDays) return { best: plan(days), byDay: null };
  const byDay = new Map();
  for (const d of days) byDay.set(d, plan([d]));
  let best = null;
  const better = (p, q) => !q || (q.relaxed && !p.relaxed) || (p.relaxed === q.relaxed && p.score < q.score);
  for (const p of byDay.values()) if (p && p.complete && better(p, best)) best = p;
  if (!best) for (const p of byDay.values()) if (p && (!best || p.missing.length < best.missing.length)) best = p;
  return { best, byDay };
}

/**
 * CU-03 pasos 4 a 7 (y A-2): calcula todas las combinaciones comercio × día.
 * params: { items, point, radiusKm, days, usePayments, payments, memberships, tickets, excluded, multi, splitDays, maxStores, maxKm, costPerKm }
 */
export async function optimize(params) {
  const t0 = performance.now();
  const ctx = await buildContext(params);
  if (!ctx.stores.length) {
    const err = new Error('No hay comercios habilitados dentro del radio.');
    err.code = 'E-2';
    throw err;
  }
  const days = [...params.days].sort();
  const matrix = new Map(); // storeId -> day -> basket
  for (const s of ctx.stores) {
    const row = new Map();
    for (const d of days) row.set(d, basketForStore(s.id, params.items, d, ctx));
    matrix.set(s.id, row);
  }
  const byDay = new Map();
  for (const d of days) {
    const complete = ctx.stores.map((s) => matrix.get(s.id).get(d)).filter((b) => b.complete);
    complete.sort((a, b) => a.total - b.total || byId(a.storeId, b.storeId));
    byDay.set(d, { best: complete[0] || null, min: complete[0]?.total ?? null, max: complete.at(-1)?.total ?? null, completeCount: complete.length });
  }
  const byStore = new Map();
  for (const s of ctx.stores) {
    let best = null;
    for (const d of days) {
      const b = matrix.get(s.id).get(d);
      if (b.complete && (!best || b.total < best.total)) best = b;
    }
    byStore.set(s.id, best);
  }
  let bestOverall = null;
  for (const d of days) {
    const b = byDay.get(d).best;
    if (b && (!bestOverall || b.total < bestOverall.total)) bestOverall = b;
  }
  let multi = null;
  if (params.multi) multi = splitPlan(params.items, ctx, { days, splitDays: !!params.splitDays, maxStores: params.maxStores ?? 3, maxKm: params.maxKm ?? 10, costPerKm: params.costPerKm ?? 250 });
  return { ctx, days, matrix, byDay, byStore, bestOverall, multi, elapsedMs: Math.round(performance.now() - t0) };
}

/** Escala verde (más barato) -> rojo (más caro). Devuelve color y posición 0..1. */
export function priceColor(value, min, max) {
  const t = max > min ? (value - min) / (max - min) : 0;
  // interpolación verde -> ámbar -> rojo
  const stops = [
    [0, [12, 140, 60]],
    [0.5, [214, 150, 0]],
    [1, [200, 45, 45]],
  ];
  let a = stops[0],
    b = stops[2];
  if (t <= 0.5) b = stops[1];
  else a = stops[1];
  const u = (t - a[0]) / (b[0] - a[0] || 1);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * u));
  return { color: `rgb(${c[0]},${c[1]},${c[2]})`, t };
}

// ---------------- CU-04: optimización de marcas ----------------

/** Costo de un producto concreto en una sucursal y día (null si no hay precio o está en falta). */
function productCost(storeId, productId, qty, ctx, day) {
  return lineFor(storeId, { productId, qty, generic: Cat.product(productId)?.generic }, ctx, day);
}

/**
 * Propone sustituciones. mode: 'target' (pct) | 'expert' (tolerance en gamas).
 * reference: { storeId, day } — los precios de la opción elegida en CU-03.
 */
export function proposeBrandChanges({ items, ctx, reference, mode, pct = 10, tolerance = 1, tiers = {} }) {
  const { storeId, day } = reference;
  const rows = [];
  const unrated = new Set();
  let baseTotal = 0;
  for (const it of items) {
    const cur = lineFor(storeId, it, ctx, day);
    if (!cur) continue;
    baseTotal += cur.net;
    const curProd = Cat.product(cur.productId);
    const alts = Cat.productsByGeneric(curProd.generic)
      .filter((p) => p.id !== curProd.id)
      .sort((a, b) => byId(a.id, b.id))
      .map((p) => ({ p, line: productCost(storeId, p.id, it.qty, ctx, day) }))
      .filter((a) => a.line && a.line.net < cur.net);
    if (!alts.length) continue;
    let chosen = null;
    if (mode === 'target') {
      chosen = alts.reduce((best, a) => (!best || a.line.net < best.line.net ? a : best), null);
    } else {
      const curTier = tiers[curProd.id];
      if (!curTier) {
        unrated.add(curProd.id);
        continue;
      }
      const ok = alts.filter((a) => {
        const t = tiers[a.p.id];
        if (!t) {
          unrated.add(a.p.id);
          return false;
        }
        return tierRank(curTier) - tierRank(t) <= tolerance;
      });
      chosen = ok.reduce((best, a) => (!best || a.line.net < best.line.net ? a : best), null);
    }
    if (chosen)
      rows.push({
        item: it,
        from: curProd,
        to: chosen.p,
        fromCost: cur.net,
        toCost: chosen.line.net,
        saving: cur.net - chosen.line.net,
        fromTier: tiers[curProd.id] || null,
        toTier: tiers[chosen.p.id] || null,
      });
  }
  rows.sort((a, b) => b.saving - a.saving || byId(a.from.id, b.from.id));
  let proposal = rows;
  let reached = true;
  if (mode === 'target') {
    // mínimo de cambios que alcanza el porcentaje: tomar los de mayor ahorro primero
    const goal = baseTotal * (pct / 100);
    proposal = [];
    let acc = 0;
    for (const r of rows) {
      if (acc >= goal) break;
      proposal.push(r);
      acc += r.saving;
    }
    reached = acc >= goal;
  }
  const saving = proposal.reduce((a, r) => a + r.saving, 0);
  return { proposal, baseTotal, saving, pctAchieved: baseTotal ? (saving / baseTotal) * 100 : 0, reached, unrated: [...unrated] };
}

export const money = (n) => (n == null ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR'));
export const pctFmt = (n, d = 1) => `${n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
