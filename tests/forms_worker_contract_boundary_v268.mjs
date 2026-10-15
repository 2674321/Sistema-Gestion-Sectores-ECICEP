// v268 — frontera de contrato Web→Forms→pipeline.
// El adaptador NO debe devolver `v.normalizado` (forma interna con claves por
// defecto) como payload externo: la segunda validación de Captura_v2_enviar_
// rechazaba lo que la primera ya había validado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHarness255, captureIdDe } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
assert.equal(h.install().ok, true, 'instalador del harness');
const c = h.c;

// Este test usa el validador CONTRACTUAL real, no el stub del harness: el stub
// (p => {ok:true}) es justamente lo que ocultaba la doble validación.
assert.equal(typeof c.__Captura_v2_validar_real, 'function', 'validador real disponible');
c.Captura_v2_validar_ = c.__Captura_v2_validar_real;

const CATALOGO = ['PROFESIONAL UNO', 'PROFESIONAL DOS'];
const FORM_ID = h.form.id;

function ctxMemoria() {
  const registros = new Map();
  const base = c.Captura_v2_ctx_('tok') || {};
  return Object.assign({}, base, {
    usuario: 'tester@ecicep.cl',
    ahora: () => '2026-10-14 12:00:00',
    maxReintentos: 3,
    catalogo: CATALOGO,
    buscarRegistro: (cid) => registros.get(cid) || null,
    persistirRegistro: (reg) => {
      if (registros.has(reg.captureId)) return { ok: false, motivo: 'DUPLICADO' };
      registros.set(reg.captureId, JSON.parse(JSON.stringify(reg)));
      return { ok: true, filaFisica: registros.size + 1 };
    },
    actualizarTrailer: (cid, cambios) => {
      const reg = registros.get(cid);
      if (!reg) return { ok: false, motivo: 'SIN_REGISTRO' };
      Object.assign(reg, cambios);
      return { ok: true };
    },
    // Entrega clínica controlada: este test verifica la FRONTERA DE CONTRATO,
    // no la escritura clínica en PACIENTES/EVENTOS.
    entregar: () => ({ estado: 'PROCESADO', idInterno: 'EC-900', idEvento: 'EV-900' }),
    aplicarAgenda: () => ({ ok: true }),
    aplicarContacto: () => ({ ok: true }),
    _registros: registros
  });
}

function permitidoEn(campo, accion) {
  const m = c.CAPTURA_V2.MATRIZ[campo];
  if (!m) return false;
  return m.REQ.indexOf(accion) >= 0 || m.OPC.indexOf(accion) >= 0;
}

function soloClavesContractuales(payload, accion, etiqueta) {
  Object.keys(payload).forEach((k) => {
    if (k === 'captureId' || k === 'accion') return;
    assert.ok(permitidoEn(k, accion), etiqueta + ': clave fuera del contrato -> ' + k);
  });
}

function respuesta(accion, campos, responseId) {
  return { formId: FORM_ID, responseId: responseId, timestamp: '2026-10-14T12:00:00.000Z', accion: accion, campos: campos };
}

// ---------------------------------------------------------------------------
// CASO NUEVO_INGRESO (el que fallo en produccion)
// ---------------------------------------------------------------------------

const camposNI = {
  RUT: '11.111.111-1', NOMBRE: 'PRUEBA E2E V267 NO REAL', SEXO: 'OTRO',
  FECHA_NACIMIENTO: '1990-05-05', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2',
  FECHA_INGRESO: '2026-10-14', TELEFONOS: '955555444', PROFESIONAL: 'PROFESIONAL UNO',
  OBSERVACIONES: 'PRUEBA E2E V267 NO REAL'
};

const ad = c.CapturaIngress_adapterForms_(respuesta('NUEVO_INGRESO', camposNI, 'resp-ni'), { catalogo: CATALOGO, hoy: '2026-10-14' });
assert.equal(ad.ok, true, 'adaptador ok: ' + JSON.stringify(ad.errores || []));
assert.equal(ad.payload.accion, 'nuevoIngreso');
assert.equal(ad.payload.telefonoObs, undefined, 'telefonoObs no cruza la frontera');
assert.equal(ad.payload.fechaEvento, undefined, 'fechaEvento no cruza la frontera');
assert.equal(ad.payload.actualizacion, undefined, 'actualizacion no cruza la frontera');
soloClavesContractuales(ad.payload, 'nuevoIngreso', 'nuevoIngreso');

// Segunda validacion: la que rechazaba en produccion.
const v = c.Captura_v2_validar_(ad.payload, { catalogo: CATALOGO });
assert.equal(v.ok, true, 'validacion repetida ok: ' + JSON.stringify(v.errores || []));

