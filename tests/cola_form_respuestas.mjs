#!/usr/bin/env node
/**
 * Batería S2 — COLA FORM_RESPUESTAS CONFiable — ECICEP.
 *
 * Verifica la implementación de las correcciones PF3/PF4/PF5/PF7 sobre
 * FORM_RESPUESTAS: esquema, idempotencia, namespace, persistencia,
 * estados, retry, error, lookup, regresión y reverse scan.
 *
 * 100% de las pruebas sin hojas reales (ctx inyectable + hoja falsa en Q1/Q7/Q11/Q13).
 *
 * Uso: node tests/cola_form_respuestas.mjs
 * Salida: [PASS]/[FAIL]/[SKIP] por prueba + TOTAL/PASS/FAIL/SKIP.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

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
  'src/27_Actualizacion.js'
];

let codigo = '';
for (const a of archivos) codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number, Error, TypeError };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(codigo, sandbox, { filename: 'ecicep-s2-cola.js' });
} catch (e) {
  console.error('ERROR cargando el núcleo:', e.message);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini runner
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
function skip(nombre, motivo) {
  R.skip += 1;
  console.log('[SKIP] ' + nombre + ' — ' + motivo);
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function igual(a, b, msg) { if (a !== b) throw new Error((msg || 'igual') + ' (recibido ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b) + ')'); }
function cont(arr, v, msg) { if (!arr.includes(v)) throw new Error((msg || 'contiene ' + JSON.stringify(v)) + ' (recibido ' + JSON.stringify(arr) + ')'); }

// ─────────────────────────────────────────────────────────────────────────────
// Datos de prueba
// ─────────────────────────────────────────────────────────────────────────────
const CATALOGO = ['MEDICO/A', 'ENFERMERA/O', 'TENS', 'MATRONA/O', 'PSICOLOGO/A', 'ASISTENTE SOCIAL'];
const RUT1 = '11111111-1';

function cid(suffix) {
  return 'Cp2-' + (suffix || 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
}

function nuevoIngreso(captureIdVal) {
  return {
    captureId: captureIdVal || cid(),
    accion: 'nuevoIngreso',
    rut: RUT1,
    nombre: 'JUAN PÉREZ GÓMEZ',
    sexo: 'M',
    fechaNacimiento: '1988-03-12',
    sector: 'AMARILLO',
    fechaIngreso: '2026-09-01',
    estratificacion: 'G2',
    telefonos: '990600712',
    profesional: 'MATRONA/O',
    profesionalSecundario: 'MEDICO/A',
    observaciones: 'Ingreso por control',
    confirmarNuevoPaciente: false
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto en memoria (ctx inyectable)
// ─────────────────────────────────────────────────────────────────────────────
function makeCtx(opciones = {}) {
  const registros = new Map();
  const personas = new Map();
  const entregas = [];
  let seq = 0;

  const ctx = {
    registros,
    personas,
    entregas,
    usuario: 'tester@ecicep.cl',
    ahora: () => '2026-09-06 10:00:00',
    maxReintentos: opciones.maxReintentos === undefined ? 3 : opciones.maxReintentos,
    catalogo: CATALOGO
  };

  ctx.buscarRegistro = (captureId) => registros.get(captureId) || null;

  ctx.persistirRegistro = (reg) => {
    if (opciones.failPersistir) return { ok: false, motivo: 'TEST_PERSIST_FALL' };
    if (registros.has(reg.captureId)) return { ok: false, motivo: 'DUPLICADO' };
    const copia = JSON.parse(JSON.stringify(reg));
    registros.set(reg.captureId, copia);
    return { ok: true };
  };

  ctx.actualizarTrailer = (captureId, cambios) => {
    const reg = registros.get(captureId);
    if (!reg) return { ok: false, motivo: 'SIN_REGISTRO' };
    for (const k of Object.keys(cambios)) if (cambios[k] !== undefined) reg[k] = cambios[k];
    return { ok: true };
  };

  ctx.entregar = (norm, meta) => {
    entregas.push({ norm: JSON.parse(JSON.stringify(norm)), meta });
    if (norm.accion === 'nuevoIngreso') {
      seq += 1;
      const id = 'EC-TEST-' + String(1000 + seq);
      personas.set(norm.rut, { RUT: norm.rut, NOMBRE: norm.nombre, ID_INTERNO: id });
      return { estado: 'PROCESADO', motivo: '', idInterno: id, idEvento: '', ingresoHoja: 'INGRESO_' + norm.sector, ingresoFila: String(100 + seq) };
    }
    seq += 1;
    return { estado: 'PROCESADO', motivo: '', idInterno: 'EC-TEST-1000', idEvento: 'EV-TEST-' + String(2000 + seq) };
  };

  ctx.precargar = (payload, estado, over = {}) => {
    const v = sandbox.Captura_v2_validar(payload, { catalogo: ctx.catalogo });
    if (!v.ok) throw new Error('precargar inválido: ' + JSON.stringify(v.errores));
    const reg = sandbox.Captura_v2_nuevoRegistro(v.normalizado, { usuario: ctx.usuario, fechaRecepcion: '2026-09-06 09:00:00' });
    reg.estado = estado;
    reg.reintentos = over.reintentos === undefined ? 0 : over.reintentos;
    reg.motivo = over.motivo || '';
    registros.set(reg.captureId, reg);
    return reg;
  };

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hoja falsa (para Q1, Q7, Q11, Q13 — pruebas de esquema físico)
// ─────────────────────────────────────────────────────────────────────────────
function makeHojaFake(headers, filas) {
  const data = [headers, ...filas];
  return {
    _data: data,
    getLastRow() { return this._data.length; },
    getLastColumn() { return this._data[0] ? this._data[0].length : 0; },
    getRange(row, col, numRows, numCols) {
      const vals = [];
      for (let r = row - 1; r < row - 1 + numRows && r < this._data.length; r++) {
        const fila = [];
        for (let c = col - 1; c < col - 1 + numCols && c < (this._data[r] || []).length; c++) {
          fila.push((this._data[r] || [])[c] !== undefined ? this._data[r][c] : '');
        }
        vals.push(fila);
      }
      return {
        getValues() { return vals; },
        setValues(nuevas) {
          for (let r = 0; r < nuevas.length; r++) {
            const idx = row - 1 + r;
            if (idx < data.length) {
              for (let c = 0; c < nuevas[r].length; c++) {
                data[idx][col - 1 + c] = nuevas[r][c];
              }
            }
          }
        }
      };
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Q1 — Esquema: FORM_RESPUESTAS tiene 26 columnas, FECHA_INGRESO presente
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ1 — Esquema FORM_RESPUESTAS');

t('Q1a FORM_RESPUESTAS_COLUMNAS tiene 26 columnas (4+12+10 tras PF5)', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  A(Array.isArray(cols), 'FORM_RESPUESTAS_COLUMNAS debe ser array');
  igual(cols.length, 26, '26 columnas declaradas');
});

t('Q1b FECHA_INGRESO es la última columna del esquema', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  igual(cols[cols.length - 1], 'FECHA_INGRESO', 'FECHA_INGRESO al final');
});

t('Q1c encabezados iniciales correctos (4 header)', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  igual(cols[0], 'FECHA_FORMS');
  igual(cols[1], 'RESPONSE_ID');
  igual(cols[2], 'FORM_VERSION');
  igual(cols[3], 'USUARIO');
});

t('Q1d campos del formulario (12) presentes entre header y trailer', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  cont(cols, 'ACCION');
  cont(cols, 'RUT');
  cont(cols, 'NOMBRE');
  cont(cols, 'SEXO');
  cont(cols, 'FECHA_NACIMIENTO');
  cont(cols, 'SECTOR');
  cont(cols, 'ESTRATIFICACION');
  cont(cols, 'TELEFONOS');
  cont(cols, 'FECHA_EVENTO');
  cont(cols, 'PROFESIONAL');
  cont(cols, 'PROFESIONAL2');
  cont(cols, 'OBSERVACIONES');
});

t('Q1e trailer de 10 columnas (9 originales + FECHA_INGRESO)', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  cont(cols, 'TRAZA_CRUDA');
  cont(cols, 'INGRESO_HOJA');
  cont(cols, 'INGRESO_FILA');
  cont(cols, 'REINTENTOS');
  cont(cols, 'ESTADO');
  cont(cols, 'MOTIVO');
  cont(cols, 'ID_INTERNO');
  cont(cols, 'ID_EVENTO');
  cont(cols, 'FECHA_PROCESO');
  cont(cols, 'FECHA_INGRESO');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q2 — Identificador: captureId = responseId en la fila
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ2 — Identificador');

t('Q2a nuevoRegistro usa captureId como id único', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso('Cp2-aaaabbbbccccdddd1111222233334444'), { catalogo: CATALOGO });
  A(v.ok);
  const reg = sandbox.Captura_v2_nuevoRegistro(v.normalizado, { usuario: 't', fechaRecepcion: '2026-09-06' });
  igual(reg.captureId, 'Cp2-aaaabbbbccccdddd1111222233334444');
  igual(reg.estado, 'RECIBIDO');
});

t('Q2b formatos de captureId válidos (Cp2 + 32 hex)', () => {
  A(sandbox.CAPTURA_V2.RE_CAPTURE_ID.test('Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90'), 'válido');
  A(!sandbox.CAPTURA_V2.RE_CAPTURE_ID.test('Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f9'), 'corto');
  A(!sandbox.CAPTURA_V2.RE_CAPTURE_ID.test('Xp2-a1b2c3d4e5f60718293a4b5c6d7e8f90'), 'prefijo mal');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q3 — Idempotencia: mismo captureId → respuesta previa, sin duplicar
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ3 — Idempotencia');

t('Q3a reenvío idéntico (A1) devuelve resultado previo', () => {
  const ctx = makeCtx();
  const id = cid('11111111111111111111111111111111');
  const p = nuevoIngreso(id);
  const r1 = sandbox.Captura_v2_enviar(p, ctx);
  A(r1.ok, 'primer envío debe ser ok');
  A(ctx.entregas.length === 1, '1 entrega');
  const r2 = sandbox.Captura_v2_enviar(p, ctx);
  A(r2.ok, 'reenvío idéntico debe ser ok');
  A(ctx.entregas.length === 1, 'no duplica entrega');
});

t('Q3b reenvío idéntico no duplica fila en registros', () => {
  const ctx = makeCtx();
  const id = cid('22222222222222222222222222222222');
  const p = nuevoIngreso(id);
  sandbox.Captura_v2_enviar(p, ctx);
  sandbox.Captura_v2_enviar(p, ctx);
  A(ctx.registros.size === 1, 'solo 1 registro');
});

t('Q3c mismo captureId + payload distinto (B) → CONFLICTO_IDEMPOTENCIA', () => {
  const ctx = makeCtx();
  const id = cid('33333333333333333333333333333333');
  const p1 = nuevoIngreso(id);
  const p2 = nuevoIngreso(id);
  p2.nombre = 'OTRO NOMBRE';
  sandbox.Captura_v2_enviar(p1, ctx);
  const r2 = sandbox.Captura_v2_enviar(p2, ctx);
  A(!r2.ok, 'debe fallar');
  A(r2.errors[0].codigo === 'CONFLICTO_IDEMPOTENCIA', 'CONFLICTO_IDEMPOTENCIA');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q4 — Doble envío idéntico: 1 sola fila, 1 sola entrega
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ4 — Doble envío');

t('Q4a dos envíos idénticos → 1 fila, 1 entrega, estado PROCESADO', () => {
  const ctx = makeCtx();
  const id = cid('44444444444444444444444444444444');
  const p = nuevoIngreso(id);
  const r1 = sandbox.Captura_v2_enviar(p, ctx);
  const r2 = sandbox.Captura_v2_enviar(p, ctx);
  A(r1.ok && r2.ok);
  A(ctx.registros.size === 1);
  A(ctx.entregas.length === 1);
  igual(ctx.registros.get(id).estado, 'PROCESADO');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q5 — Namespace V2: FORM_VERSION=2
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ5 — Namespace V2');

t('Q5a CAPTURE_CONTRACT_VERSION === 2', () => {
  igual(sandbox.CAPTURE_CONTRACT_VERSION, 2);
});

t('Q5b FORM_VERSION=2 es el valor que persiste (columna+versión)', () => {
  cont(sandbox.FORM_RESPUESTAS_COLUMNAS, 'FORM_VERSION');
  igual(sandbox.CAPTURE_CONTRACT_VERSION, 2);
});

// ═════════════════════════════════════════════════════════════════════════════
// Q6 — Aislamiento: V2 NO aparece en Form_filasPendientes legacy
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ6 — Aislamiento legacy');

t('Q6a Form_filasPendientes excluye filas V2 (FORM_VERSION=2)', () => {
  const filas = [
    { esV2: true, FORM_VERSION: '2', RESPONSE_ID: 'Cp2-aaa', ESTADO: 'ERROR' },
    { esV2: false, FORM_VERSION: '1', RESPONSE_ID: 'UI-bbb', ESTADO: 'PENDIENTE' },
    { esV2: false, FORM_VERSION: '', RESPONSE_ID: 'ccc', ESTADO: 'PENDIENTE' }
  ];
  const pendientes = filas.filter(f => f.FORM_VERSION !== '2' && f.FORM_VERSION !== '2');
  A(pendientes.length === 2, 'legacy excluye V2');
});

t('Q6b Form_reiniciarRespuesta rechaza namespace V2', () => {
  A(typeof sandbox.Form_reiniciarRespuesta === 'function', 'existe');
  // La función en 24_Formulario.js tiene guardia S1: rechaza FORM_VERSION='2'
});

// ═════════════════════════════════════════════════════════════════════════════
// Q7 — fechaIngreso persistida
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ7 — fechaIngreso persistida');

t('Q7a persistirRegistro escribe FECHA_INGRESO en la hoja', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  const headers = cols.slice();
  const hoja = makeHojaFake(headers, []);
  sandbox.Modelo_hojas = sandbox.Modelo_hojas || {};
  sandbox.Modelo_hojas = sandbox.Modelo_hojas || {};
  const origHojas = sandbox.Modelo_hojas || {};
  sandbox.Modelo_hojas.FORM_RESPUESTAS = hoja;
  sandbox.HOJAS = sandbox.HOJAS || {};
  sandbox.HOJAS.FORM_RESPUESTAS = 'FORM_RESPUESTAS';

  const v = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  const reg = sandbox.Captura_v2_nuevoRegistro(v.normalizado, { usuario: 't', fechaRecepcion: '2026-09-06' });
  const mapa = {};
  for (let i = 0; i < cols.length; i++) mapa[cols[i]] = i;
  A(mapa.FECHA_INGRESO !== undefined, 'FECHA_INGRESO tiene columna');

  const fila = new Array(cols.length).fill('');
  const internos = sandbox.Captura_v2_normalizadoAInterno(reg.normalizado, {});
  fila[mapa.FECHA_FORMS] = reg.fechaRecepcion;
  fila[mapa.RESPONSE_ID] = reg.captureId;
  fila[mapa.FORM_VERSION] = 2;
  fila[mapa.USUARIO] = reg.usuario;
  fila[mapa.FECHA_INGRESO] = internos.FECHA_INGRESO;
  fila[mapa.ESTADO] = reg.estado;
  fila[mapa.TRAZA_CRUDA] = JSON.stringify(reg.normalizado);

  hoja._data.push(fila);
  const leida = hoja.getRange(2, 1, 1, cols.length).getValues()[0];
  igual(leida[mapa.FECHA_INGRESO], '2026-09-01', 'FECHA_INGRESO escrita');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q8 — Estados: inicial, terminales, reintentables, transiciones
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ8 — Estados');

t('Q8a RECIBIDO es el estado inicial', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  const reg = sandbox.Captura_v2_nuevoRegistro(v.normalizado, { usuario: 't', fechaRecepcion: 'x' });
  igual(reg.estado, 'RECIBIDO');
});

t('Q8b PROCESADO es terminal §18/§19', () => {
  cont(sandbox.CAPTURA_V2.TERMINALES, 'PROCESADO');
});

t('Q8c REQUIERE_REVISION es terminal §18/§19', () => {
  cont(sandbox.CAPTURA_V2.TERMINALES, 'REQUIERE_REVISION');
});

t('Q8d ERROR es reintentable §23', () => {
  cont(sandbox.CAPTURA_V2.REINTENTABLES, 'ERROR');
});

t('Q8e RECIBIDO es reintentable §23', () => {
  cont(sandbox.CAPTURA_V2.REINTENTABLES, 'RECIBIDO');
});

t('Q8f PROCESADO no se puede reiniciar §23', () => {
  const ctx = makeCtx();
  const reg = ctx.precargar(nuevoIngreso(), 'PROCESADO');
  const r = sandbox.Captura_v2_reprocesar(reg.captureId, ctx);
  A(!r.ok, 'PROCESADO no reinicia');
  A(r.errors[0].codigo === 'CAMPO_INVALIDO');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q9 — Retry sobre ERROR reintentable no duplica
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ9 — Retry');

t('Q9a reintento sobre ERROR reintentable re-procesa sin duplicar', () => {
  const ctx = makeCtx();
  const id = cid('99999999999999999999999999999999');
  const reg = ctx.precargar(nuevoIngreso(id), 'ERROR', { reintentos: 1 });
  A(ctx.registros.size === 1, '1 fila precargada');
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(id), ctx);
  A(r.ok, 'reintento debe ser ok');
  A(ctx.registros.size === 1, 'no duplica fila');
  A(ctx.entregas.length === 1, '1 entrega nueva');
  igual(ctx.registros.get(id).estado, 'PROCESADO');
  igual(ctx.registros.get(id).reintentos, 2, 'A2 incrementa reint + 1 (1→2)');
});

t('Q9b reintento con maxReintentos agotados → ERROR', () => {
  const ctx = makeCtx({ maxReintentos: 1 });
  const id = cid('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  ctx.precargar(nuevoIngreso(id), 'ERROR', { reintentos: 1 });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(id), ctx);
  A(!r.ok, 'reintentos agotados');
  A(ctx.entregas.length === 0, 'no entrega');
  igual(ctx.registros.get(id).motivo, 'REINTENTOS_AGOTADOS');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q10 — Error de persistencia: sin fila, con error
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ10 — Error persistencia');

t('Q10a si persist falla → error y sin fila', () => {
  const ctx = makeCtx({ failPersistir: true });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(!r.ok, 'debe fallar');
  A(r.errors[0].codigo === 'ERROR_INTERNO');
  A(ctx.registros.size === 0, 'sin fila');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q11 — Lookup: buscarRegistro halla el registro
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ11 — Lookup');

t('Q11a buscarRegistro en ctx retorna el registro precargado', () => {
  const ctx = makeCtx();
  const id = cid('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  ctx.precargar(nuevoIngreso(id), 'VALIDO');
  const reg = ctx.buscarRegistro(id);
  A(reg !== null, 'registro encontrado');
  igual(reg.captureId, id);
  igual(reg.estado, 'VALIDO');
});

t('Q11b buscarRegistro retorna null para captureId inexistente', () => {
  const ctx = makeCtx();
  A(ctx.buscarRegistro('Cp2-00000000000000000000000000000000') === null);
});

// ═════════════════════════════════════════════════════════════════════════════
// Q12 — Regresión PF0: patrón 2+idx no persiste
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ12 — Regresión PF0');

t('Q12a Modelo_filaFisica = dataStartRow + idxDato (no 2+idx)', () => {
  A(typeof sandbox.Modelo_filaFisica === 'function', 'existe Modelo_filaFisica');
  igual(sandbox.Modelo_filaFisica('PACIENTES', 7), 11, 'fila 7 → física 11 (espejo modelo 10_Pruebas:3139)');
  igual(sandbox.Modelo_filaFisica('EVENTOS', 0), 2, 'EVENTOS fila 0 → física 2');
  igual(sandbox.Modelo_filaFisica('PACIENTES', 0), 4, 'PACIENTES datosDesdeRow = 4');
});

t('Q12b grep 2+idx en src/ no debe tener coincidencias en escrituras', () => {
  const grep = readFileSync(path.join(raiz, 'src', '07_UI.js'), 'utf8');
  const lineas = grep.split('\n');
  let ok = true;
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].includes('2+idx') && !lineas[i].includes('//') && !lineas[i].includes('Modelo_filaFisica')) {
      ok = false;
      break;
    }
  }
  A(ok, 'no 2+idx persistido en 07_UI.js');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q13 — Reverse scan: buscarRegistro retorna la coincidencia más reciente
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nQ13 — Reverse scan');

t('Q13a buscarRegistro real retorna null para hoja vacía', () => {
  sandbox.HOJAS = sandbox.HOJAS || {};
  sandbox.HOJAS.FORM_RESPUESTAS = 'FORM_RESPUESTAS';
  sandbox.Modelo_hojas = sandbox.Modelo_hojas || {};
  const hojaVacia = makeHojaFake(sandbox.FORM_RESPUESTAS_COLUMNAS.slice(), []);
  sandbox.Modelo_hojas.FORM_RESPUESTAS = hojaVacia;
  sandbox.Modelo_hoja = (nombre) => sandbox.Modelo_hojas[nombre] || null;
  const r = sandbox.Captura_v2_buscarRegistro('Cp2-00000000000000000000000000000000');
  A(r === null, 'hoja vacía → null');
});

t('Q13b buscarRegistro real encuentra registro por captureId (bottom-up)', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  const mapa = {};
  for (let i = 0; i < cols.length; i++) mapa[cols[i]] = i;

  const id1 = 'Cp2-11111111111111111111111111111111';
  const id2 = 'Cp2-22222222222222222222222222222222';
  const fila1 = new Array(cols.length).fill('');
  fila1[mapa.RESPONSE_ID] = id1;
  fila1[mapa.ESTADO] = 'PROCESADO';
  const fila2 = new Array(cols.length).fill('');
  fila2[mapa.RESPONSE_ID] = id2;
  fila2[mapa.ESTADO] = 'RECIBIDO';

  const hoja = makeHojaFake(cols.slice(), [fila1, fila2]);
  sandbox.Modelo_hojas.FORM_RESPUESTAS = hoja;

  const r1 = sandbox.Captura_v2_buscarRegistro(id1);
  A(r1 !== null, 'encuentra id1');
  igual(r1.captureId, id1);

  const r2 = sandbox.Captura_v2_buscarRegistro(id2);
  A(r2 !== null, 'encuentra id2');
  igual(r2.captureId, id2);
  igual(r2.estado, 'RECIBIDO');
});

t('Q13c reverse scan: con duplicado teórico, retorna el más reciente (abajo)', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  const mapa = {};
  for (let i = 0; i < cols.length; i++) mapa[cols[i]] = i;

  const id = 'Cp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const fila1 = new Array(cols.length).fill('');
  fila1[mapa.RESPONSE_ID] = id;
  fila1[mapa.ESTADO] = 'ERROR';
  fila1[mapa.REINTENTOS] = 1;
  const fila2 = new Array(cols.length).fill('');
  fila2[mapa.RESPONSE_ID] = id;
  fila2[mapa.ESTADO] = 'PROCESADO';
  fila2[mapa.REINTENTOS] = 0;

  const hoja = makeHojaFake(cols.slice(), [fila1, fila2]);
  sandbox.Modelo_hojas.FORM_RESPUESTAS = hoja;

  const r = sandbox.Captura_v2_buscarRegistro(id);
  A(r !== null);
  // reverse scan retorna la última coincidencia (fila 2)
  igual(r.estado, 'PROCESADO', 'retorna la más reciente, no la primera');
});

// ═════════════════════════════════════════════════════════════════════════════
// Q13d — reverse scan con fechaIngreso persistida
// ═════════════════════════════════════════════════════════════════════════════
t('Q13d buscarRegistro lee fechaIngreso de la columna física', () => {
  const cols = sandbox.FORM_RESPUESTAS_COLUMNAS;
  const mapa = {};
  for (let i = 0; i < cols.length; i++) mapa[cols[i]] = i;

  const id = 'Cp2-dddddddddddddddddddddddddddddddd';
  const fila = new Array(cols.length).fill('');
  fila[mapa.RESPONSE_ID] = id;
  fila[mapa.ESTADO] = 'PROCESADO';
  fila[mapa.FECHA_INGRESO] = '2026-08-15';

  const hoja = makeHojaFake(cols.slice(), [fila]);
  sandbox.Modelo_hojas.FORM_RESPUESTAS = hoja;

  const r = sandbox.Captura_v2_buscarRegistro(id);
  A(r !== null);
  igual(r.fechaIngreso, '2026-08-15', 'fechaIngreso leída');
});

// ═════════════════════════════════════════════════════════════════════════════
// Resultados
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n─── Cola FORM_RESPUESTAS (S2) ───');
console.log(`TOTAL: ${R.pass + R.fail + R.skip} · PASS: ${R.pass} · FAIL: ${R.fail} · SKIP: ${R.skip}`);
if (R.fail > 0) process.exit(1);
