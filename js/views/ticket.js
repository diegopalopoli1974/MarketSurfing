// CU-08 Cargar y Auditar Ticket de Compra vía OCR (con promociones por línea y medio de pago del ticket).
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, toast, steps, field, setBusy, empty } from '../ui/components.js';
import { PAYMENT_ISSUERS } from '../data/demo-seed.js';
import { HELP } from '../ui/help.js';
import { pickProduct } from '../ui/picker.js';
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import * as OCR from '../core/ocr.js';
import { interpret } from '../core/nlp.js';
import { money } from '../core/engine.js';
import { dayKey } from '../data/demo-seed.js';
import { addPoints, POINT_RULES, collabLevel } from '../app/session.js';
import * as Alerts from '../app/alerts.js';

export async function render() {
  if (collabLevel() < 1)
    return h('div', { class: 'page' }, pageHeader('Cargar ticket', { help: HELP.ticket }), empty('shield', 'Función para Colaboradores', 'Cargar tickets es una tarea de Colaborador: marcá «Días para colaborar» en tu perfil y aceptá el rol.', h('a', { class: 'btn btn-primary', href: '#/perfil?s=dias' }, 'Ir a disponibilidad')), steps('CU-08 · precondición'));
  const stage = h('div');
  const root = h('div', { class: 'page' }, pageHeader('Cargar ticket', { subtitle: 'Precios verificados por compra real · suma puntos', help: HELP.ticket }), stage, steps('CU-08 · pasos 1–9 · A-1 · A-2 · E-1 · E-2'));
  const hasOcr = await OCR.ocrAvailable();

  // Paso 1
  const step1 = () => {
    const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', id: 'ticket-file' });
    file.addEventListener('change', () => file.files[0] && step2(file.files[0]));
    clear(stage).append(
      card(
        h('label', { for: 'ticket-file', class: 'drop' }, icon('camera', { size: 36 }), h('strong', {}, 'Fotografiar ticket o elegir imagen'), h('small', {}, 'La imagen se procesa en el teléfono y no se guarda.')),
        file,
        !hasOcr ? h('p', { class: 'notice' }, icon('info'), 'El motor de OCR no está instalado en esta versión de la app: vas a completar los datos del ticket en un formulario asistido. La auditoría funciona igual.') : null,
        h('div', { class: 'row end' }, h('button', { class: 'btn btn-ghost', onclick: () => review({ cuit: null, date: dayKey(), time: null, total: null, payment: null, items: [], storeHint: '' }) }, 'Cargar a mano sin foto'))
      )
    );
  };

  // Pasos 2-3 (E-1 si es ilegible)
  const step2 = async (f) => {
    if (f.size > 15 * 1024 * 1024) return toast('La imagen es demasiado grande', 'error');
    if (!hasOcr) return review({ cuit: null, date: dayKey(), time: null, total: null, payment: null, items: [], storeHint: '' });
    const prog = h('div', { class: 'progress' }, h('div', { class: 'progress-bar' }));
    clear(stage).append(card(h('p', {}, 'Leyendo el ticket…'), prog));
    try {
      const text = await OCR.recognize(f, (p) => (prog.firstChild.style.width = `${Math.round(p * 100)}%`));
      const t = OCR.parseTicket(text);
      if (text.replace(/\s/g, '').length < 30 || (!t.items.length && !t.total)) throw new Error('ilegible');
      review(t);
    } catch (e) {
      clear(stage).append(card(h('div', { class: 'banner bad' }, icon('alert'), h('div', {}, h('strong', {}, 'Imagen ilegible'), h('span', {}, e.message === 'ilegible' ? 'Capturá el ticket nuevamente, con buena luz y sin pliegues.' : e.message))), h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: step1 }, 'Capturar de nuevo')), steps('CU-08 · E-1')));
    }
  };

  // Pasos 4 y 5 (A-2 sin foto): revisión y confirmación; luego paso 6 (auditoría) y A-1
  const review = (t) => {
    const storeSel = h('select', { class: 'input', required: true }, h('option', { value: '' }, 'Elegí la sucursal…'), Cat.stores().sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => h('option', { value: s.id }, `${s.name} — ${s.address}`)));
    const hint = (t.storeHint || '').toLowerCase();
    const guess = Cat.chains().find((c) => hint.includes(c.name.toLowerCase()));
    if (guess) {
      const s = Cat.stores().find((x) => x.chainId === guess.id);
      if (s) storeSel.value = s.id;
    }
    const cuit = h('input', { class: 'input mono', value: t.cuit || '', placeholder: '30-12345678-9', inputmode: 'numeric' });
    const date = h('input', { type: 'date', class: 'input', value: t.date || dayKey(), max: dayKey() });
    const time = h('input', { type: 'time', class: 'input', value: t.time || '' });
    const total = h('input', { type: 'number', class: 'input', min: 0, step: '0.01', value: t.total ?? '', inputmode: 'decimal' });
    const lines = t.items.map((i) => ({ ...i, product: interpretLine(i.desc) }));
    const linesEl = h('ul', { class: 'ticket-lines' });
    const sumEl = h('p', { class: 'muted small' });
    const drawLines = () => {
      clear(linesEl);
      lines.forEach((l, idx) => {
        const desc = h('input', { class: 'input', value: l.desc, 'aria-label': 'Descripción', onchange: (e) => {
          l.desc = e.target.value;
          if (!l.manual) {
            l.product = interpretLine(l.desc);
            paintBtn();
          }
        } });
        const qty = h('input', { type: 'number', class: 'input qty', min: 1, step: 1, value: l.qty, 'aria-label': 'Cantidad', onchange: (e) => ((l.qty = Math.max(1, Math.trunc(+e.target.value || 1))), upd()) });
        const amt = h('input', { type: 'number', class: 'input', min: 0, step: '0.01', value: l.amount, 'aria-label': 'Importe de lista', 'data-tip': 'Importe de la línea sin descuentos', onchange: (e) => ((l.amount = +e.target.value || 0), upd()) });
        const promoSel = h('select', { class: 'input', 'aria-label': 'Promoción aplicada', 'data-tip': 'Oferta del comercio aplicada a esta línea (si la hubo)', onchange: (e) => ((l.promo = e.target.value || null), upd()) }, [h('option', { value: '' }, 'Sin promoción'), ...PROMOS.map((x) => h('option', { value: x, selected: l.promo === x }, x))]);
        const disc = h('input', { type: 'number', class: 'input', min: 0, step: '0.01', value: l.discount || '', placeholder: 'Desc. $', 'aria-label': 'Descuento de la línea', 'data-tip': 'Descuento que figura en el ticket para esta línea', onchange: (e) => ((l.discount = Math.max(0, +e.target.value || 0)), upd()) });
        const prodBtn = h('button', { type: 'button', onclick: async () => {
          const r = await pickProduct({ allowGeneric: false, title: 'Asociar con el catálogo' });
          if (r) {
            l.product = Cat.product(r.productId);
            l.manual = true;
            drawLines();
          }
        } });
        const paintBtn = () => {
          prodBtn.className = `btn btn-sm ${l.product ? 'btn-ghost' : 'btn-warn'}`;
          prodBtn.textContent = l.product ? `✓ ${l.product.name}` : 'Sin correspondencia: asociar';
        };
        paintBtn();
        linesEl.append(h('li', {}, h('div', { class: 'grid-line' }, desc, qty, amt), h('div', { class: 'grid2' }, promoSel, disc), h('div', { class: 'row space' }, prodBtn, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => (lines.splice(idx, 1), drawLines(), upd()) }, icon('trash', { size: 16 }), 'Descartar línea'))));
      });
    };
    const paySel = h('select', { class: 'input', 'data-tip': 'Con qué pagaste: sirve para tus estadísticas de beneficios por medio de pago' }, [h('option', { value: '' }, 'Sin indicar'), h('option', { value: 'Efectivo' }, 'Efectivo'), ...[...new Set([...UD.get('profile').payments.map((p) => p.issuer), ...Object.keys(PAYMENT_ISSUERS)])].map((x) => h('option', { value: x }, x))]);
    const payDisc = h('input', { type: 'number', class: 'input', min: 0, step: '0.01', inputmode: 'decimal', placeholder: '0', onchange: () => upd() });
    const upd = () => {
      const gross = lines.reduce((a, l) => a + l.amount, 0);
      const ld = lines.reduce((a, l) => a + (l.discount || 0), 0);
      sumEl.textContent = `Suma de ítems ${money(gross)} − descuentos por promociones ${money(ld)} − descuento del medio de pago ${money(Number(payDisc.value) || 0)} = ${money(gross - ld - (Number(payDisc.value) || 0))}`;
    };
    drawLines();
    upd();
    const err = h('div', { class: 'form-error', role: 'alert' });
    const ok = h('button', { class: 'btn btn-primary btn-lg', onclick: async () => {
      err.textContent = '';
      if (!storeSel.value) return (err.textContent = 'Elegí la sucursal del ticket');
      if (!lines.length) return (err.textContent = 'El ticket no tiene ítems');
      setBusy(ok, true, 'Auditando…');
      const data = { storeId: storeSel.value, cuit: cuit.value.trim() || null, date: date.value, time: time.value, total: Number(total.value), items: lines, payment: paySel.value || null, payDiscount: Math.max(0, Number(payDisc.value) || 0) };
      // Paso 4: auditoría
      const a = await OCR.audit(data, Cat.hasTicket);
      if (!a.ok) {
        // E-2
        clear(stage).append(card(h('div', { class: 'banner bad' }, icon('alert'), h('div', {}, h('strong', {}, 'Ticket rechazado'), h('span', {}, 'No se otorgan puntos.'))), h('ul', { class: 'bullets' }, a.issues.map((i) => h('li', {}, i))), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => review(t) }, 'Revisar datos'), h('button', { class: 'btn btn-primary', onclick: step1 }, 'Otro ticket')), steps('CU-08 · E-2')));
        return;
      }
      // Paso 5 / A-1: correspondencia con el catálogo
      const unmatched = lines.filter((l) => !l.product);
      if (unmatched.length) {
        setBusy(ok, false);
        err.textContent = `Hay ${unmatched.length} línea(s) sin correspondencia: asocialas o descartalas.`;
        return;
      }
      await record(data, a);
    } }, icon('check'), 'Confirmar ticket');

    clear(stage).append(
      card(
        h('h2', { class: 'h3' }, 'Revisá los datos del ticket'),
        field('Sucursal', storeSel),
        h('div', { class: 'grid2' }, field('CUIT del comercio (opcional)', cuit), field('Total ($)', total)),
        h('div', { class: 'grid2' }, field('Fecha', date), field('Hora', time)),
        h('div', { class: 'grid2' }, field('Medio de pago', paySel), field('Descuento o reintegro del medio de pago ($)', payDisc, null, 'El descuento bancario o de billetera que figura en el ticket (0 si no hubo).')),
        h('h3', { class: 'h4' }, 'Ítems'),
        h('p', { class: 'muted small' }, 'Para cada línea: descripción, cantidad, importe sin descuento y, si hubo, la promoción aplicada y su descuento.'),
        linesEl,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => (lines.push({ desc: '', qty: 1, amount: 0, product: null, promo: null, discount: 0 }), drawLines(), upd()) }, icon('plus', { size: 16 }), 'Agregar ítem'),
        sumEl,
        err,
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: step1 }, 'Cancelar'), ok)
      )
    );
  };

  // Pasos 7-8
  const record = async (data, a) => {
    await Cat.addTicket(a.fingerprint); // el ticket no puede volver a cargarse
    const changes = [];
    for (const l of data.items) {
      const unit = Math.round(l.amount / l.qty);
      const prev = await Cat.currentPrice(data.storeId, l.product.id);
      await Cat.recordPrice({ storeId: data.storeId, productId: l.product.id, price: unit, source: 'ticket', verified: true, date: data.date });
      changes.push({ storeId: data.storeId, productId: l.product.id, price: unit, prev: prev?.price });
    }
    // promociones aplicadas: quedan vigentes 7 días para ese día de la semana en ese comercio
    const wd = new Date(`${data.date}T12:00`).getDay();
    for (const l of data.items.filter((x) => x.promo)) {
      const p = parsePromo(l.promo);
      await Cat.addPromo({ id: `tk-${data.storeId}-${l.product.id}`, storeId: data.storeId, chainId: null, productId: l.product.id, days: [wd], until: dayKey(new Date(Date.now() + 7 * 86400000)), source: 'ticket', label: `${p.label} en ${l.product.name} (según ticket)`, ...p });
    }
    const act = UD.get('activity');
    const todays = act.tickets.filter((x) => new Date(x.ts).toDateString() === new Date().toDateString()).length;
    const pts = todays < POINT_RULES.topeTicketsDia ? Math.min(POINT_RULES.ticketMaximo, data.items.length * POINT_RULES.ticketPorLinea) : 0;
    // registro personal (cifrado) para el reporte «Mis compras»
    act.tickets.unshift({ ts: Date.now(), storeId: data.storeId, date: data.date, total: data.total, lines: data.items.length, points: pts, payment: data.payment, payDiscount: data.payDiscount, items: data.items.map((l) => ({ productId: l.product.id, qty: l.qty, amount: l.amount, promo: l.promo || null, discount: l.discount || 0 })) });
    act.tickets = act.tickets.slice(0, 200);
    await UD.save('activity');
    if (pts) await addPoints(pts, `Ticket de ${Cat.store(data.storeId).name}`);
    await Alerts.evaluate(changes);
    clear(stage).append(
      card(
        h('div', { class: 'banner good' }, icon('check'), h('div', {}, h('strong', {}, 'Ticket registrado'), h('span', {}, `${data.items.length} precio(s) verificados por compra real. ${pts ? `Sumaste ${pts} puntos (total ${UD.get('activity').points}).` : 'Alcanzaste el tope diario de tickets con puntos.'}`))),
        h('p', { class: 'muted small' }, `${Cat.store(data.storeId).name} · ${data.date} · ${money(data.total)}`),
        h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: step1 }, 'Cargar otro'))
      )
    );
  };

  step1();
  return root;
}

const PROMOS = ['2x1', '3x2', '4x3', '2da al 50 %', '2da al 70 %', '2da al 80 %', '10 %', '15 %', '20 %', '25 %', '30 %', '35 %', '40 %'];
function parsePromo(v) {
  let m;
  if ((m = v.match(/^(\d)x(\d)$/))) return { type: 'nxm', n: +m[1], m: +m[2], label: v };
  if ((m = v.match(/^2da al (\d+)/))) return { type: 'second', pct: +m[1], label: `2da unidad al ${m[1]} %` };
  m = v.match(/^(\d+)/);
  return { type: 'pct', pct: +m[1], label: `${m[1]} % de descuento` };
}

function interpretLine(desc) {
  if (!desc) return null;
  const r = interpret(desc);
  return r.product && r.confidence >= 0.55 ? r.product : null;
}
