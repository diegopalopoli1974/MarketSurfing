import { HELP } from '../ui/help.js';
import { h, icon } from '../ui/dom.js';
import { card, pageHeader } from '../ui/components.js';
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import { session, isAdmin, collabLevel } from '../app/session.js';

export async function render() {
  const lists = UD.get('lists').filter((l) => !l.deleted);
  const act = UD.get('activity');
  const profile = UD.get('profile');
  const lastSync = await Cat.meta.get('lastSync');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';

  const tile = (href, ic, title, sub, tip) => h('a', { class: 'tile', href, 'data-tip': tip || null }, h('span', { class: 'tile-icon' }, icon(ic, { size: 26 })), h('span', { class: 'tile-text' }, h('strong', {}, title), h('small', {}, sub)));

  return h(
    'div',
    { class: 'page' },
    pageHeader('Inicio', { help: HELP.home }),
    h('header', { class: 'hero' }, h('p', { class: 'hero-kicker' }, `${greet}, ${session.account.displayName}`), h('h1', {}, '¿Dónde y cuándo conviene comprar?'), h('a', { class: 'btn btn-primary btn-lg', href: '#/buscar', 'data-tip': 'Calcula en qué comercio y qué día te conviene comprar una de tus listas' }, icon('wave'), 'Buscar la mejor ola')),
    h(
      'div',
      { class: 'tiles' },
      tile('#/listas', 'list', 'Mis listas', `${lists.length} lista(s)`, 'Creá y editá tus listas de compras; cada cambio queda guardado como versión'),
      tile('#/precios', 'search', 'Precios por producto', 'Dónde hay y a cuánto', 'Elegí un producto y mirá qué comercios lo tienen, a qué precio y con qué promoción'),
      tile('#/reportes', 'chart', 'Reportes', 'Inflación por marca', 'Índices de precios por marca, variación por rubro y mapa de promociones'),
      tile('#/perfil', 'user', 'Perfil de compra', `${profile.payments.length} medio(s) de pago`, 'Medios de pago, días disponibles, comercios excluidos y gamas de calidad'),
      collabLevel() >= 1 ? tile('#/gondola', 'mic', 'Reportar góndola', 'Colaborador', 'Reportá precio, promoción o faltante estando en la sucursal') : null,
      collabLevel() >= 1 ? tile('#/ticket', 'ticket', 'Cargar ticket', `${act.points} punto(s)`, 'Registrá precios verificados con el ticket de tu compra') : null,
      collabLevel() >= 2 ? tile('#/catalogo', 'store', 'Cargar catálogo', 'Comercios, productos y precios', 'Alta manual de comercios, productos y precios (Colaborador nivel 2 o Administrador)') : null,
      isAdmin() ? tile('#/sync', 'sync', 'Sincronizar', `Última: ${lastSync || '—'}`, 'Actualiza precios desde la fuente de demostración o un archivo de Precios Claros (SEPA)') : null
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
