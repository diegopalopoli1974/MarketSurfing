// "Servicio de Visión OCR" de CU-09: Tesseract.js ejecutado localmente si está instalado en /vendor/tesseract/.
// Si no está, la app lo informa y se usa el formulario asistido (la auditoría funciona igual).
import { sha256Hex } from './crypto.js';

let workerPromise = null;

export async function ocrAvailable() {
  try {
    const r = await fetch('vendor/tesseract/tesseract.min.js', { method: 'HEAD', cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('No se pudo cargar el motor de OCR'));
    document.head.append(s);
  });
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
      const base = new URL('vendor/tesseract/', location.href).href;
      return window.Tesseract.createWorker('spa', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core/',
        langPath: base + 'lang/',
        workerBlobURL: false,
        gzip: true,
        logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Reduce la imagen antes del OCR (más rápido) sin guardarla en ningún lado. */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.3)';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

export async function recognize(file, onProgress) {
  const worker = await getWorker(onProgress);
  const canvas = await prepare(file);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

// ---------- Interpretación del texto del ticket ----------
const amount = (s) => {
  let t = String(s).replace(/[^\d.,-]/g, '');
  if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{2}$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(/[.,]/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function parseTicket(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { cuit: null, date: null, time: null, total: null, payment: null, items: [], storeHint: lines.slice(0, 3).join(' ') };
  const all = lines.join('\n');
  let m;
  if ((m = all.match(/\b(\d{2})[-\s]?(\d{8})[-\s]?(\d)\b/))) out.cuit = `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = all.match(/\b(\d{2})[/-](\d{2})[/-](\d{2,4})\b/))) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    out.date = `${y}-${m[2]}-${m[1]}`;
  }
  if ((m = all.match(/\b([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/))) out.time = `${m[1]}:${m[2]}`;
  if ((m = all.match(/total\s*(?:a pagar)?\s*\$?\s*([\d.,]+)/i))) out.total = amount(m[1]);
  const pm = all.match(/(mercado ?pago|modo|cuenta dni|debito|d[eé]bito|cr[eé]dito|visa|mastercard|efectivo|naranja)/i);
  if (pm) out.payment = pm[1];
  let pendingQty = null;
  for (const l of lines) {
    if (/total|subtotal|iva|cuit|cambio|vuelto|ticket|factura|fecha|hora|caja|cajero|tarjeta|pago|efectivo/i.test(l)) continue;
    const q = l.match(/^(\d{1,3})(?:[.,]\d+)?\s*(?:x|u\s*x)\s*\$?\s*([\d.,]+)\s*$/i);
    if (q) {
      pendingQty = { qty: Number(q[1]), unit: amount(q[2]) };
      continue;
    }
    const it = l.match(/^(.{3,}?)\s+\$?\s*(-?[\d.]+,\d{2}|-?\d+\.\d{2})\s*$/);
    if (it) {
      const price = amount(it[2]);
      if (price == null || price <= 0) continue;
      const qty = pendingQty?.qty || 1;
      out.items.push({ desc: it[1].replace(/^\d{8,14}\s*/, '').trim(), qty, amount: price });
      pendingQty = null;
    }
  }
  return out;
}

export function validCuit(cuit) {
  const d = String(cuit || '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0);
  let v = 11 - (s % 11);
  if (v === 11) v = 0;
  if (v === 10) v = 9;
  return v === Number(d[10]);
}

export const MAX_TICKET_AGE_DAYS = 30;

/** Paso 4: auditoría (formato fiscal, coherencia aritmética, antigüedad y duplicado). */
export async function audit(t, isDuplicate) {
  const issues = [];
  if (t.cuit && !validCuit(t.cuit)) issues.push('El CUIT no tiene un formato fiscal válido');
  if (!t.date) issues.push('Falta la fecha del ticket');
  else {
    const d = new Date(`${t.date}T${t.time || '12:00'}`);
    const age = (Date.now() - d.getTime()) / 86400000;
    if (Number.isNaN(d.getTime())) issues.push('Fecha inválida');
    else if (age < -0.05) issues.push('La fecha del ticket es futura');
    else if (age > MAX_TICKET_AGE_DAYS) issues.push(`El ticket tiene más de ${MAX_TICKET_AGE_DAYS} días (fuera de fecha)`);
  }
  const sum = t.items.reduce((a, i) => a + i.amount, 0);
  if (!(t.total > 0)) issues.push('Falta el total');
  else if (Math.abs(sum - t.total) > Math.max(2, t.total * 0.005)) issues.push(`Total incoherente: la suma de ítems da $ ${Math.round(sum).toLocaleString('es-AR')} y el total es $ ${Math.round(t.total).toLocaleString('es-AR')}`);
  const fingerprint = await sha256Hex(['ticket', t.storeId, t.cuit || '', t.date, t.time || '', Math.round(t.total || 0), t.items.length, t.items.map((i) => Math.round(i.amount)).join(',')].join('|'));
  if (await isDuplicate(fingerprint)) issues.push('Este ticket ya fue cargado (duplicado)');
  return { ok: !issues.length, issues, fingerprint, sum };
}
