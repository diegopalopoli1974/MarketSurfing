// Estado de la sesión, bloqueo automático y utilidades compartidas entre vistas.
import * as UD from '../core/userdata.js';
import { sha256Hex } from '../core/crypto.js';

export const session = { account: null, reporterId: null, location: null };
let lockHandler = () => {};
let lastActivity = Date.now();
let hiddenAt = null;
let timer = null;

export function onLock(fn) {
  lockHandler = fn;
}

export async function begin(sess) {
  session.account = sess.account;
  session.reporterId = (await sha256Hex(`reporter:${sess.account.id}`)).slice(0, 16); // identificador anónimo
  await UD.startSession(sess.account.id, sess.account.username, sess.key);
  applyPrefs();
  lastActivity = Date.now();
  clearInterval(timer);
  timer = setInterval(checkIdle, 15_000);
}

export function lock(reason = 'manual') {
  clearInterval(timer);
  UD.endSession();
  session.account = null;
  session.location = null; // RNF-03: la ubicación no sobrevive a la sesión
  lockHandler(reason);
}

function checkIdle() {
  if (!session.account) return;
  const min = UD.get('profile')?.prefs?.autoLockMin ?? 5;
  if (Date.now() - lastActivity > min * 60_000) lock('inactividad');
}

['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => window.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (session.account && hiddenAt && Date.now() - hiddenAt > 60_000) lock('segundo plano');
});

export function applyPrefs() {
  const prefs = UD.active() ? UD.get('profile').prefs : { theme: 'auto', fontScale: 1 };
  const root = document.documentElement;
  if (prefs.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = prefs.theme;
  root.style.setProperty('--font-scale', String(prefs.fontScale || 1));
}

export const isAdmin = () => session.account?.role === 'admin';

// ---------- Puntos (RF-10, reglas públicas y determinísticas RNF-12) ----------
export const POINT_RULES = {
  reporte: 10,
  reporteConIncidencia: 5,
  ticketPorLinea: 2,
  ticketMaximo: 30,
  topeReportesDia: 20,
  topeTicketsDia: 3,
  mismaSucursalProductoHoras: 6,
};

export async function addPoints(amount, reason) {
  await UD.update('activity', (a) => {
    a.points += amount;
    a.pointsLog.unshift({ ts: Date.now(), amount, reason });
    a.pointsLog = a.pointsLog.slice(0, 200);
  });
}

export async function notifyInbox(title, body, kind = 'alert') {
  await UD.update('activity', (a) => {
    a.inbox.unshift({ id: crypto.randomUUID(), ts: Date.now(), title, body, kind, read: false });
    a.inbox = a.inbox.slice(0, 100);
  });
  window.dispatchEvent(new CustomEvent('ms:inbox'));
}
