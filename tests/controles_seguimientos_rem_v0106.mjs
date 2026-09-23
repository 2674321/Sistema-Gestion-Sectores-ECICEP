#!/usr/bin/env node
/**
 * Batería CONTROLES/SEGUIMIENTOS + REM (v0.10.6) — regresiones UI.
 *
 * T1-T6 — Controles por persona:
 *   - el backend sigue entregando ultimoControl/ultimoSeguimiento/proximo/estado;
 *   - Controles.html tiene el selector CONTROL/SEGUIMIENTO, default CONTROL;
 *   - setTipoVista cambia SOLO la presentación: cero RPC, no toca filtros
 *     (sector/estados/termino/filas/total/sel) y re-pinta desde lo cargado;
 *   - la vista CONTROL usa ultimoControl, la vista SEGUIMIENTO usa
 *     ultimoSeguimiento; ambas usan proximo como "Próxima atención";
 *   - registrar no resetea la vista (el único `CTRL.tipo =` está en setTipoVista).
 *
 * T7-T9 — Vista de trabajo REM:
 *   - al abrir NO hay loader (ni class="prog" ni "Calculando el informe…");
 *   - consultar(btn) SÍ mantiene el loader antes de ejecutar api_remVista;
 *   - init() no auto-consulta.
 *
 * Uso: node tests/controles_seguimientos_rem_v0106.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

let PASS = 0, FAIL = 0;
function t(nombre, fn) {
  try { fn(); PASS += 1; console.log('[PASS] ' + nombre); }
  catch (e) { FAIL += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function contiene(hay, aguja, msg) { if ((hay || '').indexOf(aguja) === -1) throw new Error((msg || 'no contiene: ') + aguja); }
function noContiene(hay, aguja, msg) { if ((hay || '').indexOf(aguja) !== -1) throw new Error((msg || 'no debe contener: ') + aguja); }

function read(p) { return readFileSync(path.join(raiz, 'src', p), 'utf8'); }

function backend() {
  const c = vm.createContext({ console });
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((f) => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(readFileSync(path.join(raiz, 'src', f), 'utf8'), c, { filename: f });
  }
  return c;
}

/* Cuerpo de UNA función del último bloque <script> inline de un HTML. */
function cuerpoFn(html, fn) {
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n');
  const ini = script.indexOf('function ' + fn + '(');
  if (ini === -1) throw new Error('función no encontrada: ' + fn);
  const fin = script.indexOf('\n}', ini);
  if (fin === -1) throw new Error('cierre no encontrado para: ' + fn);
  return script.slice(ini, fin + 2);
}
function cuerpoFnNombre(script, fn) {
  const ini = script.indexOf('function ' + fn + '(');
  if (ini === -1) throw new Error('función no encontrada: ' + fn);
  const fin = script.indexOf('\n}', ini);
  if (fin === -1) throw new Error('cierre no encontrado para: ' + fn);
  return script.slice(ini, fin + 2);
}
function evalFn(src, extra) {
  const sandbox = Object.assign({}, extra || {});
  const c = vm.createContext(sandbox);
  vm.runInContext(src, c, { filename: 'fn-inline.js' });
  return c;
}

// ── CONTROLES / SEGUIMIENTOS ──
console.log('CONTROLES/SEGUIMIENTOS — T1 a T6.');

t('T1 el backend sigue entregando ultimoControl/ultimoSeguimiento/proximo/estado', () => {
  const c = backend();
  const pac = [{
    ID_INTERNO: 'P1', NOMBRE: 'Ana', RUT: '11.111.111-1', SECTOR: 'NARANJO',
    ESTRATIFICACION: 'VERTICE A', ULTIMO_CONTROL: '2026-09-01',
    ULTIMO_SEGUIMIENTO: '2026-09-20', PROXIMO_CONTROL: '2026-10-01',
    FECHA_NACIMIENTO: '1990-05-05'
  }];
  const r = c.Control_filasPanel(pac, null, '2026-09-22');
  A(r && r.filas && r.filas.length === 1, 'una fila para el paciente');
  const f = r.filas[0];
  A(f.ultimoControl === '2026-09-01', 'ultimoControl presente: ' + f.ultimoControl);
  A(f.ultimoSeguimiento === '2026-09-20', 'ultimoSeguimiento presente: ' + f.ultimoSeguimiento);
  A(f.proximo === '2026-10-01', 'proximo presente: ' + f.proximo);
  A(['VENCIDO', 'POR_VENCER', 'SIN_FECHA', 'VIGENTE'].indexOf(f.estado) !== -1, 'estado calculado: ' + f.estado);
});