// Envio real con contexto in-memory.
const ctx = ctxMemoria();
const res = c.Captura_v2_enviar_(ad.payload, ctx);
const errs = JSON.stringify(res.errors || []);
assert.equal(res.ok, true, 'envio aceptado: ' + errs);
assert.doesNotMatch(errs, /CAMPO_DESCONOCIDO/, 'sin CAMPO_DESCONOCIDO telefonoObs');
assert.doesNotMatch(errs, /CAMPO_NO_PERMITIDO/, 'sin CAMPO_NO_PERMITIDO fechaEvento/actualizacion');
assert.doesNotMatch(errs, /telefonoObs/, 'sin referencias a telefonoObs');

// ---------------------------------------------------------------------------
// CASOS EQUIVALENTES DE LAS OTRAS TRES ACCIONES
// ---------------------------------------------------------------------------

const CASOS = [
  {
    accion: 'REGISTRAR_CONTROL',
    contrato: 'registrarControl',
    campos: { RUT: '11.111.111-1', FECHA_EVENTO: '2026-10-14', PROFESIONAL: 'PROFESIONAL UNO', OBSERVACIONES: 'ctrl' }
  },
  {
    accion: 'REGISTRAR_SEGUIMIENTO',
    contrato: 'registrarSeguimiento',
    campos: { RUT: '11.111.111-1', FECHA_EVENTO: '2026-10-14', PROFESIONAL: 'PROFESIONAL DOS', OBSERVACIONES: 'seg' }
  },
  {
    // RUT con ficha vigente en el harness: actualizarDatos exige lectura real.
    accion: 'ACTUALIZAR_DATOS',
    contrato: 'actualizarDatos',
    campos: { RUT: '12345678-5', PROFESIONAL: 'PROFESIONAL UNO', TELEFONOS: '955555444', OBSERVACIONES: 'act' }
  }
];

for (const caso of CASOS) {
  const a = c.CapturaIngress_adapterForms_(respuesta(caso.accion, caso.campos, 'resp-' + caso.contrato), { catalogo: CATALOGO, hoy: '2026-10-14' });
  assert.equal(a.ok, true, caso.contrato + ' adaptador: ' + JSON.stringify(a.errores || []));
  assert.equal(a.payload.accion, caso.contrato);
  assert.equal(a.payload.telefonoObs, undefined, caso.contrato + ': telefonoObs ausente');
  soloClavesContractuales(a.payload, caso.contrato, caso.contrato);
  const vv = c.Captura_v2_validar_(a.payload, { catalogo: CATALOGO });
  assert.equal(vv.ok, true, caso.contrato + ' validacion: ' + JSON.stringify(vv.errores || []));
  const rr = c.Captura_v2_enviar_(a.payload, ctxMemoria());
  const e = JSON.stringify(rr.errors || []);
  assert.equal(rr.ok, true, caso.contrato + ' envio: ' + e);
  assert.doesNotMatch(e, /CAMPO_DESCONOCIDO|CAMPO_NO_PERMITIDO/, caso.contrato + ': sin errores de contrato');
}

// ---------------------------------------------------------------------------
// LA METADATA NO ES CAMPO CLINICO
// ---------------------------------------------------------------------------

const reg = ctx._registros.get(ad.captureId);
assert.ok(reg, 'registro persistido');
assert.equal(reg.clientRequestId, '', 'clientRequestId por defecto vacio');
assert.equal(reg.source, '', 'source por defecto vacio');
assert.equal(c.CAPTURA_V2.CAMPOS.clientRequestId, undefined, 'clientRequestId no es campo clinico');
assert.equal(c.CAPTURA_V2.CAMPOS.source, undefined, 'source no es campo clinico');
assert.doesNotMatch(JSON.stringify(reg.normalizado), /clientRequestId|"source"/, 'normalizado sin metadata de transporte');

// ---------------------------------------------------------------------------
// PERSISTENCIA DE LA METADATA DE TRANSPORTE EN FORM_RESPUESTAS
// ---------------------------------------------------------------------------

// El harness del canal no carga 06_Modelo.js; se carga aqui (solo en este
// contexto de prueba) para ejercitar la persistencia real contra la hoja.
vm.runInContext(fs.readFileSync(new URL('../src/06_Modelo.js', import.meta.url), 'utf8'), c, { filename: '06_Modelo.js' });
assert.equal(typeof c.Modelo_hoja_, 'function', 'capa de modelo disponible');

