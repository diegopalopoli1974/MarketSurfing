// Motor analítico determinístico (RNF-01): mismas entradas -> mismo resultado. Sin patrocinios.
// RF-05 cálculo multidimensional de promociones, RF-06 optimización por día y comercio, RF-18 marcas.
import * as Cat from '../data/catalog.js';
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

function promoApplies(promo, product, day) {
  if (promo.days && !promo.days.includes(day)) return false;
  if (promo.productId) return promo.productId === product.id;
  if (promo.generic) return promo.generic === product.generic;
  if (promo.category) return promo.category === product.category;
  return true;
}

/** Costo de qty unidades aplicando la mejor oferta por volumen/porcentaje (no acumulables entre sí). */
export function volumeCost(unit, qty, product, promos, day) {
  let best = { cost: unit * qty, label: null };
  for (const pr of promos) {
    if (pr.type === 'payment' || !promoApplies(pr, product, day)) continue;
    let cost = null;
    if (pr.type === 'nxm' && qty >= pr.n) cost = (qty - Math.floor(qty / pr.n) * (pr.n - pr.m)) * unit;
    else if (pr.type === 'second' && qty >= 2) cost = qty * unit - Math.floor(qty / 2) * unit * (pr.pct / 100);
    else if (pr.type === 'pct') cost = qty * unit * (1 - pr.pct / 100);
    if (cost !== null && (cost < best.cost - 0.001 || (Math.abs(cost - best.cost) < 0.001 && best.label && pr.label < best.label))) best = { cost, label: pr.label };
  }
  return { cost: Math.round(best.cost), label: best.label };
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
    const v = volumeCost(rec.price, item.qty, p, promos, day);
    if (!best || v.cost < best.net) best = { productId: p.id, unit: rec.price, qty: item.qty, gross: rec.price * item.qty, net: v.cost, promo: v.label, verified: rec.verified, date: rec.date };
  }
  return best;
}

/** Mejor descuento por medio de pago para un subtotal (se paga con un único medio por ticket). */
export function paymentDiscount(storeId, subtotal, day, ctx) {
  if (!ctx.usePayments || !ctx.issuers.size) return { discount: 0, label: null, issuer: null };
  let best = { discount: 0, label: null, issuer: null };
  for (const pr of ctx.promosByStore.get(storeId) || []) {
    if (pr.type !== 'payment' || !ctx.issuers.has(pr.issuer)) continue;
    if (pr.days && !pr.days.includes(day)) continue;
    let d = subtotal * (pr.pct / 100);
    if (pr.cap) d = Math.min(d, pr.cap);
    d = Math.round(d);
    if (d > best.discount) best = { discount: d, label: pr.label, issuer: pr.issuer };
  }
  return best;
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
export async function buildContext({ point, radiusKm, excluded = [], usePayments, payments = [] }) {
  const exChains = new Set(excluded.filter((e) => e.kind === 'chain').map((e) => e.id));
  const exStores = new Set(excluded.filter((e) => e.kind === 'store').map((e) => e.id));
  const stores = Cat.stores()
    .map((s) => ({ ...s, dist: distanceKm(point, s) }))
    .filter((s) => s.dist <= radiusKm && !exChains.has(s.chainId) && !exStores.has(s.id))
    .sort((a, b) => a.dist - b.dist || byId(a.id, b.id));
  const { prices, outOfStock } = await Cat.currentForStores(stores.map((s) => s.id));
  const promosByStore = new Map(stores.map((s) => [s.id, Cat.promosForStore(s.id)]));
  return { point, radiusKm, stores, prices, outOfStock, promosByStore, usePayments, issuers: new Set(payments.map((p) => p.issuer)) };
}

/** Asignación multi-comercio de un día: cada producto al comercio de menor precio final, ponderando traslado. */
export function multiStorePlan(items, day, ctx, costPerKm, maxStores = 4) {
  const stores = ctx.stores;
  const costs = items.map((it) => stores.map((s) => lineFor(s.id, it, ctx, day)));
  const maxNet = Math.max(1, ...costs.flat().filter(Boolean).map((l) => l.net));
  const PENALTY = maxNet * 20;
  const travel = (si) => Math.round(stores[si].dist * 2 * costPerKm);

  const evaluate = (set) => {
    const assign = items.map((_, i) => {
      let best = -1;
      for (const si of set) {
        const l = costs[i][si];
        if (l && (best < 0 || l.net < costs[i][best].net)) best = si;
      }
      return best;
    });
    const perStore = new Map();
    let score = 0;
    let missing = 0;
    assign.forEach((si, i) => {
      if (si < 0) {
        missing++;
        score += PENALTY;
        return;
      }
      if (!perStore.has(si)) perStore.set(si, []);
      perStore.get(si).push(i);
    });
    const parts = [];
    for (const [si, idxs] of perStore) {
      const lines = idxs.map((i) => ({ ...costs[i][si], item: items[i] }));
      const subtotal = lines.reduce((a, l) => a + l.net, 0);
      const pay = paymentDiscount(stores[si].id, subtotal, day, ctx);
      const t = travel(si);
      score += subtotal - pay.discount + t;
      parts.push({ storeId: stores[si].id, lines, gross: lines.reduce((a, l) => a + l.gross, 0), subtotal, payment: pay, total: subtotal - pay.discount, travel: t });
    }
    // un comercio sin productos asignados no suma traslado
    return { set: [...perStore.keys()], parts, score, missing, assign };
  };

  // punto de partida: el mejor comercio único (considerando traslado)
  let current = null;
  stores.forEach((_, si) => {
    const e = evaluate([si]);
    if (!current || e.score < current.score) current = e;
  });
  if (!current) return null;
  while (current.set.length < maxStores) {
    let bestNext = null;
    stores.forEach((_, si) => {
      if (current.set.includes(si)) return;
      const e = evaluate([...current.set, si]);
      if (e.score < current.score - 1 && (!bestNext || e.score < bestNext.score)) bestNext = e;
    });
    if (!bestNext) break;
    current = bestNext;
  }
  const missingItems = items.filter((_, i) => current.assign[i] < 0);
  const parts = current.parts.sort((a, b) => b.total - a.total || byId(a.storeId, b.storeId));
  const total = parts.reduce((a, p) => a + p.total, 0);
  const travelTotal = parts.reduce((a, p) => a + p.travel, 0);
  return { day, parts, total, travel: travelTotal, missing: missingItems, complete: missingItems.length === 0 };
}

/**
 * CU-03 pasos 4 a 7 (y A-2): calcula todas las combinaciones comercio × día.
 * params: { items, point, radiusKm, days, usePayments, payments, excluded, multi, costPerKm }
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
  if (params.multi) {
    multi = new Map();
    for (const d of days) multi.set(d, multiStorePlan(params.items, d, ctx, params.costPerKm ?? 250));
  }
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
