// v256 (P0/P1) — semántica de fallos de infraestructura del canal Forms.
// Prueba COMPORTAMIENTO REAL (fallos inyectados por spies), no texto:
//  · #2  NO_ENCONTRADO jamás por error técnico → INCIERTO.
//  · #2  una fila ilegible no convierte toda la búsqueda en ausencia.
//  · #6  cola no legible ≠ "todos elegibles".
//  · #8  eliminado el registro de errores por captura (trailer autoritativo).
//  · #9  el trigger onFormSubmit NO toma lock clínico.
//  · #10 no persistir trailer cuando faltan columnas es un fallo REAL.
//  · #13 GC acotado de respaldos del instalador.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHarness255, agregarFila } from './helpers/forms_v255_harness.mjs';

const CID = 'CR-' + 'b'.repeat(32);

function seccion(titulo) { console.log('  · ' + titulo); }

// --- #2 · verificarRecepcion: fallo técnico ⇒ INCIERTO (nunca NO_ENCONTRADO)
{
  const h = createHarness255();
  h.install();
  h.c.FormApp.openById = () => { throw new Error('FORM_NO_ACCESIBLE'); };
  const r1 = h.c.WebApp_verificarRecepcion(CID);
  assert.equal(r1.estado, 'INCIERTO', 'Form inaccesible ⇒ INCIERTO');
  assert.equal(r1.incierto, true);
  assert.notEqual(r1.estado, 'NO_ENCONTRADO');
  seccion('Form inaccesible ⇒ INCIERTO');
}

// --- #2/#7 · getResponses() falla ⇒ INCIERTO; fila ilegible no invalida todo
{
  const h = createHarness255();
  h.install();
  const original = h.form.getResponses.bind(h.form);
  h.form.getResponses = () => { throw new Error('RESPONSES_READ_FAILED'); };
  const r = h.c.WebApp_verificarRecepcion(CID);
  assert.equal(r.estado, 'INCIERTO', 'getResponses throws ⇒ INCIERTO');
  assert.equal(r.codigo, 'FORM_RESPONSES_READ_FAILED');
  h.form.getResponses = original;

  const valida = h.c.Form_crearRespuestaDesdePayloadWeb_({
    accion: 'nuevoIngreso', rut: '12.345.678-5', profesional: 'PROFESIONAL UNO',
    nombre: 'PERSONA 0', sexo: 'F', fechaNacimiento: '1980-01-02', sector: 'AMARILLO',
    fechaIngreso: '2026-10-12', estratificacion: 'G2', saludMental: 'NO',
    telefonos: '999999999', proximoControl: '2026-11-05', clientRequestId: CID
  });
  assert.equal(valida.ok, true);
  const respValida = h.form.responses[h.form.responses.length - 1];
  const defectuosa = { getItemResponses() { throw new Error('ITEM_READ'); }, getId() { return 'resp-bad'; }, timestamp: new Date() };
  h.form.responses = [defectuosa, respValida];
  const out = h.c.Form_requestIdRecuperarRespuesta_(CID);
  assert.equal(out.estado, 'RECIBIDO', 'coincidencia válida hallada pese a fila ilegible');
  assert.equal(out.responseId, respValida.getId());
  seccion('getResponses throws ⇒ INCIERTO; fila ilegible se omite');
}

// --- #6 · cola no legible ⇒ ok:false (worker no asume "todo elegible")
{
  const h = createHarness255();
  agregarFila(h, { RESPONSE_ID: 'resp-a', ESTADO: 'PENDIENTE' });
  const sheet = h.dataSheet;
  const realGetRange = sheet.getRange.bind(sheet);
  sheet.getRange = () => { throw new Error('SHEET_READ_FAILED'); };
  const r = h.c.Form_leerEstadosCola_();
  assert.equal(r.ok, false, 'lectura de cola fallida ⇒ ok:false');
  assert.equal(r.motivo, 'QUEUE_STATE_READ_FAILED');
  sheet.getRange = realGetRange;
  const ok = h.c.Form_leerEstadosCola_();
  assert.equal(ok.ok, true, 'lectura sana ⇒ ok:true');
  seccion('cola ilegible ⇒ QUEUE_STATE_READ_FAILED');
}

