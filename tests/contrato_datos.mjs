#!/usr/bin/env node
/**
 * Batería de tests del CONTRATO ÚNICO DE DATOS (FASE S1) — ECICEP.
 *
 * Fuente normativa: CONTRATO_DATOS.md (S1) + docs/CONTRATO_CAPTURA_V2.md.
 * Verifica los criterios de aprobación S1.11:
 *   C1  la hoja es autoritativa: dataStartRow coincide con el layout real.
 *   C2  ninguna escritura de PACIENTES ocurre bajo la primera fila de datos.
 *   C3  conversión índice→fila única y derivada de Modelo_filaFisica.
 *   C4  todos los endpoints que escriben PACIENTES usan la misma convención.
 *   C5  una fila V2 nunca aparece como pendiente para el procesador legacy.
 *   C6  una captura V2 pendiente es retomada por su PROCESADOR V2.
 *   C7  captureId ≠ identidad clínica (la identidad es RUT/ID_INTERNO).
 * Además:
 *   R1  regresión estática: prohíbe el patrón `getRange(2 + idx` en escrituras.
 *   R2  regresión conductual: actualizarDatos→api_registrarEvento escribe en la
 *       fila física correcta y no pisa el encabezado/buscador ni otro paciente.
 *
 * Uso: node tests/contrato_datos.mjs
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Carga del núcleo (mismo orden que ejecutar_local.mjs) + 26_Captura + 07_UI
// ─────────────────────────────────────────────────────────────────────────────
const archivos = [
  'src/00_Config.js',
  'src/01_Utilidades.js',
  'src/02_Normalizacion.js',
  'src/03_Fuentes.js',
  'src/04_Identificacion.js',
  'src/13_Eventos.js',
  'src/14_REM.js',
  'src/15_RemExcel.js',
  'src/16_Amarillo.js',
  'src/17_Hojas.js',
  'src/18_Calidad.js',
  'src/19_Permisos.js',
  'src/20_Instalador.js',
  'src/21_Auditoria.js',
  'src/22_HojasVisual.js',
  'src/12_Ingresos.js',
  'src/24_Formulario.js',
  'src/25_Entorno.js',
  'src/Webhook.js',
  'src/WebApp.gs',
  'src/06_Modelo.js',
  'src/08_Dashboard.js',
  'src/11_DatosPrueba.js',
  'src/10_Pruebas.js',
'src/26_Captura.js',
  'src/27_Actualizacion.js',
  'src/07_UI.js'
];

let codigo = '';
for (const a of archivos) codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
sandbox.globalThis = sandbox;

// Stubs GAS inofensivos (los endpoints los usan solo en tiempo de llamada).
sandbox.SpreadsheetApp = {
  getActiveSpreadsheet: function () { return { getSheetByName: function () { return null; } }; },
  getActiveUser: function () { return { getEmail: function () { return 'test@ecicep.cl'; } }; }
};
sandbox.Session = { getActiveUser: function () { return { getEmail: function () { return 'test@ecicep.cl'; } }; }, getScriptTimeZone: function () { return 'America/Santiago'; } };
sandbox.Logger = { log: function () {}, logToConsole: function () {} };
sandbox.CacheService = { getScriptCache: function () { return { get: function () { return null; }, put: function () {} }; } };
sandbox.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };

vm.createContext(sandbox);

try {
  vm.runInContext(codigo, sandbox, { filename: 'ecicep-nucleo-contrato-datos.js' });
} catch (e) {
  console.error('ERROR cargando el núcleo:', e.message);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini runner (mismo estilo que captura_backend_v2.mjs)
// ─────────────────────────────────────────────────────────────────────────────
const R = { pass: 0, fail: 0, skip: 0 };
function t(nombre, fn) {
  try {
    fn();
    R.pass += 1;
    console.log('[PASS] ' + nombre);
  } catch (e) {
    R.fail += 1;
    console.log('[FAIL] ' + nombre);
    console.log('   CAUSA: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
  }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function igual(a, b, msg) { if (a !== b) throw new Error((msg || 'igual') + ' (recibido ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b) + ')'); }
function equalish(a, b, msg) {
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return igual(a, b, msg);
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) throw new Error((msg || 'equalish claves') + ' (recibido ' + ka.join(',') + ', esperado ' + kb.join(',') + ')');
  ka.forEach((k) => igual(a[k], b[k], (msg || 'equalish') + '.' + k));
}

const CSP = sandbox;
CSP.Modelo_layoutHoja; // referencia cargada

// ─────────────────────────────────────────────────────────────────────────────
// Helpers del arnés (hoja falsa + stubs de servicios)
// ─────────────────────────────────────────────────────────────────────────────
const NOMBRE_P = 'PACIENTES';
const SVC_DEP = [
  'Modelo_leerPacientes', 'Modelo_asegurarEsquemaPacientes', 'Modelo_agregarEventos',
  'Modelo_refrescarVistasSectores', 'Ingresos_sincronizarCache', 'Control_leerFrecuencia',
  'Control_calcularProximo', 'Estrat_evaluar', '_ingresosUsuarioActual',
  'Log_info', 'Log_error', 'Log_warning', 'Log_flush', 'Modelo_hoja', 'SpreadsheetApp'
];

const PAC_MUESTRA = [
  { ID_INTERNO: 'EC-0001', RUT: '11111111-1', NOMBRE: 'JUAN PÉREZ GÓMEZ', SEXO: 'M', FECHA_NACIMIENTO: '1988-03-12', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2', CONDICIONES: 'HTA', OTRAS_PATOLOGIAS: '', DUPLA_INGRESO: '', ULTIMO_CONTROL: '2026-01-10', ULTIMO_SEGUIMIENTO: '', PROXIMO_CONTROL: '2026-04-10', TELEFONOS: '+56911111111', FECHA_ACTUALIZACION: null },
  { ID_INTERNO: 'EC-0002', RUT: '22222222-2', NOMBRE: 'ANA MARÍA SOTO', SEXO: 'F', FECHA_NACIMIENTO: '1995-07-22', SECTOR: 'NARANJO', ESTRATIFICACION: 'G1', CONDICIONES: '', OTRAS_PATOLOGIAS: '', DUPLA_INGRESO: '', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', PROXIMO_CONTROL: '', TELEFONOS: '+56922222222', FECHA_ACTUALIZACION: null }
];

function crearHojaFalsa(nombre) {
  var hoja = {
    nombre: nombre,
    escrituras: []
  };
  hoja.getLastRow = function () { return 4 + hoja.escrituras.length; };
  hoja.getLastColumn = function () { return 25; };
  hoja.getSheetName = function () { return nombre; };
  hoja.getRange = function (row, col, numRows, numCols) {
    var r = {
      fila: row, col: col,
      numFilas: numRows === undefined ? 1 : numRows,
      numCols: numCols === undefined ? 1 : numCols,
      hoja: hoja
    };
    r.setValue = function (v) {
      hoja.escrituras.push({ fila: r.fila, col: r.col, numFilas: 1, numCols: 1, valor: v });
      return r;
    };
    r.setValues = function (vals) {
      hoja.escrituras.push({ fila: r.fila, col: r.col, numFilas: vals.length, numCols: vals[0].length, valores: vals });
      return r;
    };
    r.getValues = function () { return [new Array(r.numCols).fill('')]; };
    return r;
  };
  return hoja;
}

/** Activa el arnés de stubs y devuelve la hoja PACIENTES falsa (escrituras). */
function arnesActivo() {
  var hojaP = crearHojaFalsa(NOMBRE_P);
  var salvados = {};
  SVC_DEP.forEach(function (k) { salvados[k] = CSP[k]; });

  function clone() { return JSON.parse(JSON.stringify(PAC_MUESTRA)); }
  CSP.Modelo_leerPacientes = clone;
  CSP.Modelo_asegurarEsquemaPacientes = function () { return { ok: true }; };
  CSP.Modelo_agregarEventos = function () { return true; };
  CSP.Modelo_refrescarVistasSectores = function () {};
  CSP.Ingresos_sincronizarCache = function () {};
  CSP.Control_leerFrecuencia = function () { return {}; };
  CSP.Control_calcularProximo = function () { return '2026-12-01'; };
  CSP.Estrat_evaluar = function () { return { estado: 'CALCULADO', resultado: 'G2', puntaje: 2, regla: 'estrategia-1', version: 'T' }; };
  CSP._ingresosUsuarioActual = function () { return 'test@ecicep.cl'; };
  CSP.Log_info = function () {};
  CSP.Log_error = function () {};
  CSP.Log_warning = function () {};
  CSP.Log_flush = function () {};
  CSP.Modelo_hoja = function (nombre) { return nombre === NOMBRE_P ? hojaP : null; };
  CSP.SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return { getSheetByName: function (n) { return n === NOMBRE_P ? hojaP : null; } };
    },
    getActiveUser: function () { return { getEmail: function () { return 'test@ecicep.cl'; } }; }
  };

  return {
    hojaP: hojaP,
    restaura: function () { SVC_DEP.forEach(function (k) { CSP[k] = salvados[k]; }); }
  };
}

