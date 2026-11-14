// CU-01 Gestionar Listas de Compras (extendido por CU-05 Sustituir Marca en Lista).
import { HELP } from '../ui/help.js';
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, empty, toast, modal, confirmDialog, steps } from '../ui/components.js';
import { pickProduct } from '../ui/picker.js';
import * as L from '../app/listsvc.js';
import * as Cat from '../data/catalog.js';
import * as UD from '../core/userdata.js';
import { money, tierName } from '../core/engine.js';
import { setLeaveGuard } from '../app/nav.js';

const fmtDate = (ts) => new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export async function render({ params, query, rerender }) {
  if (params[0]) return editor(params[0] === 'nueva' ? null : params[0], rerender);
  if (query.get('nueva')) return editor(null, rerender);
  // Paso 1: listas con versión vigente y fecha de modificación
  const lists = L.activeLists();
  return h(
    'div',
    { class: 'page' },
    pageHeader('Mis listas', { subtitle: 'Cada cambio se guarda como una nueva versión', help: HELP.lists, actions: h('a', { class: 'btn btn-primary', href: '#/listas/nueva' }, icon('plus'), 'Nueva') }),
    lists.length
      ? h(
          'ul',
          { class: 'cards' },
          lists.map((l) => {
            const v = L.currentVersion(l);
            return h(
              'li',
              { class: 'card list-card' },
              h('a', { href: `#/listas/${l.id}`, class: 'list-link' }, h('strong', {}, v.name), h('small', {}, `${v.items.length} producto(s) · versión ${v.v} · ${fmtDate(v.ts)}`)),
              h(
                'div',
                { class: 'row-actions' },
                h('a', { class: 'btn btn-ghost btn-sm', href: `#/buscar?lista=${l.id}`, 'data-tip': 'Buscar dónde y cuándo conviene comprar esta lista' }, icon('wave', { size: 18 }), 'Optimizar'),
                h('button', {
                  class: 'icon-btn',
                  'aria-label': `Eliminar ${v.name}`,
                  onclick: async () => {
                    // A-1: eliminar conservando versiones
                    if (!(await confirmDialog('Eliminar lista', `¿Eliminar «${v.name}»? Se conservan sus versiones en el historial.`, { ok: 'Eliminar', danger: true }))) return;
                    await L.deleteList(l.id);
                    toast('Lista eliminada', 'ok');
                    rerender();
                  },
                }, icon('trash'))
              )
            );
          })
        )
      : empty('list', 'Todavía no tenés listas', 'Creá una lista con los productos que comprás habitualmente.', h('a', { class: 'btn btn-primary', href: '#/listas/nueva' }, icon('plus'), 'Crear lista'))
  );
}

