// Bandeja de avisos (notificaciones de alertas, CU-02 paso 9).
import { h, icon } from '../ui/dom.js';
import { pageHeader, empty } from '../ui/components.js';
import * as UD from '../core/userdata.js';

export async function render({ rerender }) {
  const act = UD.get('activity');
  const items = act.inbox;
  const view = h(
    'div',
    { class: 'page' },
    pageHeader('Avisos recibidos', { actions: items.length ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
      act.inbox = [];
      await UD.save('activity');
      window.dispatchEvent(new CustomEvent('ms:inbox'));
      rerender();
    } }, 'Vaciar') : null }),
    items.length
      ? h('ul', { class: 'cards' }, items.map((i) => h('li', { class: ['card inbox-item', !i.read && 'unread'] }, icon('bell'), h('div', {}, h('strong', {}, i.title), h('p', {}, i.body), h('small', { class: 'muted' }, new Date(i.ts).toLocaleString('es-AR'))))))
      : empty('bell', 'Sin avisos', 'Cuando un precio alcance una de tus alertas, el aviso aparece acá y como notificación.', h('a', { class: 'btn btn-secondary', href: '#/alertas' }, 'Ver alertas'))
  );
  if (items.some((i) => !i.read)) {
    items.forEach((i) => (i.read = true));
    await UD.save('activity');
    setTimeout(() => window.dispatchEvent(new CustomEvent('ms:inbox')), 0);
  }
  return view;
}
