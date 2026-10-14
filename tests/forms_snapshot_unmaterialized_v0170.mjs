// v270 (P0 observabilidad) — snapshot del canal activo y respuestas NO
// materializadas. Falla si:
//  · desaparece `Form_canalActivoSnapshot_` o deja de cruzar Form reciente vs
//    la cola `FORM_RESPUESTAS`;
//  · `unmaterialized>0` dentro de una cadencia deja de ser transitorio;
//  · `unmaterialized>0` por > 2 cadencias deja de ser DEGRADED;
//  · el envejecimiento > umbral deja de ser CRITICAL;
//  · la métrica de recepción real se confunde con la de capacidad.
// Sin PII: solo agregados.
import assert from 'node:assert/strict';
import { createHarness255, agregarFila, captureIdDe } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

/** Crea el canal instalado y una respuesta del Form con timestamp controlado,
 *  SIN fila de cola (por defecto) para simular respuesta no materializada. */
function conRespuestaReciente(haceMin) {
  const h = createHarness255();
  h.install();
  const r = h.c.Form_crearRespuestaDesdePayloadWeb_(Object.assign(payloadFor('nuevoIngreso'), {
    rut: '12.345.678-5', nombre: 'PERSONA SECRETA', telefonos: '988888888'
  }));
  const resp = h.form.responses[h.form.responses.length - 1];
  resp.timestamp = new Date(Date.now() - haceMin * 60000);
  return { h, r, resp };
}

// --- A · transitorio: 1 respuesta reciente sin materializar (≤ 1 cadencia) ---
{
  const { h } = conRespuestaReciente(1); // ~1 min: dentro de una cadencia
  const snap = h.c.Form_canalActivoSnapshot_();
  assert.equal(snap.disponible, true, 'snapshot disponible');
  assert.equal(snap.formsResponsesRecent, 1, 'una respuesta reciente');
  assert.equal(snap.materialized, 0, 'nada materializado');
  assert.equal(snap.unmaterialized, 1, 'una sin materializar');
  assert.ok(snap.oldestUnmaterializedMin <= 2, 'edad del pendiente ~1 min');
  const s = h.c.Form_saludOperativa_();
  assert.equal(s.estado, 'OK', 'una cadencia ⇒ transitorio, sin alerta');
  assert.ok(!s.alertas.includes('UNMATERIALIZED_PENDIENTE'));
  assert.ok(!s.alertas.includes('UNMATERIALIZED_ENVEJECIDO'));
  const obs = h.c.Form_operativoEstado_().observabilidad;
  assert.equal(obs.unmaterialized, 1, 'observabilidad.unmaterialized expuesto');
  assert.equal(obs.materialized, 0, 'observabilidad.materialized expuesto');
  assert.equal(obs.formsResponsesRecent, 1, 'observabilidad.formsResponsesRecent expuesto');
  // Sin PII en el snapshot ni en la salud.
  assert.doesNotMatch(JSON.stringify(snap), /SECRETA|12345678|988888888|PERSONA/);
  assert.doesNotMatch(JSON.stringify(s), /SECRETA|12345678|988888888|PERSONA/);
}

// --- B · DEGRADED: sin materializar por > 2 cadencias ---
{
  const { h } = conRespuestaReciente(15); // 15 min > 2*5
  const s = h.c.Form_saludOperativa_();
  assert.equal(s.estado, 'DEGRADED', '> 2 cadencias ⇒ DEGRADED');
  assert.ok(s.alertas.includes('UNMATERIALIZED_PENDIENTE'));
  assert.ok(!s.alertas.includes('UNMATERIALIZED_ENVEJECIDO'));
}

// --- C · CRITICAL: sin materializar con envejecimiento > umbral (180 min) ---
{
  const { h } = conRespuestaReciente(4 * 60); // 4 h
  const s = h.c.Form_saludOperativa_();
  assert.equal(s.estado, 'CRITICAL', 'envejecimiento ⇒ CRITICAL');
  assert.ok(s.alertas.includes('UNMATERIALIZED_ENVEJECIDO'));
  assert.ok(s.observabilidad.oldestUnmaterializedMin >= 180);
}

// --- D · materializada: la fila de cola existe ⇒ no es unmaterialized ---
{
  const h = createHarness255();
  h.install();
  const r = h.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso'));
  agregarFila(h, {
    RESPONSE_ID: captureIdDe(h, r.responseId), CAPTURE_PROVIDER: 'GOOGLE_FORMS',
    TRANSPORT_RESPONSE_ID: r.responseId, ESTADO: 'PROCESADO', FECHA_FORMS: new Date().toISOString()
  });
  const snap = h.c.Form_canalActivoSnapshot_();
  assert.equal(snap.materialized, 1, 'respuesta materializada');
  assert.equal(snap.unmaterialized, 0, 'sin pendientes de materializar');
  const s = h.c.Form_saludOperativa_();
  assert.equal(s.estado, 'OK', 'materializada + terminal ⇒ OK');
  assert.ok(!s.alertas.includes('UNMATERIALIZED_PENDIENTE'));
}

// --- E · capacidad ≠ recepción -------------------------------------------------
{
  const h = createHarness255();
  h.install();
  const m = h.c.Form_metricas_();
  assert.equal(typeof m.installableSubmitSignals, 'number', 'alias semántico de capacidad');
  const panel = h.c.Form_panelOperacion_();
  assert.ok(Number.isInteger(panel.recepciones), 'recepciones sigue siendo entero');
  assert.equal(typeof panel.installableSubmitSignals, 'number', 'panel expone installableSubmitSignals');
  assert.ok(panel.canalActual && 'unmaterialized' in panel.canalActual, 'panel expone unmaterialized');
}

console.log('forms_snapshot_unmaterialized_v0170: PASS');