function editor(listId, rerender) {
  const list = listId ? L.getList(listId) : null;
  if (listId && (!list || list.deleted)) return empty('alert', 'Lista no encontrada', null, h('a', { class: 'btn', href: '#/listas' }, 'Volver'));
  const draft = list ? L.currentItems(list).map((i) => ({ ...i })) : [];
  const nameInput = h('input', { class: 'input input-lg', value: list ? L.currentVersion(list).name : '', placeholder: 'Ej.: Compra semanal', maxlength: 60, 'aria-label': 'Nombre de la lista' });
  const itemsEl = h('ul', { class: 'items' });
  const errEl = h('div', { class: 'form-error', role: 'alert' });
  const estEl = h('p', { class: 'muted small' });
  // A-4: cambios sin guardar — se comparan el nombre y los ítems con la última versión guardada
  const snap = () => JSON.stringify({ n: nameInput.value.trim(), i: draft.map((d) => [d.generic, d.productId || null, d.qty]) });
  let saved = snap();
  const isDirty = () => snap() !== saved;
  const stateEl = h('span', { class: 'saved-state' });
  const unsavedBar = h('div', { class: 'unsaved-bar', role: 'status', hidden: true }, h('span', {}, icon('alert', { size: 18 }), ' Cambios sin guardar'), h('span', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Vuelve a la última versión guardada', onclick: () => discard() }, 'Descartar'), h('button', { class: 'btn btn-primary btn-sm', onclick: () => doSave(false) }, 'Guardar')));
  const markDirty = () => {
    const d = isDirty();
    unsavedBar.hidden = !d;
    stateEl.textContent = d ? 'Hay cambios sin guardar' : list || currentId ? 'Todo guardado' : '';
    saveBtn.disabled = !d;
  };

  const refreshEstimate = async () => {
    let total = 0;
    let n = 0;
    for (const it of draft) {
      const pid = it.productId || Cat.productsByGeneric(it.generic)[0]?.id;
      const p = pid ? await L.referencePrice(pid) : null;
      if (p) {
        total += p * it.qty;
        n++;
      }
    }
    estEl.textContent = n ? `Costo estimado (promedio de la zona, sin promociones): ${money(total)}` : '';
  };

  const renderItems = () => {
    clear(itemsEl);
    if (!draft.length) itemsEl.append(h('li', { class: 'muted pad' }, 'Sin productos todavía.'));
    draft.forEach((it, idx) => {
      const qty = h('input', { type: 'number', class: 'input qty', min: 1, max: 99, step: 1, value: it.qty, inputmode: 'numeric', 'aria-label': 'Cantidad', onchange: (e) => ((it.qty = Math.trunc(Number(e.target.value))), refreshEstimate(), markDirty()) });
      const tier = it.productId ? UD.get('profile').tiers[it.productId] : null;
      itemsEl.append(
        h(
          'li',
          { class: 'item' },
          h('div', { class: 'item-main' }, h('strong', {}, L.itemLabel(it)), tier ? h('span', { class: `tier tier-${tier}` }, tierName(tier)) : null),
          h(
            'div',
            { class: 'item-actions' },
            h('button', { class: 'icon-btn', 'aria-label': 'Restar', onclick: () => ((it.qty = Math.max(1, it.qty - 1)), (qty.value = it.qty), refreshEstimate(), markDirty()) }, '−'),
            qty,
            h('button', { class: 'icon-btn', 'aria-label': 'Sumar', onclick: () => ((it.qty = Math.min(99, it.qty + 1)), (qty.value = it.qty), refreshEstimate(), markDirty()) }, '+'),
            Cat.productsByGeneric(it.generic).length > 1 ? h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Reemplazar por otra marca equivalente (CU-05)', onclick: () => changeBrand(it) }, icon('swap', { size: 18 }), 'Cambiar marca') : null,
            h('button', { class: 'icon-btn', 'aria-label': 'Quitar', onclick: () => (draft.splice(idx, 1), renderItems(), refreshEstimate(), markDirty()) }, icon('trash', { size: 20 }))
          )
        )
      );
    });
  };

  let currentId = listId;

  // A-2 (punto de extensión EP_EdicionItem): CU-05 sobre el ítem elegido; luego paso 4 (validar)
  const changeBrand = async (it) => {
    const choice = await chooseBrand(it);
    if (!choice) return;
    errEl.textContent = '';
    try {
      // se persiste lo editado antes de sustituir para que el cambio quede en una versión propia
      if (!currentId || JSON.stringify(L.currentItems(L.getList(currentId))) !== JSON.stringify(draft.map((d) => ({ generic: d.generic, productId: d.productId || null, qty: d.qty })))) {
        const saved = await L.saveVersion(currentId, nameInput.value, draft, 'Edición');
        currentId = saved.id;
      }
      const res = await L.substituteBrand(currentId, it.generic, choice, 'manual');
      it.productId = choice;
      renderItems();
      refreshEstimate();
      saved = snap();
      markDirty();
      showSubstitutionResult(res, currentId, it.generic, () => {
        const back = L.currentItems(L.getList(currentId)).find((x) => x.generic === it.generic);
        it.productId = back?.productId || null;
        renderItems();
        refreshEstimate();
        saved = snap();
        markDirty();
      });
      if (!listId) history.replaceState(null, '', `#/listas/${currentId}`);
    } catch (e) {
      errEl.textContent = e.message; // CU-05 E-1 o CU-01 E-1
    }
  };

  // Pasos 4 a 6: validar, guardar como nueva versión y confirmar
  const doSave = async (leave = true) => {
    errEl.textContent = '';
    if (!isDirty() && currentId) {
      toast('No hay cambios para guardar', 'info');
      return true;
    }
    try {
      const savedList = await L.saveVersion(currentId, nameInput.value, draft, list || currentId ? 'Edición' : 'Creación');
      currentId = savedList.id;
      saved = snap();
      markDirty();
      toast(`Lista guardada (versión ${L.currentVersion(savedList).v})`, 'ok');
      if (leave) {
        setLeaveGuard(null);
        location.hash = '#/listas';
      } else if (!listId) history.replaceState(null, '', `#/listas/${currentId}`);
      return true;
    } catch (e) {
      errEl.textContent = e.message; // E-1: vuelve al paso 3
      errEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
  };
  const discard = () => {
    const base = currentId ? L.currentItems(L.getList(currentId)) : [];
    draft.splice(0, draft.length, ...base.map((i) => ({ ...i })));
    nameInput.value = currentId ? L.currentVersion(L.getList(currentId)).name : '';
    errEl.textContent = '';
    renderItems();
    refreshEstimate();
    saved = snap();
    markDirty();
  };
  const saveBtn = h('button', { class: 'btn btn-primary btn-lg', onclick: () => doSave(true) }, icon('check'), 'Guardar lista');
  nameInput.addEventListener('input', markDirty);
  setLeaveGuard({ dirty: isDirty, name: 'la lista', save: () => doSave(false) });

  renderItems();
  refreshEstimate();
  markDirty();

  return h(
    'div',
    { class: 'page' },
    pageHeader(list ? 'Editar lista' : 'Nueva lista', { back: '#/listas', help: HELP.lists }),
    unsavedBar,
    card(
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre'), nameInput),
      h('div', { class: 'row space' }, h('h2', { class: 'h3' }, 'Productos'), h('button', { class: 'btn btn-secondary', 'data-tip': 'Buscá por nombre, marca, categoría o código de barras', onclick: async () => {
        const r = await pickProduct({});
        if (!r) return;
        const existing = draft.find((d) => d.generic === r.generic && (d.productId || null) === r.productId);
        if (existing) existing.qty = Math.min(99, existing.qty + 1);
        else if (draft.some((d) => d.generic === r.generic)) return toast('Ese producto ya está en la lista con otra marca: usá «Cambiar marca»', 'info', 5000);
        else draft.push({ generic: r.generic, productId: r.productId, qty: 1 });
        renderItems();
        refreshEstimate();
        markDirty();
      } }, icon('plus'), 'Agregar')),
      itemsEl,
      estEl,
      errEl,
      h('div', { class: 'row end' }, stateEl, saveBtn)
    ),
    list ? versionsCard(list, rerender, isDirty) : null,
    steps('CU-01 · pasos 1–6 · A-1 · A-2 (EP_EdicionItem → CU-05) · A-3 · A-4 · E-1')
  );
}

function versionsCard(list, rerender, isDirty) {
  const det = h('details', { class: 'card' }, h('summary', {}, `Historial de versiones (${list.versions.length})`), h('p', { class: 'muted small' }, 'Cada vez que guardás (cambio de nombre, de productos o de cantidades), cambiás una marca o restaurás, se crea una versión nueva. Restaurar no borra las versiones posteriores.'));
  const ul = h('ul', { class: 'versions' });
  [...list.versions].reverse().forEach((v) =>
    ul.append(
      h(
        'li',
        {},
        h('div', {}, h('strong', {}, `v${v.v}`), ` · ${fmtDate(v.ts)} · ${v.items.length} ítem(s)`, h('br'), h('small', { class: 'muted' }, v.note || '')),
        v !== L.currentVersion(list)
          ? h('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Crea una nueva versión con el contenido de esta (A-3)', onclick: async () => {
              if (isDirty() && !(await confirmDialog('Restaurar versión', 'Tenés cambios sin guardar que se van a perder. ¿Restaurar igual?', { ok: 'Restaurar' }))) return;
              setLeaveGuard(null);
              await L.saveVersion(list.id, v.name, v.items, `Restaurada desde v${v.v}`);
              toast('Versión restaurada como nueva versión', 'ok');
              rerender();
            } }, icon('undo', { size: 16 }), 'Restaurar')
          : h('span', { class: 'pill' }, 'vigente')
      )
    )
  );
  det.append(ul);
  return det;
}

/** CU-05 paso 1: el Comprador elige la marca destino. */
async function chooseBrand(it) {
  const options = Cat.productsByGeneric(it.generic).filter((p) => p.id !== it.productId);
  const prices = await Promise.all(options.map((p) => L.referencePrice(p.id)));
  const tiers = UD.get('profile').tiers;
  return new Promise((resolve) => {
    let picked = null;
    const m = modal({
      title: 'Cambiar marca',
      content: h(
        'div',
        {},
        h('p', { class: 'muted small' }, `Producto: ${L.itemLabel(it)}. Precio de referencia: promedio de la zona.`),
        h(
          'ul',
          { class: 'pick-list' },
          options
            .map((p, i) => ({ p, price: prices[i] }))
            .sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12))
            .map(({ p, price }) => h('li', {}, h('button', { class: 'pick-item', onclick: () => ((picked = p.id), m.close()) }, h('span', {}, h('strong', {}, p.brand), h('small', {}, `${money(price)} · ${tiers[p.id] ? tierName(tiers[p.id]) : 'sin gama'}`)), icon('chevron', { size: 18 }))))
        )
      ),
      onClose: () => resolve(picked),
    });
  });
}

/** CU-05 paso 4: resultado, ahorro y opción «Deshacer» (A-1). */
export function showSubstitutionResult(res, listId, generic, afterUndo) {
  const to = Cat.product(res.toProductId);
  const m = modal({
    title: 'Marca cambiada',
    content: h('div', {}, h('p', {}, `Ahora la lista tiene ${to.name}.`), res.saving != null ? h('p', { class: res.saving >= 0 ? 'good' : 'bad' }, res.saving >= 0 ? `Ahorro estimado: ${money(res.saving)}` : `Costo adicional estimado: ${money(-res.saving)}`) : null, steps('CU-05 · pasos 1–4')),
    actions: [
      {
        label: 'Deshacer',
        onClick: async (close) => {
          await L.undoSubstitution(listId, generic, res.fromProductId);
          close();
          toast('Se restauró la marca anterior (nueva versión)', 'ok');
          afterUndo?.();
        },
      },
      { label: 'Listo', kind: 'primary', value: true },
    ],
  });
  return m;
}
