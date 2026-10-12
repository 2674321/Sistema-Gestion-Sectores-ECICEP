#!/usr/bin/env node
// ECICEP v255 — Privatizador de la superficie RPC server-side.
//
// Objetivo: reducir la superficie pública invocable por `google.script.run`
// desde ~709 funciones a un puñado explícito (runtime + captura + auth/gateway).
// Toda otra función top-level termina en `_`, que Apps Script excluye de
// `google.script.run`.
//
// Uso:
//   node tools/privatizar_rpc_surface_v255.mjs --dry-run   # escribe RENAMES_PLAN.json
//   node tools/privatizar_rpc_surface_v255.mjs --apply     # aplica el plan
//
// Reglas (prompt v255 §12):
//   1. KEEP LIST = runtime especiales existentes + helper de plantillas +
//      PUBLIC_CAPTURE + PUBLIC_AUTH.
//   2. Detecta colisión `foo_` ya existente → resuelve por overrides o ABORTA.
//   3. Los strings de `newTrigger`/`addItem` se reescriben con el mismo mapa.
//   4. Detecta referencias HTML y ABORTA si `CapturaWeb.html` referencia algo a
//      privatizar (la captura no puede usar el gateway).
//   5. Ante ambigüedad → ABORT_RENAME_AMBIGUOUS.
//   6. Migra `google.script.run` → `ECICEP_run()` en los HTML de operador
//      (NUNCA en CapturaWeb.html).
//
// NO toca IDs, URLs, labels clínicos ni datos.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'src');
const MODE_APPLY = process.argv.includes('--apply');
const MODE_DRY = process.argv.includes('--dry-run') || !MODE_APPLY;

// --- KEEP LIST -------------------------------------------------------------
const RUNTIME_POSIBLES = ['doGet', 'doPost', 'onOpen', 'onEdit', 'onInstall'];
// `include` no es RPC de datos: es el helper de plantillas `<?!= include('x') ?>`
// que Apps Script resuelve por nombre global. Debe seguir siendo global.
const RUNTIME_TEMPLATE = ['include'];
const PUBLIC_CAPTURE = [
  'WebApp_capturarRecibirDurable', 'WebApp_estadoInicial',
  'WebApp_verificarRecepcion', 'api_webappEstado'
];
const PUBLIC_AUTH = ['WebApp_operadorIniciar', 'WebApp_operadorCerrar', 'WebApp_operadorRpc'];

// Overrides para colisiones `foo` / `foo_` ya existentes.
const OVERRIDES = { 'Form_metricas': 'Form_metricasLote_' };

const EXCLUDE = new Set([
  'tools/privatizar_rpc_surface_v255.mjs',
  'RENAMES_PLAN.json',
  'tests/rpc_public_allowlist.json',
  'tests/rpc_public_surface_v255.mjs',
  'tests/seguridad_rpc_allowlist_vNEXT.mjs',
  'tests/seguridad_webapp_capacidades_vNEXT.mjs',
  'tests/public_capture_unauthenticated_v255.mjs',
  'tests/operator_rpc_boundary_v255.mjs',
  'tests/operator_html_gateway_v255.mjs',
  'tests/operator_no_session_no_pii_v255.mjs',
  'tests/operator_session_v255.mjs',
  'tests/private_trigger_menu_handlers_v255.mjs'
]);

const ABORT = [];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = name => new RegExp('\\b' + esc(name) + '\\b', 'g');

// --- 1. Recolectar funciones top-level de src ------------------------------
const srcFiles = readdirSync(SRC)
  .filter(f => /\.(?:js|gs)$/.test(f))
  .map(f => ({ f, p: path.join(SRC, f), s: readFileSync(path.join(SRC, f), 'utf8') }));

const defs = new Set();
for (const { s } of srcFiles)
  for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) defs.add(m[1]);

const keep = new Set();
for (const n of [...RUNTIME_POSIBLES, ...RUNTIME_TEMPLATE, ...PUBLIC_CAPTURE, ...PUBLIC_AUTH])
  if (defs.has(n)) keep.add(n);

// Sólo se privatiza lo que hoy es PÚBLICO (sin guion bajo final). Las internas
// ya privadas conservan su nombre exacto.
const privates = [...defs].filter(n => !keep.has(n) && !n.endsWith('_')).sort();

// --- 2. Colisiones / overrides / duplicados --------------------------------
const renameMap = {};
const colisiones = [];
for (const n of privates) {
  const destino = OVERRIDES[n] || (n + '_');
  if (destino === n) { ABORT.push('RENAME_SIN_CAMBIO:' + n); continue; }
  if (defs.has(destino)) { colisiones.push(n + ' -> ' + destino); ABORT.push('ABORT_RENAME_COLLISION:' + n); }
  renameMap[n] = destino;
}
const destVisto = new Map();
for (const [k, v] of Object.entries(renameMap)) {
  if (destVisto.has(v)) ABORT.push('ABORT_RENAME_DUPLICATE:' + v + ' (' + destVisto.get(v) + ',' + k + ')');
  destVisto.set(v, k);
}

