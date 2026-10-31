// CU-02 Gestionar Alertas de Umbral de Precio (pasos 1 a 5; los pasos 6 a 9 están en app/alerts.js).
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, confirmDialog, segmented, field, steps, setBusy } from '../ui/components.js';
import { pickProduct } from '../ui/picker.js';
import { locationControl } from '../ui/location.js';
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import * as Alerts from '../app/alerts.js';
import { referencePrice } from '../app/listsvc.js';
import { money } from '../core/engine.js';
import { dayKey } from '../data/demo-seed.js';

function alertTitle(a) {
  if (a.productId) return Cat.product(a.productId)?.name || 'Producto';
  const p = Cat.productsByGeneric(a.generic)[0];
  return p ? `${p.genericName} ${p.presentation} (cualquier marca)` : 'Producto';
}

export async function render({ rerender }) {
  const alerts = UD.get('alerts');
  const listEl = alerts.length
    ? h(
        'ul',
        { class: 'cards' },
        alerts.map((a) => {
          const expired = a.until && a.until < dayKey();
          const tog = h('input', { type: 'checkbox', role: 'switch', checked: a.active && !expired, disabled: expired, 'aria-label': 'Alerta activa', onchange: async (e) => {
            a.active = e.target.checked;
            await UD.save('alerts');
            toast(a.active ? 'Alerta activada' : 'Alerta pausada', 'ok');
          } });
          return h(
            'li',
            { class: 'card alert-card' },
            h('div', {}, h('strong', {}, alertTitle(a)), h('small', {}, `${a.type === 'price' ? `Precio ≤ ${money(a.value)}` : `Descuento ≥ ${a.value} %`} · ${a.radiusKm} km de ${a.ref.label} · hasta ${a.until || 'sin vencimiento'}${a.usePromos ? ' · con promos y medios de pago' : ''}`), expired ? h('span', { class: 'pill warn' }, 'vencida') : null),
            h('div', { class: 'row' }, h('label', { class: 'switch' }, tog, h('span', { class: 'slider', 'aria-hidden': 'true' })), h('button', { class: 'icon-btn', 'aria-label': 'Eliminar alerta', onclick: async () => {
              if (!(await confirmDialog('Eliminar alerta', '¿Eliminar esta alerta?', { ok: 'Eliminar', danger: true }))) return;
              UD.get('alerts').splice(UD.get('alerts').indexOf(a), 1);
              await UD.save('alerts');
              rerender();
            } }, icon('trash')))
          );
        })
      )
    : empty('bell', 'Sin alertas', 'Creá una alerta y te avisamos cuando un producto llegue al precio que buscás.');

  return h('div', { class: 'page' }, pageHeader('Alertas de precio', { subtitle: 'Avisos cuando un producto alcanza tu umbral' }), newAlertForm(rerender), h('h2', { class: 'h3 section-title' }, 'Mis alertas'), listEl, steps('CU-02 · pasos 1–9 · A-1 · A-2 · A-3 · E-1'));
}

