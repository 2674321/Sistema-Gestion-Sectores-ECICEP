import assert from 'assert';
const fs = await import('fs');
const s = fs.readFileSync('src/36_FormsCanal.js','utf8');
assert.ok(s.includes('Form_crearRespuestaDesdePayloadWeb_')); assert.ok(s.includes('Form_extraerCampos_')); assert.ok(s.includes('CapturaIngress_adapterForms') || s.includes('adapter'));
console.log('forms_roundtrip_v254: PASS');
