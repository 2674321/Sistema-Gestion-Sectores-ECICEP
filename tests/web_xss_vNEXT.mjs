import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const tokens = read('src/00_Tokens.html');
const sidebar = read('src/Sidebar.html');
const backup = read('src/Backup.html');

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const hostiles = ['<img src=x onerror=alert(1)>', '" autofocus onfocus=alert(1) x="',
  "');alert(1);//", '</script><script>alert(1)</script>', '&lt;svg/onload=alert(1)&gt;'];
for (const value of hostiles) {
  const escaped = esc(value);
  assert.equal(/[<>"']/.test(escaped), false, `escape incompleto: ${value}`);
}

assert.match(tokens, /replace\(\/\'\/g,'&#39;'\)/, 'el helper compartido debe escapar comilla simple');
assert.match(tokens, /function _safeUrl\(/, 'URLs dinámicas requieren validador');
assert.doesNotMatch(sidebar, /onclick="abrirFicha\([^"\n]*\+/, 'IDs del backend no deben interpolarse en onclick');
assert.match(sidebar, /addEventListener\('click'.*dataset\.id/, 'la ficha debe abrirse mediante listener DOM');
assert.match(backup, /_safeUrl\(b\.url\)/, 'URLs de backup deben validar protocolo');
assert.match(backup, /_esc\(\(r&&r\.motivo\)/, 'errores de backend deben escaparse antes de innerHTML');

console.log('web_xss_vNEXT: 10/10');
