// Control de ubicación a elección del usuario: GPS en el momento o ingreso manual (RF-04).
import { h, icon, clear } from './dom.js';
import { segmented, toast } from './components.js';
import * as Geo from '../core/geo.js';
import { session } from '../app/session.js';

export function locationControl({ name = 'loc', allowManual = true, label = 'Ubicación' } = {}) {
  let mode = session.location?.source === 'manual' ? 'manual' : 'gps';
  let manual = session.location?.source === 'manual' ? session.location : null;
  const box = h('div', { class: 'loc-manual' });
  const chosen = h('p', { class: 'loc-chosen' });

  const renderManual = () => {
    clear(box);
    if (mode !== 'manual') return;
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Barrio, localidad o dirección', 'aria-label': 'Ubicación manual' });
    const list = h('ul', { class: 'pick-list compact' });
    const show = (items) => {
      clear(list);
      for (const p of items)
        list.append(
          h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: () => {
            manual = { lat: p.lat, lng: p.lng, label: p.name, source: 'manual' };
            session.location = manual;
            chosen.textContent = `Elegida: ${p.name}`;
            clear(list);
            input.value = '';
          } }, icon('pin', { size: 18 }), h('span', {}, p.name)))
        );
    };
    input.addEventListener('input', () => show(Geo.searchPlacesOffline(input.value)));
    const online = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
      if (input.value.trim().length < 4) return toast('Escribí una dirección más completa', 'info');
      try {
        const r = await Geo.searchAddressOnline(input.value);
        if (!r.length) toast('Dirección no reconocida', 'error');
        show(r);
      } catch (e) {
        toast(e.message, 'error');
      }
    } }, icon('search', { size: 16 }), 'Buscar dirección (en línea)');
    box.append(h('div', { class: 'row' }, input), online, list);
    show(Geo.searchPlacesOffline(''));
  };

  const update = () => {
    chosen.textContent = mode === 'gps' ? 'Se usará el GPS al buscar. Las coordenadas no se guardan.' : manual ? `Elegida: ${manual.label}` : 'Elegí un lugar de la lista.';
    renderManual();
  };

  const el = h(
    'fieldset',
    { class: 'fieldset' },
    h('legend', {}, label),
    allowManual
      ? segmented(name, [
          { value: 'gps', label: 'GPS ahora', icon: 'gps' },
          { value: 'manual', label: 'Ingresar', icon: 'pin' },
        ], mode, (v) => ((mode = v), update()))
      : null,
    chosen,
    box
  );
  update();

  return {
    el,
    get mode() {
      return mode;
    },
    /** Pasos 2-3 (o A-1): obtiene el punto. Lanza Error si no es válido (E-1). */
    async resolve() {
      if (mode === 'manual') {
        if (!manual) throw new Error('Ubicación no válida: elegí un barrio o dirección.');
        return manual;
      }
      const p = await Geo.gpsPosition();
      session.location = p; // sólo en memoria
      return p;
    },
  };
}
