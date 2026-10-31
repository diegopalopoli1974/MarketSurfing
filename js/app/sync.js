// CU-10: sincronización de precios mediante adaptadores (RNF-07). El "Planificador" corre al abrir la app.
import * as Cat from '../data/catalog.js';
import { rng, dayKey, buildPromos } from '../data/demo-seed.js';
import { importSepa } from '../data/sepa.js';
import * as Alerts from './alerts.js';

/** Adaptador de demostración: simula la publicación diaria de Precios Claros. */
export const DemoAdapter = {
  id: 'demo',
  name: 'Fuente de demostración (simula Precios Claros / APIs de cadenas)',
  async fetch() {
    const today = dayKey();
    const r = rng(`sync-${today}-${Date.now()}`);
    const stores = Cat.stores().map((s) => s.id);
    const { prices } = await Cat.currentForStores(stores);
    const out = [];
    for (const rec of prices.values()) {
      if (rec.source !== 'demo' && rec.source !== 'sepa-demo') continue;
      if (r() < 0.12) {
        const change = 1 + (r() * 0.14 - 0.06); // -6 % a +8 %
        out.push({ storeId: rec.storeId, productId: rec.productId, price: Math.max(50, Math.round((rec.price * change) / 10) * 10), date: today, source: 'demo' });
      }
    }
    const promos = buildPromos(Cat.products().filter((p) => !p.sepa), today).filter((p) => p.rotating);
    return { prices: out, promos, replacePromos: (p) => p.rotating && p.demo };
  },
};

export function sepaAdapter(files, opts) {
  return {
    id: 'sepa',
    name: `Archivo SEPA (${files.map((f) => f.name).join(', ')})`,
    async fetch() {
      const res = await importSepa(files, { ...opts, knownProducts: new Map(Cat.products().map((p) => [p.id, p])) });
      if (!res.stores.length) throw new Error('No se encontraron sucursales dentro del radio elegido en el archivo');
      if (!res.prices.length) throw new Error('El archivo no tiene precios para las sucursales del radio');
      return { ...res, replacePromos: (p) => p.sepa && res.stores.some((s) => s.id === p.storeId) };
    },
  };
}

function validate(batch) {
  // paso 4: normalización e integridad
  const ok = [];
  let bad = 0;
  for (const p of batch.prices) {
    if (!p.storeId || !p.productId || !(p.price > 0) || p.price > 50_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) bad++;
    else ok.push(p);
  }
  if (batch.prices.length && bad / batch.prices.length > 0.3) throw new Error(`Lote corrupto: ${bad} de ${batch.prices.length} registros inválidos`);
  return { ok, bad };
}

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e.noRetry) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i)); // espera creciente
    }
  }
  throw last;
}

/** Ejecuta la sincronización (pasos 1 a 7). actor: 'Planificador' | 'Administrador'. */
export async function runSync(adapters, actor, onProgress = () => {}) {
  const t0 = performance.now();
  const results = [];
  // paso 2: las fuentes se consultan en paralelo
  const fetched = await Promise.allSettled(adapters.map((a) => withRetry(() => a.fetch(onProgress), a.id === 'sepa' ? 1 : 3)));
  const allChanges = [];
  for (let i = 0; i < adapters.length; i++) {
    const a = adapters[i];
    const f = fetched[i];
    if (f.status === 'rejected') {
      // E-1: fuente desactualizada, lote en cuarentena (no se tocan los datos vigentes)
      results.push({ ts: Date.now(), source: a.name, actor, ok: false, error: f.reason?.message || String(f.reason) });
      continue;
    }
    try {
      const batch = f.value;
      const { ok, bad } = validate(batch);
      if (batch.chains?.length) await Cat.addChains(batch.chains);
      if (batch.stores?.length) await Cat.addStores(batch.stores);
      if (batch.products?.length) await Cat.addProducts(batch.products);
      onProgress('Guardando nuevas versiones de precios…', 0.6);
      const changed = await Cat.bulkRecordPrices(ok, (p) => onProgress('Guardando nuevas versiones de precios…', 0.6 + p * 0.35));
      if (batch.promos) await Cat.replacePromos(batch.replacePromos || (() => false), batch.promos);
      allChanges.push(...changed);
      results.push({ ts: Date.now(), source: a.name, actor, ok: true, prices: ok.length, invalid: bad, changed: changed.length, stores: batch.stores?.length || 0, products: batch.products?.length || 0 });
    } catch (e) {
      results.push({ ts: Date.now(), source: a.name, actor, ok: false, error: e.message });
    }
  }
  // paso 6: informar precios modificados al servicio de alertas
  const alertsSent = await Alerts.evaluate(allChanges).catch(() => 0);
  const elapsed = Math.round(performance.now() - t0);
  results.forEach((r) => ((r.elapsedMs = elapsed), (r.alertsSent = alertsSent)));
  const log = (await Cat.meta.get('syncLog')) || [];
  await Cat.meta.set('syncLog', [...results, ...log].slice(0, 50));
  if (results.some((r) => r.ok)) await Cat.meta.set('lastSync', dayKey());
  return results;
}

export async function autoSyncIfDue() {
  const last = await Cat.meta.get('lastSync');
  if (last === dayKey()) return null;
  return runSync([DemoAdapter], 'Planificador de tareas');
}
