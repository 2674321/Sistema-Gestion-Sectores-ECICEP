// v255 (DEC-110) — Triggers y menús: los handlers instalables deben existir y
// ser privados (sufijo `_`). Solo `onOpen`/`onEdit` se consideran runtime.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const defs = new Set();
const textos = [];
for (const f of readdirSync(src).filter(x => /\.(?:js|gs)$/.test(x)).sort()) {
  const s = readFileSync(new URL(f, src), 'utf8'); textos.push(s);
  for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) defs.add(m[1]);
}
const todo = textos.join('\n');
const RUNTIME = new Set(['onOpen', 'onEdit', 'doGet', 'doPost']);

// Handlers de triggers instalables.
const handlers = new Set();
for (const m of todo.matchAll(/newTrigger\(\s*'([^']+)'\s*\)/g)) handlers.add(m[1]);
for (const m of todo.matchAll(/handler\s*=\s*'([^']+)'/g)) handlers.add(m[1]);
for (const h of ['Form_worker_', 'Form_onFormSubmit_', 'Backup_programado_', 'ECICEP_noop_', 'ECICEP_onChangeLibro_', 'ECICEP_onEditIngreso_']) {
  assert.ok(defs.has(h), 'handler requerido no definido: ' + h);
}
for (const h of handlers) {
  assert.ok(defs.has(h), 'handler de trigger no definido: ' + h);
  assert.ok(h.endsWith('_'), 'handler instalable debe ser privado (`_`): ' + h);
}

// Handlers de menú.
const items = [...todo.matchAll(/\.addItem\(\s*'([^']*)'\s*,\s*'([^']+)'\s*\)/g)];
assert.ok(items.length >= 8, 'se esperan los items de menú');
for (const [, label, fn] of items) {
  assert.ok(defs.has(fn), 'item de menú "' + label + '" apunta a función inexistente: ' + fn);
  assert.ok(RUNTIME.has(fn) || fn.endsWith('_'), 'item de menú debe resolver a RPC privada/runtime: ' + fn);
}

// Los runtime siguen públicos (no privatizados).
for (const r of ['onOpen', 'onEdit', 'doGet', 'doPost']) assert.ok(defs.has(r), r + ' debe existir');
assert.ok(!defs.has('onInstall'), 'onInstall no debe existir sin trigger asociado');
console.log('private_trigger_menu_handlers_v255: ' + handlers.size + ' triggers y ' + items.length + ' items de menú OK');
