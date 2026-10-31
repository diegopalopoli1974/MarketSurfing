// Datos privados del usuario: documentos JSON cifrados con AES-GCM en una base por cuenta.
import { openDb, Store, deleteDb } from './idb.js';
import { encryptJson, decryptJson } from './crypto.js';

export const DOCS = ['lists', 'alerts', 'profile', 'activity'];

const DEFAULTS = {
  lists: () => [],
  alerts: () => [],
  profile: () => ({
    payments: [],
    availability: { buy: [], receive: [], verify: [], slots: {} },
    verifier: { enabled: false, consentAt: null },
    excluded: [],
    tiers: {},
    prefs: { radiusKm: 3, costPerKm: 100, autoLockMin: 5, theme: 'auto', fontScale: 1, simulatePresence: false },
  }),
  activity: () => ({ points: 0, pointsLog: [], reports: [], tickets: [], inbox: [], lastAlertEval: 0 }),
};

let state = null; // { db, key, username, cache }

function dbName(accountId) {
  return `ms-u-${accountId}`;
}

async function open(accountId) {
  return new Store(await openDb(dbName(accountId), 1, (d) => d.createObjectStore('docs')));
}

export async function startSession(accountId, username, key) {
  const db = await open(accountId);
  const cache = {};
  for (const name of DOCS) {
    const box = await db.get('docs', name);
    cache[name] = box ? await decryptJson(key, box, `ms:${username}:${name}`) : DEFAULTS[name]();
  }
  // completa claves nuevas del perfil sin pisar las existentes
  const defProfile = DEFAULTS.profile();
  cache.profile = { ...defProfile, ...cache.profile, prefs: { ...defProfile.prefs, ...(cache.profile.prefs || {}) }, availability: { ...defProfile.availability, ...(cache.profile.availability || {}) } };
  cache.activity = { ...DEFAULTS.activity(), ...cache.activity };
  state = { db, key, username, cache };
}

export function endSession() {
  if (state) {
    state.db.db.close();
    // se sueltan referencias a datos descifrados y a la clave
    for (const k of Object.keys(state.cache)) state.cache[k] = null;
  }
  state = null;
}

export function active() {
  return !!state;
}

export function get(name) {
  if (!state) throw new Error('Sesión bloqueada');
  return state.cache[name];
}

export async function save(name, value = state?.cache[name]) {
  if (!state) throw new Error('Sesión bloqueada');
  state.cache[name] = value;
  const box = await encryptJson(state.key, value, `ms:${state.username}:${name}`);
  await state.db.put('docs', box, name);
}

export async function update(name, fn) {
  const v = get(name);
  const r = fn(v);
  await save(name, r === undefined ? v : r);
  return get(name);
}

export async function destroy(accountId) {
  endSession();
  await deleteDb(dbName(accountId));
}

/** Cajas cifradas tal como están en disco (para la copia de seguridad). */
export async function exportBoxes(accountId) {
  const db = state?.db || (await open(accountId));
  const out = {};
  for (const name of DOCS) {
    const box = await db.get('docs', name);
    if (box) out[name] = box;
  }
  return out;
}

export async function importBoxes(accountId, boxes) {
  const db = await open(accountId);
  for (const name of DOCS) if (boxes[name]?.iv && boxes[name]?.ct) await db.put('docs', boxes[name], name);
  db.db.close();
}
