// Punto de entrada: arranque, enrutador por hash, shell con navegación y bloqueo.
import { h, clear, icon } from './ui/dom.js';
import { toast } from './ui/components.js';
import * as Cat from './data/catalog.js';
import * as UD from './core/userdata.js';
import { session, onLock, applyPrefs, isAdmin, collabLevel } from './app/session.js';
import { renderLogin } from './views/login.js';
import * as Alerts from './app/alerts.js';
import { autoSyncIfDue } from './app/sync.js';
import { initTooltips } from './ui/help.js';

const app = document.getElementById('app');

const routes = {
  '': () => import('./views/home.js'),
  listas: () => import('./views/lists.js'),
  alertas: () => import('./views/alerts.js'),
  buscar: () => import('./views/search.js'),
  perfil: () => import('./views/profile.js'),
  gondola: () => import('./views/gondola.js'),
  ticket: () => import('./views/ticket.js'),
  sync: () => import('./views/sync.js'),
  reportes: () => import('./views/reports.js'),
  ajustes: () => import('./views/settings.js'),
  avisos: () => import('./views/inbox.js'),
  catalogo: () => import('./views/catalog.js'),
};

const NAV = [
  { r: '', label: 'Inicio', icon: 'home', tip: 'Pantalla principal' },
  { r: 'listas', label: 'Listas', icon: 'list', tip: 'Tus listas de compras' },
  { r: 'buscar', label: 'Buscar', icon: 'wave', tip: 'Dónde y cuándo conviene comprar una lista' },
  { r: 'reportes', label: 'Reportes', icon: 'chart', tip: 'Inflación por marca, por rubro y mapa de promociones' },
  { r: 'mas', label: 'Más', icon: 'layers', tip: 'Alertas, perfil, funciones de Colaborador y seguridad' },
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { route: parts[0] || '', params: parts.slice(1), query: new URLSearchParams(query) };
}

let mainEl, navEl;
let renderToken = 0;

function buildShell() {
  clear(app);
  mainEl = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  navEl = h('nav', { class: 'bottom-nav', 'aria-label': 'Navegación principal' });
  const demoBadge = h('div', { class: 'demo-banner', role: 'note' }, icon('info', { size: 16 }), 'Precios de demostración: simulados con fines académicos');
  app.append(h('a', { class: 'skip', href: '#main' }, 'Saltar al contenido'), demoBadge, mainEl, navEl);
  renderNav();
}

function renderNav() {
  clear(navEl);
  const { route } = parseHash();
  const inbox = UD.active() ? UD.get('activity').inbox.filter((i) => !i.read).length : 0;
  for (const n of NAV) {
    const isMore = n.r === 'mas';
    const active = isMore ? !['', 'listas', 'buscar', 'reportes'].includes(route) : route === n.r;
    const el = isMore
      ? h('button', { class: ['nav-item', active && 'active'], onclick: openMore, 'aria-haspopup': 'dialog', 'data-tip': n.tip }, icon(n.icon), h('span', {}, n.label), inbox ? h('b', { class: 'badge', 'aria-label': `${inbox} avisos sin leer` }, String(inbox)) : null)
      : h('a', { class: ['nav-item', active && 'active'], href: `#/${n.r}`, 'aria-current': active ? 'page' : null, 'data-tip': n.tip }, icon(n.icon), h('span', {}, n.label));
    navEl.append(el);
  }
}

