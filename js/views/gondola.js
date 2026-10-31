// CU-08 Reportar Precios y Stock en Góndola (actor: Verificador).
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, steps, field, setBusy } from '../ui/components.js';
import { pickProduct } from '../ui/picker.js';
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import * as Geo from '../core/geo.js';
import { interpret } from '../core/nlp.js';
import { money, volumeCost } from '../core/engine.js';
import { session, addPoints, POINT_RULES } from '../app/session.js';
import * as Alerts from '../app/alerts.js';

const GEOFENCE_M = 50;

export async function render() {
  const profile = UD.get('profile');
  if (!profile.verifier.enabled)
    return h('div', { class: 'page' }, pageHeader('Reportar en góndola'), empty('shield', 'Función para Verificadores', 'Para reportar en góndola tenés que aceptar el rol de Verificador voluntario marcando días para verificar en tu perfil.', h('a', { class: 'btn btn-primary', href: '#/perfil?s=dias' }, 'Ir a disponibilidad')), steps('CU-08 · precondición'));

  const simulate = !!profile.prefs.simulatePresence;
  const root = h('div', { class: 'page' }, pageHeader('Reportar en góndola', { subtitle: 'Precio, promoción y stock, por voz o texto (sin fotos)' }));
  const stage = h('div');
  root.append(simulate ? h('p', { class: 'notice warn' }, icon('alert'), 'Presencia simulada activa (modo demostración): no se valida el GPS y los reportes no suman puntos.') : null, stage, steps('CU-08 · pasos 1–10 · A-1 · A-2 · A-3 · E-1 · E-2'));

  // Paso 1: seleccionar sucursal
  const step1 = () => {
    const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar sucursal por nombre o barrio' });
    const list = h('ul', { class: 'pick-list compact' });
    const show = (stores) => {
      clear(list);
      for (const s of stores) list.append(h('li', {}, h('button', { class: 'pick-item', onclick: () => step2(s) }, icon('store', { size: 18 }), h('span', {}, h('strong', {}, s.name), h('small', {}, s.dist != null ? `${Geo.fmtDistance(s.dist)} · ${s.address}` : s.address)))));
    };
    const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    q.addEventListener('input', () => {
      const n = norm(q.value.trim());
      show(n ? Cat.stores().filter((s) => norm(`${s.name} ${s.barrio} ${s.address}`).includes(n)).slice(0, 15) : []);
    });
    const nearBtn = h('button', { class: 'btn btn-secondary', onclick: async () => {
      setBusy(nearBtn, true, 'Buscando…');
      try {
        const p = await Geo.gpsPosition();
        show(Cat.stores().map((s) => ({ ...s, dist: Geo.distanceKm(p, s) })).sort((a, b) => a.dist - b.dist).slice(0, 8));
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        setBusy(nearBtn, false);
      }
    } }, icon('gps', { size: 18 }), 'Sucursales más cercanas');
    clear(stage).append(card(h('h2', { class: 'h3' }, '¿En qué sucursal estás?'), h('div', { class: 'row' }, q, nearBtn), list));
  };

  // Pasos 2-3: validar geocerca por GPS (sin ingreso manual)
  const step2 = async (store) => {
    clear(stage).append(card(h('p', {}, `Verificando que estés en ${store.name}…`), h('div', { class: 'spinner' })));
    if (!simulate) {
      let p;
      try {
        p = await Geo.gpsPosition({ highAccuracy: true, timeout: 20000 });
      } catch (e) {
        return fail(store, e.message);
      }
      const d = Geo.distanceKm(p, store) * 1000;
      const acc = p.accuracy;
      p = null; // RNF-03: las coordenadas se descartan
      if (d > GEOFENCE_M || acc > GEOFENCE_M) return fail(store, acc > GEOFENCE_M ? `La precisión del GPS es insuficiente (±${Math.round(acc)} m). Probá cerca de una ventana o la entrada.` : `Estás a unos ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'} de la sucursal: no podés reportar fuera de ella.`);
    }
    step4(store);
  };

  const fail = (store, msg) => {
    // E-1
    clear(stage).append(card(h('div', { class: 'banner bad' }, icon('alert'), h('div', {}, h('strong', {}, 'No se puede reportar'), h('span', {}, msg))), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: step1 }, 'Elegir otra sucursal'), h('button', { class: 'btn btn-primary', onclick: () => step2(store) }, 'Reintentar')), steps('CU-08 · E-1')));
  };

  // Paso 4: dictado o texto libre
  const step4 = (store) => {
    const ta = h('textarea', { class: 'input', rows: 4, maxlength: 600, placeholder: 'Ej.: "La leche La Serenísima de 1 litro está a 1890, 2x1 con Mercado Pago" o "No hay aceite Natura"' });
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    const micBtn = SR
      ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => {
          if (rec) return rec.stop();
          rec = new SR();
          rec.lang = 'es-AR';
          rec.interimResults = true;
          rec.onresult = (e) => (ta.value = [...e.results].map((r) => r[0].transcript).join(' '));
          rec.onend = () => ((rec = null), micBtn.classList.remove('rec'));
          rec.onerror = (e) => toast(e.error === 'not-allowed' ? 'Permiso de micrófono denegado' : 'No se pudo dictar', 'error');
          micBtn.classList.add('rec');
          rec.start(); // paso 5: la transcripción la realiza el servicio de voz del sistema
        } }, icon('mic'), 'Dictar')
      : null;
    clear(stage).append(
      card(
        h('div', { class: 'banner good' }, icon('check'), h('div', {}, h('strong', {}, `Estás en ${store.name}`), h('span', {}, simulate ? 'Presencia simulada' : 'Ubicación validada (no se guardó)'))),
        field('Contá qué ves en la góndola', ta, SR ? 'El dictado lo procesa el servicio de voz de tu teléfono.' : 'Tu navegador no tiene dictado: usá el micrófono del teclado.'),
        h('div', { class: 'row end' }, micBtn, h('button', { class: 'btn btn-primary', onclick: () => {
          if (ta.value.trim().length < 4) return toast('Escribí o dictá el reporte', 'info');
          const r = interpret(ta.value); // pasos 5-6
          if (r.confidence < 0.6 || !r.product || (r.price == null && r.stock !== 'out')) return assisted(store, r); // A-1
          review(store, r);
        } }, icon('sparkle', { size: 18 }), 'Interpretar'))
      )
    );
    setTimeout(() => ta.focus(), 50);
  };

  // A-1: formulario asistido cuando la confianza es baja
  const assisted = (store, r) => {
    let product = r.product;
    const prodBtn = h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: async () => {
      const x = await pickProduct({ allowGeneric: false, title: '¿Qué producto es?' });
      if (x) {
        product = Cat.product(x.productId);
        clear(prodBtn).append(product.name);
      }
    } }, product ? product.name : 'Elegir producto');
    const price = h('input', { type: 'number', class: 'input', min: 1, step: 1, value: r.price ?? '', inputmode: 'numeric' });
    const stock = h('select', { class: 'input' }, h('option', { value: 'ok', selected: r.stock !== 'out' }, 'Hay stock'), h('option', { value: 'out', selected: r.stock === 'out' }, 'Sin stock'));
    const promo = h('select', { class: 'input' }, h('option', { value: '' }, 'Sin promoción'), ['2x1', '3x2', '4x3', '2da al 50 %', '2da al 70 %', '2da al 80 %', '10 %', '15 %', '20 %', '25 %', '30 %'].map((p) => h('option', { value: p, selected: r.promo?.label?.startsWith(p) }, p)));
    clear(stage).append(
      card(
        h('p', { class: 'notice' }, icon('info'), `Confianza de la interpretación: ${Math.round(r.confidence * 100)} %. Completá o corregí los datos.`),
        r.alternatives.length ? h('p', { class: 'small muted' }, '¿Quisiste decir…? ', r.alternatives.map((p) => h('button', { class: 'link', onclick: () => ((product = p), clear(prodBtn).append(p.name)) }, p.name, ' '))) : null,
        field('Producto', prodBtn),
        h('div', { class: 'grid2' }, field('Precio en góndola ($)', price), field('Stock', stock)),
        field('Promoción', promo),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => step4(store) }, 'Volver'), h('button', { class: 'btn btn-primary', onclick: () => {
          if (!product) return toast('Elegí el producto', 'info');
          const pv = Number(price.value) || null;
          if (stock.value !== 'out' && !pv) return toast('Ingresá el precio', 'info');
          review(store, { ...r, product, price: pv, stock: stock.value, promo: promo.value ? parsePromoLabel(promo.value) : null, confidence: 1, assisted: true });
        } }, 'Continuar')),
        steps('CU-08 · A-1')
      )
    );
  };

  // Paso 7 en adelante
  const review = async (store, r) => {
    const cur = await Cat.currentPrice(store.id, r.product.id);
    const hist = (await Cat.historyForProduct(r.product.id)).filter((x) => x.storeId === store.id).slice(-6);
    const ref = cur?.price || hist.at(-1)?.price || r.product.basePrice;
    const promos = Cat.promosForStore(store.id);
    const day = new Date().getDay();
    const published = volumeCost(1, 1, r.product, promos, day).label; // promo publicada vigente hoy
    clear(stage).append(
      card(
        h('h2', { class: 'h3' }, 'Revisá tu reporte'),
        h('dl', { class: 'dl' }, h('dt', {}, 'Producto'), h('dd', {}, r.product.name), h('dt', {}, 'Precio'), h('dd', {}, r.price ? money(r.price) : '—'), h('dt', {}, 'Promoción'), h('dd', {}, r.promo?.label || 'ninguna'), h('dt', {}, 'Stock'), h('dd', {}, r.stock === 'out' ? 'Sin stock' : 'Con stock'), h('dt', {}, 'Publicado'), h('dd', {}, `${cur ? money(cur.price) : 'sin dato'}${published ? ` · ${published}` : ''}`)),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => step4(store) }, 'Corregir'), h('button', { class: 'btn btn-primary', onclick: (e) => submit(e.currentTarget, store, r, ref, cur, published) }, icon('check'), 'Enviar reporte'))
      )
    );
  };

  const submit = async (btn, store, r, ref, cur, published) => {
    setBusy(btn, true, 'Registrando…');
    const act = UD.get('activity');
    const today = new Date().toDateString();
    const status = { incidents: [], points: 0, review: false };
    // Paso 7 / E-2: rango plausible
    if (r.price && (r.price < ref * 0.4 || r.price > ref * 2.5)) {
      status.review = true;
      act.reports.unshift({ ts: Date.now(), storeId: store.id, productId: r.product.id, price: r.price, status: 'en revisión' });
      await UD.save('activity');
      await Cat.logReport({ storeId: store.id, productId: r.product.id, status: 'revision' });
      clear(stage).append(card(h('div', { class: 'banner warn' }, icon('alert'), h('div', {}, h('strong', {}, 'Reporte en revisión'), h('span', {}, `El precio ${money(r.price)} está fuera del rango plausible (referencia ${money(ref)}). No suma puntos.`))), h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: () => step4(store) }, 'Nuevo reporte')), steps('CU-08 · E-2')));
      return;
    }
    // Paso 8: registrar como vigente
    if (r.price) await Cat.recordPrice({ storeId: store.id, productId: r.product.id, price: Math.round(r.price), source: simulate ? 'gondola-sim' : 'gondola' });
    await Cat.setStock(store.id, r.product.id, r.stock === 'out');
    // A-2: promoción o precio distinto de lo publicado
    const priceDiffers = cur && r.price && Math.abs(r.price - cur.price) / cur.price > 0.03;
    const promoDiffers = (r.promo && !published) || (!r.promo && published && r.stock !== 'out');
    if (priceDiffers || promoDiffers) {
      const x = await Cat.addIncident({ storeId: store.id, productId: r.product.id, type: 'condicion', reporter: session.reporterId });
      status.incidents.push(`Condición no informada (${priceDiffers ? 'precio de góndola distinto al publicado' : 'promoción distinta a la publicada'})${x.confirmed ? ' · confirmada por otro usuario' : ''}`);
    }
    // A-3: producto en oferta sin stock
    if (r.stock === 'out' && published) {
      const x = await Cat.addIncident({ storeId: store.id, productId: r.product.id, type: 'faltante', reporter: session.reporterId });
      status.incidents.push(`Faltante de producto en oferta${x.confirmed ? ' · confirmado por otro usuario' : ' · se confirma si otro usuario lo corrobora en 48 h'}`);
    }
    // Puntos con topes antifraude (reglas públicas)
    const todays = act.reports.filter((x) => new Date(x.ts).toDateString() === today && x.points > 0).length;
    const recentSame = act.reports.some((x) => x.storeId === store.id && x.productId === r.product.id && Date.now() - x.ts < POINT_RULES.mismaSucursalProductoHoras * 3600000);
    if (!simulate && todays < POINT_RULES.topeReportesDia && !recentSame) status.points = POINT_RULES.reporte + (status.incidents.length ? POINT_RULES.reporteConIncidencia : 0);
    act.reports.unshift({ ts: Date.now(), storeId: store.id, productId: r.product.id, price: r.price, stock: r.stock, status: 'vigente', points: status.points, incidents: status.incidents.length });
    act.reports = act.reports.slice(0, 300);
    await UD.save('activity');
    if (status.points) await addPoints(status.points, `Reporte en ${store.name}`);
    await Cat.logReport({ storeId: store.id, productId: r.product.id, status: 'vigente' });
    const rep = await Cat.reputation(store.id);
    // Paso 9: informar al servicio de alertas
    if (r.price) await Alerts.evaluate([{ storeId: store.id, productId: r.product.id, price: Math.round(r.price), prev: cur?.price }]);
    // Paso 10
    clear(stage).append(
      card(
        h('div', { class: 'banner good' }, icon('check'), h('div', {}, h('strong', {}, 'Reporte registrado'), h('span', {}, status.points ? `Sumaste ${status.points} puntos (total ${UD.get('activity').points}).` : simulate ? 'Presencia simulada: sin puntos.' : recentSame ? 'Ya reportaste este producto aquí hace poco: sin puntos.' : 'Alcanzaste el tope diario de puntos.'))),
        status.incidents.length ? h('ul', { class: 'bullets' }, status.incidents.map((i) => h('li', {}, i))) : null,
        h('p', { class: 'muted small' }, `Reputación de ${store.name}: ${rep.score}/100 (${rep.incidents} incidencia(s) en 90 días).`),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: step1 }, 'Otra sucursal'), h('button', { class: 'btn btn-primary', onclick: () => step4(store) }, 'Reportar otro producto'))
      )
    );
  };

  step1();
  return root;
}

function parsePromoLabel(v) {
  let m;
  if ((m = v.match(/^(\d)x(\d)$/))) return { type: 'nxm', n: +m[1], m: +m[2], label: v };
  if ((m = v.match(/^2da al (\d+)/))) return { type: 'second', pct: +m[1], label: `2da unidad al ${m[1]} %` };
  if ((m = v.match(/^(\d+)/))) return { type: 'pct', pct: +m[1], label: `${m[1]} % de descuento` };
  return null;
}
