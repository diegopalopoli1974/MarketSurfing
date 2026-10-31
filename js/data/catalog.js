// Catálogo compartido del dispositivo (datos públicos de precios: no se cifra).
// Precios con versiones inmutables (RNF-11): cada cambio agrega un registro al histórico.
import { openDb, Store, txDone } from '../core/idb.js';
import * as Seed from './demo-seed.js';

let db;
const mem = { chains: new Map(), stores: new Map(), products: new Map(), byGeneric: new Map(), promos: [] };

export async function init(onProgress = () => {}) {
  const raw = await openDb('ms-catalog', 1, (d) => {
    d.createObjectStore('chains', { keyPath: 'id' });
    d.createObjectStore('stores', { keyPath: 'id' });
    const p = d.createObjectStore('products', { keyPath: 'id' });
    p.createIndex('generic', 'generic');
    const c = d.createObjectStore('current', { keyPath: 'key' });
    c.createIndex('store', 'storeId');
    c.createIndex('product', 'productId');
    const h = d.createObjectStore('history', { autoIncrement: true });
    h.createIndex('product', 'productId');
    h.createIndex('storeProduct', ['storeId', 'productId']);
    d.createObjectStore('promos', { keyPath: 'id' });
    d.createObjectStore('stock', { keyPath: 'key' });
    const i = d.createObjectStore('incidents', { autoIncrement: true, keyPath: 'id' });
    i.createIndex('store', 'storeId');
    d.createObjectStore('tickets', { keyPath: 'hash' });
    d.createObjectStore('reportsLog', { autoIncrement: true });
    d.createObjectStore('meta');
  });
  db = new Store(raw);
  if (!(await db.get('meta', 'seededAt'))) await seedDemo(onProgress);
  await loadMemory();
}

async function loadMemory() {
  mem.chains = new Map((await db.getAll('chains')).map((c) => [c.id, c]));
  mem.stores = new Map((await db.getAll('stores')).map((s) => [s.id, s]));
  const prods = await db.getAll('products');
  mem.products = new Map(prods.map((p) => [p.id, p]));
  mem.byGeneric = new Map();
  for (const p of prods) {
    if (!mem.byGeneric.has(p.generic)) mem.byGeneric.set(p.generic, []);
    mem.byGeneric.get(p.generic).push(p);
  }
  mem.promos = await db.getAll('promos');
}

async function seedDemo(onProgress) {
  onProgress('Preparando catálogo de demostración…', 0.05);
  const products = Seed.buildProducts();
  const stores = Seed.buildStores();
  const chainsById = Object.fromEntries(Seed.CHAINS.map((c) => [c.id, c]));
  await db.bulkPut('chains', Seed.CHAINS);
  await db.bulkPut('stores', stores);
  await db.bulkPut('products', products);
  onProgress('Generando precios y 12 meses de historia…', 0.2);
  const { current, history } = Seed.buildPrices(products, stores, chainsById);
  await db.bulkPut('current', current);
  for (let i = 0; i < history.length; i += 6000) {
    await db.bulkPut('history', history.slice(i, i + 6000), 6000);
    onProgress('Guardando histórico de precios…', 0.25 + (0.65 * i) / history.length);
  }
  await db.bulkPut('promos', Seed.buildPromos(products));
  await db.put('meta', Date.now(), 'seededAt');
  await db.put('meta', Seed.dayKey(), 'lastSync');
  await db.put('meta', [{ ts: Date.now(), source: 'Datos de demostración', ok: true, products: products.length, prices: current.length, changed: 0, note: 'Carga inicial' }], 'syncLog');
  onProgress('Listo', 1);
}

export const chains = () => [...mem.chains.values()];
export const chain = (id) => mem.chains.get(id);
export const stores = () => [...mem.stores.values()];
export const store = (id) => mem.stores.get(id);
export const products = () => [...mem.products.values()];
export const product = (id) => mem.products.get(id);
export const productsByGeneric = (g) => mem.byGeneric.get(g) || [];
export const generics = () =>
  [...mem.byGeneric.entries()].map(([key, list]) => ({ key, name: list[0].genericName, category: list[0].category, presentation: list[0].presentation, count: list.length }));