// --- 3. Referencias HTML ---------------------------------------------------
const htmlFiles = readdirSync(SRC).filter(f => /\.html$/.test(f));
const capturaHtmlFile = 'CapturaWeb.html';
const allNames = Object.keys(renameMap);

const capturaRefsFound = [];
const htmlRefs = {};
for (const f of htmlFiles) {
  const s = readFileSync(path.join(SRC, f), 'utf8');
  const hits = allNames.filter(n => wordRe(n).test(s));
  if (hits.length) {
    htmlRefs[f] = hits.length;
    if (f === capturaHtmlFile) capturaRefsFound.push(...hits);
  }
}
if (capturaRefsFound.length) ABORT.push('ABORT_CAPTURA_REFERENCIA:' + [...new Set(capturaRefsFound)].join(','));

const htmlRun = {};
for (const f of htmlFiles) {
  const s = readFileSync(path.join(SRC, f), 'utf8');
  const c = (s.match(/google\.script\.run(?=\s*\.)/g) || []).length;
  if (c) htmlRun[f] = c;
}

const plan = {
  generado: new Date().toISOString(),
  modo: MODE_APPLY ? 'apply' : 'dry-run',
  total_defs: defs.size,
  public_antes: privates.length + keep.size,
  public_despues: keep.size,
  keep: [...keep].sort(),
  privatizadas: privates.length,
  colisiones,
  renameMap,
  htmlRefs,
  htmlRun,
  abort: ABORT
};

// --- 4. Modo dry-run / abort -----------------------------------------------
if (!MODE_APPLY) {
  writeFileSync(path.join(ROOT, 'RENAMES_PLAN.json'), JSON.stringify(plan, null, 2));
  if (ABORT.length) {
    console.error('ABORT_RENAME_AMBIGUOUS:\n  ' + ABORT.join('\n  '));
    process.exit(3);
  }
  console.log('DRY-RUN OK');
  console.log('  defs totales      : ' + defs.size);
  console.log('  keep (públicas)   : ' + keep.size + ' ' + JSON.stringify([...keep].sort()));
  console.log('  privatizadas      : ' + privates.length);
  console.log('  colisiones        : ' + JSON.stringify(colisiones));
  console.log('  HTML google.script.run: ' + JSON.stringify(htmlRun));
  console.log('  plan → RENAMES_PLAN.json');
  process.exit(0);
}

if (ABORT.length) {
  writeFileSync(path.join(ROOT, 'RENAMES_PLAN.json'), JSON.stringify(plan, null, 2));
  console.error('ABORT_RENAME_AMBIGUOUS:\n  ' + ABORT.join('\n  '));
  process.exit(3);
}

// --- 5. Aplicar rename a src + tests + tools -------------------------------
let archivosTocados = 0;
function aplicarArchivo(p, extRe) {
  const rel = path.relative(ROOT, p);
  if (EXCLUDE.has(rel)) return;
  if (!extRe.test(p)) return;
  const antes = readFileSync(p, 'utf8');
  let s = antes;
  for (const [from, to] of Object.entries(renameMap)) s = s.replace(wordRe(from), to);
  if (s !== antes) { writeFileSync(p, s); archivosTocados++; }
}
for (const { p } of srcFiles) aplicarArchivo(p, /\.(?:js|gs)$/);
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else aplicarArchivo(p, /\.(?:mjs|js|gs|json|md)$/);
  }
}
walk(path.join(ROOT, 'tests'));
walk(path.join(ROOT, 'tools'));

// --- 6. HTML operador: google.script.run → ECICEP_run() --------------------
let htmlTocados = 0;
for (const f of htmlFiles) {
  if (f === capturaHtmlFile) continue;
  const p = path.join(SRC, f);
  const antes = readFileSync(p, 'utf8');
  const s = antes.replace(/google\.script\.run(?=\s*\.)/g, 'ECICEP_run()');
  if (s !== antes) { writeFileSync(p, s); htmlTocados++; }
}

writeFileSync(path.join(ROOT, 'RENAMES_PLAN.json'), JSON.stringify(plan, null, 2));
console.log('APPLY OK');
console.log('  archivos tocados (src/tests/tools): ' + archivosTocados);
console.log('  HTML operador google.script.run→ECICEP_run(): ' + htmlTocados);
console.log('  privatizadas: ' + privates.length);
