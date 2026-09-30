import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const srcUrl = new URL('src/', root);
const sources = readdirSync(srcUrl).filter(f => /\.(?:js|gs|html)$/.test(f))
  .map(f => readFileSync(new URL(f, srcUrl), 'utf8')).join('\n');
const report = readFileSync(new URL('docs/INFORME_AUDITORIA_VNEXT.md', root), 'utf8');

assert.doesNotMatch(sources, /XFrameOptionsMode\.ALLOWALL/, 'ALLOWALL no autorizado');
assert.doesNotMatch(sources, /AIza[0-9A-Za-z_-]{20,}/, 'posible API key de Google versionada');
assert.doesNotMatch(sources, /https?:\/\/[^\s'"`]+[?&](?:key|token|access_token)=/i,
  'secretos no deben viajar en query strings literales');
for (const name of ['Instalar_pIntegridad', 'Instalar_pMigraciones', 'Fuentes_cargaReal',
  'Limpieza_ejecutar', 'Backup_podar']) {
  assert.doesNotMatch(sources, new RegExp('^function\\s+' + name + '\\s*\\(', 'm'), name + ' debe ser privado');
}
assert.doesNotMatch(report, /\b\d{1,2}\.\d{3}\.\d{3}-[0-9K]\b/i, 'el informe no contiene RUT');
assert.doesNotMatch(report, /\b\+?56\s?9\s?\d{4}\s?\d{4}\b/, 'el informe no contiene teléfonos');
assert.doesNotMatch(report, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, 'el informe no contiene emails');

console.log('repo_security_hygiene_vNEXT: secretos, PII y guards estáticos PASS');
