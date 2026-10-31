// Cuentas locales (multiusuario) con base cifrada por usuario.
import { openDb, Store } from './idb.js';
import * as C from './crypto.js';

const MAX_FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

let accountsDb;
async function db() {
  if (!accountsDb) {
    const raw = await openDb('ms-accounts', 1, (d) => {
      d.createObjectStore('accounts', { keyPath: 'id' });
      d.createObjectStore('meta');
    });
    accountsDb = new Store(raw);
  }
  return accountsDb;
}

export async function listAccounts() {
  const all = await (await db()).getAll('accounts');
  return all.map(({ id, username, displayName, role, bio, lastLogin }) => ({ id, username, displayName, role, hasBio: !!bio, lastLogin }));
}

export async function getAccount(id) {
  return (await db()).get('accounts', id);
}

async function saveAccount(acc) {
  await (await db()).put('accounts', acc);
}

export function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

export function usernameIssues(u) {
  const n = normalizeUsername(u);
  if (n.length < 3) return 'El usuario debe tener al menos 3 caracteres';
  if (n.length > 30) return 'El usuario no puede superar 30 caracteres';
  if (!/^[a-z0-9._-]+$/.test(n)) return 'Usá sólo letras sin acentos, números, punto, guion o guion bajo';
  return null;
}

/** Crea la cuenta y devuelve { session, recoveryCode }. */
export async function register({ username, displayName, password }) {
  const uname = normalizeUsername(username);
  const uIssue = usernameIssues(uname);
  if (uIssue) throw new Error(uIssue);
  const issues = C.passwordIssues(password, uname);
  if (issues.length) throw new Error(issues.join('. '));
  const existing = await listAccounts();
  if (existing.some((a) => a.username === uname)) throw new Error('Ese nombre de usuario ya existe en este dispositivo');

  const dek = await C.generateDek();
  const recoveryCode = C.newRecoveryCode();
  const acc = {
    id: crypto.randomUUID(),
    username: uname,
    displayName: String(displayName || uname).trim().slice(0, 40),
    role: existing.length === 0 ? 'admin' : 'user', // la primera cuenta administra la sincronización (CU-10)
    createdAt: Date.now(),
    pw: await C.wrapWithPassword(dek, password),
    rec: await C.wrapWithRecovery(dek, recoveryCode),
    bio: null,
    failed: 0,
    lockUntil: 0,
    lastLogin: Date.now(),
  };
  await saveAccount(acc);
  const key = await C.toSessionKey(dek);
  return { session: { account: publicAccount(acc), key }, recoveryCode };
}

function publicAccount(acc) {
  return { id: acc.id, username: acc.username, displayName: acc.displayName, role: acc.role, hasBio: !!acc.bio };
}

export function lockRemainingMs(acc) {
  return Math.max(0, (acc.lockUntil || 0) - Date.now());
}

async function registerFailure(acc) {
  acc.failed = (acc.failed || 0) + 1;
  if (acc.failed >= MAX_FREE_ATTEMPTS) {
    const ms = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (acc.failed - MAX_FREE_ATTEMPTS));
    acc.lockUntil = Date.now() + ms;
  }
  await saveAccount(acc);
}

export async function login(accountId, password) {
  const acc = await getAccount(accountId);
  if (!acc) throw new Error('Cuenta inexistente');
  const wait = lockRemainingMs(acc);
  if (wait > 0) throw new Error(`Demasiados intentos. Esperá ${Math.ceil(wait / 1000)} s.`);
  try {
    const dek = await C.unwrapWithPassword(acc.pw, password);
    acc.failed = 0;
    acc.lockUntil = 0;
    acc.lastLogin = Date.now();
    await saveAccount(acc);
    return { account: publicAccount(acc), key: dek };
  } catch {
    await registerFailure(acc);
    const left = MAX_FREE_ATTEMPTS - acc.failed;
    throw new Error(left > 0 ? `Contraseña incorrecta. Te quedan ${left} intento(s) antes del bloqueo temporal.` : 'Contraseña incorrecta. Cuenta bloqueada temporalmente.');
  }
}

export async function loginByUsername(username, password) {
  const uname = normalizeUsername(username);
  const acc = (await (await db()).getAll('accounts')).find((a) => a.username === uname);
  // Mensaje genérico para no revelar qué usuarios existen
  if (!acc) {
    await new Promise((r) => setTimeout(r, 600));
    throw new Error('Usuario o contraseña incorrectos');
  }
  return login(acc.id, password);
}

/** Recupera el acceso con el código y fija una contraseña nueva. Devuelve sesión y nuevo código. */
export async function recover(username, code, newPassword) {
  const uname = normalizeUsername(username);
  const acc = (await (await db()).getAll('accounts')).find((a) => a.username === uname);
  if (!acc) throw new Error('Usuario o código incorrectos');
  const wait = lockRemainingMs(acc);
  if (wait > 0) throw new Error(`Demasiados intentos. Esperá ${Math.ceil(wait / 1000)} s.`);
  const issues = C.passwordIssues(newPassword, uname);
  if (issues.length) throw new Error(issues.join('. '));
  let dek;
  try {
    dek = await C.unwrapWithRecovery(acc.rec, code, true);
  } catch {
    await registerFailure(acc);
    throw new Error('Usuario o código incorrectos');
  }
  const recoveryCode = C.newRecoveryCode();
  acc.pw = await C.wrapWithPassword(dek, newPassword);
  acc.rec = await C.wrapWithRecovery(dek, recoveryCode);
  acc.bio = null; // por seguridad se debe volver a activar la huella
  acc.failed = 0;
  acc.lockUntil = 0;
  await saveAccount(acc);
  return { session: { account: publicAccount(acc), key: await C.toSessionKey(dek) }, recoveryCode };
}

