import assert from 'assert';
const fs = await import('fs');
const s = fs.readFileSync('src/36_FormsCanal.js','utf8');
assert.ok(s.includes('WebApp_capturarRecibirDurable'));
assert.ok(s.includes('Form_crearRespuestaDesdePayloadWeb_'));
assert.ok(s.includes('Form_validarPayloadTransporte_'));
console.log('webapp_durable_receiver_v254: PASS');
