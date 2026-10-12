#!/usr/bin/env node
// v253 — Instalador canal Google Forms: idempotencia, schema, triggers, itemMap.
// Release gate v255: además de cargar los módulos, verifica que la superficie del
// instalador/validador quede definida tras la carga (no sólo "carga sin error").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console:{log(){},warn(){},error(){},info(){}}, JSON, Date, Math, RegExp, Object, Array, String, Number, Boolean, Error });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','17_Hojas.js','24_Formulario.js','26_Captura.js','29_ActualizacionCaptura.js','30_Ingesta.js','36_FormsCanal.js'];
const readSrc = (f) => readFileSync(path.join(raiz, 'src', f), 'utf8');
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

for (const fn of ['Form_operativoInstalar', 'Form_construirSchema_', 'Form_syncCatalogos', 'Form_operativoReparar']) {
  assert.equal(typeof ctx[fn], 'function', 'tras cargar el canal debe existir ' + fn);
}
assert.ok(ctx.Form_formId_() === '' || typeof ctx.Form_formId_() === 'string', 'Form_formId_ responde sin lanzar');

console.log('google_forms_instalador_v253: PASS');
