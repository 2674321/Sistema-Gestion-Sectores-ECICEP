// v270 (DEC-116) — Captura directa al Form: recepción durable + REVIEW, SIN
// mutación clínica. La Web App es el único canal operativo de captura
// (AGENTS.md reglas 3/4); el Form solo es transporte durable interno y su URL
// no se publica. Un envío sin clientRequestId válido no puede mutar el modelo
// clínico: queda REQUIERE_REVISION para decisión humana.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
assert.equal(h.install().ok, true, 'instalador del harness');
const c = h.c;
// El validador CONTRACTUAL real, no el stub del harness.
c.Captura_v2_validar_ = c.__Captura_v2_validar_real;

const CATALOGO = ['PROFESIONAL UNO', 'PROFESIONAL DOS'];
const FORM_ID = h.form.id;

function ctxMemoria(extra) {
  const registros = new Map();
  const entregas = [];
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
    entregar: (norm) => {
      entregas.push(norm);
      return { estado: 'PROCESADO', idInterno: 'EC-900', idEvento: 'EV-900' };
    },
    aplicarAgenda: () => ({ ok: true }),
    aplicarContacto: () => ({ ok: true }),
    _registros: registros,
    _entregas: entregas
  }, extra || {});
}

const camposNI = {
  RUT: '11.111.111-1', NOMBRE: 'PRUEBA DIRECTA NO REAL', SEXO: 'OTRO',
  FECHA_NACIMIENTO: '1990-05-05', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2',
  FECHA_INGRESO: '2026-10-14', TELEFONOS: '955555444', PROFESIONAL: 'PROFESIONAL UNO',
  OBSERVACIONES: 'PRUEBA DIRECTA NO REAL'
};
function respuesta(accion, campos, responseId) {
  return { formId: FORM_ID, responseId: responseId, timestamp: '2026-10-14T12:00:00.000Z', accion: accion, campos: campos };
}
const ad = c.CapturaIngress_adapterForms_(respuesta('NUEVO_INGRESO', camposNI, 'resp-directo'), { catalogo: CATALOGO, hoy: '2026-10-14' });
assert.equal(ad.ok, true, 'adaptador ok: ' + JSON.stringify(ad.errores || []));

// ---------------------------------------------------------------------------
// 1 · NÚCLEO: `soloRecepcion` persiste y NO ejecuta la entrega clínica.
// ---------------------------------------------------------------------------
{
  const ctx = ctxMemoria({ soloRecepcion: true });
  const r = c.Captura_v2_enviar_(ad.payload, ctx);
  assert.equal(r.ok, true, 'recepción durable aceptada: ' + JSON.stringify(r.errors || []));
  assert.equal(r.data.estado, 'REQUIERE_REVISION', 'estado REQUIERE_REVISION');
  assert.equal(r.data.motivo, 'GOOGLE_FORM_DIRECT_REQUIERE_REVISION', 'motivo explícito');
  assert.equal(ctx._entregas.length, 0, 'SIN mutación clínica: entregar no fue llamado');
  assert.equal(ctx._registros.size, 1, 'registro persistido una vez');
  const reg = ctx._registros.get(ad.captureId);
  assert.equal(reg.estado, 'REQUIERE_REVISION', 'trailer durable en REQUIERE_REVISION');
  assert.equal(reg.motivo, 'GOOGLE_FORM_DIRECT_REQUIERE_REVISION', 'trailer con motivo');
  assert.ok(r.filaFisica, 'filaFisica devuelta para clasificación durable');
}

// ---------------------------------------------------------------------------
// 2 · REGRESIÓN: sin `soloRecepcion` el envío se procesa con normalidad.
// ---------------------------------------------------------------------------
{
  const ctx = ctxMemoria();
  const r = c.Captura_v2_enviar_(ad.payload, ctx);
  assert.equal(r.ok, true, 'envío normal ok: ' + JSON.stringify(r.errors || []));
  assert.equal(r.data.estado, 'PROCESADO', 'estado PROCESADO');
  assert.equal(ctx._entregas.length, 1, 'entrega clínica ejecutada en el flujo normal');
}

