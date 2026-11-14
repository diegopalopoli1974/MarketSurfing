// Ubicación: GPS en el momento o ingreso manual. Las coordenadas viven sólo en memoria (RNF-03).
import { BARRIOS, ZONES_EXTRA } from '../data/demo-seed.js';

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

/** Pide la posición al GPS. Lanza Error con mensaje en castellano. */
export function gpsPosition({ highAccuracy = true, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este dispositivo no tiene servicio de ubicación'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, label: 'Mi ubicación (GPS)', source: 'gps' }),
      (e) => {
        const msg =
          e.code === 1
            ? 'Permiso de ubicación denegado. Habilitalo en el navegador o ingresá la ubicación manualmente.'
            : e.code === 3
              ? 'Sin señal de GPS (tiempo agotado).'
              : 'No se pudo obtener la ubicación (sin señal de GPS).';
        reject(new Error(msg));
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 0 }
    );
  });
}

// Lugares disponibles sin conexión para el ingreso manual
const PLACES = [
  ...BARRIOS.map(([name, lat, lng]) => ({ name: `${name}, CABA`, lat, lng })),
  ...ZONES_EXTRA.map(([name, lat, lng, dep]) => ({ name: dep === 'CABA' ? `${name}, CABA` : `${name}, ${dep} (Bs. As.)`, lat, lng })),
  { name: 'Retiro, CABA', lat: -34.5915, lng: -58.3747 },
  { name: 'Microcentro, CABA', lat: -34.6037, lng: -58.3816 },
  { name: 'Puerto Madero, CABA', lat: -34.6118, lng: -58.3628 },
  { name: 'Barracas, CABA', lat: -34.6448, lng: -58.3809 },
  { name: 'Mataderos, CABA', lat: -34.6591, lng: -58.5023 },
  { name: 'Liniers, CABA', lat: -34.6425, lng: -58.5199 },
  { name: 'Devoto, CABA', lat: -34.6007, lng: -58.5136 },
  { name: 'Vicente López', lat: -34.5263, lng: -58.4745 },
  { name: 'Olivos', lat: -34.5076, lng: -58.4893 },
  { name: 'San Isidro', lat: -34.4708, lng: -58.5286 },
  { name: 'Avellaneda', lat: -34.6623, lng: -58.3653 },
  { name: 'Lanús', lat: -34.7061, lng: -58.3928 },
  { name: 'Quilmes', lat: -34.7206, lng: -58.2546 },
  { name: 'Lomas de Zamora', lat: -34.7609, lng: -58.4063 },
  { name: 'Morón', lat: -34.6534, lng: -58.6198 },
  { name: 'San Martín', lat: -34.5747, lng: -58.5386 },
  { name: 'Ramos Mejía', lat: -34.6408, lng: -58.5653 },
  { name: 'La Plata', lat: -34.9214, lng: -57.9545 },
  { name: 'Córdoba Capital', lat: -31.4201, lng: -64.1888 },
  { name: 'Rosario', lat: -32.9442, lng: -60.6505 },
  { name: 'Mendoza', lat: -32.8895, lng: -68.8458 },
  { name: 'Mar del Plata', lat: -38.0055, lng: -57.5426 },
  { name: 'San Miguel de Tucumán', lat: -26.8083, lng: -65.2176 },
  { name: 'Salta', lat: -24.7821, lng: -65.4232 },
  { name: 'Neuquén', lat: -38.9516, lng: -68.0591 },
  { name: 'Santa Fe', lat: -31.6333, lng: -60.7 },
  { name: 'Bahía Blanca', lat: -38.7183, lng: -62.2663 },
];

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function searchPlacesOffline(q) {
  const n = norm(q.trim());
  if (!n) return PLACES.slice(0, 8);
  return PLACES.filter((p) => norm(p.name).includes(n)).slice(0, 10);
}

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit', signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Georef (Gobierno de Argentina): normaliza calle + altura con interpolación de numeración. */
async function georef(direccion, lugar) {
  const bases = ['https://apis.datos.gob.ar/georef/api/v2.0/direcciones', 'https://apis.datos.gob.ar/georef/api/direcciones'];
  const filtros = lugar ? [{ localidad_censal: lugar }, { localidad: lugar }, { departamento: lugar }, { municipio: lugar }] : [{}];
  for (const base of bases) {
    for (const f of filtros) {
      const qs = new URLSearchParams({ direccion, max: '5', ...f });
      const data = await getJson(`${base}?${qs}`);
      const list = (data?.direcciones || [])
        .map((d) => {
          const lat = Number(d.ubicacion?.lat);
          const lng = Number(d.ubicacion?.lon);
          const loc = d.localidad_censal?.nombre || d.departamento?.nombre || '';
          const name = d.nomenclatura || [d.calle?.nombre, d.altura?.valor, loc].filter(Boolean).join(' ');
          return { name: String(name).slice(0, 90), lat, lng };
        })
        .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng) && d.lat !== 0);
      if (list.length) return list;
      if (data) break; // el servicio respondió sin resultados con este filtro: probar el siguiente
    }
  }
  return [];
}

async function nominatim(params) {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '5', countrycodes: 'ar', 'accept-language': 'es', ...params });
  const data = await getJson(`https://nominatim.openstreetmap.org/search?${qs}`);
  return (data || [])
    .map((d) => ({ name: String(d.display_name).split(',').slice(0, 4).join(','), lat: Number(d.lat), lng: Number(d.lon) }))
    .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
}

/**
 * Búsqueda de dirección en línea: primero Georef (direcciones argentinas con altura),
 * luego OpenStreetMap/Nominatim con distintas variantes. Ej.: «Bouchard 2855, Caseros».
 */
export async function searchAddressOnline(q) {
  if (!navigator.onLine) throw new Error('Sin conexión: elegí un barrio o localidad de la lista');
  const text = String(q).trim().slice(0, 120);
  const [first, ...rest] = text.split(',').map((x) => x.trim()).filter(Boolean);
  const lugar = rest.join(' ').replace(/\b(bs\.? ?as\.?|buenos aires|argentina|caba)\b/gi, '').trim();
  let r = await georef(first, lugar || null);
  if (!r.length && lugar) r = await georef(`${first} ${lugar}`, null);
  if (r.length) return r;
  const m = first.match(/^(.*?)(\d{1,5})\s*$/);
  if (m && lugar) r = await nominatim({ street: `${m[2]} ${m[1].trim()}`, city: lugar, country: 'Argentina' });
  if (!r.length) r = await nominatim({ q: `${text}${/argentina/i.test(text) ? '' : ', Buenos Aires, Argentina'}` });
  if (!r.length && m) {
    // última opción: la calle sin altura (ubicación aproximada)
    r = (await nominatim({ q: `${m[1].trim()}${lugar ? `, ${lugar}` : ''}, Argentina` })).map((x) => ({ ...x, name: `${x.name} (aprox., sin altura)` }));
  }
  if (!r.length) throw new Error('No se encontró la dirección. Probá «calle altura, localidad» (ej.: Bouchard 2855, Caseros).');
  return r;
}

export const DEFAULT_POINT = { lat: -34.6037, lng: -58.4316, label: 'Caballito / Almagro (CABA)', source: 'manual' };
