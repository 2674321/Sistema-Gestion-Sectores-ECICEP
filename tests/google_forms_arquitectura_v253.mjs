#!/usr/bin/env node
// v253 — Arquitectura: scopes, sin setDestination, webapp anónimo, arquitectura correcta.
// Release gate v255: el test ya no es un stub; verifica invariantes reales.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(raiz, 'src', 'appsscript.json'), 'utf8'));
const canal = readFileSync(path.join(raiz, 'src', '36_FormsCanal.js'), 'utf8');

assert.ok(Array.isArray(manifest.oauthScopes), 'appsscript.json debe declarar oauthScopes');
assert.ok(manifest.oauthScopes.some(s => /\/auth\/forms$/.test(s)), 'debe declarar el scope de Forms');
assert.equal(manifest.webapp && manifest.webapp.executeAs, 'USER_DEPLOYING', 'la WebApp se ejecuta como el deployer');
assert.equal(manifest.webapp && manifest.webapp.access, 'ANYONE_ANONYMOUS', 'la captura es anónima (DEC-102)');
assert.ok(!/setDestination\s*\(/.test(canal), 'el canal NO debe usar setDestination (arquitectura durable)');
assert.ok(/newTrigger\('Form_worker_'\)/.test(canal) && /everyMinutes\(5\)/.test(canal), 'el worker debe estar enganchado por trigger');

console.log('google_forms_arquitectura_v253: PASS');
