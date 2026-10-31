import { h, icon } from '../ui/dom.js';
import { card } from '../ui/components.js';
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import { session, isAdmin } from '../app/session.js';

export async function render() {
  const lists = UD.get('lists').filter((l) => !l.deleted);
  const alerts = UD.get('alerts').filter((a) => a.active);
  const act = UD.get('activity');
  const profile = UD.get('profile');
  const unread = act.inbox.filter((i) => !i.read).length;
  const lastSync = await Cat.meta.get('lastSync');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  const tile = (href, ic, title, sub, extra) => h('a', { class: 'tile', href }, h('span', { class: 'tile-icon' }, icon(ic, { size: 26 })), h('span', { class: 'tile-text' }, h('strong', {}, title), h('small', {}, sub)), extra || null);

  return h(
    'div',
    { class: 'page' },
    h('header', { class: 'hero' }, h('p', { class: 'hero-kicker' }, `${greet}, ${session.account.displayName}`), h('h1', {}, '¿Dónde y cuándo conviene comprar?'), h('a', { class: 'btn btn-primary btn-lg', href: '#/buscar' }, icon('wave'), 'Buscar la mejor ola')),
    unread ? h('a', { class: 'notice', href: '#/avisos' }, icon('bell'), h('span', {}, `Tenés ${unread} aviso(s) de precio sin leer`), icon('chevron', { size: 18 })) : null,
    h(
      'div',
      { class: 'tiles' },
      tile('#/listas', 'list', 'Mis listas', `${lists.length} lista(s)`),
      tile('#/alertas', 'bell', 'Alertas', `${alerts.length} activa(s)`),
      tile('#/reportes', 'chart', 'Reportes', 'Inflación por marca'),
      tile('#/perfil', 'user', 'Perfil de compra', `${profile.payments.length} medio(s) de pago`),
      profile.verifier.enabled ? tile('#/gondola', 'mic', 'Reportar góndola', 'Verificador voluntario') : null,
      tile('#/ticket', 'ticket', 'Cargar ticket', `${act.points} punto(s)`),
      isAdmin() ? tile('#/sync', 'sync', 'Sincronizar', `Última: ${lastSync || '—'}`) : null
    ),
    !lists.length
      ? card(h('h2', {}, 'Primer paso'), h('p', {}, 'Armá tu primera lista de compras. Después la app calcula en qué comercio y qué día te conviene comprarla.'), h('a', { class: 'btn btn-secondary', href: '#/listas?nueva=1' }, icon('plus'), 'Crear lista'))
      : null,
    card(
      h('h2', {}, 'Cómo funciona la ola'),
      h(
        'ol',
        { class: 'how' },
        h('li', {}, 'Elegís una lista, tu ubicación y qué días podés comprar.'),
        h('li', {}, 'La app aplica ofertas por cantidad, descuentos del día y los de tus medios de pago.'),
        h('li', {}, 'Ves el mapa de verde (más barato) a rojo (más caro) y elegís comercio o día.')
      )
    )
  );
}
