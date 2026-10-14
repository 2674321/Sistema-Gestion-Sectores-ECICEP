import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = new URL('../src/99_ActivacionTemporal.js', import.meta.url);
const s = fs.readFileSync(url, 'utf8');

assert.match(s, /function ECICEP_ACTIVAR_AHORA\(\)/, 'existe ECICEP_ACTIVAR_AHORA');
assert.match(s, /Session\.getEffectiveUser\(\)\.getEmail\(\)/, 'usa EffectiveUser');
assert.match(s, /if \(!effectiveEmail\)/, 'exige effectiveUser no vacío (editor manual)');
assert.doesNotMatch(s, /Session\.getActiveUser\s*\(/, 'no depende de ActiveUser (puede venir vacío en el editor)');
assert.match(s, /OWNER_EDITOR_CONTEXT_REQUIRED/, 'motivo OWNER');
assert.match(s, /60 \* 60000/, 'ventana técnica de 60 min');
assert.match(s, /GOOGLE_FORMS_CONFIG\.ACTIVATION_WINDOW\.CLAVE/, 'usa la clave de ventana configurada');
assert.match(s, /Operacion_ventanaActivacionAbierta_/, 'consulta si la ventana está abierta');
assert.match(s, /WebApp_operadorConfigurado_/, 'exige operador');
assert.match(s, /OPERADOR_NO_CONFIGURADO/, 'motivo operador');
assert.match(s, /Form_formId_\(\)/, 'exige Form ID');
assert.match(s, /FORM_ID_REQUIRED/, 'motivo Form ID');
assert.match(s, /Operacion_preflightBloqueosNoReparables_/, 'usa el filtro de blockers no reparables');
assert.match(s, /Form_operativoInstalar_\(\{[\s\S]*?crearNuevo:\s*false[\s\S]*?adoptarExistente:\s*true[\s\S]*?\}\)/, 'instala/adopta solo el Form configurado');
assert.match(s, /Form_migrarTrailerLegacy_\(\{\s*dryRun:\s*true\s*\}\)/, 'legacy dry-run');
assert.match(s, /Form_migrarTrailerLegacy_\(\{\s*dryRun:\s*false\s*\}\)/, 'legacy apply');
assert.ok(s.indexOf('dryRun: true') < s.indexOf('dryRun: false'), 'dry-run antes de apply');
assert.match(s, /Form_operativoDiagnosticar_\(\)/, 'diagnóstico');
assert.match(s, /ECICEP_ACTIVATION_RESULT/, 'registra línea de resultado');
assert.match(s, /'READY_FOR_DEPLOY'/, 'retorna READY_FOR_DEPLOY');
assert.match(s, /POST_RELEASE_PREFLIGHT_BLOCKED/, 'post-preflight obligatorio');
assert.ok(s.indexOf('Form_operativoDiagnosticar_') < s.lastIndexOf('Operacion_preflightRelease_'), 'post-preflight tras diagnóstico');

// Prohibiciones de alcance.
assert.doesNotMatch(s, /clasp/i, 'sin clasp');
assert.doesNotMatch(s, /doGet|doPost/, 'sin doGet/doPost');
assert.doesNotMatch(s, /newDeployment|updateDeployment|\.deploy\s*\(/i, 'sin deploy');
assert.doesNotMatch(s, /\bqr\b|QR/i, 'sin cambios de QR');

console.log('activacion_temporal_v260: PASS');
