// Servicio de listas: versionado incremental (RF-01) y sustitución de marca (CU-05 / RF-17).
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';

export const activeLists = () => UD.get('lists').filter((l) => !l.deleted);
export const getList = (id) => UD.get('lists').find((l) => l.id === id);
export const currentVersion = (list) => list.versions[list.versions.length - 1];
export const currentItems = (list) => currentVersion(list).items;

export function itemLabel(it) {
  if (it.productId) return Cat.product(it.productId)?.name || 'Producto no disponible';
  const g = Cat.productsByGeneric(it.generic)[0];
  return g ? `${g.genericName} ${g.presentation} · cualquier marca` : 'Producto no disponible';
}

/** CU-01 paso 4: validaciones. Devuelve lista de errores (vacía si es válido). */
export function validateList(name, items, selfId = null) {
  const errors = [];
  const n = String(name || '').trim();
  if (!n) errors.push('La lista necesita un nombre');
  if (n.length > 60) errors.push('El nombre no puede superar 60 caracteres');
  if (activeLists().some((l) => l.id !== selfId && currentVersion(l).name.trim().toLowerCase() === n.toLowerCase())) errors.push('Ya tenés una lista con ese nombre');
  if (!items.length) errors.push('Agregá al menos un producto');
  items.forEach((it) => {
    if (!(Number.isInteger(it.qty) && it.qty > 0 && it.qty <= 99)) errors.push(`Cantidad inválida en «${itemLabel(it)}» (1 a 99)`);
    if (it.productId ? !Cat.product(it.productId) : !Cat.productsByGeneric(it.generic).length) errors.push('Hay un producto que no existe en el catálogo');
  });
  return errors;
}

/** CU-01 paso 5: guarda una nueva versión incremental (crea la lista si no existe). */
export async function saveVersion(listId, name, items, note = 'Edición') {
  const errors = validateList(name, items, listId);
  if (errors.length) {
    const e = new Error(errors.join('. '));
    e.code = 'E-1';
    throw e;
  }
  let list = listId && getList(listId);
  const clean = items.map((i) => ({ generic: i.generic, productId: i.productId || null, qty: i.qty }));
  if (!list) {
    list = { id: crypto.randomUUID(), createdAt: Date.now(), deleted: false, versions: [] };
    UD.get('lists').push(list);
  }
  list.versions.push({ v: list.versions.length + 1, ts: Date.now(), name: String(name).trim(), items: clean, note });
  await UD.save('lists');
  return list;
}

/** CU-01 A-1: baja lógica conservando las versiones. */
export async function deleteList(listId) {
  const l = getList(listId);
  l.deleted = true;
  l.deletedAt = Date.now();
  await UD.save('lists');
}

/** Precio de referencia de un producto: promedio de precios vigentes en todas las sucursales. */
export async function referencePrice(productId) {
  const recs = await Cat.currentByProduct(productId);
  if (!recs.length) return null;
  return Math.round(recs.reduce((a, r) => a + r.price, 0) / recs.length);
}

/** CU-05 paso 2: equivalencia (misma categoría, presentación y unidad = mismo genérico) y distinta de la actual. */
export function checkEquivalence(fromProductIdOrGeneric, toProductId) {
  const to = Cat.product(toProductId);
  if (!to) return 'La marca destino no existe en el catálogo';
  const from = Cat.product(fromProductIdOrGeneric);
  const generic = from ? from.generic : fromProductIdOrGeneric;
  if (from && from.id === to.id) return 'La marca destino es la misma que la actual';
  const ref = from || Cat.productsByGeneric(generic)[0];
  if (to.generic !== generic || to.category !== ref.category || to.presentation !== ref.presentation || to.unit !== ref.unit) return `«${to.name}» no es equivalente: debe tener la misma categoría, presentación y unidad`;
  return null;
}

/**
 * CU-05 pasos 2 y 3: sustituye la marca del ítem (por genérico) como nueva versión.
 * Devuelve { list, fromProductId, toProductId, saving }.
 */
export async function substituteBrand(listId, generic, toProductId, origin = 'manual') {
  const list = getList(listId);
  const items = currentItems(list).map((i) => ({ ...i }));
  const it = items.find((i) => i.generic === generic);
  if (!it) throw new Error('El ítem ya no está en la lista');
  const err = checkEquivalence(it.productId || it.generic, toProductId);
  if (err) {
    const e = new Error(err);
    e.code = 'E-1';
    throw e;
  }
  const fromProductId = it.productId;
  const [a, b] = await Promise.all([fromProductId ? referencePrice(fromProductId) : null, referencePrice(toProductId)]);
  it.productId = toProductId;
  const fromName = fromProductId ? Cat.product(fromProductId).brand : 'cualquier marca';
  await saveVersion(listId, currentVersion(list).name, items, `Cambio de marca (${origin}): ${fromName} → ${Cat.product(toProductId).brand}`);
  return { list, fromProductId, toProductId, saving: a != null && b != null ? (a - b) * it.qty : null };
}

/** CU-05 A-1: deshacer, restaurando la marca anterior como nueva versión. */
export async function undoSubstitution(listId, generic, fromProductId) {
  const list = getList(listId);
  const items = currentItems(list).map((i) => ({ ...i }));
  const it = items.find((i) => i.generic === generic);
  if (!it) return;
  it.productId = fromProductId || null;
  await saveVersion(listId, currentVersion(list).name, items, 'Deshacer cambio de marca');
}