// --- #8 · registrarErrorTransporte es NO-OP; no crea ScriptProperties
{
  const h = createHarness255();
  h.install();
  const r = h.c.Form_registrarErrorTransporte_('Cp4-' + 'a'.repeat(32), [{ codigo: 'X' }]);
  assert.equal(r.ok, true);
  assert.equal(r.omitido, true);
  assert.equal(r.motivo, 'TRAILER_ES_AUTORITATIVO');
  const restantes = Array.from(h.props.keys()).filter(k => String(k).indexOf('GOOGLE_FORM_ERRORS|') === 0);
  assert.equal(restantes.length, 0, 'sin ScriptProperties GOOGLE_FORM_ERRORS|<captureId>');
  seccion('registrarErrorTransporte es NO-OP');
}

// --- #9 · trigger onFormSubmit lock-free + contador de señal
{
  const h = createHarness255();
  h.install();
  const antes = h.lockCalls;
  const resp = h.form.createResponse().submit();
  const r = h.c.Form_onFormSubmit_({ response: resp });
  assert.equal(r.ok, true);
  assert.equal(h.lockCalls, antes, 'onFormSubmit no toma lock clínico');
  const cnt = Number(h.c.Form_propLeer_('GOOGLE_FORM_METRIC_SUBMIT_SIGNAL_COUNT') || 0);
  assert.ok(cnt >= 1, 'contador de señal incrementado sin lock');
  seccion('trigger lock-free + contador');
}

// --- #10 · faltan columnas del trailer ⇒ fallo REAL (no "omitido")
{
  const h = createHarness255();
  h.install();
  agregarFila(h, { RESPONSE_ID: 'resp-x', ESTADO: 'PENDIENTE' });
  const sheet = h.dataSheet;
  sheet.headers = sheet.headers.filter(c => c !== 'CLASIFICACION' && c !== 'TRANSPORTE_ERROR');
  sheet.getRange = (row, col, nr, nc) => ({
    getValues: () => {
      const out = [];
      for (let r = 0; r < nr; r++) {
        const rr = (row - 1) + r;
        const src = rr === 0 ? sheet.headers : (sheet.rows[rr - 1] || []);
        out.push(Array.from({ length: nc }, (_, c) => src[col - 1 + c] === undefined ? '' : src[col - 1 + c]));
      }
      return out;
    },
    setValues(v) { if (row - 1 === 0) sheet.headers = v[0].slice(); return this; }
  });
  const r = h.c.Form_escribirClasificacionTrailer_(2, 'REVIEW', [{ codigo: 'X' }]);
  assert.equal(r.ok, false, 'columnas ausentes ⇒ fallo real');
  assert.equal(r.motivo, 'COLUMNAS_AUSENTES');
  seccion('trailer sin columnas ⇒ COLUMNAS_AUSENTES');
}

// --- #13 · GC acotado de ECICEP_INST_BK|<ejecucion>
{
  const c = vm.createContext({ console, JSON, Date, Math, Object, String, Number, Array, RegExp });
  vm.runInContext(readFileSync(new URL('../src/01_Utilidades.js', import.meta.url), 'utf8'), c, { filename: '01_Utilidades.js' });
  vm.runInContext(readFileSync(new URL('../src/20_Instalador.js', import.meta.url), 'utf8'), c, { filename: '20_Instalador.js' });
  const store = new Map();
  c.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => store.get(k) || '',
    setProperty: (k, v) => { store.set(String(k), String(v)); },
    getKeys: () => Array.from(store.keys()),
    deleteProperty: k => { store.delete(String(k)); }
  }) };
  c.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) };
  assert.equal(typeof c.Instalar_bkRegistrarYGc_, 'function');
  assert.ok(c.INSTALAR_BK_GC_MAX > 0);
  for (let i = 0; i < 12; i++) {
    c.PropertiesService.getScriptProperties().setProperty('ECICEP_INST_BK|e' + i, 'bk' + i);
    c.Instalar_bkRegistrarYGc_('ECICEP_INST_BK|e' + i);
  }
  const restantes = c.PropertiesService.getScriptProperties().getKeys()
    .filter(k => k.indexOf('ECICEP_INST_BK|') === 0);
  assert.ok(restantes.length <= c.INSTALAR_BK_GC_MAX,
    'GC acota claves huérfanas (≤' + c.INSTALAR_BK_GC_MAX + '), hay ' + restantes.length);
  assert.ok(restantes.includes('ECICEP_INST_BK|e11'), 'se conserva la más reciente');
  assert.ok(!restantes.includes('ECICEP_INST_BK|e0'), 'se purga la más antigua');
  seccion('GC acota ECICEP_INST_BK| a las últimas N');
}

console.log('forms_v256_failure_semantics: PASS');
