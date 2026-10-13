#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHarness255, agregarFila, captureIdDe, respuestaConCampos } from './helpers/forms_v255_harness.mjs';

// LockService presente pero roto: fail-closed y cero mutaciones.
{
  const c = vm.createContext({ JSON, Date, Math });
  vm.runInContext(readFileSync(new URL('../src/01_Utilidades.js', import.meta.url), 'utf8'), c);
  let llamadas = 0;
  c.LockService = { getScriptLock() { throw new Error('LOCK_DOWN'); } };
  const r = c.Ecicep_conLock_(() => { llamadas++; return { ok: true }; });
  assert.equal(r.codigo, 'LOCK_NO_DISPONIBLE');
  assert.equal(r.reintentable, true);
  assert.equal(llamadas, 0);
}

// Worker conserva candidato cuando el operador posee el lock clínico y converge.
{
  const h = createHarness255(); h.install();
  const resp = respuestaConCampos(h, 'nuevoIngreso', 58);
  const cid = captureIdDe(h, resp.getId());
  agregarFila(h, { RESPONSE_ID: cid, CAPTURE_PROVIDER: 'GOOGLE_FORMS',
    TRANSPORT_RESPONSE_ID: resp.id, ESTADO: 'PENDIENTE' });
  h.setLockSequence([true, true, false]); // lease toma; métrica; lock clínico busy
  const primero = h.c.Form_worker_({ max: 1 });
  assert.equal(primero.retryable, 1);
  assert.equal(h.pipelineCalls.length, 0, 'lock busy no entra al pipeline');
  assert.equal(h.processed.size, 0);
  const segundo = h.c.Form_worker_({ max: 1 });
  assert.equal(segundo.procesadas, 1);
  assert.equal(h.pipelineCalls.length, 1);
  assert.equal(h.processed.size, 1);
}

// Dos callers sobre el mismo RUT: el segundo no entra mientras A posee el lock.
{
  const c = vm.createContext({ JSON, Date, Math });
  vm.runInContext(readFileSync(new URL('../src/01_Utilidades.js', import.meta.url), 'utf8'), c);
  let tomado = false, pacientes = 0, eventos = 0;
  c.LockService = { getScriptLock: () => ({
    tryLock() { if (tomado) return false; tomado = true; return true; },
    releaseLock() { tomado = false; }
  }) };
  let b;
  const a = c.Ecicep_conLock_(() => {
    b = c.Ecicep_conLock_(() => { pacientes++; eventos++; return { ok: true }; });
    pacientes++; eventos++; return { ok: true };
  });
  assert.equal(a.ok, true); assert.equal(b.codigo, 'SERVICIO_OCUPADO');
  assert.equal(pacientes, 1); assert.equal(eventos, 1);
}

console.log('preactivation_locking_v258: PASS');
