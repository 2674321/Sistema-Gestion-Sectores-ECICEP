#!/usr/bin/env node
/** vNEXT — §14 SEMÁNTICA TRANSACCIONAL (fallo en persistencia de EVENTOS):
 *  rollback de PACIENTES recién anexados → sin huérfanos; el reintento
 *  converge exactamente (1 paciente + 1 evento INGRESO + INGRESADO), nunca
 *  un paciente sin su evento.
 *
 * Uso: node tests/transaccion_eventos_crash_vNEXT.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let passed = 0;
function test(name, run) { run(); passed++; console.log('[PASS] ' + name); }

/** RUT chileno con DV válido (evita errores de validación no buscados). */
function rutOk(cuerpo) {
  const s = String(cuerpo);
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += Number(s[i]) * (2 + ((s.length - 1 - i) % 6));
  const r = 11 - (sum % 11);
  const dv = r === 11 ? '0' : (r === 10 ? 'K' : String(r));
  return s + '-' + dv;
}

// --- Harness (idéntico al contrato sintético de ficha_ingresos_v0102) ---
function hojaFake(estado) {
  const vals = estado;
  const set = (r, c, v) => {
    while (vals.length < r) vals.push([]);
    const row = vals[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  };
  const mk = (r, c, nr, nc) => {
    const grid = Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => (vals[r - 1 + i] || [])[c - 1 + j] ?? ''));
    return {
      getValues: () => grid.map((g) => g.slice()),
      getValue: () => (grid[r - 1] && grid[r - 1][c - 1] !== undefined) ? grid[r - 1][c - 1] : '',
      getNumRows: () => nr,
      getNumColumns: () => nc,
      setValues: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))); },
      setValue: (v) => { set(r, c, v); },
      setFormulas: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, String(v || '').replace(/^=/, '=F:')))); },
      setNumberFormat: () => {},
      setFontWeight: () => {}, setBackground: () => {}, setFontColor: () => {},
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); }
    };
  };
  const colIdx = (a1) => { let n = 0; for (const ch of a1) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  return {
    get val() { return vals; },
    getLastRow: () => vals.length,
    getLastColumn: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    deleteRows: (inicio, cantidad) => { vals.splice(inicio - 1, cantidad); },
    deleteRow: (n) => { vals.splice(n - 1, 1); },
    getRange: (a, b, c, d) => {
      if (typeof a === 'number') return mk(a, b, c ?? 1, d ?? 1);
      const m = /^([A-Z]+)(\d+)$/.exec(String(a));
      return mk(Number(m[2]), colIdx(m[1]), 1, 1);
    },
    getDataRange: () => mk(1, 1, vals.length || 1, Math.max(1, vals.reduce((m, r) => Math.max(m, r.length), 0)))
  };
}

function libro() {
  const ctx = vm.createContext({ console: console });
  const orden = ['src/00_Config.js', 'src/26_Captura.js', 'src/29_ActualizacionCaptura.js',
    'src/31_Ficha.js', 'src/27_Actualizacion.js', 'src/28_IA.js'];
  const resto = readdirSync(new URL('src/', root)).filter((f) => /\.(js|gs)$/.test(f)).sort();
  const restoFiltrado = resto.map((f) => 'src/' + f).filter((a) => orden.indexOf(a) === -1);
  for (const a of orden.concat(restoFiltrado)) {
    vm.runInContext(read(a), ctx, { filename: a });
  }
  ctx.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
  ctx.Utilities = { getUuid: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', formatDate: () => '' };
  ctx.WebApp_autorizarBuscador = (t) => t === 'tok';
  ctx.HVis_formatearIngresos = () => ({ ok: true, migrado: false });
  ctx.Log_info = () => {}; ctx.Log_error = () => {}; ctx.Log_warning = () => {}; ctx.Log_flush = () => {};
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheetByName: () => null, getSheets: () => [] }),
    openById: () => null,
    BorderStyle: { SOLID_THICK: 1, SOLID: 2, DOTTED: 3, DASHED: 4, DOUBLE: 5 },
    WrapStrategy: { WRAP: 1, OVERFLOW: 2, CLIP: 3, CLAMP: 4 },
    newDataValidation: () => ({ build: () => ({}) }),
    newConditionalFormatRule: () => ({ build: () => ({}) })
  };
  const expr = (e) => vm.runInContext(e, ctx);
  const campos = (v) => expr(v);
  const hoja = (nombre, headers) => { const f = hojaFake([headers.slice()]); ctx.hojas[nombre] = f; return f; };
  ctx.hojas = {};

  const PAC = campos('MODELO_PACIENTE.map(function(c){return c.campo;})');
  const pHeaders = new Array(3).fill().map(() => []);
  pHeaders[2] = PAC;
  ctx.hojas['PACIENTES'] = hojaFake(pHeaders);

  const hojaVisual = (nombre, headers) => {
    const vals = new Array(3).fill().map(() => []);
    vals[2] = headers.slice();
    const f = hojaFake(vals);
    ctx.hojas[nombre] = f;
    return f;
  };

  hoja('EVENTOS', campos('COLUMNAS_EVENTOS'));
  hojaVisual('INGRESO_NARANJO', campos('INGRESO_COLUMNAS'));
  hojaVisual('INGRESO_AMARILLO', campos('INGRESO_COLUMNAS'));
  hojaVisual('INGRESO_VERDE', campos('INGRESO_COLUMNAS'));
  hojaVisual('SECTOR_NARANJO', campos('COLUMNAS_SECTOR_VISTA'));
  hojaVisual('SECTOR_AMARILLO', campos('COLUMNAS_SECTOR_VISTA'));
  hojaVisual('SECTOR_VERDE', campos('COLUMNAS_SECTOR_VISTA'));
  hoja('STAGING_IMPORT', ['ID_PROVISIONAL', 'ARCHIVO_ORIGEN', 'HOJA_ORIGEN', 'FILA_ORIGEN', 'SECTOR_ORIGEN', 'ESTADO_VALIDACION', 'ERRORES', 'WARNINGS', 'IDENTIFICACION', 'VALORES_ORIGINALES', 'NORMALIZADO', 'FUENTE']);
  hoja('CONFLICTOS', ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE', 'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR']);
  hoja('PROFESIONALES', campos('COLUMNAS_PROFESIONALES'));
  hoja('RESPONSABLES', campos('COLUMNAS_RESPONSABLES'));
  const cfgF = hojaFake([['CLAVE', 'VALOR', 'DESCRIPCION']]);
  ctx.hojas['CONFIG'] = cfgF;

  ctx.Modelo_ss = () => ({ getSheetByName: (n) => ctx.hojas[n] || null });

  // La mayoría de regresiones históricas inspeccionan el estado transitorio
  // INGRESADO. La limpieza productiva se habilita explícitamente si se quiere.
  ctx.Ingresos_eliminarOrigenConfirmado_ = () => ({ eliminadas: 0 });

  return ctx;
}

