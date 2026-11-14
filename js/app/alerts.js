// CU-12 Evaluar y Notificar Alertas de Precio: incluido por los casos que actualizan precios (CU-07, CU-08, CU-09 y CU-11).
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import { distanceKm } from '../core/geo.js';
import { volumeCost, money } from '../core/engine.js';
import { notifyInbox } from './session.js';

const DEDUP_MS = 24 * 3600 * 1000;

/** Zonas de una alerta (las alertas antiguas tenían un único punto de referencia y radio). */
export function zonesOf(a) {
  if (a.zones?.length) return a.zones;
  if (a.ref) return [{ lat: a.ref.lat, lng: a.ref.lng, label: a.ref.label, radiusKm: a.radiusKm || 3 }];
  return [];
}
const inZones = (a, store) => zonesOf(a).some((z) => distanceKm(z, store) <= z.radiusKm);

function finalPrice(alert, storeId, product, listPrice) {
  if (!alert.usePromos) return { final: listPrice, label: null };
  const day = new Date().getDay();
  const promos = Cat.promosForStore(storeId);
  const v = volumeCost(listPrice, 1, product, promos, day);
  let final = v.cost;
  let label = v.label;
  const issuers = new Set((UD.get('profile').payments || []).map((p) => p.issuer));
  for (const pr of promos) {
    if (pr.type !== 'payment' || !issuers.has(pr.issuer) || (pr.days && !pr.days.includes(day))) continue;
    const d = Math.min(final * (pr.pct / 100), pr.cap ?? Infinity);
    if (final - d < final) {
      final = Math.round(final - d);
      label = label ? `${label} + ${pr.label}` : pr.label;
      break;
    }
  }
  return { final, label };
}

/** changes: [{ storeId, productId, price, prev? }] */
export async function evaluate(changes) {
  if (!UD.active() || !changes?.length) return 0;
  const alerts = UD.get('alerts').filter((a) => a.active && (!a.until || new Date(a.until + 'T23:59:59') >= new Date()));
  if (!alerts.length) return 0;
  let sent = 0;
  const hits = new Map(); // alerta -> coincidencias nuevas (se envía un único aviso por alerta)
  for (const ch of changes) {
    const product = Cat.product(ch.productId);
    const store = Cat.store(ch.storeId);
    if (!product || !store) continue;
    for (const a of alerts) {
      if (a.productId ? a.productId !== product.id : a.generic !== product.generic) continue;
      if (!inZones(a, store)) continue;
      const { final, label } = finalPrice(a, store.id, product, ch.price);
      let hit = false;
      if (a.type === 'price') hit = final <= a.value;
      else {
        const regular = Math.max(ch.price, ch.prev || 0);
        hit = regular > 0 && ((regular - final) / regular) * 100 >= a.value;
      }
      if (!hit) continue; // A-1
      const key = `${product.id}|${store.id}`;
      a.sentLog = a.sentLog || {};
      if (a.sentLog[key] && Date.now() - a.sentLog[key] < DEDUP_MS) continue; // A-2
      a.sentLog[key] = Date.now();
      if (!hits.has(a)) hits.set(a, []);
      hits.get(a).push({ product, store, final, label });
    }
  }
  for (const [, list] of hits) {
    list.sort((x, y) => x.final - y.final);
    const best = list[0];
    const title = `Precio alcanzado: ${best.product.name}`;
    const body = `${money(best.final)} en ${best.store.name}${best.label ? ` (${best.label})` : ''}.${list.length > 1 ? ` Y en ${list.length - 1} comercio(s) más.` : ''}`;
    await notifyInbox(title, body, 'alert');
    await push(title, body);
    sent++;
  }
  await UD.save('alerts');
  return sent;
}

/** Re-evalúa contra los precios vigentes (al iniciar sesión o crear una alerta). */
export async function evaluateAll() {
  if (!UD.active()) return 0;
  const alerts = UD.get('alerts').filter((a) => a.active);
  const pids = new Set();
  for (const a of alerts) {
    if (a.productId) pids.add(a.productId);
    else Cat.productsByGeneric(a.generic).forEach((p) => pids.add(p.id));
  }
  const changes = [];
  for (const pid of pids) for (const rec of await Cat.currentByProduct(pid)) changes.push({ storeId: rec.storeId, productId: pid, price: rec.price });
  return evaluate(changes);
}

/** Servicio de notificaciones (actor secundario): notificación local mediante el service worker. */
async function push(title, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    // El texto de la notificación no incluye datos personales, sólo producto, precio y comercio.
    if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: `ms-${title}`, lang: 'es-AR' });
    else new Notification(title, { body });
  } catch {
    /* sin permisos: queda en la bandeja interna */
  }
}

export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

