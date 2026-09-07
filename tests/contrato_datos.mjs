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
sandbox.Session = { getActiveUser: function () { return { getEmail: function () { return 'test@ecicep.cl'; } }; } };
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

t('C4/R2: api_patologiasGuardar escribe (ambas escrituras) en Modelo_filaFisica', () => {
  const a = arnesActivo();
  try {
    const r = CSP.api_patologiasGuardar('EC-0002', [], '');
    A(r.ok, 'ok: ' + JSON.stringify(r));
    const filas = filasPacientes(a.hojaP);
    igual(filas.length, 2, 'dos escrituras (condiciones + estratificación)');
    igual(filas[0], 5, 'primera escritura fila física 5');
    igual(filas[1], 5, 'segunda escritura fila física 5 (mismo paciente)');
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
// Resumen
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\nCONTRATO DE DATOS (S1) — Total: ${R.pass + R.fail + R.skip} · OK: ${R.pass} · FALLAN: ${R.fail} · SKIP: ${R.skip}`);
process.exit(R.fail ? 1 : 0);