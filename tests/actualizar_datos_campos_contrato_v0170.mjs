#!/usr/bin/env node
// Contrato de campos P0 — ACTUALIZAR_DATOS.
// Garantiza que el frontend (grupos de src/EditorPaciente.html) y el backend
// (CAPTURA_EDICION_CAMPOS de src/29_ActualizacionCaptura.js) no vuelvan a
// divergir: una refactorización que deje "solo 2 campos" rompería esta prueba.
//
// Regla: todos los campos editables del backend deben existir en el editor
// frontend, salvo una exclusión documentada de forma explícita.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

// Exclusiones documentadas: ninguna. Todo CAPTURA_EDICION_CAMPOS debe ser editable.
const EXCLUSIONES = [];

const backendSrc = read('src/29_ActualizacionCaptura.js');
const mBackend = backendSrc.match(/var\s+CAPTURA_EDICION_CAMPOS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(mBackend, 'CAPTURA_EDICION_CAMPOS no encontrado en el backend');
const backend = mBackend[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

const editorSrc = read('src/EditorPaciente.html');
const mGrupos = editorSrc.match(/var\s+grupos\s*=\s*(\[[\s\S]*?\n\s*\]);/);
assert.ok(mGrupos, 'la lista grupos no fue encontrada en EditorPaciente.html');
// grupos es un literal de datos puro: se evalúa como estructura y se leen las
// claves reales (evita confundir los catálogos de opciones con campos).
const grupos = vm.runInNewContext('(' + mGrupos[1] + ')');
const frontend = grupos.flatMap(g => g[1].map(f => f[0]));

assert.equal(frontend.length, new Set(frontend).size, 'no debe haber campos duplicados en el editor');
assert.ok(frontend.length >= 18, 'el editor debe exponer al menos 18 campos de ficha (hoy: ' + frontend.length + ')');

const faltantes = backend.filter(k => !frontend.includes(k));
assert.equal(faltantes.length, 0,
  'campos del backend ausentes en el editor frontend: ' + JSON.stringify(faltantes));
assert.equal(backend.filter(k => !EXCLUSIONES.includes(k)).length, backend.length,
  'toda exclusión de campo debe estar documentada en EXCLUSIONES');

const sobrantes = frontend.filter(k => !backend.includes(k));
assert.equal(sobrantes.length, 0,
  'el editor expone campos que el backend no admite (serían rechazados): ' + JSON.stringify(sobrantes));

console.log('actualizar_datos_campos_contrato_v0170: ' + backend.length + ' campos backend ≡ ' + frontend.length + ' campos frontend');
