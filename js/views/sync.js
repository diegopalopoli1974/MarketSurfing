// CU-10 Sincronizar Precios Abiertos y Catálogos de APIs (Administrador / Planificador de tareas).
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, steps, field, setBusy, confirmDialog } from '../ui/components.js';
import { locationControl } from '../ui/location.js';
import * as Cat from '../data/catalog.js';
import { isAdmin } from '../app/session.js';
import { runSync, DemoAdapter, sepaAdapter } from '../app/sync.js';

export async function render({ rerender }) {
  if (!isAdmin()) return h('div', { class: 'page' }, pageHeader('Sincronizar precios'), empty('lock', 'Sólo para el Administrador', 'La primera cuenta creada en el dispositivo administra la sincronización.'));
  const stats = await Cat.stats();
  const log = (await Cat.meta.get('syncLog')) || [];
  const lastSync = await Cat.meta.get('lastSync');
  const progress = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const onProgress = (msg) => (progress.textContent = msg);

  const showResults = (res) => {
    for (const r of res) toast(r.ok ? `${r.source}: ${r.changed} precio(s) actualizados` : `${r.source}: ${r.error}`, r.ok ? 'ok' : 'error', 6000);
    rerender();
  };

  const demoBtn = h('button', { class: 'btn btn-primary', onclick: async () => {
    setBusy(demoBtn, true, 'Sincronizando…');
    try {
      showResults(await runSync([DemoAdapter], 'Administrador', onProgress));
    } finally {
      setBusy(demoBtn, false);
    }
  } }, icon('sync'), 'Ejecutar ahora');

  const files = h('input', { type: 'file', class: 'input', multiple: true, accept: '.zip,.csv,.txt' });
  const radius = h('input', { type: 'number', class: 'input', min: 1, max: 50, value: 10, inputmode: 'numeric' });
  const maxStores = h('input', { type: 'number', class: 'input', min: 1, max: 200, value: 40, inputmode: 'numeric' });
  const loc = locationControl({ name: 'loc-sepa', label: 'Importar sucursales alrededor de' });
  const sepaBtn = h('button', { class: 'btn btn-primary', onclick: async () => {
    if (!files.files.length) return toast('Elegí el archivo SEPA (.zip) o los CSV', 'info');
    setBusy(sepaBtn, true, 'Importando…');
    try {
      const point = await loc.resolve();
      const adapter = sepaAdapter([...files.files], { point, radiusKm: Math.min(50, Math.max(1, +radius.value || 10)), maxStores: Math.min(200, Math.max(1, +maxStores.value || 40)), onProgress });
      showResults(await runSync([adapter], 'Administrador', onProgress));
    } catch (e) {
      toast(e.message, 'error', 6000);
    } finally {
      setBusy(sepaBtn, false);
    }
  } }, icon('upload'), 'Importar archivo');

  return h(
    'div',
    { class: 'page' },
    pageHeader('Sincronizar precios', { subtitle: `Última sincronización: ${lastSync || '—'}` }),
    card(h('h2', { class: 'h3' }, 'Catálogo local'), h('dl', { class: 'dl' }, h('dt', {}, 'Sucursales'), h('dd', {}, String(stats.stores)), h('dt', {}, 'Productos'), h('dd', {}, String(stats.products)), h('dt', {}, 'Precios vigentes'), h('dd', {}, stats.prices.toLocaleString('es-AR')), h('dt', {}, 'Versiones históricas'), h('dd', {}, stats.history.toLocaleString('es-AR')), h('dt', {}, 'Promociones'), h('dd', {}, String(stats.promos)))),
    card(h('h2', { class: 'h3' }, 'Fuente de demostración'), h('p', { class: 'muted small' }, 'Simula la publicación diaria de precios. El Planificador de tareas la ejecuta automáticamente una vez por día al abrir la app.'), h('div', { class: 'row end' }, demoBtn)),
    card(
      h('h2', { class: 'h3' }, 'Precios Claros / SEPA (archivo)'),
      h('p', { class: 'muted small' }, 'Descargá el dataset SEPA desde datos.produccion.gob.ar (Precios Claros) en una computadora o en el celular y cargalo acá. Se importan sólo las sucursales del radio elegido; los precios nuevos se agregan como versiones sin borrar las anteriores.'),
      field('Archivo(s) .zip o .csv', files),
      loc.el,
      h('div', { class: 'grid2' }, field('Radio (km)', radius), field('Máximo de sucursales', maxStores)),
      h('div', { class: 'row end' }, sepaBtn)
    ),
    progress,
    card(
      h('h2', { class: 'h3' }, 'Registro de ejecuciones'),
      log.length
        ? h('ul', { class: 'log' }, log.slice(0, 15).map((r) => h('li', { class: r.ok ? '' : 'bad' }, h('strong', {}, new Date(r.ts).toLocaleString('es-AR')), ` · ${r.actor || 'Sistema'} · ${r.source}`, h('br'), h('small', {}, r.ok ? `${(r.prices ?? 0).toLocaleString('es-AR')} precios leídos · ${(r.changed ?? 0).toLocaleString('es-AR')} nuevos/modificados${r.invalid ? ` · ${r.invalid} inválidos` : ''}${r.alertsSent ? ` · ${r.alertsSent} aviso(s)` : ''}${r.elapsedMs != null ? ` · ${r.elapsedMs} ms` : ''}${r.note ? ` · ${r.note}` : ''}` : `Fuente desactualizada, lote en cuarentena: ${r.error}`))))
        : h('p', { class: 'muted' }, 'Sin ejecuciones.')
    ),
    card(
      h('h2', { class: 'h3' }, 'Restablecer catálogo'),
      h('p', { class: 'muted small' }, 'Borra precios, sucursales e importaciones y vuelve a generar los datos de demostración. No afecta las cuentas ni sus listas.'),
      h('div', { class: 'row end' }, h('button', { class: 'btn btn-danger', onclick: async () => {
        if (!(await confirmDialog('Restablecer catálogo', 'Se perderán los precios importados y reportados en este dispositivo.', { ok: 'Restablecer', danger: true }))) return;
        await Cat.resetAll();
        location.reload();
      } }, 'Restablecer'))
    ),
    steps('CU-10 · pasos 1–7 · E-1')
  );
}
