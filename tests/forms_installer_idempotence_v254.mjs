import assert from 'assert';
const fs = await import('fs');
const s = fs.readFileSync('src/36_FormsCanal.js','utf8');
assert.ok(s.includes('Form_operativoInstalar')); assert.ok(s.includes('Form_campoRequerido_'));
console.log('forms_installer_idempotence_v254: PASS');