function filasPacientes(hojaP) { return hojaP.escrituras.map(function (w) { return w.fila; }); }
function primeraFilaDatosP() { return CSP.Modelo_dataStartRow(NOMBRE_P); }

// ─────────────────────────────────────────────────────────────────────────────
// C1 — la hoja es autoritativa (dataStartRow coincide con el layout real)
// ─────────────────────────────────────────────────────────────────────────────
t('C1: Modelo_dataStartRow(PACIENTES) coincide con el layout configurado', () => {
  const d = CSP.Modelo_layoutHoja(NOMBRE_P);
  igual(CSP.Modelo_dataStartRow(NOMBRE_P), d.datosDesdeRow, 'dataStartRow = layout real');
  igual(CSP.Modelo_dataStartRow(NOMBRE_P), 4, 'PACIENTES datos desde fila 4 (layout VISUAL)');
});

t('C1: FORM_RESPUESTAS y EVENTOS tienen dataStartRow consistente', () => {
  igual(CSP.Modelo_dataStartRow('FORM_RESPUESTAS'), CSP.Modelo_layoutHoja('FORM_RESPUESTAS').datosDesdeRow, 'FORM_RESPUESTAS coherente');
  igual(CSP.Modelo_dataStartRow('EVENTOS'), CSP.Modelo_layoutHoja('EVENTOS').datosDesdeRow, 'EVENTOS coherente');
  igual(CSP.Modelo_dataStartRow('EVENTOS'), 2, 'EVENTOS datos desde fila 2');
});

// ─────────────────────────────────────────────────────────────────────────────
// C3 — conversión índice→fila única y derivada (también respalda C2/C4)
// ─────────────────────────────────────────────────────────────────────────────
t('C3: Modelo_filaFisica es la conversión única y lineal index→fila', () => {
  for (let i = 0; i < 5; i++) {
    igual(CSP.Modelo_filaFisica(NOMBRE_P, i), CSP.Modelo_dataStartRow(NOMBRE_P) + i, 'filaFisica(' + i + ')');
  }
  igual(CSP.Modelo_filaFisica(NOMBRE_P, 1), 5, 'paciente idx=1 → fila física 5');
});