function newAlertForm(rerender) {
  const st = { target: null, type: 'price', usePromos: false };
  const prodBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: async () => {
    const r = await pickProduct({ title: 'Producto o marca a vigilar' });
    if (!r) return;
    st.target = r;
    const ref = await referencePrice(r.productId || Cat.productsByGeneric(r.generic)[0].id);
    st.ref = ref;
    clear(prodBtn).append(icon('edit', { size: 18 }), alertTitle(r));
    refHint.textContent = ref ? `Precio promedio actual en la zona: ${money(ref)}` : '';
    if (ref && !value.value) value.value = String(Math.round((ref * 0.85) / 10) * 10);
  } }, icon('search', { size: 18 }), 'Elegir producto o marca');
  const refHint = h('small', { class: 'hint' });
  const value = h('input', { type: 'number', class: 'input', min: 1, step: 1, inputmode: 'numeric', 'aria-label': 'Umbral' });
  const valueLabel = h('span', { class: 'field-label' }, 'Precio tope ($)');
  const until = h('input', { type: 'date', class: 'input', value: dayKey(new Date(Date.now() + 30 * 86400000)), min: dayKey() });
  const radius = h('input', { type: 'number', class: 'input', min: 0.5, max: 30, step: 0.5, value: UD.get('profile').prefs.radiusKm || 3, inputmode: 'decimal' });
  const promos = h('input', { type: 'checkbox', onchange: (e) => (st.usePromos = e.target.checked) });
  const loc = locationControl({ name: 'loc-alert', label: 'Punto de referencia de la alerta' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const save = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, icon('bell'), 'Crear alerta');

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (!st.target) return (err.textContent = 'Elegí el producto o la marca a vigilar');
        setBusy(save, true, 'Guardando…');
        try {
          // Pasos 2-3 (A-1: punto manual). Sólo se guarda el punto elegido, no un historial (RNF-03).
          const p = await loc.resolve();
          const ref = { lat: Number(p.lat.toFixed(4)), lng: Number(p.lng.toFixed(4)), label: p.source === 'gps' ? `mi ubicación (GPS, ${new Date().toLocaleDateString('es-AR')})` : p.label };
          // Paso 4: coherencia del umbral y del radio (E-1)
          const v = Number(value.value);
          const r = Number(radius.value);
          const errs = [];
          if (st.type === 'price') {
            if (!(v > 0)) errs.push('El precio tope debe ser mayor a cero');
            else if (st.ref && (v < st.ref * 0.2 || v > st.ref * 3)) errs.push(`El precio tope no es coherente con el producto (referencia ${money(st.ref)}): debe estar entre ${money(st.ref * 0.2)} y ${money(st.ref * 3)}`);
          } else if (!(v >= 1 && v <= 90)) errs.push('El descuento debe estar entre 1 % y 90 %');
          if (!(r >= 0.5 && r <= 30)) errs.push('El radio debe estar entre 0,5 y 30 km');
          if (until.value && until.value < dayKey()) errs.push('La vigencia no puede ser anterior a hoy');
          if (errs.length) throw Object.assign(new Error(errs.join('. ')), { code: 'E-1' });
          UD.get('alerts').push({ id: crypto.randomUUID(), productId: st.target.productId, generic: st.target.generic, type: st.type, value: v, until: until.value || null, radiusKm: r, ref, usePromos: st.usePromos, active: true, createdAt: Date.now(), sentLog: {} });
          await UD.save('alerts');
          const perm = await Alerts.requestPushPermission();
          toast(perm === 'granted' ? 'Alerta activa. Te avisaremos con una notificación.' : 'Alerta activa. Los avisos quedarán en «Avisos recibidos» (notificaciones no permitidas).', 'ok', 5000); // paso 5
          const n = await Alerts.evaluateAll();
          if (n) toast('¡Ya hay comercios que cumplen la alerta! Mirá «Avisos recibidos».', 'info', 5000);
          rerender();
        } catch (ex) {
          err.textContent = ex.message;
          setBusy(save, false);
        }
      },
    },
    h('h2', { class: 'h3' }, 'Nueva alerta'),
    prodBtn,
    refHint,
    segmented('atype', [
      { value: 'price', label: 'Precio tope' },
      { value: 'pct', label: '% de descuento' },
    ], 'price', (t) => ((st.type = t), (valueLabel.textContent = t === 'price' ? 'Precio tope ($)' : 'Descuento mínimo (%)'), (value.value = t === 'pct' ? '20' : st.ref ? String(Math.round((st.ref * 0.85) / 10) * 10) : ''))),
    h('label', { class: 'field' }, valueLabel, value),
    h('div', { class: 'grid2' }, field('Vigente hasta', until), field('Radio (km)', radius)),
    h('label', { class: 'check' }, promos, h('span', {}, 'Evaluar con promociones y mis medios de pago')),
    loc.el,
    err,
    save
  );
  return card(form);
}
