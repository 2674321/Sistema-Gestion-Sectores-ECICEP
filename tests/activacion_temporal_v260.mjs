import assert from 'node:assert/strict';
import fs from 'node:fs';

const url = new URL('../src/99_ActivacionTemporal.js', import.meta.url);
const s = fs.readFileSync(url, 'utf8');

assert.match(s, /function ECICEP_ACTIVAR_AHORA\(\)/, 'existe ECICEP_ACTIVAR_AHORA');
assert.match(s, /60 \* 60000/, 'ventana técnica de 60 min');
assert.match(s, /GOOGLE_FORMS_CONFIG\.ACTIVATION_WINDOW\.CLAVE/, 'usa la clave de ventana configurada');
assert.match(s, /Operacion_ventanaActivacionAbierta_/, 'consulta si la ventana está abierta');
assert.match(s, /WebApp_operadorConfigurado_/, 'exige operador');
assert.match(s, /OPERADOR_NO_CONFIGURADO/, 'motivo operador');
assert.match(s, /Form_formId_\(\)/, 'exige Form ID');
assert.match(s, /FORM_ID_REQUIRED/, 'motivo Form ID');
assert.match(s, /ECICEP_configurarFormProduccion_\(\)/, 'fija el Form de producción autorizado');
assert.match(s, /'FORM_CONFIG'/, 'etapa FORM_CONFIG');
assert.match(s, /FORM_PRODUCTION_NOT_ACCESSIBLE/, 'motivo de Form objetivo inaccesible');
assert.ok(
  s.indexOf('ECICEP_configurarFormProduccion_()') < s.indexOf('if (!Form_formId_())'),
  'configura el Form objetivo antes de verificar el ID'
);
assert.match(s, /ECICEP_asegurarBackupActivacion_\(\)/, 'autorrepara el trigger de respaldo');
assert.match(s, /ECICEP_asegurarFormActivacion_\(\)/, 'autorrepara el Form inaccesible');
assert.match(s, /BACKUP_TRIGGER_REPAIR_FAILED/, 'motivo de reparación de respaldo');
assert.match(s, /FORM_REPAIR_FAILED/, 'motivo de reparación de Form');
assert.match(s, /repairs:\s*\{[\s\S]*?backupTrigger[\s\S]*?formRecreated/, 'reporta reparaciones agregadas');
assert.ok(
  s.indexOf('ECICEP_asegurarBackupActivacion_()') < s.indexOf('Operacion_preflightRelease_()'),
  'repara el respaldo antes del preflight'
);
assert.ok(
  s.indexOf('ECICEP_asegurarFormActivacion_()') < s.indexOf('Operacion_preflightRelease_()'),
  'repara el Form antes del preflight'
);
assert.match(s, /Operacion_preflightBloqueosNoReparables_/, 'usa el filtro de blockers no reparables');
assert.match(s, /Form_operativoInstalar_\(\{[\s\S]*?crearNuevo:\s*false[\s\S]*?adoptarExistente:\s*true[\s\S]*?\}\)/, 'instala/adopta solo el Form configurado');
assert.doesNotMatch(
  s,
  /Form_migrarTrailerLegacy_/,
  'la activación no ejecuta migración legacy'
);

assert.match(
  s,
  /DEFERRED_POST_ACTIVATION/,
  'legacy queda diferido fuera del camino crítico'
);
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
