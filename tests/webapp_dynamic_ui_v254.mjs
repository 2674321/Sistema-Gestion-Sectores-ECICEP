import assert from 'assert';
const fs=require('fs');
const html=fs.readFileSync('src/CapturaWeb.html','utf8');
assert.ok(html.includes('accion'));
console.log('webapp_dynamic_ui_v254: PASS');
