import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const s = fs.readFileSync(new URL('../src/38_Release.js', import.meta.url), 'utf8');
const body = s.slice(s.indexOf('function Operacion_preflightBloqueosNoReparables_'));
assert.doesNotMatch(body, /clasp\s|newDeployment|updateDeployment/i, 'el asistente no publica');
for (const fn of ['UI_formCanalAdoptarId_', 'UI_formCanalCrearNuevoSeguro_', 'UI_operadorConfigurarClaveActivacion_'])
  assert.match(s, new RegExp('function ' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

let CALLS = [];
const abierta = () => ({ ok: true, abierta: true });
const block = n => ({ nombre: n, estado: 'BLOCK' });

function run(o) {
  o = o || {}; CALLS = [];
  const pre = (o.preflight || [{ checks: [] }]).slice();
  const ctx = {
    console,
    Operacion_ventanaActivacionAbierta_: o.ventana || (() => ({ ok: false, abierta: false })),
    Operacion_preflightRelease_: () => (pre.length ? pre.shift() : { checks: [], resultado: 'READY_TO_ACTIVATE' }),
    WebApp_operadorConfigurado_: o.operador || (() => true),
    Form_formId_: o.formId || (() => 'FORM-X'),
    UI_formCanalInstalarSeguro_: o.instalar || (() => { CALLS.push('install'); return { ok: true }; }),
    Form_migrarTrailerLegacy_: (x) => { CALLS.push('legacy:' + (x && x.dryRun ? 'dry' : 'apply')); return o.legacy ? o.legacy(x) : { ok: true }; },
    Form_operativoDiagnosticar_: () => { CALLS.push('diag'); return o.diag ? o.diag() : { ok: true }; },
    UI_formCanalAlert_: () => {},
    _UI_get_: o.ui || (() => ({ alert: () => 0, ButtonSet: { YES_NO: 1 }, Button: { YES: 0 } }))
  };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return ctx.UI_formCanalAsistenteActivacion_();
}
const abierta_ = () => ({ ok: true, abierta: true });

// A. Blocker NO reparable → STOP sin mutaciones.
let r = run({ ventana: abierta_, preflight: [{ checks: [{ nombre: 'BACKUP_TRIGGER_PRESENT', estado: 'BLOCK' }] }] });
assert.equal(r.ok, false);
assert.equal(r.motivo, 'RELEASE_PREFLIGHT_BLOCKED');
assert.deepEqual(r.bloqueos, ['BACKUP_TRIGGER_PRESENT']);
assert.deepEqual(CALLS, [], 'blocker no reparable: cero mutaciones');

// B. Solo blockers reparables → el instalador SÍ ejecuta y puede llegar a verde.
r = run({
  ventana: abierta_,
  preflight: [
    { checks: [{ nombre: 'FORM_COLUMNS_CURRENT', estado: 'BLOCK' }, { nombre: 'FORM_SUBMIT_TRIGGER_COUNT', estado: 'BLOCK' }, { nombre: 'FORM_WORKER_TRIGGER_COUNT', estado: 'BLOCK' }] },
    { checks: [], resultado: 'ACTIVE_HEALTHY' }
  ]
});
assert.equal(r.estado, 'READY_FOR_DEPLOY');
assert.deepEqual(CALLS, ['install', 'legacy:dry', 'diag'], 'reparables: instala y continúa');

// C. Blocker posterior (tras instalar) → POST_RELEASE_PREFLIGHT_BLOCKED, nunca READY.
r = run({
  ventana: abierta_,
  preflight: [
    { checks: [] },
    { checks: [{ nombre: 'NO_SCHEMA_DRIFT', estado: 'BLOCK' }] }
  ]
});
assert.equal(r.ok, false);
assert.equal(r.motivo, 'POST_RELEASE_PREFLIGHT_BLOCKED');
assert.notEqual(r.estado, 'READY_FOR_DEPLOY');
assert.deepEqual(r.bloqueos, ['NO_SCHEMA_DRIFT']);

// D. Todo verde → READY_FOR_DEPLOY.
r = run({ ventana: abierta_, preflight: [{ checks: [] }, { checks: [], resultado: 'ACTIVE_HEALTHY' }] });
assert.equal(r.estado, 'READY_FOR_DEPLOY');
assert.deepEqual(CALLS, ['install', 'legacy:dry', 'diag']);

// Extras: ventana cerrada, falta operador/Form, error de instalación, cancelación legacy, diagnóstico fail.
assert.deepEqual(run({}), { ok: false, abierta: false });
CALLS = [];
r = run({ ventana: abierta_, preflight: [{ checks: [] }], operador: () => false });
assert.equal(r.motivo, 'OPERATOR_SETUP_REQUIRED'); assert.equal(CALLS.length, 0);
r = run({ ventana: abierta_, preflight: [{ checks: [] }], formId: () => '' });
assert.equal(r.motivo, 'FORM_SETUP_REQUIRED');
r = run({ ventana: abierta_, preflight: [{ checks: [] }], instalar: () => { CALLS.push('install'); return { ok: false, motivo: 'INSTALAR_FALLO' }; } });
assert.equal(r.ok, false); assert.deepEqual(CALLS, ['install']);
r = run({
  ventana: abierta_,
  preflight: [{ checks: [] }],
  legacy: (x) => (x && x.dryRun ? { ok: true, legacyDetectadas: 2 } : { ok: true }),
  ui: () => ({ alert: () => 1, ButtonSet: { YES_NO: 1 }, Button: { YES: 0 } })
});
assert.equal(r.motivo, 'LEGACY_APPLY_CANCELLED');
r = run({ ventana: abierta_, preflight: [{ checks: [] }], diag: () => { CALLS.push('diag'); return { ok: false, motivo: 'POST_FAIL' }; } });
assert.equal(r.motivo, 'POST_INSTALL_DIAGNOSTIC_FAILED');

// Guardas estáticas: no hay publicación ni cambio de otros componentes.
assert.doesNotMatch(body, /clasp\s|newDeployment|updateDeployment/i);
console.log('activation_assistant_v260: PASS');