const ctrHtml = read('Controles.html');
const ctrScript = [...ctrHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

t('T2 el selector CONTROL/SEGUIMIENTO existe y el default es CONTROL', () => {
  contiene(ctrHtml, 'data-tipo="CONTROL"', 'botón Control');
  contiene(ctrHtml, 'data-tipo="SEGUIMIENTO"', 'botón Seguimiento');
  contiene(ctrHtml, 'setTipoVista', 'handler setTipoVista');
  contiene(ctrHtml, 'id="tituloPanel"', 'título neutro');
  contiene(ctrHtml, 'Controles y seguimientos por persona', 'texto del título');
  if (!/tipo:\s*'CONTROL'/.test(ctrScript)) throw new Error('default CTRL.tipo = CONTROL ausente');
});

t('T3/T5 setTipoVista no hace RPC ni toca filtros/búsqueda/paginación/selección', () => {
  const fn = cuerpoFn(ctrHtml, 'setTipoVista');
  ['api_controlPanel', 'consultar', 'ECICEP_lectura'].forEach((x) => noContiene(fn, x, 'no debe invocar ' + x));
  ['CTRL.sector', 'CTRL.termino', 'CTRL.estados', 'CTRL.todos', 'CTRL.filas', 'CTRL.total',
   'CTRL.sel', 'CTRL.inicio', 'CTRL.limite'].forEach((x) => noContiene(fn, x, 'no debe tocar ' + x));
  contiene(fn, 'pintar', 're-pinta desde las filas ya cargadas');
});

t('T6 registrar no resetea la vista: único CTRL.tipo = está en setTipoVista', () => {
  const asignaciones = ctrScript.match(/CTRL\.tipo\s*=\s*tipo/g) || [];
  if (asignaciones.length !== 1) {
    throw new Error('CTRL.tipo = tipo aparece ' + asignaciones.length + ' veces (esperado 1: solo setTipoVista)');
  }
  const registrar = cuerpoFn(ctrHtml, 'registrar');
  noContiene(registrar, 'CTRL.tipo', 'registrar no debe resetear la vista');
});

t('T4 la vista CONTROL usa ultimoControl, SEGUIMIENTO usa ultimoSeguimiento, ambas usan proximo', () => {
  const ult = cuerpoFn(ctrHtml, 'ultimoSegunVista');
  const etq = cuerpoFn(ctrHtml, 'etiquetaUltimo');
  const fixture = { ultimoControl: '2026-09-01', ultimoSeguimiento: '2026-09-20', proximo: '2026-10-01' };

  const sandbox = { CTRL: { tipo: 'CONTROL' } };
  const s = vm.createContext(sandbox);
  vm.runInContext(ult + '\n' + etq, s, { filename: 'fn-inline.js' });
  if (s.ultimoSegunVista(fixture) !== '2026-09-01') throw new Error('CONTROL debe mostrar ultimoControl');
  if (s.etiquetaUltimo() !== 'Últ. control') throw new Error('etiqueta CONTROL');
  s.CTRL.tipo = 'SEGUIMIENTO';
  if (s.ultimoSegunVista(fixture) !== '2026-09-20') throw new Error('SEGUIMIENTO debe mostrar ultimoSeguimiento');
  if (s.etiquetaUltimo() !== 'Últ. seguimiento') throw new Error('etiqueta SEGUIMIENTO');

  // La tabla usa _fmtFecha(f.proximo) como "Próxima atención" en AMBAS vistas
  // y el encabezado de la columna anterior es dinámico (etiquetaUltimo()).
  contiene(ctrScript, 'Próxima atención</th>', 'header compartido Próxima atención');
  contiene(ctrScript, '+ etiquetaUlt +', 'columna de último registro dinámica');
  contiene(ctrScript, '_fmtFecha(f.proximo)', 'columna próxima desde f.proximo');
  noContiene(cuerpoFn(ctrHtml, 'pintar'), 'Próx. control', 'ya no se dice "Próx. control"');
});

t('T4b textos neutros: sin toda la agenda presentada como "control"', () => {
  contiene(ctrHtml, 'El panel izquierdo muestra automáticamente las atenciones pendientes.', 'placeholder neutro');
  contiene(ctrHtml, 'Lista automática de personas con atención vencida, próxima o sin próxima atención agendada.', 'pista por defecto neutra');
  contiene(ctrHtml, 'Próxima atención', 'detalle/cols usan Próxima atención');
});

// ── REM ──
console.log('REM — T7 a T9.');

const remHtml = read('RemVista.html');
const remScript = [...remHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

t('T7 al abrir la ventana NO hay loader ni "Calculando el informe…"', () => {
  const pre = remHtml.slice(0, remHtml.indexOf('<script'));
  noContiene(pre, 'class="prog"', 'sin bareader .prog al abrir');
  noContiene(pre, 'Calculando el informe', 'sin texto Calculando al abrir');
  contiene(pre, 'Selecciona los filtros y pulsa', 'placeholder neutro presente');
});

t('T8 consultar(btn) SÍ usa loader antes de ejecutar api_remVista', () => {
  const cs = remScript.indexOf('function consultar(');
  const fn = cuerpoFnNombre(remScript, 'consultar');
  contiene(fn, 'class="prog"', 'loader en consultar');
  contiene(fn, 'Calculando el informe', 'texto del loader en consultar');
  if (fn.indexOf('Calculando el informe') > fn.indexOf('api_remVista')) {
    throw new Error('el loader debe aparecer ANTES de api_remVista');
  }
});

t('T9 init() no auto-consulta (espera al botón Consultar)', () => {
  const i0 = remScript.indexOf('(function init() {');
  if (i0 === -1) throw new Error('init no encontrado');
  const i1 = remScript.indexOf('})();', i0);
  if (i1 === -1) throw new Error('fin de init no encontrado');
  const initBody = remScript.slice(i0, i1 + 4);
  noContiene(initBody, 'consultar(', 'init no llama consultar');
  noContiene(initBody, 'ECICEP_lectura(', 'init no dispara RPC');
  contiene(remHtml, 'onclick="consultar(this)"', 'consultar sigue ligado al botón Consultar');
});

// ── Resumen ──
console.log('');
console.log('Controles/Seguimientos + REM v0.10.6 — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);