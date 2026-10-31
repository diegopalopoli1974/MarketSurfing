// CU-06 Redirigir Compra a Delivery de Supermercado (Cart Permalink de VTEX). No procesa pagos.
import { h, icon } from '../ui/dom.js';
import { modal, steps, spinner } from '../ui/components.js';
import * as Cat from '../data/catalog.js';
import { money } from '../core/engine.js';
import { rng } from '../data/demo-seed.js';

/** Paso 2: producto interno -> SKU del comercio. En la demo el SKU es simulado y determinístico. */
function skuFor(chain, product) {
  if (product.sepa || chain.sepa) return null; // sin tabla de equivalencias para datos importados
  const r = rng(`sku-${chain.id}-${product.id}`);
  if (r() < 0.06) return null; // algunos productos no se venden online
  return String(100000 + Math.floor(r() * 899999));
}

export async function openDelivery({ store, basket }) {
  const chain = Cat.chain(store.chainId);
  const body = h('div', {}, spinner('Preparando el carrito…'));
  const m = modal({ title: `Comprar online en ${chain.name}`, wide: true, content: body });

  const lines = basket.lines.map((l) => ({ ...l, product: Cat.product(l.productId), sku: skuFor(chain, Cat.product(l.productId)) }));
  const withSku = lines.filter((l) => l.sku);
  const noSku = lines.filter((l) => !l.sku); // A-1

  // Pasos 3-4: consulta de disponibilidad y precio vigente por SKU (aquí: precios locales más recientes)
  const checked = [];
  for (const l of withSku) {
    const cur = await Cat.currentPrice(store.id, l.productId);
    checked.push({ ...l, apiPrice: cur?.price ?? null, available: !!cur });
  }
  const diffs = checked.filter((c) => !c.available || c.apiPrice !== c.unit);

  if (chain.platform !== 'vtex') {
    // sin Cart Permalink: se ofrece abrir el sitio sin precarga (E-1 equivalente)
    body.replaceChildren(
      h('p', {}, `${chain.name} usa una plataforma propia que no admite carritos precargados por enlace. Podés abrir su sitio y cargar los productos a mano.`),
      h('div', { class: 'row end' }, h('a', { class: 'btn btn-primary', href: `https://${chain.host}/`, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir sitio sin precarga')),
      steps('CU-06 · E-1')
    );
    return;
  }

  // Paso 5: enlace profundo
  const qs = checked.filter((c) => c.available).map((c) => `sku=${encodeURIComponent(c.sku)}&qty=${c.qty}&seller=1`).join('&');
  const url = `https://${chain.host}/checkout/cart/add?${qs}&sc=1`;

  // Paso 6: resumen con diferencias
  body.replaceChildren(
    h('p', { class: 'notice' }, icon('info'), 'Los SKU de esta demostración son simulados: el sitio real abrirá, pero el carrito no se va a precargar con estos códigos.'),
    h(
      'table',
      { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Producto'), h('th', { class: 'num' }, 'Cant.'), h('th', { class: 'num' }, 'SKU'), h('th', { class: 'num' }, 'Precio online'))),
      h(
        'tbody',
        {},
        checked.map((c) => h('tr', { class: c.apiPrice !== c.unit ? 'diff' : '' }, h('td', {}, c.product.name), h('td', { class: 'num' }, String(c.qty)), h('td', { class: 'num mono' }, c.sku), h('td', { class: 'num' }, c.available ? money(c.apiPrice) : 'sin stock', c.apiPrice !== c.unit && c.available ? h('small', { class: 'bad' }, ` (antes ${money(c.unit)})`) : null))),
        noSku.map((c) => h('tr', { class: 'muted' }, h('td', {}, c.product.name), h('td', { class: 'num' }, String(c.qty)), h('td', { colspan: 2 }, 'No disponible online')))
      )
    ),
    h('p', {}, diffs.length ? `Se detectaron ${diffs.length} diferencia(s) de precio o stock.` : 'Sin diferencias de precio ni de stock.'),
    h('p', { class: 'muted small' }, 'MarketSurfing no procesa pagos: en el sitio del comercio elegís la franja de entrega y pagás.'),
    h(
      'div',
      { class: 'row end' },
      h('button', { class: 'btn', onclick: () => m.close() }, 'Cancelar'), // A-2
      h('a', { class: 'btn btn-primary', href: url, target: '_blank', rel: 'noopener noreferrer', onclick: () => setTimeout(() => m.close(), 300) }, icon('cart', { size: 18 }), 'Ir al carrito del comercio') // paso 7
    ),
    steps('CU-06 · pasos 1–8 · A-1 · A-2')
  );
}
