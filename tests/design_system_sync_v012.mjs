#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const cfg = readFileSync(new URL('src/00_Config.js', root), 'utf8');
const css = readFileSync(new URL('src/00_Tokens.html', root), 'utf8');
const c = vm.createContext({});
vm.runInContext(cfg, c);
const t = vm.runInContext('DESIGN_SYSTEM.TOKENS_UI', c);
const pares = {
  background: '--bg', surface: '--surface', border: '--border', text: '--text-primary',
  primary: '--primary', naranjo: '--sector-naranjo', amarillo: '--sector-amarillo',
  verde: '--sector-verde', success: '--success', warning: '--warning', danger: '--danger'
};
let n = 0;
for (const [clave, variable] of Object.entries(pares)) {
  const m = css.match(new RegExp(variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*(#[0-9A-Fa-f]{6})'));
  assert.ok(m, 'token CSS ausente: ' + variable);
  assert.equal(m[1].toUpperCase(), String(t[clave]).toUpperCase(), variable + ' sincronizado'); n++;
}
assert.match(cfg, /VERSION:\s*'0\.14\.1'/); n++;
console.log('Design system v0.12 — ' + n + '/' + n + ' PASS');