function openMore() {
  const items = [
    { href: '#/alertas', icon: 'bell', label: 'Alertas de precio', sub: 'Te avisamos cuando un producto llega a tu precio · CU-02' },
    { href: '#/avisos', icon: 'info', label: 'Avisos recibidos', sub: 'Avisos de tus alertas' },
    { href: '#/perfil', icon: 'user', label: 'Mi perfil de compra', sub: 'Medios de pago, días, comercios y gamas · CU-07' },
    !collabLevel() ? { href: '#/perfil?s=dias', icon: 'mic', label: 'Sumarme como Colaborador', sub: 'Para cargar tickets y reportar en góndola' } : null,
    collabLevel() >= 1 ? { href: '#/gondola', icon: 'mic', label: 'Reportar en góndola', sub: 'CU-08 · Colaborador' } : null,
    collabLevel() >= 1 ? { href: '#/ticket', icon: 'ticket', label: 'Cargar ticket', sub: 'CU-09 · Colaborador' } : null,
    collabLevel() >= 2 ? { href: '#/catalogo', icon: 'store', label: 'Cargar comercios, productos y precios', sub: 'CU-12 · Colaborador nivel 2' } : null,
    isAdmin() ? { href: '#/sync', icon: 'sync', label: 'Sincronizar precios', sub: 'Demo o archivo Precios Claros · CU-10 · Administrador' } : null,
    { href: '#/ajustes', icon: 'shield', label: 'Seguridad y cuenta', sub: isAdmin() ? 'Contraseña, huella, copia y roles de las cuentas' : 'Contraseña, huella y copia de seguridad' },
  ].filter(Boolean);
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Más opciones' });
  const close = () => {
    sheet.close();
    sheet.remove();
  };
  sheet.append(
    h('div', { class: 'sheet-grip' }),
    h(
      'ul',
      { class: 'menu' },
      items.map((i) => h('li', {}, h('a', { href: i.href, onclick: close }, icon(i.icon), h('span', {}, h('strong', {}, i.label), h('small', {}, i.sub)), icon('chevron', { size: 18 })))),
      h('li', {}, h('button', { class: 'menu-lock', onclick: () => (close(), import('./app/session.js').then((m) => m.lock('manual'))) }, icon('lock'), h('span', {}, h('strong', {}, 'Bloquear'), h('small', {}, session.account?.displayName || '')), ''))
    )
  );
  sheet.addEventListener('click', (e) => e.target === sheet && close());
  sheet.addEventListener('cancel', close);
  document.body.append(sheet);
  sheet.showModal();
}

async function route() {
  if (!session.account) return;
  const token = ++renderToken;
  const { route: r, params, query } = parseHash();
  const loader = routes[r] || routes[''];
  renderNav();
  try {
    const mod = await loader();
    const view = await mod.render({ params, query, rerender: route });
    if (token !== renderToken) return;
    clear(mainEl).append(view);
    mainEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (!UD.active()) return; // se bloqueó mientras cargaba
    console.error(e);
    clear(mainEl).append(h('div', { class: 'card error' }, h('h2', {}, 'Ocurrió un error'), h('p', {}, e.message || String(e))));
  }
}

async function enterApp() {
  buildShell();
  if (!location.hash) location.hash = '#/';
  document.body.classList.add('in-app');
  await route();
  // tareas en segundo plano tras el ingreso
  autoSyncIfDue().catch(() => {});
  Alerts.evaluateAll().catch(() => {});
}

onLock((reason) => {
  const msg = reason === 'inactividad' ? 'Sesión bloqueada por inactividad' : reason === 'segundo plano' ? 'Sesión bloqueada al volver a la app' : null;
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  showLogin();
  if (msg) toast(msg, 'info');
});

function showLogin() {
  document.body.classList.remove('in-app');
  applyPrefs();
  clear(app).append(renderLogin({ onSuccess: enterApp }));
}

window.addEventListener('hashchange', route);
window.addEventListener('ms:inbox', () => navEl && renderNav());

initTooltips();

async function boot() {
  const splash = h('div', { class: 'splash' }, h('img', { src: 'icons/icon.svg', alt: '', width: 72, height: 72 }), h('h1', {}, 'MarketSurfing'), h('p', { class: 'muted', id: 'boot-msg' }, 'Iniciando…'), h('div', { class: 'progress' }, h('div', { class: 'progress-bar', id: 'boot-bar' })));
  clear(app).append(splash);
  if (!window.isSecureContext) toast('La app necesita HTTPS para cifrar datos y usar el GPS.', 'error', 8000);
  if (!window.crypto?.subtle || !window.indexedDB) {
    clear(app).append(h('div', { class: 'card error' }, h('h2', {}, 'Navegador no compatible'), h('p', {}, 'Se necesita un navegador actualizado con WebCrypto e IndexedDB.')));
    return;
  }
  try {
    await Cat.init((msg, p) => {
      document.getElementById('boot-msg').textContent = msg;
      document.getElementById('boot-bar').style.width = `${Math.round(p * 100)}%`;
    });
  } catch (e) {
    clear(app).append(h('div', { class: 'card error' }, h('h2', {}, 'No se pudo abrir la base local'), h('p', {}, e.message)));
    return;
  }
  navigator.storage?.persist?.().catch(() => {});
  showLogin();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}

boot();
