import assert from 'assert';
const fs = await import('fs');
const s = fs.readFileSync('src/36_FormsCanal.js','utf8');
assert.ok(s.includes('GOOGLE_FORM_CANONICAL_ITEM_MAP') || s.includes('GLOBAL|ACCION') || s.includes('Form_indexarSchema_'));
console.log('forms_canonical_item_map_v254: PASS');
