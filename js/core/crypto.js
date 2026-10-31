// Criptografía local: todo con WebCrypto (sin dependencias).
// Esquema:
//  - DEK (Data Encryption Key): AES-GCM 256 aleatoria por usuario; cifra todos sus datos.
//  - KEK de contraseña: PBKDF2-SHA256 (600.000 iteraciones) -> AES-KW; envuelve la DEK.
//  - KEK de recuperación: PBKDF2 sobre un código aleatorio de 120 bits -> AES-KW.
//  - KEK biométrica: salida PRF de una passkey (WebAuthn) -> HKDF -> AES-KW.
//  Una contraseña incorrecta no "valida" contra un hash: simplemente AES-KW falla al desenvolver.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
export const RECOVERY_ITERATIONS = 150_000;

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(text) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Kek(secret, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

async function hkdfKek(ikm, salt, info) {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

export async function generateDek() {
  // extractable sólo para poder envolverla; la copia de sesión se re-importa como no extraíble.
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function wrap(dek, kek) {
  return toB64(await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW'));
}

async function unwrap(wrappedB64, kek, extractable = false) {
  return crypto.subtle.unwrapKey('raw', fromB64(wrappedB64), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}

export async function wrapWithPassword(dek, password, saltB64 = toB64(randomBytes(16)), iterations = PBKDF2_ITERATIONS) {
  const kek = await pbkdf2Kek(password, fromB64(saltB64), iterations);
  return { salt: saltB64, iterations, wrapped: await wrap(dek, kek) };
}

/** Devuelve la DEK o lanza si la contraseña es incorrecta. */
export async function unwrapWithPassword(blob, password, extractable = false) {
  const kek = await pbkdf2Kek(password, fromB64(blob.salt), blob.iterations);
  return unwrap(blob.wrapped, kek, extractable);
}

// Código de recuperación: 24 caracteres base32 sin ambigüedades (120 bits), en grupos de 4.
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const b = randomBytes(24);
  const chars = [...b].map((x) => B32[x & 31]).join('');
  return chars.match(/.{4}/g).join('-');
}
export function normalizeRecoveryCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1');
}

export async function wrapWithRecovery(dek, code) {
  return wrapWithPassword(dek, normalizeRecoveryCode(code), toB64(randomBytes(16)), RECOVERY_ITERATIONS);
}
export async function unwrapWithRecovery(blob, code, extractable = false) {
  return unwrapWithPassword(blob, normalizeRecoveryCode(code), extractable);
}

export async function wrapWithPrf(dek, prfOutput, saltB64 = toB64(randomBytes(16))) {
  const kek = await hkdfKek(prfOutput, fromB64(saltB64), 'marketsurfing-bio-v1');
  return { salt: saltB64, wrapped: await wrap(dek, kek) };
}
export async function unwrapWithPrf(blob, prfOutput, extractable = false) {
  const kek = await hkdfKek(prfOutput, fromB64(blob.salt), 'marketsurfing-bio-v1');
  return unwrap(blob.wrapped, kek, extractable);
}

/** Copia no extraíble de la DEK para usar durante la sesión. */
export async function toSessionKey(extractableDek) {
  const raw = await crypto.subtle.exportKey('raw', extractableDek);
  const k = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  new Uint8Array(raw).fill(0);
  return k;
}

export async function encryptJson(key, value, aad = '') {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value)));
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson(key, box, aad = '') {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: enc.encode(aad) }, key, fromB64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// ---------- Política de contraseñas ----------
const COMMON = new Set(
  'password 123456 12345678 123456789 1234567890 qwerty qwerty123 abc123 111111 000000 password1 iloveyou admin admin123 contraseña contrasena argentina boca river 12345 654321 123123 marketsurfing superman dragon'.split(
    ' '
  )
);

export function passwordIssues(pw, username = '') {
  const issues = [];
  if (pw.length < 10) issues.push('Al menos 10 caracteres');
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length < 16 && classes < 3) issues.push('Combiná minúsculas, mayúsculas, números o símbolos (o usá una frase de 16+ caracteres)');
  if (COMMON.has(pw.toLowerCase())) issues.push('Es una contraseña muy común');
  if (username && pw.toLowerCase().includes(username.toLowerCase())) issues.push('No debe contener el nombre de usuario');
  if (/^(.)\1+$/.test(pw)) issues.push('No repitas un mismo carácter');
  return issues;
}

export function passwordStrength(pw) {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const bits = pw.length * Math.log2(pool || 1);
  if (bits < 40) return { level: 0, label: 'Débil' };
  if (bits < 60) return { level: 1, label: 'Aceptable' };
  if (bits < 80) return { level: 2, label: 'Buena' };
  return { level: 3, label: 'Muy buena' };
}
