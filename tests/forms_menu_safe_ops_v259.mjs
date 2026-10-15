import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const ui = readFileSync(new URL('../src/07_UI.js', import.meta.url), 'utf8');
const menu = ui.match(/function UI_menuGoogleForms_\([\s\S]*?\n\}/)?.[0] || '';
for (const fn of ['UI_formCanalEstado_', 'UI_formCanalDiagnostico_', 'UI_formCanalLegacyDryRun_', 'UI_formCanalInstalarSeguro_', 'UI_formCanalCatalogosSeguro_']) assert.match(menu, new RegExp(fn));
assert.doesNotMatch(menu, /'Form_operativoInstalar_'|'Form_syncCatalogos_'|'Form_operativoEstado_'/);
assert.match(menu, /Mostrar QR de CapturaWeb/);
assert.doesNotMatch(ui, /crearNuevo:\s*true/);
const instalar = ui.match(/function UI_formCanalInstalarSeguro_\([\s\S]*?\n\}/)?.[0] || '';
assert.match(instalar, /Operacion_ventanaActivacionAbierta_/);
assert.match(instalar, /FORM_ID_REQUIRED/);
assert.match(instalar, /crearNuevo:\s*false/);
assert.match(instalar, /Form_operativoReparar_\(\{ dryRun: true \}\)/);
const estado = ui.match(/function UI_formCanalEstado_\([\s\S]*?\n\}/)?.[0] || '';
assert.doesNotMatch(estado, /Form_operativoInstalar_|Form_syncCatalogos_|setProperty|setValue/);

function prepararUI({ conForm = true, ventana = true, postOk = true } = {}) {
  const h = createHarness255({ noKnownForm: !conForm });
  if (conForm) h.install();
  vm.runInContext(ui, h.c, { filename: '07_UI.js' });
  if (ventana) h.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${Date.now() + 30 * 60 * 1000}`);
  const uiMock = {
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' }, Button: { YES: 'YES' },
    alert() { return 'YES'; }
  };
  h.c._UI_get_ = () => uiMock;
  h.c.Form_operativoReparar_ = () => ({ ok: true, dryRun: true, necesitaCambio: false });
  let diagCalls = 0, installs = 0;
  h.c.Form_operativoDiagnosticar_ = () => {
    diagCalls++;
    const ok = diagCalls === 1 ? true : postOk;
    return { ok, estado: { formId: conForm ? h.form.id : '', form: {} },
      checks: [{ nombre: 'trigger_worker', ok, detalle: ok ? '1' : '0' }] };
  };
  h.c.Form_operativoInstalar_ = () => { installs++; return { ok: true, motivo: 'INSTALADO' }; };
  return { h, get installs() { return installs; } };
}

const postFail = prepararUI({ postOk: false });
const rf = postFail.h.c.UI_formCanalInstalarSeguro_();
assert.equal(rf.ok, false); assert.equal(rf.motivo, 'POST_INSTALL_DIAGNOSTIC_FAILED');
assert.equal(postFail.installs, 1);

const postGreen = prepararUI({ postOk: true });
assert.equal(postGreen.h.c.UI_formCanalInstalarSeguro_().ok, true);
assert.equal(postGreen.installs, 1);

const noId = prepararUI({ conForm: false });
assert.equal(noId.h.c.UI_formCanalInstalarSeguro_().motivo, 'FORM_ID_REQUIRED');
assert.equal(noId.installs, 0, 'sin Form ID no muta');

const closed = prepararUI({ ventana: false });
assert.equal(closed.h.c.UI_formCanalInstalarSeguro_().motivo, 'ACTIVATION_WINDOW_CLOSED');
assert.equal(closed.installs, 0, 'ventana cerrada no muta');
console.log('forms_menu_safe_ops_v259: PASS');
