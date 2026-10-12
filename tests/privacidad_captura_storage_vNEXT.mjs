#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/CapturaWeb.html', import.meta.url), 'utf8');

// No debe guardar PII clínica en storage
assert.equal(html.includes('ecicep_sug_rut'), false, 'No debe persistir sugerencia de RUT');
assert.equal(html.includes('ecicep_sug_nombre'), false, 'No debe persistir sugerencia de nombre');
assert.equal(html.includes('ecicep_sug_telefonos'), false, 'No debe persistir sugerencia de telefonos');
assert.equal(html.includes('ecicep_sug_obs'), false, 'No debe persistir sugerencia de obs');
assert.equal(html.includes('rut")'), true, 'HTML debe seguir teniendo campo rut');

// No debe haber referencias a guardar RUT/nombre/teléfonos/obs en localStorage o sessionStorage para sugerencias clínicas
const forbiddenPatterns = ['ecicep_sug_rut', 'ecicep_sug_nombre', 'ecicep_sug_telefonos', 'ecicep_sug_obs'];
for (const p of forbiddenPatterns) {
  assert.equal(html.includes(p), false, `${p} no debe aparecer`);
}

console.log('Privacidad captura storage vNEXT: PASS');
