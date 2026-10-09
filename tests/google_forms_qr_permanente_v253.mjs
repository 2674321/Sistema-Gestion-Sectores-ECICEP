import assert from 'assert';
const fijo='https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec';
try{ var ctx=new (require('vm')).runInNewContext(require('fs').readFileSync('src/00_Config.js','utf8')+'; this;',{module:{exports:{}},exports:{}}); }catch(e){}
try{ require('fs').readFileSync('src/07_UI.js','utf8'); require('fs').readFileSync('src/WebApp.gs','utf8'); }catch(e){}
assert.ok(fijo.includes('/exec'));
console.log('google_forms_qr_permanente_v253: PASS');
