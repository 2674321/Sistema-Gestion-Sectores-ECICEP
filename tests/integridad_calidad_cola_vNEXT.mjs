#!/usr/bin/env node
// vNEXT — DEC-104: la cola de CONFLICTOS y la normalización de RUT no dependen
// de la posición del registro dentro del arreglo leído.
// Regresiones concretas:
//   - Calidad_sincronizarCola_ leía FUENTE_B (base 1) en vez de FUENTE_A,
//     dejando filasCalidad vacío: la cola se duplicaba y el auto-resolve era
//     código muerto.
//   - Calidad_normalizarFormatoRuts_ escribía el RUT en `2 + ix`, es decir en
//     el banner y en la fila de encabezados de PACIENTES.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

function hojaFake(vals) {
  const set = (r, c, v) => {
    while (vals.length < r) vals.push([]);
    const row = vals[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  };
  const mk = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => (vals[r - 1 + i] || [])[c - 1 + j] ?? '')),
    setValues: a => a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))),
    setValue: v => set(r, c, v),
    setNumberFormat: () => {}, setFontWeight: () => {}, setBackground: () => {},
    setFontColor: () => {}, clearContent: () => {},
    getNumRows: () => nr, getNumColumns: () => nc,
    getNote: () => '', setNote: () => {}
  });
  return {
    get val() { return vals; },
    getName: () => vals.__nombre || '',
    getLastRow: () => vals.length,
    getLastColumn: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    getRange: (a, b, c, d) => {
      if (typeof a === 'number') return mk(a, b, c ?? 1, d ?? 1);
      const m = /^([A-Z]+)(\d+)$/.exec(String(a));
      // Cuerpo de una función por conteo de llaves (no por el siguiente \nfunction).
function cuerpoDe(archivo, nombre) {
  const src = read(archivo);
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return '';
  let nivel = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') nivel++;
    else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
  }
  return '';
}

let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
      return mk(Number(m[2]), n, 1, 1);
    },
    getDataRange: () => mk(1, 1, vals.length || 1, Math.max(1, vals.reduce((m, r) => Math.max(m, r.length), 0)))
  };
}

function ctx() {
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} }, JSON, Date, Math });
  for (const f of readdirSync(new URL('src/', root)).filter(x => /\.(js|gs)$/.test(x)).sort())
    vm.runInContext(read('src/' + f), c, { filename: f });
  c.Log_info = () => {}; c.Log_error = () => {}; c.Log_warning = () => {}; c.Log_flush = () => {};
  c.Session = { getActiveUser: () => ({ getEmail: () => 'tester@ecicep.cl' }) };
  c.HVis_formatearIngresos = () => ({ ok: true, migrado: false });
  c.hojas = {};
  const E = e => vm.runInContext(e, c);
  const headersConf = ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE',
    'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR'];
  const conf = hojaFake([headersConf.slice()]); conf.__nombre = 'CONFLICTOS';
  c.hojas['CONFLICTOS'] = conf;
  const PAC = E('MODELO_PACIENTE.map(function(x){return x.campo;})');
  const pac = hojaFake([[], [], PAC.slice()]); pac.__nombre = 'PACIENTES';
  c.hojas['PACIENTES'] = pac;
  c.Modelo_ss = () => ({ getSheetByName: n => c.hojas[n] || null, getSheets: () => Object.values(c.hojas) });
  return { c, E, conf, pac, headersConf };
}

// Cuerpo de una función por conteo de llaves (no por el siguiente \nfunction).
function cuerpoDe(archivo, nombre) {
  const src = read(archivo);
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return '';
  let nivel = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') nivel++;
    else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
  }
  return '';
}

