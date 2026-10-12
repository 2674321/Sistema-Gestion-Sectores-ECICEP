import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync('src/CapturaWeb.html','utf8');
const select = html.match(/<select id="accion"[\s\S]*?<\/select>/);
assert.ok(select, 'select#accion presente');
assert.equal((select[0].match(/<option /g) || []).length, 4, 'cuatro acciones exactas');
for (const expected of ['NUEVO_INGRESO">Nuevo ingreso', 'REGISTRAR_CONTROL">Control',
  'REGISTRAR_SEGUIMIENTO">Seguimiento', 'ACTUALIZAR_DATOS">Actualizar']) assert.match(select[0], new RegExp(expected));
assert.doesNotMatch(html, /<input[^>]+type="radio"[^>]+name="accion"/);
assert.match(html, /function getAccion\(\)\{return document\.getElementById\("accion"\)\.value\}/);
assert.match(html, /\.WebApp_capturarRecibirDurable\(datos,/);
assert.doesNotMatch(html, /\.WebApp_previaDuplicadosV2\(datos,/);
assert.match(html, /clientRequestId/); assert.doesNotMatch(html, /captureId:e\.captureId/);
assert.match(html, /Registro recibido correctamente\. ECICEP lo procesará automáticamente\./);
console.log('webapp_dynamic_ui_v254: PASS');
