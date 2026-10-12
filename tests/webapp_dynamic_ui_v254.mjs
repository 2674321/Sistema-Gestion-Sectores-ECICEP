import assert from 'assert';
const fs = await import('fs');
const html = fs.readFileSync('src/CapturaWeb.html','utf8');
assert.ok(html.includes('accion') || html.includes('Acción'));
console.log('webapp_dynamic_ui_v254: PASS');