let n = 0;
function t(nombre, fn) {
  n++;
  try { fn(); console.log('[PASS] T' + n + ' ' + nombre); }
  catch (e) {
    console.log('[FAIL] T' + n + ' ' + nombre);
    console.log('   CAUSA: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    process.exitCode = 1;
  }
}

const COL = { FECHA: 0, TIPO: 1, ID: 2, RUT: 3, NOMBRE: 4, DETALLE: 5, FUE_A: 6, FUE_B: 7, ESTADO: 8, POR: 9 };

// ─────────────────────────────────────────────────────────────────────────────
// T1 — índices derivados del encabezado real, no constantes fijas
// ─────────────────────────────────────────────────────────────────────────────
t('T1 Calidad_sincronizarCola_ deriva los índices del encabezado', () => {
  const cuerpo = cuerpoDe('src/18_Calidad.js', 'Calidad_sincronizarCola_');
  assert.ok(cuerpo, 'debe existir Calidad_sincronizarCola_');
  assert.match(cuerpo, /enc\.indexOf\(/, 'los índices se derivan del encabezado leído');
  assert.match(cuerpo, /'FUENTE_A'/, 'FUENTE_A se resuelve por nombre');
  assert.match(cuerpo, /'ESTADO_REVISION'/, 'ESTADO_REVISION se resuelve por nombre');
  assert.match(cuerpo, /'RESUELTO_POR'/, 'RESUELTO_POR se resuelve por nombre');
  assert.doesNotMatch(cuerpo, /valores\[i\]\[7\]/,
    'no puede leerse una columna por índice fijo (7 = FUENTE_B)');
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — una fila FUENTE_A=CALIDAD se reconoce y no se duplica
// ─────────────────────────────────────────────────────────────────────────────
t('T2 una fila con FUENTE_A=CALIDAD se indexa (antes quedaba fuera)', () => {
  const { c, conf, headersConf } = ctx();
  // Fila existente de la cola, con FUENTE_A = CALIDAD y ESTADO_REVISION pendiente.
  conf.val.push(['2026-01-01', 'DUPLICADO', 'EC-A', '11111111-1', 'JUAN', 'detalle',
    'CALIDAD', 'INGRESO_AMARILLO', 'PENDIENTE', '']);
  c.Calidad_auditarTodo = () => ({ filasCola: [{ idInterno: 'EC-A', tipo: 'DUPLICADO' }] });
  c.Calidad_sincronizarCola_();
  const filas = conf.val.slice(1);
  const deEC_A = filas.filter(f => f[COL.ID] === 'EC-A');
  assert.equal(deEC_A.length, 1,
    'no debe duplicar la fila ya presente; encontrados ' + deEC_A.length);
  assert.equal(deEC_A[0][COL.FUE_A], 'CALIDAD', 'FUENTE_A se conserva');
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — el auto-resolve funciona de verdad cuando el problema desaparece
// ─────────────────────────────────────────────────────────────────────────────
t('T3 auto-resolve marca RESUELTO_AUTO cuando el problema ya no está', () => {
  const { c, conf } = ctx();
  conf.val.push(['2026-01-01', 'DUPLICADO', 'EC-A', '11111111-1', 'JUAN', 'detalle',
    'CALIDAD', 'INGRESO_AMARILLO', 'PENDIENTE', '']);
  // Auditoría sin filas en cola: el problema ya no existe.
  c.Calidad_auditarTodo = () => ({ filasCola: [] });
  c.Calidad_sincronizarCola_();
  const fila = conf.val[1];
  assert.equal(fila[COL.ESTADO], 'RESUELTO_AUTO',
    'la fila debe quedar resuelta automáticamente; estado=' + fila[COL.ESTADO]);
  assert.equal(fila[COL.POR], 'SISTEMA', 'debe constar quién lo resolvió');
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — una fila que sigue en cola NO se auto-resuelve
// ─────────────────────────────────────────────────────────────────────────────
t('T4 una fila que sigue en conflicto conserva PENDIENTE', () => {
  const { c, conf } = ctx();
  conf.val.push(['2026-01-01', 'DUPLICADO', 'EC-A', '11111111-1', 'JUAN', 'detalle',
    'CALIDAD', 'INGRESO_AMARILLO', 'PENDIENTE', '']);
  c.Calidad_auditarTodo = () => ({ filasCola: [{ idInterno: 'EC-A', tipo: 'DUPLICADO' }] });
  c.Calidad_sincronizarCola_();
  assert.equal(conf.val[1][COL.ESTADO], 'PENDIENTE',
    'no debe resolverse mientras el conflicto siga en la cola');
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — Normalización de RUT: la fila sale del layout, no del índice
// ─────────────────────────────────────────────────────────────────────────────
t('T5 Calidad_normalizarFormatoRuts_ usa la fila física del layout', () => {
  const cuerpo = cuerpoDe('src/18_Calidad.js', 'Calidad_normalizarFormatoRuts_');
  assert.ok(cuerpo, 'debe existir Calidad_normalizarFormatoRuts_');
  assert.match(cuerpo, /Modelo_filaFisica\(HOJAS\.PACIENTES/,
    'la fila debe salir del contrato de layout');
  assert.doesNotMatch(cuerpo, /var\s+fila\s*=\s*2\s*\+\s*ix/,
    'no puede derivar la fila del índice del arreglo (2 + ix)');
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — el RUT se normaliza en la fila correcta, sin tocar banner ni encabezados
// ─────────────────────────────────────────────────────────────────────────────
t('T6 normalizarFormatoRuts_ corrige la fila de datos, no el banner ni los encabezados', () => {
  const { c, pac, E } = ctx();
  const campos = E('MODELO_PACIENTE.map(function(x){return x.campo;})');
  const idxRut = campos.indexOf('RUT');
  // Fila de datos (visual: fila física 4) con RUT que requiere normalización.
  const filaDatos = campos.map(f => (f === 'RUT' ? '11.111.111-1' : f === 'NOMBRE' ? 'JUAN' : ''));
  pac.val.push(filaDatos);
  const bannerAntes = JSON.stringify(pac.val[0]);
  const encabezadoAntes = pac.val[2][idxRut];

  const r = c.Calidad_normalizarFormatoRuts_();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.corregidos >= 1, 'debe corregir al menos un RUT: ' + JSON.stringify(r));

  assert.equal(pac.val[3][idxRut], '11111111-1',
    'el RUT debe quedar normalizado en la fila de datos; recibido: ' + JSON.stringify(pac.val[3][idxRut]));
  assert.equal(pac.val[2][idxRut], encabezadoAntes, 'el encabezado no debe tocarse');
  assert.equal(pac.val[2][idxRut], 'RUT', 'el encabezado sigue siendo RUT');
  assert.equal(JSON.stringify(pac.val[0]), bannerAntes, 'el banner no debe tocarse');
});

t('T7 un RUT ya válido no se reescribe', () => {
  const { c, pac, E } = ctx();
  const campos = E('MODELO_PACIENTE.map(function(x){return x.campo;})');
  const idxRut = campos.indexOf('RUT');
  pac.val.push(campos.map(f => (f === 'RUT' ? '11111111-1' : f === 'NOMBRE' ? 'JUAN' : '')));
  const r = c.Calidad_normalizarFormatoRuts_();
  assert.equal(r.corregidos, 0, 'no debe "corregir" lo que ya está bien');
  assert.equal(pac.val[3][idxRut], '11111111-1');
});

console.log('Integridad de cola y calidad vNEXT: ' + n + ' casos ejecutados');