export const categories = () => [...new Set(products().map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es'));

export function promosForStore(storeId) {
  const s = mem.stores.get(storeId);
  if (!s) return [];
  return mem.promos.filter((p) => (p.storeId ? p.storeId === storeId : p.chainId === s.chainId));
}

export async function currentForStores(storeIds) {
  const map = new Map();
  const tx = db.db.transaction(['current', 'stock']);
  const idx = tx.objectStore('current').index('store');
  await Promise.all(
    storeIds.map(
      (id) =>
        new Promise((res, rej) => {
          const r = idx.getAll(id);
          r.onsuccess = () => {
            for (const rec of r.result) map.set(rec.key, rec);
            res();
          };
          r.onerror = () => rej(r.error);
        })
    )
  );
  const stockRecs = await new Promise((res, rej) => {
    const r = tx.objectStore('stock').getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const ids = new Set(storeIds);
  const out = new Map();
  const cutoff = Date.now() - 3 * 86400000; // un faltante reportado vale 3 días
  for (const s of stockRecs) if (ids.has(s.storeId) && s.out && s.ts > cutoff) out.set(s.key, s);
  return { prices: map, outOfStock: out };
}

export async function currentPrice(storeId, productId) {
  return db.get('current', `${storeId}|${productId}`);
}

export async function currentByProduct(productId) {
  return db.getAllFromIndex('current', 'product', productId);
}

/** Registra un precio nuevo como versión inmutable. Devuelve { changed, prev }. */
export async function recordPrice({ storeId, productId, price, source, verified = false, date = Seed.dayKey() }) {
  const key = `${storeId}|${productId}`;
  const prev = await db.get('current', key);
  const tx = db.db.transaction(['current', 'history'], 'readwrite');
  tx.objectStore('current').put({ key, storeId, productId, price, date, source, verified: verified || prev?.verified || false });
  tx.objectStore('history').add({ storeId, productId, date, price, source, ts: Date.now() });
  await txDone(tx);
  return { changed: !prev || prev.price !== price, prev };
}

export async function bulkRecordPrices(records, onProgress) {
  const changed = [];
  for (let i = 0; i < records.length; i += 1500) {
    const slice = records.slice(i, i + 1500);
    const tx = db.db.transaction(['current', 'history'], 'readwrite');
    const cur = tx.objectStore('current');
    const his = tx.objectStore('history');
    for (const r of slice) {
      const key = `${r.storeId}|${r.productId}`;
      const req = cur.get(key);
      req.onsuccess = () => {
        const prev = req.result;
        if (!prev || prev.price !== r.price) {
          cur.put({ key, storeId: r.storeId, productId: r.productId, price: r.price, date: r.date, source: r.source, verified: false });
          his.add({ storeId: r.storeId, productId: r.productId, date: r.date, price: r.price, source: r.source, ts: Date.now() });
          changed.push({ storeId: r.storeId, productId: r.productId, price: r.price, prev: prev?.price });
        }
      };
    }
    await txDone(tx);
    onProgress?.(Math.min(1, (i + slice.length) / records.length));
  }
  return changed;
}

/** Alta directa de precios demo (sucursales generadas cerca del usuario). */
export async function addRawPrices(current, history) {
  await db.bulkPut('current', current);
  await db.bulkPut('history', history, 6000);
}

export async function historyForProduct(productId) {
  return db.getAllFromIndex('history', 'product', productId);
}

export async function setStock(storeId, productId, out) {
  await db.put('stock', { key: `${storeId}|${productId}`, storeId, productId, out, ts: Date.now() });
}

export async function addStores(list) {
  await db.bulkPut('stores', list);
  for (const s of list) mem.stores.set(s.id, s);
}
export async function addChains(list) {
  await db.bulkPut('chains', list);
  for (const c of list) mem.chains.set(c.id, c);
}
export async function addProducts(list) {
  await db.bulkPut('products', list);
  for (const p of list) {
    mem.products.set(p.id, p);
    if (!mem.byGeneric.has(p.generic)) mem.byGeneric.set(p.generic, []);
    const arr = mem.byGeneric.get(p.generic);
    if (!arr.some((x) => x.id === p.id)) arr.push(p);
  }
}
export async function replacePromos(filterFn, newPromos) {
  const keep = mem.promos.filter((p) => !filterFn(p));
  const tx = db.db.transaction('promos', 'readwrite');
  const os = tx.objectStore('promos');
  os.clear();
  for (const p of [...keep, ...newPromos]) os.put(p);
  await txDone(tx);
  mem.promos = [...keep, ...newPromos];
}
export const promos = () => mem.promos;

// ---------- Incidencias y reputación (RF-20, reglas públicas RNF-12) ----------
export const REPUTATION_RULES = {
  base: 100,
  faltanteConfirmado: 8,
  condicionConfirmada: 5,
  sinConfirmar: 2,
  ventanaDias: 90,
  confirmacionHoras: 48,
};

export async function addIncident({ storeId, productId, type, reporter }) {
  const all = await db.getAllFromIndex('incidents', 'store', storeId);
  const winMs = REPUTATION_RULES.confirmacionHoras * 3600000;
  const match = all.find((i) => i.type === type && i.productId === productId && !i.confirmed && i.reporter !== reporter && Date.now() - i.ts < winMs);
  if (match) {
    match.confirmed = true;
    match.confirmedAt = Date.now();
    await db.put('incidents', match);
    return { confirmed: true };
  }
  await db.add('incidents', { storeId, productId, type, reporter, ts: Date.now(), confirmed: false });
  return { confirmed: false };
}

export async function reputation(storeId) {
  const R = REPUTATION_RULES;
  const since = Date.now() - R.ventanaDias * 86400000;
  const list = (await db.getAllFromIndex('incidents', 'store', storeId)).filter((i) => i.ts >= since);
  let score = R.base;
  for (const i of list) {
    if (!i.confirmed) score -= R.sinConfirmar;
    else score -= i.type === 'faltante' ? R.faltanteConfirmado : R.condicionConfirmada;
  }
  return { score: Math.max(0, score), incidents: list.length, confirmed: list.filter((i) => i.confirmed).length };
}

// ---------- Tickets (huellas anti duplicado) y registro de reportes ----------
export async function hasTicket(hash) {
  return !!(await db.get('tickets', hash));
}
export async function addTicket(hash) {
  await db.put('tickets', { hash, ts: Date.now() });
}
export async function logReport(entry) {
  await db.add('reportsLog', { ...entry, ts: Date.now() });
}
export async function recentReports() {
  return db.getAll('reportsLog');
}

// ---------- Metadatos ----------
export const meta = {
  get: (k) => db.get('meta', k),
  set: (k, v) => db.put('meta', v, k),
};

export async function stats() {
  return { stores: mem.stores.size, products: mem.products.size, prices: await db.count('current'), history: await db.count('history'), promos: mem.promos.length };
}

export async function resetAll() {
  const names = ['chains', 'stores', 'products', 'current', 'history', 'promos', 'stock', 'incidents', 'tickets', 'reportsLog', 'meta'];
  const tx = db.db.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  await txDone(tx);
}