// ─────────────────────────────────────────────────────────────────────────────
// C4 + C2 + R2 — endpoints escriben PACIENTES con la misma convención
// ─────────────────────────────────────────────────────────────────────────────
t('C4/R2: api_duplaGuardar escribe en Modelo_filaFisica (no 2+idx)', () => {
  const a = arnesActivo();
  try {
    const r = CSP.api_duplaGuardar('EC-0002', ['ENFERMERA/O']);
    A(r.ok, 'guardar ok: ' + JSON.stringify(r));
    igual(filasPacientes(a.hojaP)[0], 5, 'fila física = 4+idx(1)');
  } finally { a.restaura(); }
});

t('C4/R2: api_controlActualizarUltimo escribe en Modelo_filaFisica', () => {
  const a = arnesActivo();
  try {
    const r = CSP.api_controlActualizarUltimo('EC-0002', 'CONTROL', '2026-09-01');
    A(r.ok, 'ok: ' + JSON.stringify(r));
    igual(filasPacientes(a.hojaP)[0], 5, 'fila física = 4+idx(1)');
  } finally { a.restaura(); }
});

t('C4/R2: api_registrarEvento (ruta actualizarDatos/controles V2) escribe en Modelo_filaFisica', () => {
  const a = arnesActivo();
  try {
    const r = CSP.api_registrarEvento({ tipoEvento: 'CONTROL', fecha: '2026-09-01', idInterno: 'EC-0002', profesional: 'TENS', fuente: 'Cp2-test' });
    A(r.ok, 'ok: ' + JSON.stringify(r));
    igual(filasPacientes(a.hojaP)[0], 5, 'fila física = 4+idx(1)');
  } finally { a.restaura(); }
});

t('C4/R2: api_patologiasGuardar escribe (una sola escritura fusionada) en Modelo_filaFisica', () => {
  const a = arnesActivo();
  try {
    const r = CSP.api_patologiasGuardar('EC-0002', [], '');
    A(r.ok, 'ok: ' + JSON.stringify(r));
    const filas = filasPacientes(a.hojaP);
    // Condiciones + estratificación se escriben en UNA escritura atómica de la
    // MISMA fila física (PERF pasada 7: antes eran dos setValues consecutivos).
    igual(filas.length, 1, 'una sola escritura (condiciones + estratificación fusionadas)');
    igual(filas[0], 5, 'fila física = 4+idx(1)');
    const w = a.hojaP.escrituras[0];
    A(w && w.valores, 'escritura con setValues');
    const filaSalvada = w.valores[0];
    const leerP = (k) => {
      const campos = CSP.Modelo_campos();
      const i = campos.indexOf(k);
      if (i === -1) return 'SIN_COLUMNA';
      return i < filaSalvada.length ? String(filaSalvada[i]) : '';
    };
    igual(leerP('CONDICIONES'), '', 'condiciones guardadas en la misma escritura');
    igual(leerP('ESTRATIFICACION'), 'G2', 'estrat re-calculada en la misma escritura');
  } finally { a.restaura(); }
});

t('C4/R2: Estrat_recalcularPaciente escribe en Modelo_filaFisica', () => {
  const a = arnesActivo();
  try {
    const r = CSP.Estrat_recalcularPaciente('EC-0002');
    A(r.ok, 'ok: ' + JSON.stringify(r));
    igual(filasPacientes(a.hojaP)[0], 5, 'fila física = 4+idx(1)');
  } finally { a.restaura(); }
});