export async function changePassword(accountId, currentPw, newPw) {
  const acc = await getAccount(accountId);
  const issues = C.passwordIssues(newPw, acc.username);
  if (issues.length) throw new Error(issues.join('. '));
  let dek;
  try {
    dek = await C.unwrapWithPassword(acc.pw, currentPw, true);
  } catch {
    await registerFailure(acc);
    throw new Error('La contraseña actual no es correcta');
  }
  acc.pw = await C.wrapWithPassword(dek, newPw);
  await saveAccount(acc);
}

export async function regenerateRecovery(accountId, currentPw) {
  const acc = await getAccount(accountId);
  let dek;
  try {
    dek = await C.unwrapWithPassword(acc.pw, currentPw, true);
  } catch {
    await registerFailure(acc);
    throw new Error('La contraseña actual no es correcta');
  }
  const code = C.newRecoveryCode();
  acc.rec = await C.wrapWithRecovery(dek, code);
  await saveAccount(acc);
  return code;
}

export async function verifyPassword(accountId, pw) {
  const acc = await getAccount(accountId);
  try {
    await C.unwrapWithPassword(acc.pw, pw);
    return true;
  } catch {
    await registerFailure(acc);
    return false;
  }
}

export async function deleteAccountRecord(accountId) {
  await (await db()).delete('accounts', accountId);
}

export async function setRole(accountId, role) {
  const acc = await getAccount(accountId);
  acc.role = role;
  await saveAccount(acc);
}

// ---------- Biometría (passkey con extensión PRF) ----------

export function bioApiAvailable() {
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

export async function bioPlatformAvailable() {
  if (!bioApiAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function prfGet(credIdB64, prfSaltB64) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: C.randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: C.fromB64(credIdB64) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: C.fromB64(prfSaltB64) } } },
    },
  });
  const out = cred?.getClientExtensionResults?.().prf?.results?.first;
  if (!out) throw new Error('Este dispositivo no admite desbloqueo biométrico seguro (PRF).');
  return new Uint8Array(out);
}

/** Activa la huella: requiere la contraseña para obtener la DEK. */
export async function enableBiometrics(accountId, password) {
  const acc = await getAccount(accountId);
  let dek;
  try {
    dek = await C.unwrapWithPassword(acc.pw, password, true);
  } catch {
    await registerFailure(acc);
    throw new Error('La contraseña no es correcta');
  }
  const prfSalt = C.toB64(C.randomBytes(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'MarketSurfing', id: location.hostname },
      user: { id: C.randomBytes(16), name: acc.username, displayName: acc.displayName },
      challenge: C.randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: C.fromB64(prfSalt) } } },
    },
  });
  const ext = cred.getClientExtensionResults?.() || {};
  if (ext.prf && ext.prf.enabled === false) throw new Error('Este dispositivo no admite desbloqueo biométrico seguro (PRF).');
  const credId = C.toB64(cred.rawId);
  let out = ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : await prfGet(credId, prfSalt);
  const wrapped = await C.wrapWithPrf(dek, out);
  out.fill(0);
  acc.bio = { credId, prfSalt, ...wrapped };
  await saveAccount(acc);
}

export async function loginWithBiometrics(accountId) {
  const acc = await getAccount(accountId);
  if (!acc?.bio) throw new Error('La huella no está activada para esta cuenta');
  const wait = lockRemainingMs(acc);
  if (wait > 0) throw new Error(`Cuenta bloqueada. Esperá ${Math.ceil(wait / 1000)} s.`);
  const out = await prfGet(acc.bio.credId, acc.bio.prfSalt);
  const key = await C.unwrapWithPrf(acc.bio, out);
  out.fill(0);
  acc.failed = 0;
  acc.lastLogin = Date.now();
  await saveAccount(acc);
  return { account: publicAccount(acc), key };
}

export async function disableBiometrics(accountId) {
  const acc = await getAccount(accountId);
  acc.bio = null;
  await saveAccount(acc);
}

/** Datos necesarios para una copia de seguridad cifrada (sólo material envuelto, nunca claves en claro). */
export async function exportAccountEnvelope(accountId) {
  const acc = await getAccount(accountId);
  return { username: acc.username, displayName: acc.displayName, pw: acc.pw, rec: acc.rec };
}

export async function importAccountEnvelope(env, password) {
  const uname = normalizeUsername(env.username);
  const existing = await listAccounts();
  if (existing.some((a) => a.username === uname)) throw new Error(`Ya existe la cuenta «${uname}» en este dispositivo`);
  const dek = await C.unwrapWithPassword(env.pw, password).catch(() => {
    throw new Error('La contraseña no corresponde a la copia de seguridad');
  });
  const acc = {
    id: crypto.randomUUID(),
    username: uname,
    displayName: env.displayName || uname,
    role: existing.length === 0 ? 'admin' : 'user',
    createdAt: Date.now(),
    pw: env.pw,
    rec: env.rec,
    bio: null,
    failed: 0,
    lockUntil: 0,
    lastLogin: Date.now(),
  };
  await saveAccount(acc);
  return { account: publicAccount(acc), key: dek };
}
