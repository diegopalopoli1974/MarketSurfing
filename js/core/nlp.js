// "Servicio IA" de CU-08 implementado como intérprete LOCAL de texto coloquial (sin enviar datos a la nube).
// Extrae producto, precio, promoción y estado de stock con un nivel de confianza.
import * as Cat from '../data/catalog.js';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '');

const STOP = new Set('de del la el los las en con sin y a al un una por para que esta estan hay no x lt kg gr g ml cc'.split(' '));
const ISSUERS = ['mercado pago', 'modo', 'cuenta dni', 'naranja x', 'uala', 'banco nacion', 'galicia', 'santander', 'bbva', 'provincia', 'macro', 'visa', 'mastercard', 'american express', 'efectivo'];

function parseAmount(s) {
  // "1.890,50" | "1890" | "1,890" | "1.890"
  let t = s.replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const WORD_NUM = { cien: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
function spokenThousands(t) {
  // "mil ochocientos" / "dos mil quinientos" (dictado sin dígitos)
  const m = t.match(/\b(?:(\d+|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?mil(?:\s+(cien|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos))?(?:\s+(\d{1,2}))?\b/);
  if (!m) return null;
  const units = { un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const k = m[1] ? Number(m[1]) || units[m[1]] || 1 : 1;
  return k * 1000 + (m[2] ? WORD_NUM[m[2]] : 0) + (m[3] ? Number(m[3]) : 0);
}

export function interpret(text) {
  const raw = String(text || '').slice(0, 600);
  const t = norm(raw);
  const out = { text: raw, product: null, alternatives: [], price: null, promo: null, issuer: null, stock: null, confidence: 0, notes: [] };

  // Stock
  if (/\b(no hay|sin stock|agotad[oa]s?|faltante|no queda|no quedan|vaci[oa]|no tienen|falta|no tiene)\b/.test(t)) out.stock = 'out';
  else if (/\b(hay stock|en stock|hay bastante|lleno|hay mucho|disponible)\b/.test(t)) out.stock = 'ok';

  // Promociones
  let m;
  if ((m = t.match(/\b(\d)\s*x\s*(\d)\b/)) && Number(m[1]) > Number(m[2])) out.promo = { type: 'nxm', n: Number(m[1]), m: Number(m[2]), label: `${m[1]}x${m[2]}` };
  else if ((m = t.match(/\b(?:2da|segunda|2a)\s*(?:unidad)?\s*(?:al|a)\s*(\d{1,3})\s*%?/))) out.promo = { type: 'second', pct: Number(m[1]), label: `2da unidad al ${m[1]} %` };
  else if ((m = t.match(/\b(\d{1,2})\s*(?:%|por ciento)\s*(?:off|de descuento|descuento|menos)?/))) out.promo = { type: 'pct', pct: Number(m[1]), label: `${m[1]} % de descuento` };
  for (const iss of ISSUERS) if (t.includes(iss)) out.issuer = iss;
  if (out.promo && out.issuer) out.promo.label += ` con ${out.issuer}`;

  // Precio: primero "$ 1.890" o "1.890 pesos"; si no, un número grande que no sea presentación ni promo
  const cleaned = t.replace(/\b\d\s*x\s*\d\b/g, ' ').replace(/\b\d{1,3}\s*(%|por ciento)/g, ' ').replace(/\b(2da|segunda)\s*(unidad)?\s*(al|a)\s*\d+/g, ' ');
  if ((m = cleaned.match(/\$\s*([\d.,]+)/)) || (m = cleaned.match(/([\d.,]+)\s*(?:pesos|mangos)\b/)) || (m = cleaned.match(/\b(?:a|sale|cuesta|esta|precio|vale)\s+(?:a\s+)?\$?\s*([\d.,]{3,})/))) out.price = parseAmount(m[1]);
  if (out.price == null) {
    const nums = [...cleaned.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{3,7}(?:,\d{1,2})?)(?![\d.,]*\s*(?:g|gr|grs|gramos|kg|kilo|kilos|ml|cc|l|lt|lts|litro|litros|u|unidades|m|metros)\b)/g)].map((x) => parseAmount(x[1])).filter((n) => n && n >= 50);
    if (nums.length) out.price = Math.max(...nums);
  }
  if (out.price == null) out.price = spokenThousands(cleaned);

  // Producto: puntaje por marca, nombre genérico y presentación
  const tokens = new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
  const scored = [];
  for (const p of Cat.products()) {
    let score = 0;
    const brand = norm(p.brand);
    if (brand !== 'sin marca' && t.includes(brand)) score += 4;
    const gWords = norm(p.genericName).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    const hit = gWords.filter((w) => tokens.has(w) || [...tokens].some((tk) => tk.length > 3 && (tk.startsWith(w.slice(0, 5)) || w.startsWith(tk.slice(0, 5))))).length;
    score += hit * 2;
    if (hit && hit === gWords.length) score += 1;
    const pres = norm(p.presentation).replace(/\s/g, '');
    if (pres && t.replace(/\s/g, '').includes(pres)) score += 1;
    if (score > 0) scored.push({ p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  if (scored.length) {
    out.product = scored[0].p;
    out.alternatives = scored.slice(1, 5).map((x) => x.p);
    const top = scored[0].score;
    const second = scored[1]?.score ?? 0;
    let c = Math.min(1, top / 7);
    if (top === second) c *= 0.6; // ambiguo
    if (out.price == null && out.stock !== 'out') c *= 0.6;
    out.confidence = Math.round(c * 100) / 100;
  }
  if (!out.product) out.notes.push('No se reconoció el producto');
  if (out.price == null && out.stock !== 'out') out.notes.push('No se reconoció el precio');
  return out;
}