// ---------------------------------------------------------------------------
// 3 · FRONTERA FORMS: directo → REVIEW + soloRecepcion; WebApp → TERMINAL.
// ---------------------------------------------------------------------------
const ctxWorker = { catalogo: CATALOGO, leerPacientes: () => [] };
function spyEnviar(record) {
  return (payload, ctxEnvio) => {
    record.push(ctxEnvio);
    return { ok: true, data: { estado: ctxEnvio.soloRecepcion ? 'REQUIERE_REVISION' : 'PROCESADO' } };
  };
}

// 3a · Captura directa al Form (sin clientRequestId → GOOGLE_FORM_DIRECT).
{
  const record = [];
  c.CapturaIngress_enviar_ = spyEnviar(record);
  const r = c.Form_procesarRespuestaConTransporte_(
    respuesta('NUEVO_INGRESO', camposNI, 'r-directo'), ctxWorker,
    { transporte: { clientRequestId: '', source: '' } });
  assert.equal(record.length, 1, 'el pipeline es invocado (recepción durable)');
  assert.equal(record[0].soloRecepcion, true, 'ctx.soloRecepcion propagado al núcleo');
  assert.equal(record[0].source, 'GOOGLE_FORM_DIRECT', 'SOURCE normalizado a GOOGLE_FORM_DIRECT');
  assert.equal(r.ok, false, 'no se declara éxito clínico');
  assert.equal(r.clasificacion, 'REVIEW', 'clasificación REVIEW');
  assert.equal(r.estado, 'REQUIERE_REVISION', 'estado final REQUIERE_REVISION');
  assert.equal(r.errores[0].codigo, 'GOOGLE_FORM_DIRECT_REQUIERE_REVISION', 'código explícito');
}

// 3b · Captura desde la Web App (clientRequestId válido → WEBAPP).
{
  const record = [];
  c.CapturaIngress_enviar_ = spyEnviar(record);
  const cr = 'CR-0123456789abcdef0123456789abcdef';
  const r = c.Form_procesarRespuestaConTransporte_(
    respuesta('NUEVO_INGRESO', camposNI, 'r-web'), ctxWorker,
    { transporte: { clientRequestId: cr, source: 'WEBAPP' } });
  assert.equal(record.length, 1, 'pipeline invocado');
  assert.equal(record[0].soloRecepcion, undefined, 'sin soloRecepcion en el flujo Web App');
  assert.equal(record[0].source, 'WEBAPP', 'SOURCE WEBAPP');
  assert.equal(r.ok, true, 'envío Web App exitoso');
  assert.equal(r.clasificacion, 'TERMINAL', 'flujo normal clasifica TERMINAL');
}

// 3c · El estado resultante es inelegible (no reintenta en bucle).
assert.equal(c.Form_esElegibleCandidato_({ estado: 'REQUIERE_REVISION', clasificacion: '' }), false, 'REQUIERE_REVISION inelegible');
assert.equal(c.Form_esElegibleCandidato_({ estado: '', clasificacion: 'REVIEW' }), false, 'REVIEW inelegible');

// ---------------------------------------------------------------------------
// 4 · GUARDAS ESTÁTICAS
// ---------------------------------------------------------------------------
const captura = fs.readFileSync(new URL('../src/26_Captura.js', import.meta.url), 'utf8');
assert.match(captura, /if \(c\.soloRecepcion\)/, 'el núcleo corta la entrega por soloRecepcion');
const capProc = captura.slice(captura.indexOf('function Captura_v2_enviar_'), captura.indexOf('function Captura_v2_estado_'));
assert.match(capProc, /GOOGLE_FORM_DIRECT_REQUIERE_REVISION/, 'motivo normativo en el núcleo');

const canal = fs.readFileSync(new URL('../src/36_FormsCanal.js', import.meta.url), 'utf8');
const cuerpoProc = canal.slice(canal.indexOf('function Form_procesarRespuestaConTransporte_'), canal.indexOf('function Form_registrarErrorTransporte_'));
assert.match(cuerpoProc, /ctxEnvio\.soloRecepcion = true/, 'soloRecepcion propagado por respuesta');
assert.match(cuerpoProc, /clasificacion: 'REVIEW'/, 'resultado REVIEW para captura directa');
assert.match(cuerpoProc, /soloRecepcionDirecta/, 'la política es explícita y nombrada');

console.log('google_form_direct_review_v0170: PASS');
