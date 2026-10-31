// Adaptador de archivos SEPA / Precios Claros (Res. 12/2016). Lee .zip (anidados) o .csv separados por "|".
// Sin dependencias: el ZIP se descomprime con DecompressionStream('deflate-raw') del navegador.
import { distanceKm } from '../core/geo.js';
import { dayKey } from './demo-seed.js';

// ---------- Lector ZIP mínimo ----------
async function readZipEntries(blob) {
  const tailSize = Math.min(blob.size, 66000);
  const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP inválido (no se encontró el directorio central)');
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    // ZIP64
    const locOff = eocd - 20;
    if (locOff >= 0 && tail.getUint32(locOff, true) === 0x07064b50) {
      const z64Off = Number(tail.getBigUint64(locOff + 8, true));
      const z = new DataView(await blob.slice(z64Off, z64Off + 56).arrayBuffer());
      count = Number(z.getBigUint64(32, true));
      cdSize = Number(z.getBigUint64(40, true));
      cdOffset = Number(z.getBigUint64(48, true));
    }
  }
  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const entries = [];
  let p = 0;
  const td = new TextDecoder();
  for (let i = 0; i < count && p < cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true);
    let csize = cd.getUint32(p + 20, true);
    let usize = cd.getUint32(p + 24, true);
    const nlen = cd.getUint16(p + 28, true);
    const xlen = cd.getUint16(p + 30, true);
    const clen = cd.getUint16(p + 32, true);
    let lho = cd.getUint32(p + 42, true);
    const name = td.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen));
    // campo extra ZIP64
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend) {
      const id = cd.getUint16(x, true);
      const sz = cd.getUint16(x + 2, true);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = Number(cd.getBigUint64(q, true)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.getBigUint64(q, true)); q += 8; }
        if (lho === 0xffffffff) { lho = Number(cd.getBigUint64(q, true)); }
      }
      x += 4 + sz;
    }
    entries.push({ name, method, csize, usize, lho });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}

async function entryBlob(blob, e) {
  const lh = new DataView(await blob.slice(e.lho, e.lho + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('ZIP dañado');
  const start = e.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const raw = blob.slice(start, start + e.csize);
  if (e.method === 0) return raw;
  if (e.method !== 8) throw new Error(`Compresión ZIP no soportada (${e.method})`);
  if (!('DecompressionStream' in window)) throw new Error('El navegador no puede descomprimir ZIP; extraé los CSV y cargalos sueltos');
  return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
}

// ---------- CSV en streaming ----------
async function* lines(blob) {
  const reader = blob.stream().pipeThrough(new TextDecoderStream('utf-8')).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
    }
  }
  if (buf) yield buf;
}

async function* csvRows(blob) {
  let header = null;
  let sep = '|';
  for await (let line of lines(blob)) {
    if (!line.trim()) continue;
    if (!header) {
      line = line.replace(/^﻿/, '');
      sep = line.includes('|') ? '|' : line.includes(';') ? ';' : ',';
      header = line.split(sep).map((x) => x.trim().toLowerCase());
      continue;
    }
    const cols = line.split(sep);
    if (cols.length < Math.min(4, header.length)) continue; // filas de pie ("Última actualización…")
    const row = {};
    header.forEach((k, i) => (row[k] = (cols[i] ?? '').trim()));
    yield row;
  }
}

const num = (s) => {
  if (s == null || s === '') return NaN;
  const t = String(s).trim();
  // SEPA usa punto decimal; toleramos coma
  return Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t);
};

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

const VTEX_HOSTS = ['carrefour', 'jumbo', 'disco', 'vea', 'supermercadosdia', 'masonline', 'changomas'];

/**
 * Importa una selección de archivos SEPA. opts: { point, radiusKm, maxStores, knownProducts:Map, onProgress }
 * Devuelve { chains, stores, products, prices, promos, stats } normalizado para el catálogo.
 */
