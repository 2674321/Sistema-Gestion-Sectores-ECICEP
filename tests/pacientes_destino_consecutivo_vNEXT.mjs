#!/usr/bin/env node
/**
 * Regresión — hotfix "salto de filas" en PACIENTES (16-10-2026).
 *
 * Síntoma de producción: entre el último paciente y el alta nueva aparecían
 * ~200 filas artificiales con solo `AE=FALSE` (REQUIERE_REVISION). Causa
 * probada: `Modelo_agregarPacientes_` calculaba el destino con
 * `hoja.getLastRow() + 1` DESPUÉS de preparar/expandir reservas. Si la reserva
 * queda "ocupada" (cualquier valor, p.ej. FALSE en REQUIERE_REVISION), el alta
 * se desplaza detrás del bloque reservado.
 *
 * Este test NO toca producción ni credenciales: usa la hoja real simulada
 * (fake) y el código real de src/ (00_Config, 01_Utilidades, 02_Normalizacion,
 * 06_Modelo, 34_LibroUX). `Hojas_prepararRangoDatos_` se reemplaza por un
 * contaminante simulado (escribe FALSE en REQUIERE_REVISION de la reserva),
 * que es exactamente el estado físico observado y que la defensa de
 * `Hojas_asegurarCapacidad_` neutraliza.
 *
 * Uso: node tests/pacientes_destino_consecutivo_vNEXT.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('..', import.meta.url);
const leer = (p) => fs.readFileSync(new URL(p, raiz), 'utf8');

// ---------------------------------------------------------------------------
// Fake Sheet/Range con semántica GAS relevante: getLastRow() cuenta celdas con
// contenido (FALSE booleano SÍ cuenta; celda vacía o '' NO cuenta).
// ---------------------------------------------------------------------------
class FakeRange {
  constructor(hoja, fila, col, nFilas, nCols) {
    this.hoja = hoja; this.fila = fila; this.col = col;
    this.nFilas = nFilas; this.nCols = nCols;
  }
  _coord(absRow, absCol) { return [absRow - 1, absCol - 1]; }
  _asegurar(absRow, absCol) {
    const g = this.hoja.grid;
    while (g.length < absRow) g.push(new Array(this.hoja.anchoMax).fill(''));
    const fila = g[absRow - 1];
    while (fila.length < absCol) fila.push('');
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nFilas; r++) {
      const absR = this.fila + r;
      const row = [];
      for (let c = 0; c < this.nCols; c++) {
        const absC = this.col + c;
        this._asegurar(absR, absC);
        const v = this.hoja.grid[absR - 1][absC - 1];
        row.push(v === undefined || v === null ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    if (!vals || !vals.length) return this;
    const n = vals[0].length;
    for (let r = 0; r < vals.length; r++) {
      for (let c = 0; c < n; c++) {
        const absR = this.fila + r, absC = this.col + c;
        this._asegurar(absR, absC);
        const v = vals[r][c];
        this.hoja.grid[absR - 1][absC - 1] = (v === undefined || v === null) ? '' : v;
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  getValue() {
    const v = this.hoja.grid[this.fila - 1] ? this.hoja.grid[this.fila - 1][this.col - 1] : '';
    return v === undefined || v === null ? '' : v;
  }
  clearContent() {
    for (let r = 0; r < this.nFilas; r++) {
      for (let c = 0; c < this.nCols; c++) {
        const absR = this.fila + r, absC = this.col + c;
        this._asegurar(absR, absC);
        this.hoja.grid[absR - 1][absC - 1] = '';
      }
    }
    return this;
  }
}

class FakeSheet {
  constructor(nombre, opciones) {
    opciones = opciones || {};
    this.nombre = nombre;
    this.maxRows = opciones.maxRows || 50;
    this.anchoMax = opciones.anchoMax || 40;
    this.grid = [];
    for (let i = 0; i < this.maxRows; i++) this.grid.push(new Array(this.anchoMax).fill(''));
  }
  getName() { return this.nombre; }
  getRange(fila, col, nFilas, nCols) {
    return new FakeRange(this, fila, col, nFilas === undefined ? 1 : nFilas, nCols === undefined ? 1 : nCols);
  }
  _contenido(v) { return v !== '' && v !== null && v !== undefined; }
  getLastRow() {
    let ultima = 0;
    for (let r = this.grid.length - 1; r >= 0; r--) {
      if ((this.grid[r] || []).some((v) => this._contenido(v))) { ultima = r + 1; break; }
    }
    return ultima;
  }
  getLastColumn() {
    let ancho = 0;
    this.grid.forEach((fila) => {
      for (let c = fila.length - 1; c >= 0; c--) {
        if (this._contenido(fila[c])) { if (c + 1 > ancho) ancho = c + 1; break; }
      }
    });
    return ancho;
  }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(at, n) {
    while (this.grid.length < at) this.grid.push(new Array(this.anchoMax).fill(''));
    for (let i = 0; i < n; i++) this.grid.splice(at + i, 0, new Array(this.anchoMax).fill(''));
    this.maxRows += n;
  }
}

// ---------------------------------------------------------------------------
// Contexto vm con el código REAL del repositorio.
// ---------------------------------------------------------------------------
const ctx = {
  console, JSON, Date, Math, RegExp, Object, Array, String, Number,
  isFinite, isNaN, parseInt, parseFloat
};
ctx.globalThis = ctx;
ctx.Log_error_ = () => {};
ctx.Log_info_ = () => {};
ctx.Log_warning_ = () => {};
ctx.Log_flush_ = () => {};
vm.createContext(ctx);
for (const f of ['src/00_Config.js', 'src/01_Utilidades.js', 'src/02_Normalizacion.js', 'src/06_Modelo.js', 'src/34_LibroUX.js']) {
  vm.runInContext(leer(f), ctx, { filename: f });
}

const CAMPOS = ctx.MODELO_PACIENTE.map((c) => c.campo);
const COL_REV = CAMPOS.indexOf('REQUIERE_REVISION'); // 30 (columna AE)
const HR = ctx.Modelo_headerRow_(ctx.HOJAS.PACIENTES); // 3
const DS = ctx.Modelo_dataStartRow_(ctx.HOJAS.PACIENTES); // 4

// RUT chileno válido determinista (módulo 11) para no depender de valores reales.
function dv(cuerpo) {
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
function rut(n) { const c = String(70000000 + n); return c + '-' + dv(c); }
function nuevo(id, n, nombre) {
  return { ID_INTERNO: id, RUT: rut(n), NOMBRE: nombre, FUENTE: 'TEST|hoja|1' };
}

let HOJA_PAC = null;
ctx.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (n) => (n === ctx.HOJAS.PACIENTES ? HOJA_PAC : (ctx.__hojas || {})[n] || null),
    getId: () => 'fake'
  })
};

function hojaPacientes(opciones) {
  opciones = opciones || {};
  const h = new FakeSheet(ctx.HOJAS.PACIENTES, opciones);
  // Layout visual: fila 1 título, fila 2 secciones, fila 3 encabezados reales.
  h.getRange(HR, 1, 1, CAMPOS.length).setValues([CAMPOS]);
  (opciones.pacientes || []).forEach((p, i) => {
    h.getRange(DS + i, 1, 1, CAMPOS.length).setValues([filaPaciente(p)]);
  });
  HOJA_PAC = h;
  if (opciones.maxRows) h.maxRows = opciones.maxRows;
  ctx._MODELO_SS = null;
  ctx._MEMO_HOJAS = {};
  ctx._MODELO_INDICES = {};
  return h;
}

function filaPaciente(p) {
  p = p || {};
  return CAMPOS.map((campo) => {
    if (Object.prototype.hasOwnProperty.call(p, campo)) return p[campo];
    if (campo === 'FUENTE') return 'TEST|hoja|1';
    return '';
  });
}

// Contaminante simulado: la preparación de reservas escribe FALSE en
// REQUIERE_REVISION de cada fila nueva (estado físico de producción).
ctx.Hojas_prepararRangoDatos_ = (nombre, filaInicial, cantidad) => {
  const h = ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h) return { ok: false };
  let col = -1;
  if (nombre === ctx.HOJAS.PACIENTES) {
    col = CAMPOS.indexOf('REQUIERE_REVISION') + 1;
  } else if (nombre === ctx.HOJAS.EVENTOS) {
    col = 1; // simula cualquier valor residual en la reserva de EVENTOS
  }
  if (col > 0) {
    const vals = [];
    for (let i = 0; i < cantidad; i++) vals.push([col === CAMPOS.indexOf('REQUIERE_REVISION') + 1 ? false : 'reserva']);
    h.getRange(filaInicial, col, cantidad, 1).setValues(vals);
  }
  return { ok: true, hoja: nombre };
};

const ctxAltaPac = { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'test' };
let ok = 0;
function t(nombre, fn) {
  try { fn(); ok++; console.log('  [PASS] ' + nombre); }
  catch (e) { console.error('  [FAIL] ' + nombre + '\n      ' + (e && e.stack || e)); process.exitCode = 1; }
}

// Patrón PREVIO (bug): capacidad que contamina sin limpiar + destino decidido
// con getLastRow() DESPUÉS de expandir. Es el comportamiento exacto de master
// antes de este hotfix.
function capacidadVieja(hoja, filaNecesaria, opciones) {
  opciones = opciones || {};
  const max = hoja.getMaxRows(), reserva = opciones.reserva || 50;
  if (filaNecesaria + reserva <= max) return;
  const bloque = Math.max(opciones.bloque || 200, filaNecesaria + reserva - max);
  hoja.insertRowsAfter(max, bloque);
  const col = CAMPOS.indexOf('REQUIERE_REVISION') + 1;
  const vals = [];
  for (let i = 0; i < bloque; i++) vals.push([false]);
  hoja.getRange(max + 1, col, bloque, 1).setValues(vals);
}
function altaPatronViejo(hoja, filas) {
  capacidadVieja(hoja, hoja.getLastRow() + filas.length, { bloque: 200 });
  const inicio = hoja.getLastRow() + 1;
  ctx.Utl_escribirBloque_(hoja, inicio, 1, filas);
  return inicio;
}

console.log('pacientes_destino_consecutivo_vNEXT');

// 1) Hoja vacía con 3 filas de encabezado → primera alta en fila 4.
t('1. hoja vacía (encab. 1-3) → primera alta en fila 4', () => {
  const h = hojaPacientes();
  const n = ctx.Modelo_agregarPacientes_([nuevo('EC-A-0001', 1, 'P1')], ctxAltaPac);
  assert.equal(n, 1);
  assert.equal(ctx.Utl_texto_(h.getRange(DS, CAMPOS.indexOf('ID_INTERNO') + 1).getValue()), 'EC-A-0001');
  assert.equal(h.getLastRow(), DS);
});

// 2) N pacientes consecutivos → próximo en N+4.
t('2. N pacientes consecutivos → próximo registro en N+4', () => {
  const pacientes = [];
  for (let i = 0; i < 5; i++) pacientes.push({ ID_INTERNO: 'EC-P-' + i, RUT: rut(100 + i), NOMBRE: 'P' + i });
  const h = hojaPacientes({ pacientes: pacientes });
  assert.equal(h.getLastRow(), DS + 4);
  const dest = ctx.Modelo_ultimaFilaPaciente_(h) + 1;
  assert.equal(dest, 4 + 5);
});

// 3) Expansión de 200 filas con formato, sin valores → alta consecutiva sin salto.
t('3. expansión 200 filas reservadas → alta consecutiva (sin salto)', () => {
  const h = hojaPacientes({ pacientes: [nuevo('EC-A-0001', 1, 'P1')], maxRows: 4 });
  ctx.Modelo_agregarPacientes_([nuevo('EC-A-0002', 2, 'P2')], ctxAltaPac);
  // La reserva insertada debe quedar SIN valores: getLastRow == última fila real.
  assert.equal(h.getLastRow(), DS + 1, 'la reserva no debe aportar contenido a getLastRow');
  assert.equal(ctx.Utl_texto_(h.getRange(DS + 1, COL_REV + 1).getValue()), '', 'AE de reserva vacío');
  const ids = ctx.Modelo_leerPacientes_().map((p) => p.ID_INTERNO).filter(Boolean).join('|');
  assert.equal(ids, 'EC-A-0001|EC-A-0002', 'pacientes contiguos');
});

// 4) Reserva contaminada por AE=FALSE sin identidad → alta consecutiva segura.
t('4. reserva contaminada AE=FALSE sin identidad → alta consecutiva', () => {
  const h = hojaPacientes({ pacientes: [nuevo('EC-A-0001', 1, 'P1')] });
  // 3 filas artificiales (solo AE=FALSE) tras el último paciente.
  for (let r = DS + 1; r <= DS + 3; r++) h.getRange(r, COL_REV + 1).setValue(false);
  assert.ok(h.getLastRow() >= DS + 3, 'contaminación presente en getLastRow');
  ctx.Modelo_agregarPacientes_([nuevo('EC-A-0002', 2, 'P2')], ctxAltaPac);
  assert.equal(ctx.Utl_texto_(h.getRange(DS + 1, CAMPOS.indexOf('ID_INTERNO') + 1).getValue()), 'EC-A-0002',
    'el alta ocupa la primera fila contaminada, no salta');
  const ids = ctx.Modelo_leerPacientes_().map((p) => p.ID_INTERNO).filter(Boolean).join('|');
  assert.equal(ids, 'EC-A-0001|EC-A-0002');
});

// 5) Fila con datos clínicos en destino sin ID_INTERNO → bloqueo, sin sobrescritura.
t('5. datos clínicos sin ID_INTERNO en destino → DESTINO_PACIENTES_OCUPADO', () => {
  const h = hojaPacientes({ pacientes: [nuevo('EC-A-0001', 1, 'P1')] });
  h.getRange(DS + 1, CAMPOS.indexOf('NOMBRE') + 1).setValue('REGISTRO SIN ID');
  assert.throws(
    () => ctx.Modelo_agregarPacientes_([nuevo('EC-A-0002', 2, 'P2')], ctxAltaPac),
    /DESTINO_PACIENTES_OCUPADO/);
  assert.equal(ctx.Utl_texto_(h.getRange(DS + 1, CAMPOS.indexOf('NOMBRE') + 1).getValue()), 'REGISTRO SIN ID',
    'no se sobrescribe el dato no identificado');
});

// 6) Hueco histórico → no se reordena ni se rompe el mapeo físico.
t('6. hueco histórico entre pacientes → alta después del último, sin reordenar', () => {
  const h = hojaPacientes();
  h.getRange(DS, 1, 1, CAMPOS.length).setValues([filaPaciente({ ID_INTERNO: 'EC-A-0001', RUT: rut(1), NOMBRE: 'P1' })]);
  // hueco: DS+1..DS+3 vacío
  h.getRange(DS + 4, 1, 1, CAMPOS.length).setValues([filaPaciente({ ID_INTERNO: 'EC-A-0002', RUT: rut(2), NOMBRE: 'P2' })]);
  const ultima = ctx.Modelo_ultimaFilaPaciente_(h);
  assert.equal(ultima, DS + 4);
  ctx.Modelo_agregarPacientes_([nuevo('EC-A-0003', 3, 'P3')], ctxAltaPac);
  assert.equal(ctx.Utl_texto_(h.getRange(DS + 4, CAMPOS.indexOf('ID_INTERNO') + 1).getValue()), 'EC-A-0002',
    'paciente previo intacto en su fila física');
  assert.equal(ctx.Utl_texto_(h.getRange(DS + 5, CAMPOS.indexOf('ID_INTERNO') + 1).getValue()), 'EC-A-0003',
    'alta inmediatamente después del último paciente');
});

// 7) Dos altas consecutivas + lote → sin saltos ni IDs duplicados.
t('7. dos altas + lote de tres → contiguas y sin duplicados', () => {
  const h = hojaPacientes();
  ctx.Modelo_agregarPacientes_([nuevo('EC-A-0001', 1, 'P1')], ctxAltaPac);
  ctx.Modelo_agregarPacientes_([nuevo('EC-A-0002', 2, 'P2')], ctxAltaPac);
  ctx.Modelo_agregarPacientes_([
    nuevo('EC-A-0003', 3, 'P3'),
    nuevo('EC-A-0004', 4, 'P4'),
    nuevo('EC-A-0005', 5, 'P5')
  ], ctxAltaPac);
  const ids = ctx.Modelo_leerPacientes_().map((p) => p.ID_INTERNO).filter(Boolean);
  assert.equal(ids.join('|'), 'EC-A-0001|EC-A-0002|EC-A-0003|EC-A-0004|EC-A-0005');
  assert.equal(new Set(ids).size, ids.length, 'sin IDs duplicados');
  assert.equal(h.getLastRow(), DS + 4);
});

// 8) Actualización de paciente existente no anexa filas (mismo conteo).
t('8. re-alta de un ID existente → rechazo, sin fila nueva ni duplicado', () => {
  const h = hojaPacientes({ pacientes: [nuevo('EC-A-0001', 1, 'P1')] });
  const antes = h.getLastRow();
  assert.throws(
    () => ctx.Modelo_agregarPacientes_([nuevo('EC-A-0001', 1, 'P1')], ctxAltaPac),
    /ALTA_ID_INTERNO_YA_EXISTE/);
  assert.equal(h.getLastRow(), antes, 'el rechazo no escribe filas');
});

// 9) Concurrencia: el destino se relee del libro en cada alta y el lock vive
//    en los llamadores (sin lock anidado dentro de Modelo_agregarPacientes_).
t('9. dos solicitudes → contiguas; lock externo, sin lock anidado interno', () => {
  const h = hojaPacientes();
  ctx.Modelo_agregarPacientes_([nuevo('EC-C-0001', 11, 'C1')], ctxAltaPac);
  ctx.Modelo_agregarPacientes_([nuevo('EC-C-0002', 12, 'C2')], ctxAltaPac);
  assert.equal(ctx.Modelo_leerPacientes_().map((p) => p.ID_INTERNO).filter(Boolean).join('|'), 'EC-C-0001|EC-C-0002');
  const src = leer('src/06_Modelo.js');
  const cuerpo = src.slice(src.indexOf('function Modelo_agregarPacientes_'), src.indexOf('function Modelo_asegurarEsquemaEventos_'));
  assert.doesNotMatch(cuerpo, /Ecicep_conLock_/, 'no anida un lock (ScriptLock no es reentrante)');
});

// 10) getLastRow() cambia justo tras preparar capacidad → el destino se conserva.
t('10. getLastRow() cambia tras preparar capacidad → destino preservado', () => {
  const h = hojaPacientes({ pacientes: [nuevo('EC-A-0001', 1, 'P1')], maxRows: 4 });
  const destinoAntes = ctx.Modelo_ultimaFilaPaciente_(h) + 1;
  // El patrón VIEJO sí salta: demuestra el bug original (hoja aislada, sin
  // tocar el mock global para no desviar el destino del patrón NUEVO).
  const h2 = new FakeSheet(ctx.HOJAS.PACIENTES, { maxRows: 4 });
  h2.getRange(3, 1, 1, CAMPOS.length).setValues([CAMPOS]);
  ctx.Utl_escribirBloque_(h2, 4, 1, [filaPaciente({ ID_INTERNO: 'EC-A-0001', RUT: rut(1), NOMBRE: 'P1' })]);
  const viejo = altaPatronViejo(h2, [filaPaciente({ ID_INTERNO: 'EC-A-9999', RUT: rut(9999), NOMBRE: 'X' })]);
  assert.ok(viejo > destinoAntes + 100, 'el código anterior saltaba ~200 filas (' + viejo + ')');
  // El patrón NUEVO escribe en el destino calculado.
  ctx.Modelo_agregarPacientes_([nuevo('EC-A-0002', 2, 'P2')], ctxAltaPac);
  assert.equal(ctx.Utl_texto_(h.getRange(destinoAntes, CAMPOS.indexOf('ID_INTERNO') + 1).getValue()), 'EC-A-0002');
});

// 11) EVENTOS sigue append-only con ID_INTERNO/FUENTE correctos.
t('11. EVENTOS append-only con ID_INTERNO/FUENTE', () => {
  const ev = new FakeSheet(ctx.HOJAS.EVENTOS, { anchoMax: ctx.COLUMNAS_EVENTOS.length + 2 });
  ev.getRange(1, 1, 1, ctx.COLUMNAS_EVENTOS.length).setValues([ctx.COLUMNAS_EVENTOS]);
  const cIdInt = ctx.COLUMNAS_EVENTOS.indexOf('ID_INTERNO') + 1;
  const cFuente = ctx.COLUMNAS_EVENTOS.indexOf('FUENTE') + 1;
  const cIdEv = ctx.COLUMNAS_EVENTOS.indexOf('ID_EVENTO') + 1;
  ctx.__hojas = { [ctx.HOJAS.EVENTOS]: ev };
  ctx._MODELO_SS = null;
  ctx._MEMO_HOJAS = {};
  ctx._MODELO_INDICES = {};
  ctx.Modelo_agregarEventos_([{ ID_EVENTO: 'EV-1', ID_INTERNO: 'EC-A-0001', FUENTE: 'TEST' }], 'tester', ctxAltaPac);
  ctx.Modelo_agregarEventos_([{ ID_EVENTO: 'EV-2', ID_INTERNO: 'EC-A-0002', FUENTE: 'TEST' }], 'tester', ctxAltaPac);
  assert.equal(ctx.Utl_texto_(ev.getRange(2, cIdEv).getValue()), 'EV-1');
  assert.equal(ctx.Utl_texto_(ev.getRange(3, cIdEv).getValue()), 'EV-2');
  assert.equal(ctx.Utl_texto_(ev.getRange(3, cIdInt).getValue()), 'EC-A-0002');
  assert.equal(ctx.Utl_texto_(ev.getRange(3, cFuente).getValue()), 'TEST');
  ctx.__hojas = {};
});

// 12) Idempotencia del helper de capacidad: dos corridas no escriben valores
//     sobre filas vacías ni alteran datos existentes.
t('12. Hojas_asegurarCapacidad_ idempotente: reservas vacías y datos intactos', () => {
  const h = hojaPacientes({ pacientes: [nuevo('EC-A-0001', 1, 'P1')], maxRows: 4 });
  ctx.Hojas_asegurarCapacidadGestionada_(h, DS + 1, { bloque: 200 });
  const ultima1 = h.getLastRow();
  const idAntes = ctx.Utl_texto_(h.getRange(DS, CAMPOS.indexOf('ID_INTERNO') + 1).getValue());
  ctx.Hojas_asegurarCapacidadGestionada_(h, DS + 1, { bloque: 200 });
  assert.equal(h.getLastRow(), ultima1, 'la reserva no aporta contenido en la 2ª corrida');
  assert.equal(ctx.Utl_texto_(h.getRange(DS, CAMPOS.indexOf('ID_INTERNO') + 1).getValue()), idAntes, 'dato real intacto');
  // Ninguna celda de la reserva tiene valor (ni FALSE en REQUIERE_REVISION).
  const reserva = h.getRange(ultima1 + 1, 1, 50, CAMPOS.length).getValues();
  assert.ok(reserva.every((fila) => fila.every((v) => v === '' || v === null || v === undefined)),
    'la reserva queda sin valores');
});

console.log('\npacientes_destino_consecutivo_vNEXT: ' + ok + '/12 PASS');
process.exit(process.exitCode || 0);
