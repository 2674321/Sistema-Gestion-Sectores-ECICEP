import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const log = read('src/09_Log.js');
const web = read('src/WebApp.gs');
const form = read('src/24_Formulario.js');

assert.match(log, /function Log_sanitizarTexto_\(/);
assert.match(log, /\[EMAIL\]/);
assert.match(log, /\[RUT\]/);
assert.match(log, /\[TELEFONO\]/);
assert.match(log, /\[SECRETO\]/);
assert.match(log, /function Log_sanitizarContexto_\(/);
assert.doesNotMatch(web, /console\.(?:log|error)\([^\n]*crudo\.RUT/,
  'no registrar RUT, ni siquiera parcial');
assert.doesNotMatch(web, /console\.log\([^\n]*JSON\.stringify\((?:proc|estado|resultado\.data\.diagnostico)/,
  'no serializar resultados clínicos en consola');
assert.doesNotMatch(form, /console\.log\([^\n]*JSON\.stringify\((?:lf|resumenPipeline|trailersAnexos)/,
  'no serializar filas ni trailers en consola');
assert.doesNotMatch(read('src/28_IA.js'), /console\.(?:log|error)\([^\n]*(?:api.?key|GEMINI_API_KEY)/i);

console.log('logs_privacidad_vNEXT: 10/10');