t('C2: ninguna escritura de PACIENTES del arnés ocurre bajo la primera fila de datos', () => {
  const a = arnesActivo();
  try {
    CSP.api_duplaGuardar('EC-0002', ['TENS']);
    CSP.api_registrarEvento({ tipoEvento: 'SEGUIMIENTO', fecha: '2026-09-01', idInterno: 'EC-0001', fuente: 'UI_FICHA' });
    CSP.Estrat_recalcularPaciente('EC-0001');
    const filas = filasPacientes(a.hojaP);
    const minimo = primeraFilaDatosP();
    filas.forEach((f, i) => { if (f < minimo) throw new Error('escritura ' + i + ' bajo fila de datos: ' + f); });
    A(filas.length >= 3, 'se registraron escrituras');
  } finally { a.restaura(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// C5 — namespace V2/legacy: la cola compartida no mezcla procesadores
// ─────────────────────────────────────────────────────────────────────────────
t('C5: fila V2 (FORM_VERSION=2 / prefijo Cp2-) NO aparece pendiente para el legacy', () => {
  const headers = CSP.Form_columnas();
  const mapa = CSP.Form_mapeoEncabezados(headers);
  const idx = (k) => { const m = mapa.idx; return m[k]; };

  function fila(rid, version, estado, reint) {
    const arr = new Array(headers.length).fill('');
    if (idx('FECHAFORMS') !== undefined) arr[idx('FECHAFORMS')] = '2026-09-01 10:00:00';
    if (idx('RESPONSEID') !== undefined) arr[idx('RESPONSEID')] = rid;
    if (idx('FORMVERSION') !== undefined) arr[idx('FORMVERSION')] = version;
    if (idx('ESTADO') !== undefined) arr[idx('ESTADO')] = estado;
    if (idx('REINTENTOS') !== undefined) arr[idx('REINTENTOS')] = reint;
    if (idx('ACCION') !== undefined) arr[idx('ACCION')] = estado === 'RECIBIDO' ? 'NUEVO_INGRESO' : 'REGISTRAR_CONTROL';
    return arr;
  }

  const valores = [
    headers,
    fila('LEGACY-1', '', 'RECIBIDO', 0),
    fila('Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90', '2', 'RECIBIDO', 0),
    fila('Cp2-b2c3d4e5f60718293a4b5c6d7e8f90', '2', 'ERROR', 1),
    fila('LEGACY-2', '', 'ERROR', 1),
    fila('Cp2-c3d4e5f60718293a4b5c6d7e8f90', '', 'RECIBIDO', 0)
  ];

  const pend = CSP.Form_filasPendientes(valores, CSP.Form_mapeoEncabezados(headers), 3);
  const ids = pend.map((p) => p.responseId);
  A(ids.indexOf('LEGACY-1') !== -1, 'legacy RECIBIDO pendiente');
  A(ids.indexOf('LEGACY-2') !== -1, 'legacy ERROR reintentable pendiente');
  A(ids.indexOf('Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90') === -1, 'V2 RECIBIDO excluido (FORM_VERSION=2)');
  A(ids.indexOf('Cp2-b2c3d4e5f60718293a4b5c6d7e8f90') === -1, 'V2 ERROR excluido (FORM_VERSION=2)');
  A(ids.indexOf('Cp2-c3d4e5f60718293a4b5c6d7e8f90') === -1, 'V2 sin FORMVERSION excluido por prefijo Cp2-');
});

t('C5: Form_reiniciarRespuesta rechaza respuestas del namespace V2', () => {
  const headers = CSP.Form_columnas();
  function filaV2() {
    const m = CSP.Form_mapeoEncabezados(headers).idx;
    const arr = new Array(headers.length).fill('');
    if (m['RESPONSEID'] !== undefined) arr[m['RESPONSEID']] = 'Cp2-d4e5f60718293a4b5c6d7e8f9071829a';
    if (m['FORMVERSION'] !== undefined) arr[m['FORMVERSION']] = '2';
    if (m['ESTADO'] !== undefined) arr[m['ESTADO']] = 'ERROR';
    return arr;
  }
  const a = arnesActivo();
  try {
    a.hojaP.escrituras = [];
    CSP.Modelo_hoja = function (nombre) {
      if (nombre === 'FORM_RESPUESTAS') {
        const h2 = crearHojaFalsa('FORM_RESPUESTAS');
        h2.getLastRow = function () { return 2; };
        const datos = [[...headers], filaV2()];
        h2.getRange = function (row, col, nR, nC) {
          const r = {
            fila: row, col: col,
            numFilas: nR === undefined ? 1 : nR,
            numCols: nC === undefined ? 1 : nC,
            hoja: h2
          };
          r.getValues = function () {
            const sal = [];
            for (let x = 0; x < (nR === undefined ? 1 : nR); x++) {
              const fuente = datos[(row - 1) + x] || [];
              const filaOut = [];
              for (let y = 0; y < (nC === undefined ? 1 : nC); y++) filaOut.push(fuente[(col - 1) + y] === undefined ? '' : fuente[(col - 1) + y]);
              sal.push(filaOut);
            }
            return sal;
          };
          r.setValue = function (v) { h2.escrituras.push({ fila: r.fila, col: r.col, valor: v }); return r; };
          return r;
        };
        return h2;
      }
      return null;
    };
    const r = CSP.Form_reiniciarRespuesta('Cp2-d4e5f60718293a4b5c6d7e8f9071829a');
    igual(r.ok, false, 'rechazado');
    igual(r.motivo, 'NAMESPACE_V2_USA_PROCESADOR_V2', 'motivo de rechazo');
  } finally { a.restaura(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// C6 — retoma V2 por su procesador (Captura_v2_retomarRegistro)
// ─────────────────────────────────────────────────────────────────────────────
const CID1 = 'Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90';
const CID2 = 'Cp2-b1b2c3d4e5f60718293a4b5c6d7e8f90';
const RUTA = '11111111-1';
const CATALOGO = ['MEDICO/A', 'ENFERMERA/O', 'TENS', 'MATRONA/O', 'PSICOLOGO/A', 'ASISTENTE SOCIAL'];

function makeCtx(over) {
  const registros = new Map();
  const personas = new Map();
  const entregas = [];
  let seq = 0;
  const ctx = {
    registros, personas, entregas,
    usuario: 'tester@ecicep.cl',
    ahora: () => '2026-09-04 10:00:00',
    maxReintentos: 3,
    catalogo: CATALOGO
  };
  ctx.buscarRegistro = (capId) => registros.get(capId) || null;
  ctx.persistirRegistro = (reg) => { registros.set(reg.captureId, JSON.parse(JSON.stringify(reg))); return { ok: true }; };
  ctx.actualizarTrailer = (capId, cambios) => {
    const reg = registros.get(capId);
    if (!reg) return { ok: false, motivo: 'SIN_REGISTRO' };
    for (const k of Object.keys(cambios)) reg[k] = cambios[k];
    return { ok: true };
  };
  ctx.entregar = (norm, meta) => {
    entregas.push({ norm: JSON.parse(JSON.stringify(norm)), meta });
    if (norm.accion === 'nuevoIngreso') {
      seq += 1;
      const id = 'EC-RET-' + String(1000 + seq);
      personas.set(norm.rut, { RUT: norm.rut, NOMBRE: norm.nombre, ID_INTERNO: id });
      return { estado: 'PROCESADO', motivo: '', idInterno: id, idEvento: '', ingresoHoja: 'INGRESO_' + norm.sector, ingresoFila: String(300 + seq) };
    }
    const pers = personas.get(norm.rut);
    if (!pers) return { estado: 'REQUIERE_REVISION', motivo: 'PERSONA_NO_ENCONTRADA', idInterno: '', idEvento: '' };
    seq += 1;
    return { estado: 'PROCESADO', motivo: '', idInterno: pers.ID_INTERNO, idEvento: 'EV-RET-' + String(2000 + seq) };
  };
  if (over) {
    ctx.usuario = over.usuario || ctx.usuario;
    if (over.ng) ctx.entregar = (norm, meta) => {
      entregas.push({ norm: JSON.parse(JSON.stringify(norm)), meta });
      seq += 1;
      return { estado: 'PROCESADO', motivo: '', idInterno: 'EC-RET-' + String(1000 + seq), idEvento: 'EV-RET-' + String(2000 + seq) };
    };
  }
  return ctx;
}

function payloadControl(capId) {
  return {
    captureId: capId, accion: 'registrarControl', rut: RUTA,
    fechaEvento: '2026-08-15', profesional: 'ENFERMERA/O', profesionalSecundario: 'TENS', observaciones: 'Control de rutina'
  };
}

function precargar(ctx, payload, estado) {
  const v = CSP.Captura_v2_validar(payload, { catalogo: ctx.catalogo });
  if (!v.ok) throw new Error('precargar inválido');
  const reg = CSP.Captura_v2_nuevoRegistro(v.normalizado, { usuario: ctx.usuario, fechaRecepcion: '2026-09-04 09:00:00' });
  reg.estado = estado;
  const copia = JSON.parse(JSON.stringify(reg));
  ctx.registros.set(copy_id(reg), copia);
  return v.normalizado;
}
function copy_id(reg) { return reg.captureId; }

t('C6: pendiente V2 ERROR es retomado por su procesador (re-entrega vía motor V2)', () => {
  const ctx = makeCtx();
  const norm = precargar(ctx, payloadControl(CID1), 'ERROR');
  ctx.personas.set(RUTA, { RUT: RUTA, NOMBRE: 'JUAN PÉREZ', ID_INTERNO: 'EC-0001' });
  const r = CSP.Captura_v2_retomarRegistro(CID1, ctx);
  A(r.ok, 'retoma ok: ' + JSON.stringify(r));
  igual(r.data.estado, 'PROCESADO', 'vuelve PROCESADO por el motor V2');
  igual(ctx.entregas.length, 1, 're-entrega ejecutada por el procesador V2');
  igual(ctx.registros.get(CID1).estado, 'PROCESADO', 'trailer confirmado');
  igual(ctx.registros.get(CID1).motivo, '', 'motivo limpio tras entrega ok');
});

t('C6: pendiente V2 RECIBIDO (sin entregar aún) se retoma y entrega', () => {
  const ctx = makeCtx();
  const norm = precargar(ctx, payloadControl(CID2), 'RECIBIDO');
  ctx.personas.set(RUTA, { RUT: RUTA, NOMBRE: 'JUAN PÉREZ', ID_INTERNO: 'EC-0001' });
  const r = CSP.Captura_v2_retomarRegistro(CID2, ctx);
  A(r.ok, 'ok: ' + JSON.stringify(r));
  igual(r.data.estado, 'PROCESADO');
  igual(ctx.entregas.length, 1);
});

t('C6: PROCESADO NO se retoma (estado terminal)', () => {
  const ctx = makeCtx();
  precargar(ctx, payloadControl(CID1), 'PROCESADO');
  const r = CSP.Captura_v2_retomarRegistro(CID1, ctx);
  igual(r.ok, false, 'rechazado');
  igual(r.errors[0].codigo, 'CAMPO_INVALIDO', 'código de error');
  igual(ctx.entregas.length, 0, 'no re-entrega');
});

t('C6: REQUIERE_REVISION NO se retoma automáticamente (decisión humana)', () => {
  const ctx = makeCtx();
  precargar(ctx, payloadControl(CID1), 'REQUIERE_REVISION');
  const r = CSP.Captura_v2_retomarRegistro(CID1, ctx);
  igual(r.ok, false, 'rechazado');
  igual(ctx.entregas.length, 0, 'no re-entrega');
  igual(ctx.registros.get(CID1).estado, 'REQUIERE_REVISION', 'trailer intacto');
});

t('C6: sin payload normalizado almacenado → rechazo (no inventa payload)', () => {
  const ctx = makeCtx();
  const cap = 'Cp2-e5f60718293a4b5c6d7e8f90a1b2c3d4';
  ctx.registros.set(cap, { captureId: cap, estado: 'ERROR', normalizado: null, reintentos: 0, ingresoHoja: '', ingresoFila: '' });
  const r = CSP.Captura_v2_retomarRegistro(cap, ctx);
  igual(r.ok, false, 'rechazado');
  igual(ctx.entregas.length, 0, 'no entrega');
});

t('C6: syntax de captureId inválido en retoma → SINTAXIS_INVALIDA', () => {
  const ctx = makeCtx();
  const r = CSP.Captura_v2_retomarRegistro('Cp2-ABCD', ctx);
  igual(r.ok, false);
  igual(r.errors[0].codigo, 'SINTAXIS_INVALIDA');
});

t('C6: entrypoint WebApp_capturarRetomar no-crash (acepta payload de objeto)', () => {
  // Sin ctx inyectado usa el ctx GAS; en node sin hojas no encuentra el registro.
  const r = CSP.WebApp_capturarRetomar({ captureId: 'Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90' });
  A(typeof r === 'object', 'respuesta objeto');
  A('ok' in r, 'tiene ok');
  A(Array.isArray(r.errors), 'tiene errors (rechazo por entorno sin registro o sesión)');
});

// ─────────────────────────────────────────────────────────────────────────────
// C7 — captureId ≠ identidad clínica
// ─────────────────────────────────────────────────────────────────────────────
t('C7: la identidad clínica es RUT/ID_INTERNO, no el captureId', () => {
  const ctx = makeCtx();
  const cap = 'Cp2-f60718293a4b5c6d7e8f90a1b2c3d4e5';
  const ingreso = {
    captureId: cap, accion: 'nuevoIngreso', rut: RUTA, nombre: 'JUAN PÉREZ GÓMEZ',
    sexo: 'M', fechaNacimiento: '1988-03-12', sector: 'AMARILLO', fechaIngreso: '2026-09-01',
    estratificacion: 'G2', telefonos: '+56911111111', profesional: 'MATRONA/O',
    profesionalSecundario: 'MEDICO/A', observaciones: '', confirmarNuevoPaciente: false
  };
  const r = CSP.Captura_v2_enviar(ingreso, ctx);
  A(r.ok, 'envío ok');
  igual(r.data.estado, 'PROCESADO');
  const internos = CSP.Captura_v2_normalizadoAInterno(CSP.Captura_v2_validar(ingreso, { catalogo: ctx.catalogo }).normalizado, {});
  igual(internos.RUT, RUTA, 'identidad por RUT');
  A(r.data.idInterno !== cap, 'ID_INTERNO ≠ captureId');
  A(r.data.idInterno.indexOf('Cp2-') !== 0, 'ID_INTERNO no hereda el prefijo de transporte');
  const persona = ctx.personas.get(RUTA);
  A(persona && persona.ID_INTERNO !== cap, 'la persona se indexa por RUT con identidad propia');
  igual(ctx.registros.get(cap).estado, 'PROCESADO', 'registro trazado por captureId');
});

// ─────────────────────────────────────────────────────────────────────────────
// R1 — regresión estática: prohibición de `getRange(2 + idx` en escrituras
// ─────────────────────────────────────────────────────────────────────────────
t('R1: ninguna escritura con patrón 2+idx persiste en el código (regresión PF0)', () => {
  const files = ['src/07_UI.js', 'src/02_Normalizacion.js', 'src/24_Formulario.js', 'src/26_Captura.js', 'src/06_Modelo.js'];
  let texto = '';
  for (const f of files) texto += '\n' + readFileSync(path.join(raiz, f), 'utf8');
  const mal = texto.match(/getRange\s*\(\s*2\s*\+\s*idx/gi);
  igual(mal === null ? 0 : mal.length, 0, 'patrón getRange(2 + idx eliminado');
  const usoCanonico = (texto.match(/Modelo_filaFisica\(HOJAS\.PACIENTES/g) || []).length;
  A(usoCanonico >= 5, 'las escrituras de PACIENTES usan Modelo_filaFisica (uso=' + usoCanonico + ')');
});

// ─────────────────────────────────────────────────────────────────────────────
// R3 — lectura acotada de CONFIG (PERF pasada 7): _config_leerValores lee la
// hoja UNA vez y sirve N claves; _rem9_configValor/_backup_mantener delegan.
// ─────────────────────────────────────────────────────────────────────────────
t('R3: _config_leerValores entrega N claves con UNA sola lectura de CONFIG', () => {
  const contador = { lecturas: 0 };
  const filasConfig = [
    ['CLAVE', 'VALOR', 'DESCRIPCION'],
    ['BACKUP_AUTO_ULTIMA', '2026-09-10 08:00:00', ''],
    ['BACKUP_MANTENER', '5', ''],
    ['GENERAL_NOMBRE_SISTEMA', 'ECICEP', '']
  ];
  const hojaC = {
    getLastRow: () => filasConfig.length,
    getDataRange: () => ({ getNumRows: () => filasConfig.length,
                          getValues: () => { contador.lecturas += 1; return filasConfig; } })
  };
  const prevHoja = CSP.Modelo_hoja;
  CSP.Modelo_hoja = (nombre) => nombre === CSP.HOJAS.CONFIG ? hojaC : null;
  try {
    const mapa = CSP._config_leerValores(['BACKUP_AUTO_ULTIMA', 'BACKUP_MANTENER']);
    igual(contador.lecturas, 1, 'una sola lectura para N claves');
    igual(mapa['BACKUP_AUTO_ULTIMA'], '2026-09-10 08:00:00');
    igual(mapa['BACKUP_MANTENER'], '5');
    const antes = contador.lecturas;
    igual(CSP._rem9_configValor('GENERAL_NOMBRE_SISTEMA'), 'ECICEP', 'delega en el helper');
    A(contador.lecturas >= antes + 1, '_rem9_configValor usa una lectura');
    igual(CSP._backup_mantener(), 5, '_backup_mantener delega en el helper');
    igual(CSP._rem9_configValor('CLAVE_INEXISTENTE'), '', 'clave ausente → string vacío');
    igual(CSP._backup_mantener(), 5, 'mantener estable tras lecturas múltiples');
  } finally {
    CSP.Modelo_hoja = prevHoja;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// R4 — lectores ligeros (PERF pasada 9): Modelo_leerPacientes/EventosCampos
// materializan SOLO los campos pedidos con UNA sola lectura de hoja (memo).
// ─────────────────────────────────────────────────────────────────────────────

function hojaLigeraPara(nombre, filas, hr) {
  return {
    getLastRow: function () { return hr + filas.length - 1; },
    getLastColumn: function () { return filas[0].length; },
    getRange: function () {
      return { getValues: () => {
        lecturasContador += 1;
        return filas;
      } };
    }
  };
}
let lecturasContador = 0;

t('R4a: Modelo_leerPacientesCampos entrega SOLO los campos pedidos (una lectura)', () => {
  const filas = [
    ['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'REQUIERE_REVISION'],
    ['EC-0001', '11111111-1', 'JUAN PÉREZ', 'NARANJO', true],
    ['EC-0002', '22222222-2', 'ANA SOTO', 'AMARILLO', false]
  ];
  lecturasContador = 0;
  const prevHoja = CSP.Modelo_hoja;
  // PACIENTES es hoja VISUAL (encabezados en fila 3).
  CSP.Modelo_hoja = (nombre) => nombre === CSP.HOJAS.PACIENTES ? hojaLigeraPara('PACIENTES', filas, 3) : null;
  CSP.Modelo_invalidarLecturas();
  try {
    const r = CSP.Modelo_leerPacientesCampos(['ID_INTERNO', 'SECTOR', 'REQUIERE_REVISION', 'NOMBRE_INEXISTENTE']);
    igual(lecturasContador, 1, 'una sola lectura de hoja');
    igual(r.length, 2, 'mismas filas');
    igual(r[0].ID_INTERNO, 'EC-0001');
    igual(r[0].SECTOR, 'NARANJO');
    igual(r[0].REQUIERE_REVISION, 'TRUE', 'boolean → TRUE');
    igual(r[1].REQUIERE_REVISION, 'FALSE', 'boolean → FALSE');
    A(!('NOMBRE_INEXISTENTE' in r[0]), 'campo ausente en encabezado → omitido');
    A(!('NOMBRE' in r[0]), 'campo NO pedido no se materializa');
  } finally {
    CSP.Modelo_hoja = prevHoja;
    CSP.Modelo_invalidarLecturas();
  }
});

t('R4b: Modelo_leerEventosCampos materializa solo los campos pedidos', () => {
  const filas = [
    ['ID_EVENTO', 'ID_INTERNO', 'TIPO_EVENTO', 'FECHA_EVENTO', 'SECTOR'],
    ['EV-1', 'EC-0001', 'CONTROL', '2026-09-05', 'NARANJO'],
    ['EV-2', 'EC-0002', 'INGRESO', '2026-09-10', 'AMARILLO']
  ];
  lecturasContador = 0;
  const prevHoja = CSP.Modelo_hoja;
  // EVENTOS es hoja simple (encabezados en fila 1).
  CSP.Modelo_hoja = (nombre) => nombre === CSP.HOJAS.EVENTOS ? hojaLigeraPara('EVENTOS', filas, 1) : null;
  CSP.Modelo_invalidarLecturas();
  try {
    const r = CSP.Modelo_leerEventosCampos(['TIPO_EVENTO', 'FECHA_EVENTO', 'SECTOR']);
    igual(lecturasContador, 1, 'una sola lectura de hoja');
    igual(r[0].TIPO_EVENTO, 'CONTROL');
    igual(r[0].FECHA_EVENTO, '2026-09-05');
    A(!('NOMBRE' in r[0]) && !('ID_EVENTO' in r[0]), 'solo campos pedidos');
  } finally {
    CSP.Modelo_hoja = prevHoja;
    CSP.Modelo_invalidarLecturas();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// R5 — agregador puro del Panel de Control (PERF pasada 9): _centro_resumen
// calcula los KPIs en pases lineales sin arreglos intermedios (misma semántica
// que la versión con eventosMin/paxMin).
// ─────────────────────────────────────────────────────────────────────────────
t('R5: _centro_resumen calcula KPIs/sectores/últimos en una sola pasada', () => {
  const precisos = (arr) => arr.map((s) => `${s.sector}#${s.pacientes}#${s.porRevisar}#${s.ingresos7d}#${s.cobertura}`).join('|');
  const pacientes = [
    { SECTOR: 'NARANJO', REQUIERE_REVISION: true, ESTRATIFICACION: 'G3', FECHA_ACTUALIZACION: new Date('2026-09-01T10:00:00') },
    { SECTOR: 'NARANJO', REQUIERE_REVISION: 'TRUE', ESTRATIFICACION: 'g2', FECHA_ACTUALIZACION: null },
    { SECTOR: 'AMARILLO', REQUIERE_REVISION: false, ESTRATIFICACION: '', FECHA_ACTUALIZACION: null },
    { SECTOR: 'VERDE', REQUIERE_REVISION: 'FALSE', ESTRATIFICACION: 'G', FECHA_ACTUALIZACION: null }
  ];
  const eventos = [
    { TIPO_EVENTO: 'INGRESO', SECTOR: 'NARANJO', FECHA_EVENTO: '2026-09-10T09:30:00', NOMBRE: 'LUIS PÉREZ' },
    { TIPO_EVENTO: 'CONTROL', SECTOR: 'NARANJO', FECHA_EVENTO: '2026-09-05', NOMBRE: 'LUIS PÉREZ' },
    { TIPO_EVENTO: 'INGRESO', SECTOR: 'AMARILLO', FECHA_EVENTO: '2026-09-03', NOMBRE: '' },
    { TIPO_EVENTO: 'INGRESO', SECTOR: 'AMARILLO', FECHA_EVENTO: '2026-09-08', NOMBRE: 'ANA SOTO' },
    { TIPO_EVENTO: 'SEGUIMIENTO', SECTOR: 'VERDE', FECHA_EVENTO: '2026-08-30', NOMBRE: 'CARLA DÍAZ' },
    { TIPO_EVENTO: 'INGRESO', SECTOR: 'VERDE', FECHA_EVENTO: '2026-09-07', NOMBRE: 'CARLA DÍAZ' }
  ];
  const r = CSP._centro_resumen(pacientes, eventos, '2026-09-10', 'America/Santiago');
  igual(r.pacientes, 4);
  igual(r.ingresosHoy, 1, 'solo INGRESO del 2026-09-10');
  igual(r.eventosMes, 5, 'septiembre (5 de 6 eventos)');
  igual(r.porRevisar, 2, 'REQUIERE_REVISION true/TRUE');
  igual(r.estratPendiente, 2, 'ESTRAT vacío o G');
  igual(precisos(r.sectores),
    'NARANJO#2#2#1#Cobertura parcial|AMARILLO#1#0#1#Cobertura parcial|VERDE#1#0#1#Cobertura parcial');
  igual(r.ultimos.length, 4, 'top-4 de actividad');
  igual(r.ultimos[0].fechaIso, '2026-09-10', 'más reciente primero');
  igual(r.ultimos[0].tipo, 'INGRESO');
  igual(r.ultimos[0].iniciales, 'L. P.', 'iniciales desde NOMBRE');
  A(r.ultimos.every((u) => u.fechaIso && u.tipo), 'cada item tiene fechaIso y tipo');
  A(r._ultimaActF instanceof Date && r._ultimaActF.getTime() === new Date('2026-09-01T10:00:00').getTime(),
    'FECHA_ACTUALIZACION máxima preservada como Date');
});

// ─────────────────────────────────────────────────────────────────────────────
// R6/R7 — PERF pasada 10: las listas de campos de los lectores ligeros cubren
// EXACTAMENTE lo que consumen sus funciones (REM normalizador + panel control).
// Una lista incompleta no tira error: silenciosamente vacía campos → los tests
// detectan esa deriva campo a campo.
// ─────────────────────────────────────────────────────────────────────────────
t('R6: _EVENTOS_CAMPOS_REM cubre el input de _rem_normalizarEventos', () => {
  const filas = [
    ['ID_EVENTO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'FECHA_EVENTO', 'TIPO_EVENTO', 'SECTOR', 'RIESGO_G', 'PROFESIONAL', 'DESCRIPCION', 'CANTIDAD', 'OBSERVACIONES'],
    ['EV-1', 'EC-0001', '11111111-1', 'JUAN PÉREZ', '2026-09-05', 'CONTROL', 'NARANJO', 'G2', 'DRA.', 'Consulta', '1', 'nota']
  ];
  const prevHoja = CSP.Modelo_hoja;
  CSP.Modelo_hoja = (nombre) => (nombre === CSP.HOJAS.EVENTOS ? hojaLigeraPara('EVENTOS', filas, 1) : null);
  CSP.Modelo_invalidarLecturas();
  try {
    const norm = CSP._rem_normalizarEventos(CSP.Modelo_leerEventosCampos(CSP._EVENTOS_CAMPOS_REM));
    equalish(norm[0], {
      ID_EVENTO: 'EV-1', ID_INTERNO: 'EC-0001', RUT: '11111111-1', NOMBRE: 'JUAN PÉREZ',
      FECHA_EVENTO: '2026-09-05', TIPO_EVENTO: 'CONTROL', SECTOR: 'NARANJO',
      RIESGO_G: 'G2', PROFESIONAL: 'DRA.', DESCRIPCION: 'Consulta', CANTIDAD: 1
    });
    A(!('OBSERVACIONES' in norm[0]), 'campos fuera del set REM no se materializan');
  } finally {
    CSP.Modelo_hoja = prevHoja;
    CSP.Modelo_invalidarLecturas();
  }
});

t('R7: _CONTROL_CAMPOS_PACIENTES alimenta Control_consultarControles sin perder campos', () => {
  const filas = [
    ['ID_INTERNO', 'NOMBRE', 'RUT', 'SECTOR', 'ESTRATIFICACION', 'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO', 'FECHA_NACIMIENTO', 'REQUIERE_REVISION'],
    ['EC-0001', 'JUAN PÉREZ', '11111111-1', 'NARANJO', 'G2', '2026-01-10', '', '1988-03-12', true],
    ['EC-0002', 'ANA SOTO', '22222222-2', 'AMARILLO', 'G1', '', '', '1995-07-22', false]
  ];
  const prevHoja = CSP.Modelo_hoja;
  // PACIENTES es hoja VISUAL (encabezados en fila 3).
  CSP.Modelo_hoja = (nombre) => (nombre === CSP.HOJAS.PACIENTES ? hojaLigeraPara('PACIENTES', filas, 3) : null);
  CSP.Modelo_invalidarLecturas();
  try {
    const lista = CSP.Modelo_leerPacientesCampos(CSP._CONTROL_CAMPOS_PACIENTES);
    const res = CSP.Control_consultarControles(lista, {}, '2026-09-10', { sector: 'NARANJO' });
    igual(res.total, 1, 'filtro sector NARANJO');
    const f = res.filas[0];
    igual(f.nombre, 'JUAN PÉREZ');
    igual(f.rut, '11111111-1');
    igual(f.sector, 'NARANJO');
    igual(f.estrat, 'G2');
    igual(f.ultimoControl, '2026-01-10');
    igual(f.ultimoSeguimiento, '');
    A(f.edad !== undefined && f.edad !== '', 'edad calculada desde FECHA_NACIMIENTO');
  } finally {
    CSP.Modelo_hoja = prevHoja;
    CSP.Modelo_invalidarLecturas();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\nCONTRATO DE DATOS (S1) — Total: ${R.pass + R.fail + R.skip} · OK: ${R.pass} · FALLAN: ${R.fail} · SKIP: ${R.skip}`);
process.exit(R.fail ? 1 : 0);