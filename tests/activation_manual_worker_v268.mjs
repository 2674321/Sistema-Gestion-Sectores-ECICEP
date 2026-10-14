// v268 — wrapper TEMPORAL para ejecutar `Form_worker_` a mano desde el editor.
// Comprueba que hace exactamente UNA pasada del worker, pide diagnóstico, no
// toca la activación ni el instalador, y emite el prefijo de log esperado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../src/99_ActivacionTemporal.js', import.meta.url), 'utf8');

function entorno(o) {
  o = o || {};
  const L = [];
  const ctx = {
    console: { log: (m) => { L.push('log:' + String(m)); } },
    Form_worker_: () => { L.push('worker'); return o.worker ? o.worker() : { ok: true, filas: 0 }; },
    Form_operativoDiagnosticar_: () => { L.push('diag'); return o.diag ? o.diag() : { ok: true }; },
    Form_operativoInstalar_: () => { L.push('instalar'); return { ok: true }; },
    Form_worker_reset: undefined,
    ECICEP_ACTIVAR_AHORA: () => { L.push('activar'); return { ok: false }; },
    ECICEP_asegurarBackupActivacion_: () => { L.push('backup'); return { ok: true, creado: false }; },
    ECICEP_bootstrapFormProduccion_: () => { L.push('bootstrap'); return { ok: true, creado: false, metodo: 'EXISTING' }; },
    ECICEP_configurarFormProduccion_: () => { L.push('formprod'); return { ok: true }; },
    ECICEP_asegurarFormActivacion_: () => { L.push('formrepair'); return { ok: true, recreado: false }; },
    FormApp: { openById: () => { L.push('openById'); return {}; }, create: () => { L.push('create'); return {}; } }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, L };
}

const cuenta = (L, p) => L.filter((x) => x.indexOf(p) === 0).length;

// 1. Existe y es pública (sin `_` final) para aparecer en el selector de Apps Script.
assert.match(src, /^function ECICEP_EJECUTAR_WORKER_AHORA\(\)/m, 'existe ECICEP_EJECUTAR_WORKER_AHORA');

// 2. UNA sola llamada al worker + diagnóstico, y nada más.
let e = entorno({});
let r = e.ctx.ECICEP_EJECUTAR_WORKER_AHORA();
assert.equal(cuenta(e.L, 'worker'), 1, 'llama a Form_worker_() exactamente una vez');
assert.equal(cuenta(e.L, 'diag'), 1, 'llama a Form_operativoDiagnosticar_()');
assert.deepEqual(e.L, ['worker', 'diag', 'log:ECICEP_WORKER_MANUAL_RESULT {"worker":{"ok":true,"filas":0},"diagnostico":{"ok":true}}'],
  'no invoca activación, instalador, Form ni repairs');

// 3. No llama a ECICEP_ACTIVAR_AHORA ni instala/crea Forms.
assert.equal(cuenta(e.L, 'activar'), 0, 'no ejecuta la activación');
assert.equal(cuenta(e.L, 'instalar'), 0, 'no instala');
assert.equal(cuenta(e.L, 'create'), 0, 'no crea Forms');
assert.equal(cuenta(e.L, 'openById'), 0, 'no abre Forms');
assert.equal(cuenta(e.L, 'bootstrap'), 0, 'no bootstrappea Forms');
assert.equal(cuenta(e.L, 'backup'), 0, 'no repara el trigger de respaldo');

// 4. Prefijo de log y forma del resultado.
assert.ok(cuenta(e.L, 'log:ECICEP_WORKER_MANUAL_RESULT') === 1, 'emite ECICEP_WORKER_MANUAL_RESULT');
assert.deepEqual(JSON.parse(JSON.stringify(r)), { worker: { ok: true, filas: 0 }, diagnostico: { ok: true } });

// 5. La salida natural del worker se conserva (incluye `filas`) sin enriquecerla.
e = entorno({ worker: () => ({ ok: true, filas: 3, detalle: 'cola procesada' }) });
r = e.ctx.ECICEP_EJECUTAR_WORKER_AHORA();
assert.equal(r.worker.filas, 3, 'conserva la salida natural del worker');
assert.equal(r.worker.detalle, 'cola procesada', 'no pierde detalle técnico');

// 6. Fail-closed: excepción del worker o del diagnóstico no rompe el wrapper.
e = entorno({ worker: () => { throw new Error('worker-cae'); } });
r = e.ctx.ECICEP_EJECUTAR_WORKER_AHORA();
assert.equal(r.worker.ok, false);
assert.equal(r.worker.motivo, 'WORKER_EXCEPTION');
assert.ok(cuenta(e.L, 'log:ECICEP_WORKER_MANUAL_RESULT') === 1, 'igual registra el resultado');

e = entorno({ diag: () => { throw new Error('diag-cae'); } });
r = e.ctx.ECICEP_EJECUTAR_WORKER_AHORA();
assert.equal(r.diagnostico.ok, false);
assert.equal(r.diagnostico.motivo, 'DIAGNOSTICO_EXCEPTION');

// 7. El wrapper no invoca directamente lo que debe quedar en privados.
const cuerpo = src.slice(src.indexOf('function ECICEP_EJECUTAR_WORKER_AHORA'));
assert.doesNotMatch(cuerpo, /Form_migrarTrailerLegacy_|Form_legacyReconciliarDryRun_/, 'sin legacy');
assert.doesNotMatch(cuerpo, /FormApp\.|Form_operativoInstalar_|ECICEP_ACTIVAR_AHORA/, 'sin Forms ni instalador');
assert.doesNotMatch(cuerpo, /ScriptApp\.|newTrigger|deleteTrigger/, 'no toca triggers');

console.log('activation_manual_worker_v268: PASS');