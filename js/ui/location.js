// Control de ubicación a elección del usuario: GPS en el momento o ingreso manual (RF-04).
import { h, icon, clear } from './dom.js';
import { segmented, toast } from './components.js';
import * as Geo from '../core/geo.js';
import { session } from '../app/session.js';
import { svgMap } from './map.js';

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

/**
 * Selector de zonas (CU-02): una o más zonas = punto + radio, elegidas por barrio, localidad o dirección
 * (nomenclador local y Servicio de Geocodificación) o tocando el mapa. No usa el GPS.
 */
export function zonePicker({ zones = [], defaultRadius = 2, onChange = () => {} } = {}) {
  const list = h('ul', { class: 'zone-list' });
  const mapBox = h('div');
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Barrio, localidad o «calle altura, localidad»', enterkeyhint: 'search', 'aria-label': 'Buscar zona' });
  const results = h('ul', { class: 'pick-list compact' });
  let mapCenter = zones[0] || Geo.DEFAULT_POINT;
  const changed = () => (drawList(), drawMap(), onChange(zones));
  const add = (p, label) => {
    if (zones.length >= 5) return toast('Máximo 5 zonas por alerta', 'info');
    zones.push({ lat: Number(p.lat.toFixed(5)), lng: Number(p.lng.toFixed(5)), label: String(label).slice(0, 60), radiusKm: defaultRadius });
    mapCenter = zones.at(-1);
    clear(results);
    input.value = '';
    changed();
  };
  const show = (items) => {
    clear(results);
    for (const p of items) results.append(h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: () => add(p, p.name) }, icon('pin', { size: 18 }), h('span', {}, p.name))));
  };
  const searchOnline = async () => {
    const q = input.value.trim();
    if (q.length < 3) return toast('Escribí un barrio, una localidad o una dirección', 'info');
    clear(results).append(h('li', { class: 'muted pad' }, 'Consultando el servicio de geocodificación…'));
    try {
      show(await Geo.searchAddressOnline(q));
    } catch (e) {
      clear(results).append(h('li', { class: 'form-error pad' }, e.message)); // E-1
    }
  };
  input.addEventListener('input', () => {
    show(Geo.searchPlacesOffline(input.value));
    if (input.value.trim().length >= 3) results.append(h('li', {}, h('button', { type: 'button', class: 'pick-item', onclick: searchOnline }, icon('search', { size: 18 }), h('span', {}, h('strong', {}, `Buscar «${input.value.trim()}» en internet`), h('small', {}, 'Para direcciones exactas o lugares que no están en la lista')))));
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), searchOnline()));
  const drawList = () => {
    clear(list);
    if (!zones.length) list.append(h('li', { class: 'muted' }, 'Sin zonas todavía: buscá un barrio o tocá el mapa.'));
    zones.forEach((z, i) =>
      list.append(
        h(
          'li',
          {},
          h('span', {}, icon('pin', { size: 16 }), ' ', z.label),
          h(
            'span',
            { class: 'row' },
            h('input', { type: 'number', class: 'input', min: 0.3, max: 15, step: 0.1, value: z.radiusKm, inputmode: 'decimal', 'aria-label': `Radio de ${z.label} en km`, 'data-tip': 'Radio de la zona en km', onchange: (e) => ((z.radiusKm = Math.min(15, Math.max(0.3, Number(e.target.value) || defaultRadius))), changed()) }),
            h('small', {}, 'km'),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Quitar ${z.label}`, onclick: () => (zones.splice(i, 1), changed()) }, icon('trash', { size: 18 }))
          )
        )
      )
    );
  };
  const drawMap = () => {
    const r = Math.max(2, ...zones.map((z) => Geo.distanceKm(mapCenter, z) + z.radiusKm));
    clear(mapBox).append(svgMap({ center: mapCenter, radiusKm: Math.min(25, r * 1.5), zones, showCenter: false, showRadius: false, onPick: (p) => add(p, `Punto marcado (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`), caption: 'Tocá el mapa para agregar una zona en ese punto · arrastrá para moverte' }));
  };
  drawList();
  drawMap();
  const el = h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Zonas de la alerta'), h('p', { class: 'hint' }, 'Agregá uno o más barrios, localidades o direcciones (con su radio). Te avisamos por los comercios que estén dentro de cualquiera de ellas.'), input, results, list, mapBox);
  return { el, get zones() { return zones; } };
}