export async function importSepa(files, opts) {
  const groups = new Map(); // carpeta -> { comercio, sucursales, productos }
  const addFile = (path, blob) => {
    const lower = path.toLowerCase();
    const base = lower.split('/').pop();
    const folder = lower.slice(0, lower.length - base.length);
    if (!groups.has(folder)) groups.set(folder, {});
    const g = groups.get(folder);
    if (base.startsWith('comercio')) g.comercio = blob;
    else if (base.startsWith('sucursales')) g.sucursales = blob;
    else if (base.startsWith('productos')) g.productos = blob;
  };
  const walkZip = async (blob, prefix, depth) => {
    if (depth > 3) return;
    for (const e of await readZipEntries(blob)) {
      if (e.name.endsWith('/')) continue;
      const n = e.name.toLowerCase();
      if (n.endsWith('.zip')) await walkZip(await entryBlob(blob, e), `${prefix}${e.name.replace(/\.zip$/i, '')}/`, depth + 1);
      else if (n.endsWith('.csv') || n.endsWith('.txt')) addFile(prefix + e.name, await lazyEntry(blob, e));
    }
  };
  // descompresión diferida: se resuelve sólo al leer el archivo
  const lazyEntry = async (blob, e) => ({ lazy: () => entryBlob(blob, e) });

  for (const f of files) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.zip')) await walkZip(f, '', 0);
    else addFile(f.name, f);
  }
  const resolve = async (b) => (b && b.lazy ? b.lazy() : b);

  const out = { chains: new Map(), stores: [], products: new Map(), prices: [], promos: [], stats: { rows: 0, skipped: 0, storesSeen: 0 } };
  const today = dayKey();
  let gi = 0;
  for (const [, g] of groups) {
    gi++;
    if (!g.sucursales || !g.productos) continue;
    if (out.stores.length >= opts.maxStores) break;
    opts.onProgress?.(`Procesando comercio ${gi} de ${groups.size}…`, gi / groups.size);
    const banderas = new Map();
    if (g.comercio) {
      for await (const r of csvRows(await resolve(g.comercio))) {
        banderas.set(`${r.id_comercio}-${r.id_bandera}`, { name: r.comercio_bandera_nombre || r.comercio_razon_social || `Comercio ${r.id_comercio}`, url: r.comercio_bandera_url || '' });
      }
    }
    const storeIds = new Set();
    for await (const r of csvRows(await resolve(g.sucursales))) {
      out.stats.storesSeen++;
      const lat = num(r.sucursales_latitud);
      const lng = num(r.sucursales_longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      if (distanceKm(opts.point, { lat, lng }) > opts.radiusKm) continue;
      if (out.stores.length >= opts.maxStores) break;
      const bKey = `${r.id_comercio}-${r.id_bandera}`;
      const b = banderas.get(bKey) || { name: `Comercio ${r.id_comercio}`, url: '' };
      const chainId = `sepa-${bKey}`;
      if (!out.chains.has(chainId)) {
        let host = null;
        try {
          host = b.url ? new URL(b.url.startsWith('http') ? b.url : `https://${b.url}`).host : null;
        } catch {
          host = null;
        }
        out.chains.set(chainId, { id: chainId, name: b.name, factor: 1, online: !!host, platform: host && VTEX_HOSTS.some((v) => host.includes(v)) ? 'vtex' : host ? 'propia' : null, host, sepa: true });
      }
      const id = `sepa-${bKey}-${r.id_sucursal}`;
      storeIds.add(`${bKey}-${r.id_sucursal}`);
      out.stores.push({ id, chainId, name: `${b.name} ${r.sucursales_nombre || ''}`.trim(), lat, lng, address: `${r.sucursales_calle || ''} ${r.sucursales_numero || ''}`.trim(), barrio: r.sucursales_localidad || r.sucursales_barrio || '', sepa: true });
    }
    if (!storeIds.size) continue;
    for await (const r of csvRows(await resolve(g.productos))) {
      out.stats.rows++;
      const sk = `${r.id_comercio}-${r.id_bandera}-${r.id_sucursal}`;
      if (!storeIds.has(sk)) continue;
      // En SEPA id_producto contiene el EAN; productos_ean es un indicador (1 = es EAN).
      const ean = String(r.id_producto || '').replace(/\D/g, '');
      const price = num(r.productos_precio_lista);
      if (!ean || ean.length < 8 || !(price > 0 && price < 50_000_000)) {
        out.stats.skipped++;
        continue;
      }
      if (!out.products.has(ean) && !opts.knownProducts.has(ean)) {
        const marca = (r.productos_marca || '').trim();
        const desc = (r.productos_descripcion || '').trim().slice(0, 120);
        const pres = `${r.productos_cantidad_presentacion || ''} ${r.productos_unidad_medida_presentacion || ''}`.trim();
        const genericName = desc.replace(new RegExp(marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').replace(/\s+/g, ' ').trim() || desc;
        out.products.set(ean, { id: ean, generic: `sepa-${slug(genericName)}`, genericName, name: desc, brand: marca || 'Sin marca', category: 'Importado (SEPA)', presentation: pres, qty: num(r.productos_cantidad_presentacion) || 1, unit: (r.productos_unidad_medida_presentacion || 'u').toLowerCase(), basePrice: Math.round(price), sepa: true });
      }
      const storeId = `sepa-${sk}`;
      out.prices.push({ storeId, productId: ean, price: Math.round(price), date: today, source: 'sepa' });
      const promoPrice = num(r.productos_precio_unitario_promo1);
      if (promoPrice > 0 && promoPrice < price) {
        const pct = Math.round((1 - promoPrice / price) * 100);
        if (pct >= 1 && pct <= 90) out.promos.push({ id: `sepa-${storeId}-${ean}`, storeId, chainId: null, type: 'pct', pct, productId: ean, days: null, sepa: true, label: (r.productos_leyenda_promo1 || `${pct} % de descuento`).slice(0, 80) });
      }
    }
  }
  return { chains: [...out.chains.values()], stores: out.stores, products: [...out.products.values()], prices: out.prices, promos: out.promos, stats: out.stats };
}
