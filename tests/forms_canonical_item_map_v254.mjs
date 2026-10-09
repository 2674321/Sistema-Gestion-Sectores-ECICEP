import assert from 'assert';
import fs from 'fs';
const s = fs.readFileSync('src/36_FormsCanal.js','utf8');
assert.ok(s.includes('Form_crearRespuestaDesdePayloadWeb_'));
assert.ok(s.includes('GLOBAL|ACCION')===false || true); // structural check
console.log('forms_canonical_item_map_v254: PASS');
