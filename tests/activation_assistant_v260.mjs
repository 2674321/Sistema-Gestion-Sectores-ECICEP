import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const s = fs.readFileSync(new URL('../src/38_Release.js', import.meta.url), 'utf8');
const body = s.slice(s.indexOf('function UI_formCanalAsistenteActivacion_'));
assert.doesNotMatch(body, /clasp\s|newDeployment|updateDeployment/i, 'el asistente no publica');
for (const fn of ['UI_formCanalAdoptarId_', 'UI_formCanalCrearNuevoSeguro_', 'UI_operadorConfigurarClaveActivacion_'])
  assert.match(s, new RegExp('function ' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

let CALLS = [];
const abierta = () => ({ ok: true, abierta: true });

function run(overrides) {
  CALLS = [];
  const ctx = {
    console,
    Operacion_ventanaActivacionAbierta_: () => ({ ok: false, abierta: false }),
    Operacion_preflightRelease_: () => ({ resultado: 'READY_TO_ACTIVATE' }),
    WebApp_operadorConfigurado_: () => true,
    Form_formId_: () => 'FORM-X',
    UI_formCanalInstalarSeguro_: () => { CALLS.push('install'); return { ok: true }; },
    Form_migrarTrailerLegacy_: (o) => { CALLS.push('legacy:' + (o && o.dryRun ? 'dry' : 'apply')); return { ok: true }; },
    Form_operativoDiagnosticar_: () => { CALLS.push('diag'); return { ok: true }; },
    UI_formCanalAlert_: () => {},
    _UI_get_: () => ({ alert: () => 0, ButtonSet: { YES_NO: 1 }, Button: { YES: 0 } })
  };
  Object.assign(ctx, overrides || {});
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return ctx.UI_formCanalAsistenteActivacion_();
}

// 1. Ventana cerrada → cero mutaciones.
let r = run({});
assert.equal(r.ok, false);
assert.equal(CALLS.length, 0, 'ventana cerrada no muta');

// 2. Falta operador → stop, cero mutaciones.
r = run({ Operacion_ventanaActivacionAbierta_: abierta, WebApp_operadorConfigurado_: () => false });
assert.equal(r.motivo, 'OPERATOR_SETUP_REQUIRED');
assert.equal(CALLS.length, 0);

// 3. Falta Form → stop, cero mutaciones.
r = run({ Operacion_ventanaActivacionAbierta_: abierta, Form_formId_: () => '' });
assert.equal(r.motivo, 'FORM_SETUP_REQUIRED');
assert.equal(CALLS.length, 0);

// 4. Error intermedio (instalación) → stop, no continúa.
r = run({ Operacion_ventanaActivacionAbierta_: abierta, UI_formCanalInstalarSeguro_: () => { CALLS.push('install'); return { ok: false, motivo: 'INSTALAR_FALLO' }; } });
assert.equal(r.ok, false);
assert.deepEqual(CALLS, ['install'], 'no continúa tras error de instalación');

// 5. Legacy presente y usuario cancela → stop sin aplicar.
r = run({
  Operacion_ventanaActivacionAbierta_: abierta,
  Form_migrarTrailerLegacy_: (o) => { CALLS.push('legacy:' + (o && o.dryRun ? 'dry' : 'apply')); return o && o.dryRun ? { ok: true, legacyDetectadas: 2 } : { ok: true }; },
  _UI_get_: () => ({ alert: () => 1, ButtonSet: { YES_NO: 1 }, Button: { YES: 0 } })
});
assert.equal(r.motivo, 'LEGACY_APPLY_CANCELLED');
assert.deepEqual(CALLS, ['install', 'legacy:dry'], 'cancelación no aplica');

// 6. Legacy confirmado + post ok → READY_FOR_DEPLOY.
r = run({
  Operacion_ventanaActivacionAbierta_: abierta,
  Form_migrarTrailerLegacy_: (o) => { CALLS.push('legacy:' + (o && o.dryRun ? 'dry' : 'apply')); return o && o.dryRun ? { ok: true, legacyDetectadas: 2 } : { ok: true }; },
  _UI_get_: () => ({ alert: () => 0, ButtonSet: { YES_NO: 1 }, Button: { YES: 0 } })
});
assert.equal(r.estado, 'READY_FOR_DEPLOY');
assert.deepEqual(CALLS, ['install', 'legacy:dry', 'legacy:apply', 'diag']);

// 7. Flujo verde sin legacy → READY_FOR_DEPLOY.
r = run({ Operacion_ventanaActivacionAbierta_: abierta });
assert.equal(r.estado, 'READY_FOR_DEPLOY');
assert.deepEqual(CALLS, ['install', 'legacy:dry', 'diag']);

// 8. Postdiagnóstico falla → no READY.
r = run({ Operacion_ventanaActivacionAbierta_: abierta, Form_operativoDiagnosticar_: () => { CALLS.push('diag'); return { ok: false, motivo: 'POST_FAIL' }; } });
assert.equal(r.ok, false);
assert.equal(r.motivo, 'POST_INSTALL_DIAGNOSTIC_FAILED');

console.log('activation_assistant_v260: PASS');
