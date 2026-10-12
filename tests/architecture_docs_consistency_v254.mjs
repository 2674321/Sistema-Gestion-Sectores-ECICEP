import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('src/CapturaWeb.html', 'utf8');
const forms = readFileSync('src/36_FormsCanal.js', 'utf8');
const config = readFileSync('src/00_Config.js', 'utf8');
const webapp = readFileSync('src/WebApp.gs', 'utf8').slice(0, 1800);
const currentDocs = [readFileSync('AGENTS.md', 'utf8').slice(0, 6500), readFileSync('README.md', 'utf8'),
  readFileSync('docs/CONTRATO_CAPTURA_V2.md', 'utf8').slice(0, 18000), readFileSync('docs/VERSIONADO.md', 'utf8')].join('\n');
assert.match(html, /<select id="accion"/); assert.doesNotMatch(html, /type="radio" name="accion"/);
assert.match(html, /WebApp_capturarRecibirDurable/); assert.doesNotMatch(html, /\.WebApp_previaDuplicadosV2_\(datos,/);
assert.match(forms, /GOOGLE_FORM_CANONICAL_ITEM_MAP/); assert.match(config, /LOCK_WAIT_MS:\s*750/);
assert.doesNotMatch(forms, /tryLock\(12000\)/);
assert.match(webapp, /FormResponse\.submit\(\)[\s\S]*Form_worker_[\s\S]*Captura_v2_enviar_/);
assert.doesNotMatch(webapp, /Google Forms fueron\s*\n?\s*\*?\s*retirados|única entrada operativa es WebApp_capturarEnviar_/);
for (const phrase of ['Web App', 'transporte durable interno', 'Form_worker_', 'Captura_v2_enviar_']) assert.match(currentDocs, new RegExp(phrase));
console.log('architecture_docs_consistency_v254: PASS');
