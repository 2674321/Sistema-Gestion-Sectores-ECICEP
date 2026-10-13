import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm';
const src=fs.readFileSync(new URL('../src/07_UI.js',import.meta.url),'utf8');
const rows=[['TIPO','DETALLE','ESTADO_REVISION','RESUELTO_POR'],['MATCH','{bad','ABIERTO','']];
const hoja={getLastRow(){return rows.length}};
const c={console,JSON,Date,HOJAS:{CONFLICTOS:'CONFLICTOS'},WebApp_autorizarBuscador_(){return true},Modelo_hoja_(){return hoja},Utl_leerBloque_(){return rows},Utl_claveAlnum_(x){return String(x).replace(/[^A-Z]/gi,'').toUpperCase()},Utl_texto_(x){return String(x??'')},Modelo_leerPacientesCampos_(){return[]},Log_error_(){}};
vm.createContext(c);vm.runInContext(src,c); const r=c.api_revisionListar_('x');
assert.equal(r.ok,true);assert.equal(r.metricas.abiertos,1);assert.equal(r.metricas.reviewPayloadInvalid,1);assert.equal(r.casos.length,1);assert.equal(r.casos[0].motivoTecnico,'REVIEW_PAYLOAD_INVALID');assert.equal(r.casos[0].resoluble,false);
assert.doesNotMatch(JSON.stringify(r.metricas),/rut|nombre|telefono/i);
console.log('review_invalid_payload_v260: PASS');
