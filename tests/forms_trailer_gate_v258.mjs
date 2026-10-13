#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHarness255, agregarFila, captureIdDe, respuestaConCampos } from './helpers/forms_v255_harness.mjs';

for (const rama of ['PROCESSED', 'REVIEW', 'TERMINAL', 'RETRYABLE']) {
  const h = createHarness255(); h.install();
  const resp = respuestaConCampos(h, 'nuevoIngreso', rama.length);
  const cid = captureIdDe(h, resp.getId());
  agregarFila(h, { RESPONSE_ID: cid, CAPTURE_PROVIDER: 'GOOGLE_FORMS',
    TRANSPORT_RESPONSE_ID: resp.id, ESTADO: 'PENDIENTE' });
  h.props.set('GOOGLE_FORM_CURSOR', '2026-01-01T00:00:00.000Z');
  let llamadas = 0;
  h.c.Form_procesarRespuestaConTransporte_ = () => {
    llamadas++;
    if (rama === 'PROCESSED') return { ok: true, responseId: resp.getId(), captureId: cid, clasificacion: 'TERMINAL' };
    return { ok: false, responseId: resp.getId(), captureId: cid,
      clasificacion: rama, errores: [{ codigo: 'CASO_' + rama }] };
  };
  const real = h.c.Form_escribirClasificacionTrailer_;
  let falla = true, exitos = 0;
  h.c.Form_escribirClasificacionTrailer_ = (...args) => {
    if (falla) { falla = false; return { ok: false, motivo: 'SHEETS_DOWN' }; }
    exitos++; return real(...args);
  };
  const primero = h.c.Form_worker_({ max: 1 });
  assert.equal(primero.retryable, 1, rama);
  assert.equal(primero.filas[0].errores[0].codigo, 'TRAILER_WRITE_FAILED', rama);
  assert.equal(h.props.get('GOOGLE_FORM_CURSOR'), '2026-01-01T00:00:00.000Z', rama + ': cursor seguro');
  const segundo = h.c.Form_worker_({ max: 1 });
  assert.equal(exitos, 1, rama + ': clasificación persistida una vez al volver Sheets');
  if (rama === 'RETRYABLE') {
    h.c.Form_procesarRespuestaConTransporte_ = () => ({ ok: true, responseId: resp.getId(), captureId: cid, clasificacion: 'TERMINAL' });
    const tercero = h.c.Form_worker_({ max: 1 });
    assert.equal(tercero.procesadas, 1, 'retryable converge');
  } else if (rama === 'PROCESSED') assert.equal(segundo.procesadas, 1);
  else assert.equal(segundo[rama.toLowerCase()], 1);
  assert.ok(llamadas >= 2);
}

console.log('forms_trailer_gate_v258: PASS');
