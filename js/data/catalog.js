// Catálogo compartido del dispositivo (datos públicos de precios: no se cifra).
// Precios con versiones inmutables (RNF-11): cada cambio agrega un registro al histórico.
import { openDb, Store, txDone } from '../core/idb.js';
import * as Seed from './demo-seed.js';

let db;
const mem = { chains: new Map(), stores: new Map(), products: new Map(), byGeneric: new Map(), promos: [] };

export async function init(onProgress = () => {}) {
  const raw = await openDb('ms-catalog', CATALOG_DB_VERSION, (d, oldVersion) => {
    if (oldVersion < 2) {
      const sr = d.createObjectStore('series', { keyPath: 'key' });
      sr.createIndex('product', 'productId');
    }
    if (oldVersion >= 1) return;
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
  else if (((await db.get('meta', 'catalogVersion')) || 1) < CATALOG_VERSION) await migrateDemo(onProgress);
  await loadMemory();
}

const CATALOG_DB_VERSION = 2;
export const CATALOG_VERSION = 3; // 3: promociones con condiciones (socios, cantidad mínima, topes por período)

async function deleteWhere(store, pred) {
  await new Promise((res, rej) => {
    const tx = db.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (pred(c.value)) c.delete();
      c.continue();
    };
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

/**
 * Actualiza los datos de demostración a la nueva versión del catálogo SIN tocar lo cargado por
 * usuarios (góndola, tickets, carga manual, SEPA). Los EAN demo existentes se conservan, así que
 * las listas de los usuarios siguen siendo válidas.
 */
async function migrateDemo(onProgress) {
  onProgress('Actualizando el catálogo de demostración…', 0.05);
  await keepOnly('history', (r) => r.source !== 'demo');
  onProgress('Actualizando el catálogo de demostración…', 0.15);
  await keepOnly('current', (r) => r.source !== 'demo');
  await keepOnly('stores', (r) => !r.demo || r.manual);
  await keepOnly('products', (r) => !/^20\d{11}$/.test(r.id) || r.manual);
  await keepOnly('promos', (r) => !r.demo);
  await seedDemo(onProgress, true);
}

/** Vacía un almacén conservando sólo los registros indicados (mucho más rápido que borrar uno por uno). */
async function keepOnly(store, keep) {
  const all = await db.getAll(store);
  const kept = all.filter(keep);
  if (kept.length === all.length) return;
  await db.clear(store);
  if (!kept.length) return;
  const os = db.db.transaction(store).objectStore(store);
  if (os.keyPath) await db.bulkPut(store, kept, 5000);
  else for (const r of kept) await db.add(store, r);
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

async function seedDemo(onProgress, migrating = false) {
  onProgress('Preparando catálogo de demostración…', 0.3);
  const products = Seed.buildProducts();
  const stores = Seed.buildStores();
  const chainsById = Object.fromEntries(Seed.CHAINS.map((c) => [c.id, c]));
  await db.bulkPut('chains', Seed.CHAINS);
  await db.bulkPut('stores', stores);
  await db.bulkPut('products', products);
  onProgress(`Generando precios de ${stores.length} sucursales y ${products.length} productos…`, 0.4);
  let { current, series } = Seed.buildPrices(products, stores, chainsById);
  if (migrating) {
    // no pisar precios cargados por usuarios
    const kept = new Set((await db.getAll('current')).map((r) => r.key));
    current = current.filter((r) => !kept.has(r.key));
  }
  for (let i = 0; i < current.length; i += 5000) {
    await db.bulkPut('current', current.slice(i, i + 5000), 5000);
    onProgress('Guardando precios vigentes…', 0.4 + (0.25 * i) / current.length);
  }
  for (let i = 0; i < series.length; i += 5000) {
    await db.bulkPut('series', series.slice(i, i + 5000), 5000);
    onProgress('Guardando 12 meses de historia…', 0.65 + (0.3 * i) / series.length);
  }
  await db.bulkPut('promos', Seed.buildPromos(products));
  await db.put('meta', Date.now(), 'seededAt');
  await db.put('meta', CATALOG_VERSION, 'catalogVersion');
  await db.put('meta', Seed.dayKey(), 'lastSync');
  const log = (await db.get('meta', 'syncLog')) || [];
  await db.put('meta', [{ ts: Date.now(), source: 'Datos de demostración', ok: true, products: products.length, prices: current.length, changed: 0, note: migrating ? `Catálogo ampliado (versión ${CATALOG_VERSION})` : 'Carga inicial' }, ...log].slice(0, 50), 'syncLog');
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
  const today = Seed.dayKey();
  return mem.promos.filter((p) => (p.storeId ? p.storeId === storeId : p.chainId === s.chainId) && (!p.until || p.until >= today));
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
export async function addRawPrices(current, series) {
  await db.bulkPut('current', current);
  await db.bulkPut('series', series, 5000);
}

/** Histórico de un producto: series mensuales compactas + versiones registradas. */
export async function historyForProduct(productId) {
  const [hist, ser] = await Promise.all([db.getAllFromIndex('history', 'product', productId), db.getAllFromIndex('series', 'product', productId)]);
  const out = [];
  for (const s of ser) s.dates.forEach((date, i) => out.push({ storeId: s.storeId, productId, date, price: s.prices[i], source: 'demo' }));
  return out.concat(hist);
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

// ---------- Incidencias y reputación (RF-17, reglas públicas RNF-12) ----------
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
  return { stores: mem.stores.size, products: mem.products.size, prices: await db.count('current'), history: (await db.count('history')) + (await db.count('series')) * 12, promos: mem.promos.length };
}

export async function resetAll() {
  const names = ['chains', 'stores', 'products', 'current', 'history', 'series', 'promos', 'stock', 'incidents', 'tickets', 'reportsLog', 'meta'];
  const tx = db.db.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  await txDone(tx);
}

// ---------- Carga manual (CU-10: Colaborador nivel 2 / Administrador) ----------
export async function removePromo(id) {
  await db.delete('promos', id);
  mem.promos = mem.promos.filter((p) => p.id !== id);
}

export async function addPromo(promo) {
  await db.put('promos', promo);
  mem.promos = [...mem.promos.filter((p) => p.id !== promo.id), promo];
}

export async function deleteStore(id) {
  await db.delete('stores', id);
  await deleteWhere('current', (r) => r.storeId === id);
  await deleteWhere('promos', (r) => r.storeId === id);
  mem.stores.delete(id);
  mem.promos = mem.promos.filter((p) => p.storeId !== id);
}

export async function deleteProduct(id) {
  const p = mem.products.get(id);
  await db.delete('products', id);
  await deleteWhere('current', (r) => r.productId === id);
  mem.products.delete(id);
  if (p) mem.byGeneric.set(p.generic, (mem.byGeneric.get(p.generic) || []).filter((x) => x.id !== id));
  if (p && !mem.byGeneric.get(p.generic)?.length) mem.byGeneric.delete(p.generic);
}

export async function manualLog() {
  return (await db.getAll('reportsLog')).filter((r) => r.kind === 'manual').sort((a, b) => b.ts - a.ts);
}
