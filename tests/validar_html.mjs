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
 * Además de los <script>, se valida la INTEGRIDAD de los scriptlets GAS
 * `<? … ?>` del template completo: el cierre `?>` no degrada la sintaxis que
 * un `<script>` embebido pierde cuando la corrupción rompe la compilación del
 * template en el servidor (caso real: `<?<? if … ?>` y `%= VAR %` en
 * Sidebar.html rompían el sidebar de INICIO con "Unexpected token" sin que el
 * pipeline lo detectara).
 *   - Balance de aperturas `<?` y cierres `?>` por archivo.
 *   - Prohibido el doble-open `<?<?` / `<?<`.
 *   - Prohibido `%= IDENT %` como texto (debe ser `<?= IDENT ?>`).
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
  validarScriptlets(html, rel, errores);
  validarPuenteAcceso(html, rel, errores);
  ok -= errores.length;
  console.log(`  ${rel}: scripts=${scripts.length} ok=${ok} fail=${errores.length}`);
  return { nombre: rel, ok, fail: errores.length, errores };
}

/** Contrato de Acceso Universal — CapturaWeb.html.
 *  El QR «acceso universal sin permisos» depende de que el template sirva el
 *  token compartido en dos sitios que DEBEN quedar unidos:
 *    1) <body data-acceso="<?= CAPTURA_ACCESO ?>">  (inyección server-side)
 *    2) el bundle lee window.ECICEP_ACCESO en cada RPC.
 *  Si falta el puente `window.ECICEP_ACCESO = document.body.getAttribute('data-acceso')`,
 *  un visitante anónimo (que escanea el QR sin cuenta Google) envía undefined
 *  como `acceso`, el backend lo niega (ACCESO_DENEGADO) y el QR «no funciona»
 *  aunque el operador con sesión sí vea la página. Regresión real detectada en
 *  la fase de diagnóstico del QR (v0.9.26): el bundle leía la variable 4 veces
 *  sin que nadie la asignara. Esta regla impide que reaparezca. */
function validarPuenteAcceso(html, rel, errores) {
  const inyectaTokenEnBody = /<body[^>]*data-acceso\s*=\s*["']<\?=\s*CAPTURA_ACCESO\s*\?>["']/;
  const leeTokenJs = /window\.ECICEP_ACCESO/;
  if (!inyectaTokenEnBody.test(html) || !leeTokenJs.test(html)) return;
  const puente =
    /window\.ECICEP_ACCESO\s*=\s*document\.body\s*&&\s*document\.body\.getAttribute\s*\(\s*["']data-acceso["']\s*\)\s*\|\|\s*["']{2}|window\.ECICEP_ACCESO\s*=\s*document\.body\.getAttribute\s*\(\s*["']data-acceso["']\s*\)\s*\|\|\s*["']{2}/;
  if (!puente.test(html)) {
    errores.push(
      `  contrato acceso universal: body sirve data-acceso pero el bundle nunca asigna ` +
        `window.ECICEP_ACCESO (el QR anónimo quedará denegado). ` +
        `Añade el puente tras <body> antes del primer google.script.run.`,
    );
    return;
  }
  const primerUso = html.search(/window\.ECICEP_ACCESO/);
  const primerPuente = html.search(/window\.ECICEP_ACCESO\s*=\s*document\.body/);
  if (primerPuente === -1 || primerPuente > primerUso) {
    errores.push(
      `  contrato acceso universal: el puente window.ECICEP_ACCESO=… debe ejecutarse ` +
        `antes de la primera lectura (${primerUso}) pero aparece en ${primerPuente}.`,
    );
  }
}

/** Integridad de los scriptlets GAS `<? … ?>` que el chequeo de <script> omite.
 *  Una corrupción aquí rompe la compilación del template en el servidor sin que
 *  el navegador llegue a ver HTML válido (regresión real en Sidebar.html). */
function validarScriptlets(html, rel, errores) {
  const aperturas = (html.match(/<\?/g) || []).length;
  const cierres = (html.match(/\?>/g) || []).length;
  if (aperturas !== cierres) {
    errores.push(`  template: <? = ${aperturas} ¿? = ${cierres} (desbalanceado)`);
  }
  const patrones = [
    [/<\?</, 'doble apertura de scriptlet (<?<?)'],
    [/%=\s*[A-Za-z_]\w*\s*%/, 'scriptlet degradado a texto (%= VAR %) → usar <?= VAR ?>'],
  ];
  for (const [re, desc] of patrones) {
    if (re.test(html)) errores.push(`  template: ${desc}`);
  }
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