// Fixture: fila válida de INGRESO_NARANJO (contrato INGRESO_COLUMNAS).
function filaIngresoValida(opc) {
  opc = opc || {};
  return [opc.nombre || 'ANA PEREZ', opc.rut || rutOk(12345678), 'F', '1980-05-10', opc.tel || '900000000',
    opc.fecha || '2026-01-15', opc.estrat || 'G2', '', 'observación de ingreso',
    opc.estado || '', '', opc.salud || 'NO'];
}

// ---------------------------------------------------------------------------
// T1 — control: el camino normal converge (1 paciente + 1 evento).
// ---------------------------------------------------------------------------
test('T1 control: ingreso válido → 1 PACIENTE + 1 EVENTO + INGRESADO', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resumen.nuevos, 1);
  assert.equal(r.resumen.eventosCreados, 1);
  assert.equal(c.Modelo_leerPacientes().length, 1);
  assert.equal(c.Modelo_leerEventos().length, 1);
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
});

// ---------------------------------------------------------------------------
// T2 — §14: fallo en Modelo_agregarEventos_ → rollback, sin huérfanos.
// ---------------------------------------------------------------------------
test('T2 crash EVENTOS → rollback PACIENTES sin huérfano + retry converge', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();

  const realAgregar = c.Modelo_agregarEventos_;
  c.Modelo_agregarEventos_ = function () { throw new Error('EVENTOS_IO_FALLO_TEST'); };

  let r;
  try {
    r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  } catch (e) {
    r = { ok: false, motivo: String((e && e.message) || e) };
  }
  c.Modelo_agregarEventos_ = realAgregar;

  assert.equal(r.ok, false, 'el fallo de persistencia se reporta');
  assert.match(r.motivo, /EVENTOS_IO_FALLO_TEST/, 'motivo del crash explícito');

  // SIN huérfanos: el paciente recién anexado fue retirado.
  assert.equal(c.hojas['PACIENTES'].val.length, 3, 'rollback: fila anexada retirada (quedan 3 cabeceras)');
  assert.equal(c.Modelo_leerPacientes().length, 0, '0 pacientes tras rollback');
  assert.equal(c.hojas['EVENTOS'].val.length, 1, 'ningún evento fantasma');
  assert.equal(c.hojas['SECTOR_NARANJO'].val.length, 3, 'sin perfil sectorial fantasma');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], '', 'no se marca INGRESADO sin persitir');

  // RETRY: converge exactamente (idempotencia de la fila física, sin duplicar).
  const r2 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(c.Modelo_leerPacientes().length, 1, '1 paciente tras retry');
  assert.equal(c.Modelo_leerEventos().length, 1, '1 evento INGRESO tras retry');
  assert.equal(c.Modelo_leerPacientes()[0].RUT, rutOk(12345678), 'el paciente es el esperado');
  assert.equal(c.Modelo_leerEventos()[0].ID_INTERNO, c.Modelo_leerPacientes()[0].ID_INTERNO, 'evento ligado al paciente');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO', 'retry completa el flujo');
});

console.log('Transacción eventos crash vNEXT: PASS');