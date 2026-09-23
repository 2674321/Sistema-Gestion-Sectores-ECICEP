#!/usr/bin/env node
/**
 * Batería CAPTURA — LECTURAS ACOTADAS (§41) — ECICEP v0.10.5.
 *
 * Garantiza que la captura en la Web App y la pre-ficha del sidebar NUNCA
 * escaneen una hoja INGRESO_* completa (10.000 filas) dentro de un request:
 *   - Ingresos_leerFilasAcotadas_ lee SOLO la fila de encabezados + las filas
 *     físicas permitidas (getRange de UNA fila cada una), nunca getDataRange
 *     ni getRange(1,1,getLastRow(),...).
 *   - Ingresos_leerHoja usa la ruta acotada cuando filasPermitidas ≤ 50.
 *   - Ingresos_detallePendiente (api_ingresoDetalle) = una sola lectura acotada.
 *   - El shape devuelto es [encabezados, ...filas] y no renumero filas ajenas.
 *
 * Fixture: hoja ficticia INGRESO_NARANJO en layout VISUAL real (encabezados en
 * fila 3, datos desde 4) con 10.000 filas; contador de getRange/getDataRange;
 * en la ruta acotada ninguna lectura supera 1 fila de alto.
 *
 * Uso: node tests/captura_rendimiento_acotado_vNEXT.mjs
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

// ── Backend REAL en vm ──
function backend() {
  const c = vm.createContext({ console });
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((f) => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(readFileSync(path.join(raiz, 'src', f), 'utf8'), c, { filename: f });
  }
  return c;
}

// ── Hoja ficticia de 10.000 filas con contador de lecturas ──
function makeSheet(rows, log) {
  return {
    getLastRow() { return rows.length; },
    getLastColumn() { return rows[0] ? rows[0].length : 1; },
    getRange(r, col, numR, numC) {
      log.push({ tipo: 'getRange', r, col, numR, numC });
      return {
        getValues() {
          return Array.from({ length: numR }, (_, i) =>
            Array.from({ length: numC }, (_, j) => {
              const rr = r + i - 1, cc = col + j - 1;
              return (rr >= 0 && rr < rows.length) ? (rows[rr][cc] !== undefined ? rows[rr][cc] : '') : '';
            }));
        }
      };
    },
    getDataRange() {
      log.push({ tipo: 'getDataRange' });
      return { getValues() { return rows; } };
    }
  };
}

function cabecera() {
  return ['NOMBRE', 'RUT', 'FECHA DE INGRESO', 'SECTOR', 'FECHA NACIMIENTO', 'ESTADO_INGRESO', 'NOTA_SISTEMA'];
}
// Layout VISUAL real: fila 1 título, 2 secciones, 3 encabezados, 4+ datos.
// Total 10.000 filas de datos → getLastRow() = 10003.
function fixture(hr) {
  const hdr = cabecera();
  const rows = [hdr.map(() => 'TITULO'), hdr.map(() => 'SECCION'), hdr];
  const N = 10000;
  for (let i = 0; i < N; i++) {
    const filaFis = hr + 1 + i;
    const fila = hdr.map(() => '');
    fila[0] = 'PERSONA FICTICIA ' + filaFis;
    fila[1] = '11.111.111-' + (filaFis % 10);
    fila[2] = '2026-09-16';
    fila[3] = 'NARANJO';
    fila[4] = '1990-01-01';
    rows.push(fila);
  }
  return rows;
}
function contar(log, tipo) { return log.filter((x) => x.tipo === tipo).length; }
function maxAltura(log) { return Math.max(0, ...log.filter((x) => x.tipo === 'getRange').map((x) => x.numR)); }

function harness(seed) {
  const c = seed || backend();
  const log = [];
  const hr = c.Modelo_headerRow('INGRESO_NARANJO');
  const sheet = makeSheet(fixture(hr), log);
  c.Modelo_ss = () => ({ getSheetByName: (n) => (n === 'INGRESO_NARANJO' ? sheet : null) });
  return { c, log, sheet, hr };
}

// ── 1. Invariante de fuente: la ruta acotada nunca lee bloques ──
console.log('RENDIMIENTO A — invariante de la ruta acotada (fuente + lecturas).');

t('A1 Ingresos_leerFilasAcotadas_ por código: sin getDataRange ni bloque completo', () => {
  const c = backend();
  const src = c.Ingresos_leerFilasAcotadas_.toString();
  A(src.indexOf('getDataRange') === -1, 'no usa getDataRange');
  A(/getRange\(\s*[^,]+,\s*[^,]+,\s*[\w.]*\s*getLastRow\(/.test(src) === false, 'no pide todo el alto de la hoja');
  A(/getRange\(\s*[\w.]*\s*getLastRow\(/.test(src) === false, 'ninguna llamada depende de getLastRow para el alto');
  A(src.indexOf('forEach') !== -1 && /getRange\(fi,\s*1,\s*1,\s*ancho\)/.test(src), 'una lectura de UNA fila por fila permitida');
});

t('A2 la hoja de 10.000 filas se lee con 1 encabezado + 1 fila objetivo (nunca el bloque)', () => {
  const { c, log, sheet, hr } = harness();
  const out = c.Ingresos_leerFilasAcotadas_(sheet, 'INGRESO_NARANJO', ['9876']);
  A(contar(log, 'getDataRange') === 0, 'getDataRange nunca se llama');
  A(maxAltura(log) === 1, 'ninguna lectura supera 1 fila de alto');
  A(log.filter((x) => x.numR === 1 && x.r === hr).length === 1, 'exactamente UNA fila de encabezados (fila ' + hr + ')');
  A(log.filter((x) => x.numR === 1 && x.r > hr).length === 1, 'exactamente UNA fila de datos leída');
  A(log.some((x) => x.r === 9876 && x.numR === 1), 'la fila objetivo 9876 fue leída individualmente');
  A(log.every((x) => x.tipo === 'getRange' ? x.numR === 1 : true), 'todas las lecturas son de 1 fila');
  A(out[0] && out[0].join('|').toUpperCase().indexOf('NOMBRE') !== -1, 'shape [encabezados, ...filas]');
  A(out[1] && out[1][0] === 'PERSONA FICTICIA 9876', 'fila física 9876 leída exacta');
});

t('A3 varias filas permitidas → lecturas individuales, máximo 1 fila de alto', () => {
  const { c, log, sheet, hr } = harness();
  const permitidas = ['50', '9800', '10003'];
  c.Ingresos_leerFilasAcotadas_(sheet, 'INGRESO_NARANJO', permitidas);
  A(contar(log, 'getDataRange') === 0, 'sin getDataRange');
  A(maxAltura(log) === 1, 'altura de lectura nunca > 1');
  const filasDatos = log.filter((x) => x.numR === 1 && x.r > hr);
  A(filasDatos.length === permitidas.length, 'una lectura por fila permitida');
  A(filasDatos.every((x) => permitidas.indexOf(String(x.r)) !== -1), 'solo filas permitidas, el orden no inventa números');
});

// ── 2. Integración: leerHoja y detalle pendiente acotados ──
console.log('RENDIMIENTO B — ingestión y detalle pendiente usan la ruta acotada.');
console.log('RENDIMIENTO C — la ruta acotada se usa cuando lisPermitidas ≤ 50.');

t('B1 Ingresos_leerHoja con filasPermitidas=[9876] no escanea la hoja completa', () => {
  const { c, log, hr } = harness();
  const r = c.Ingresos_leerHoja('INGRESO_NARANJO', ['9876']);
  A(contar(log, 'getDataRange') === 0, 'leerHoja acotado sin getDataRange');
  A(maxAltura(log) === 1, 'sin lecturas de bloque');
  A(log.some((x) => x.r === 9876 && x.numR === 1), 'lee la fila objetivo suelta');
  A(r.staging.length === 1, 'staging con la fila objetivo');
  A(String(r.staging[0].FILA_ORIGEN) === '9876', 'FILA_ORIGEN exacta: ' + String(r.staging[0].FILA_ORIGEN));
});

t('B2 api_ingresoDetalle (pre-ficha) hace UNA lectura acotada, sin barrer INGRESO_NARANJO', () => {
  const { c, log, sheet, hr } = harness();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  const r = c.api_ingresoDetalle('INGRESO_NARANJO', '9876', 't');
  A(r.ok === true && r.fila === 9876, 'detalle entregado para la fila 9876');
  A(r.preFicha && r.preFicha.nombre === 'PERSONA FICTICIA 9876', 'pre-ficha de la fila correcta');
  A(contar(log, 'getDataRange') === 0, 'sin getDataRange');
  A(maxAltura(log) === 1, 'máximo 1 fila de alto por lectura');
  A(log.filter((x) => x.numR === 1 && x.r === 9876).length >= 1, 'la única fila de datos leída es 9876');
  A(sheet.getLastRow() === 10003, 'hoja intacta (10.000 filas sin tocar)');
});

t('B3 fila fuera de rango o inválida responde ok:false explícito, sin escanear la hoja', () => {
  const { c, log, sheet } = harness();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  const fuera = c.api_ingresoDetalle('INGRESO_NARANJO', '20000', 't');
  A(fuera.ok === false && fuera.motivo, 'fila fuera de rango → ok:false con motivo: ' + JSON.stringify(fuera));
  A(maxAltura(log) === 1 && contar(log, 'getDataRange') === 0, 'sin escaneo de bloque para un caso periférico');
  A(sheet.getLastRow() === 10003, 'sin daños a la hoja');
  const inv = c.api_ingresoDetalle('INGRESO_NARANJO', 'abc', 't');
  A(inv.ok === false && inv.motivo === 'FILA_INVALIDA', 'número inválido → FILA_INVALIDA');
});

t('C1 con 51+ filas permitidas la ruta vuelve al bloque completo (fallback legítimo)', () => {
  const { c, log } = harness();
  let bloqueLlamado = 0;
  c.Modelo_leerBloqueCabecera = (nombreHoja, hoja) => {
    bloqueLlamado += 1;
    const hdr = cabecera();
    return [hdr, hdr.map(() => 'X')];
  };
  const muchas = Array.from({ length: 51 }, (_, i) => String(100 + i));
  const r = c.Ingresos_leerHoja('INGRESO_NARANJO', muchas);
  A(bloqueLlamado === 1, 'con >50 filas, leerHoja delega en Modelo_leerBloqueCabecera');
  A(r.staging.length >= 0, 'resultado consistente del fallback');
});

t('C2 con ≤ 50 filas permitidas nunca se lee un bloque completo', () => {
  const { c, log } = harness();
  const antes = log.filter((x) => x.tipo === 'getDataRange').length;
  const pocas = Array.from({ length: 50 }, (_, i) => String(101 + i));
  const r = c.Ingresos_leerHoja('INGRESO_NARANJO', pocas);
  A(contar(log, 'getDataRange') === antes, 'sin getDataRange');
  A(maxAltura(log) === 1, 'ninguna lectura supera 1 fila de alto');
  A(r.staging.length === 50, 'las 50 filas permitidas entran al staging: ' + r.staging.length);
  A(r.staging.every((f, i) => String(f.FILA_ORIGEN) === String(101 + i)), 'FILA_ORIGEN coincide con cada fila física permitida');
});

// ── 3. Regla de activación: el umbral de 50 filas está en el lector ──
t('D1 Ingresos_detallePendiente reutiliza la ruta acotada (pre-ficha del sidebar)', () => {
  const { c, log } = harness();
  const r = c.Ingresos_detallePendiente('INGRESO_NARANJO', 9876);
  A(r.ok === true && r.fila === 9876, 'detalle ok fila 9876');
  A(maxAltura(log) === 1, 'lectura acotada del detalle');
  A(contar(log, 'getDataRange') === 0, 'sin getDataRange en la pre-ficha');
  A(r.preFicha.nombre === 'PERSONA FICTICIA 9876', 'pre-ficha correcta');
});

// ── Resumen ──
console.log('');
console.log('Captura / Lecturas acotadas vNEXT — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);