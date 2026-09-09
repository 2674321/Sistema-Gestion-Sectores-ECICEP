#!/usr/bin/env node
/**
 * Batería VALIDAR HTML — ECICEP.
 * Objetivo: cerrar el hueco del CI sobre la sintaxis de los <script> embebidos
 * en las páginas HTML (Web App, guía interactiva, paneles, demo).
 *
 * El CI de GitHub solo ejecuta `node --check` sobre src/*.js y src/*.gs; un
 * error de sintaxis dentro de un <script> inline de CapturaWeb.html o de la
 * guía en 00_Tokens.html rompería el canal operativo sin que el pipeline lo
 * detectara. Esta batería extrae cada script inline de cada HTML y lo valida
 * como programa JavaScript independiente (new Function), igual que hacen los
 * navegadores al materializar <script>.
 *
 * Reglas de extracción:
 *   - Se ignoran scripts con atributo `src=` (externos).
 *   - Se ignoran bloques con plantillas GAS `<? … ?>` (no son JS puro).
 *   - Se valida el resto, incluidos los `type="text/plain"` que se inyectan
 *     luego como <script> real (p.ej. la librería QR en CapturaWeb.html).
 *
 * Uso: node tests/validar_html.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

const HTML_RE = /<script([^>>]*?)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR = /\bsrc\s*=/i;
const GAS_TEMPLATE = /<\?/;

function extraerScripts(ruta) {
  const html = readFileSync(ruta, 'utf8');
  const out = [];
  let m;
  HTML_RE.lastIndex = 0;
  while ((m = HTML_RE.exec(html))) {
    if (SRC_ATTR.test(m[1])) continue;      // externo
    if (GAS_TEMPLATE.test(m[2])) continue;  // plantilla GAS
    out.push(m[2]);
  }
  return out;
}

function validar(html, rel) {
  const scripts = extraerScripts(html);
  if (!scripts.length) {
    console.log(`  ${rel}: sin scripts inline validables`);
    return { nombre: rel, ok: 0, fail: 0, errores: [] };
  }
  let ok = 0;
  const errores = [];
  scripts.forEach((s, i) => {
    try {
      // procesa el script sin ejecutarlo; new Function solo parsea.
      new Function(s);
      ok++;
    } catch (e) {
      errores.push(`  script ${i + 1}: ${e.message}`);
    }
  });
  console.log(`  ${rel}: scripts=${scripts.length} ok=${ok} fail=${errores.length}`);
  return { nombre: rel, ok, fail: errores.length, errores };
}

const candidatos = [
  ...readdirSync(path.join(raiz, 'src'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(raiz, 'src', f)),
];
const demo = path.join(raiz, 'examples', 'formulario_demo.html');
if (existsSync(demo)) candidatos.push(demo);

let totalOk = 0;
let totalFail = 0;
const todos = [];

console.log('ECICEP — Validación de sintaxis de <script> embebidos en HTML');
for (const ruta of candidatos.sort()) {
  const rel = path.relative(raiz, ruta);
  const r = validar(ruta, rel);
  totalOk += r.ok;
  totalFail += r.fail;
  todos.push(r);
}

if (totalFail) {
  console.log('\nFAIL:');
  for (const r of todos) for (const e of r.errores) console.log(`  ${r.nombre}${e}`);
  console.log(`\nVALIDAR HTML — Total: ${totalOk + totalFail} · OK: ${totalOk} · FALLAN: ${totalFail}`);
  process.exit(1);
}
console.log(`\nVALIDAR HTML — Total: ${totalOk} · OK: ${totalOk} · FAIL: ${totalFail}`);