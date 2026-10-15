// v270 (§24) — paridad manifest ↔ docs ↔ consumidores reales de scopes OAuth.
//  · todo scope del manifiesto debe estar documentado en docs/OAUTH_SCOPES.md;
//  · toda fila documentada debe existir en el manifiesto (sin scope fantasma);
//  · un servicio de Apps Script usado en `src/` exige su scope, presente y
//    documentado (consumidor nuevo sin scope documentado → FAIL).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/appsscript.json'), 'utf8'));
const scopes = new Set((manifest.oauthScopes || []).map(s => s.replace('https://www.googleapis.com/auth/', '')));
const doc = fs.readFileSync(path.join(root, 'docs/OAUTH_SCOPES.md'), 'utf8');

// 1 · Todo scope declarado debe estar documentado.
for (const s of scopes) assert.ok(doc.includes('/auth/' + s), 'scope sin documentar: ' + s);

// 2 · Toda fila documentada debe existir en el manifiesto.
const filas = [...doc.matchAll(/^\|\s*`\.\.\.\/(auth\/[a-z._]+)`/gm)].map(m => m[1].replace('auth/', ''));
assert.ok(filas.length >= scopes.size, 'la tabla debe cubrir todos los scopes');
for (const s of filas) assert.ok(scopes.has(s), 'documentado pero ausente del manifiesto: ' + s);

// 3 · Consumidor real ⇒ scope requerido y documentado.
const src = fs.readdirSync(path.join(root, 'src'))
  .filter(f => /\.(js|gs)$/.test(f))
  .map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const REQUERIDOS = {
  SpreadsheetApp: 'spreadsheets', DocumentApp: 'documents', DriveApp: 'drive',
  HtmlService: 'script.container.ui', UrlFetchApp: 'script.external_request',
  ScriptApp: 'script.scriptapp', FormApp: 'forms',
  GmailApp: 'gmail', MailApp: 'gmail', CalendarApp: 'calendar'
};
for (const [sym, scope] of Object.entries(REQUERIDOS)) {
  if (new RegExp('\\b' + sym + '\\b').test(src)) {
    assert.ok(scopes.has(scope), sym + ' usado pero falta el scope ' + scope);
    assert.ok(doc.includes('/auth/' + scope), sym + ' usado pero ' + scope + ' sin documentar');
  }
}
if (/\bFormApp\b/.test(src)) {
  assert.ok(scopes.has('forms.body'), 'FormApp usado pero falta forms.body');
  assert.ok(doc.includes('/auth/forms.body'), 'forms.body sin documentar');
}
console.log('oauth_scopes_v270: PASS');
