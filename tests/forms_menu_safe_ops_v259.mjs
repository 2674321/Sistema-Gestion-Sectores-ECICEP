import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
console.log('forms_menu_safe_ops_v259: PASS');
