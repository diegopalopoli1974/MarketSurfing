// Control de ubicación a elección del usuario: GPS en el momento o ingreso manual (RF-02).
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
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Barrio, localidad o «calle altura, localidad»', enterkeyhint: 'search', 'aria-label': 'Ubicación manual' });
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
    const searchOnline = async () => {
      const q = input.value.trim();
      if (q.length < 4) return toast('Escribí la dirección: calle, altura y localidad', 'info');
      clear(list).append(h('li', { class: 'muted pad' }, 'Buscando en internet…'));
      try {
        show(await Geo.searchAddressOnline(q));
      } catch (e) {
        clear(list).append(h('li', { class: 'form-error pad' }, e.message));
      }
    };
    input.addEventListener('input', () => {
      const res = Geo.searchPlacesOffline(input.value);
      show(res);
      if (input.value.trim().length >= 4)
        list.append(h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: searchOnline, 'data-tip': 'Busca la dirección exacta (calle y altura) en el servicio oficial Georef y en OpenStreetMap. Requiere conexión.' }, icon('search', { size: 18 }), h('span', {}, h('strong', {}, `Buscar «${input.value.trim()}» en internet`), h('small', {}, 'Calle y altura, por ejemplo: Bouchard 2855, Caseros')))));
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchOnline();
      }
    });
    const online = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: searchOnline, 'data-tip': 'Busca la dirección exacta (calle y altura) en internet' }, icon('search', { size: 16 }), 'Buscar dirección exacta (en línea)');
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

