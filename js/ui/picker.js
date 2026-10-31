// Selector de productos: por nombre, marca o código de barras (con cámara si el navegador lo permite).
import { h, icon, clear } from './dom.js';
import { modal, toast } from './components.js';
import * as Cat from '../data/catalog.js';

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function searchCatalog(q, { allowGeneric = true, limit = 30 } = {}) {
  const n = norm(q).trim();
  const digits = q.replace(/\D/g, '');
  const out = [];
  if (digits.length >= 8) {
    const p = Cat.product(digits);
    if (p) out.push({ kind: 'product', product: p });
  }
  const terms = n.split(/\s+/).filter(Boolean);
  if (!terms.length) return out;
  const prods = Cat.products().filter((p) => {
    const hay = norm(`${p.name} ${p.brand} ${p.category} ${p.genericName}`);
    return terms.every((t) => hay.includes(t));
  });
  if (allowGeneric) {
    const gens = new Map();
    for (const p of prods) if (!gens.has(p.generic) && Cat.productsByGeneric(p.generic).length > 1) gens.set(p.generic, p);
    for (const p of gens.values()) out.push({ kind: 'generic', generic: p.generic, product: p });
  }
  for (const p of prods.sort((a, b) => a.name.localeCompare(b.name, 'es'))) out.push({ kind: 'product', product: p });
  return out.slice(0, limit);
}

/** Abre el selector. Resuelve con { generic, productId|null } o null. */
export function pickProduct({ title = 'Agregar producto', allowGeneric = true } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', type: 'search', placeholder: 'Ej.: leche, Marolio, 779…', 'aria-label': 'Buscar producto', autocomplete: 'off' });
    const results = h('ul', { class: 'pick-list', role: 'listbox' });
    let done = false;
    const choose = (v) => {
      done = true;
      m.close(v);
    };
    const renderResults = () => {
      const q = input.value;
      const res = q.trim() ? searchCatalog(q, { allowGeneric }) : [];
      clear(results);
      if (!q.trim()) {
        for (const c of Cat.categories()) results.append(h('li', {}, h('button', { class: 'pick-cat', onclick: () => ((input.value = c), renderResults()) }, c)));
        return;
      }
      if (!res.length) results.append(h('li', { class: 'muted pad' }, 'Sin resultados en el catálogo'));
      for (const r of res) {
        const p = r.product;
        const label = r.kind === 'generic' ? h('span', {}, h('strong', {}, `${p.genericName} ${p.presentation}`), h('small', {}, `Cualquier marca · ${Cat.productsByGeneric(p.generic).length} opciones`)) : h('span', {}, h('strong', {}, p.name), h('small', {}, `${p.category} · EAN ${p.id}`));
        results.append(h('li', {}, h('button', { class: 'pick-item', role: 'option', onclick: () => choose({ generic: p.generic, productId: r.kind === 'generic' ? null : p.id }) }, r.kind === 'generic' ? icon('layers', { size: 18 }) : icon('star', { size: 18 }), label)));
      }
    };
    input.addEventListener('input', renderResults);
    const scanBtn = 'BarcodeDetector' in window ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => {
      const code = await scanBarcode();
      if (code) {
        input.value = code;
        renderResults();
        const p = Cat.product(code);
        if (!p) toast(`El código ${code} no está en el catálogo`, 'error');
      }
    } }, icon('camera', { size: 18 }), 'Escanear código') : null;
    const m = modal({ title, content: h('div', { class: 'picker' }, h('div', { class: 'row' }, input, scanBtn), results), onClose: (v) => resolve(done ? v : null), wide: true });
    renderResults();
    setTimeout(() => input.focus(), 60);
  });
}

/** Escaneo de código de barras con la cámara (BarcodeDetector). La imagen no se guarda. */
export function scanBarcode() {
  return new Promise(async (resolve) => {
    let stream;
    let stop = false;
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true });
    const m = modal({
      title: 'Escanear código de barras',
      content: h('div', {}, video, h('p', { class: 'muted small' }, 'Apuntá al código EAN del producto.')),
      onClose: () => {
        stop = true;
        stream?.getTracks().forEach((t) => t.stop());
        resolve(found);
      },
    });
    let found = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const loop = async () => {
        if (stop) return;
        try {
          const codes = await det.detect(video);
          if (codes.length) {
            found = codes[0].rawValue;
            m.close();
            return;
          }
        } catch {
          /* cuadro no listo */
        }
        setTimeout(loop, 250);
      };
      loop();
    } catch {
      toast('No se pudo usar la cámara', 'error');
      m.close();
    }
  });
}
