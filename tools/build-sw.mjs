// Genera sw.js con la lista de archivos a precachear y una versión basada en su contenido.
// Uso: node tools/build-sw.mjs
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const include = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];
const files = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) readdirSync(p).sort().forEach((f) => walk(join(p, f)));
  else files.push(relative(root, p));
};
include.forEach((p) => walk(join(root, p)));
const hash = createHash('sha256');
files.forEach((f) => hash.update(f).update(readFileSync(join(root, f))));
const version = hash.digest('hex').slice(0, 12);
const tpl = readFileSync(join(root, 'tools/sw.template.js'), 'utf8');
writeFileSync(join(root, 'sw.js'), tpl.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(['./', ...files], null, 2)));
console.log(`sw.js generado: versión ${version}, ${files.length} archivos`);