function persistirConTransporte(opts, responseId) {
  const capturable = {
    captureId: captureIdDe(h, responseId), accion: 'nuevoIngreso',
    rut: '11.111.111-1', profesional: 'PROFESIONAL UNO',
    nombre: 'PRUEBA TRAZA V268', sexo: 'OTRO', fechaNacimiento: '1990-05-05',
    sector: 'AMARILLO', fechaIngreso: '2026-10-14'
  };
  const v = c.Captura_v2_validar_(capturable, { catalogo: CATALOGO });
  assert.equal(v.ok, true, 'payload de registro valido: ' + JSON.stringify(v.errores || []));
  const nuevo = c.Captura_v2_nuevoRegistro_(v.normalizado,
    Object.assign({ usuario: 'tester@ecicep.cl', fechaRecepcion: '2026-10-14 12:00:00' }, opts));
  const r = c.Captura_v2_persistirRegistro_(nuevo);
  assert.equal(r.ok, true, 'registro persistido: ' + JSON.stringify(r));
  return h.dataSheet.rows[h.dataSheet.rows.length - 1];
}

// Captura creada desde CapturaWeb (tiene clientRequestId).
const crWeb = 'CR-0123456789abcdef0123456789abcdef';
let fila = persistirConTransporte({
  captureProvider: 'GOOGLE_FORMS', transportId: 'resp-web-1',
  clientRequestId: crWeb, source: 'WEBAPP'
}, 'resp-web-1');
assert.equal(fila[h.colIndex('CAPTURE_PROVIDER')], 'GOOGLE_FORMS', 'CAPTURE_PROVIDER');
assert.equal(fila[h.colIndex('TRANSPORT_RESPONSE_ID')], 'resp-web-1', 'TRANSPORT_RESPONSE_ID = responseId del Form');
assert.equal(fila[h.colIndex('CLIENT_REQUEST_ID')], crWeb, 'CLIENT_REQUEST_ID persistido');
assert.equal(fila[h.colIndex('SOURCE')], 'WEBAPP', 'SOURCE = WEBAPP');

// Captura directa al Form (sin clientRequestId).
fila = persistirConTransporte({
  captureProvider: 'GOOGLE_FORMS', transportId: 'resp-directo-1',
  clientRequestId: '', source: 'GOOGLE_FORM_DIRECT'
}, 'resp-directo-1');
assert.equal(fila[h.colIndex('TRANSPORT_RESPONSE_ID')], 'resp-directo-1', 'TRANSPORT_RESPONSE_ID directo');
assert.equal(fila[h.colIndex('CLIENT_REQUEST_ID')], '', 'CLIENT_REQUEST_ID vacio');
assert.equal(fila[h.colIndex('SOURCE')], 'GOOGLE_FORM_DIRECT', 'SOURCE = GOOGLE_FORM_DIRECT');

// La metadata NO entra a la traza clinica.
const traza = fila[h.colIndex('TRAZA_CRUDA')] || '';
assert.doesNotMatch(traza, /CLIENT_REQUEST_ID|GOOGLE_FORM_DIRECT|TRANSPORT_/, 'TRAZA_CRUDA sin metadata de transporte');

// ---------------------------------------------------------------------------
// GUARDAS ESTATICAS
// ---------------------------------------------------------------------------

const ingesta = fs.readFileSync(new URL('../src/30_Ingesta.js', import.meta.url), 'utf8');
const cuerpoAdapter = ingesta.slice(
  ingesta.indexOf('function CapturaIngress_adapterForms_'),
  ingesta.indexOf('function CapturaIngress_edicionDesdeForma_')
);
assert.doesNotMatch(cuerpoAdapter, /payload\s*=\s*v\.normalizado/, 'el adaptador NO devuelve v.normalizado');
assert.match(cuerpoAdapter, /Captura_v2_validar_\(payload/, 'conserva la validacion anticipada');
assert.equal((cuerpoAdapter.match(/Captura_v2_validar_\(/g) || []).length, 1, 'una sola validacion en el adaptador');

const canal = fs.readFileSync(new URL('../src/36_FormsCanal.js', import.meta.url), 'utf8');
const cuerpoProc = canal.slice(canal.indexOf('function Form_procesarRespuestaConTransporte_'));
assert.match(cuerpoProc, /ctxEnvio\.transportId = responseId/, 'transportId por respuesta');
assert.match(cuerpoProc, /ctxEnvio\.clientRequestId = requestId/, 'clientRequestId propagado');
assert.match(cuerpoProc, /ctxEnvio\.source = sourceNormalizado/, 'source propagado');
assert.match(cuerpoProc, /filaFisica: filaFisicaNueva/, 'filaFisica resuelta tras persistir');

const cuerpoWorker = canal.slice(canal.indexOf('function Form_worker_'));
assert.match(cuerpoWorker, /estadoPrev\.filaFisica\)\s*\|\|\s*r\.filaFisica/, 'el worker usa la fila resuelta');

console.log('forms_worker_contract_boundary_v268: PASS');