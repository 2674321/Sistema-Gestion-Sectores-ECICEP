#!/usr/bin/env node
// Seguridad v0.10.3 — separación de capacidades CAPTURA ≠ OPERADOR (§92).
// Ejecuta los wrappers en VM (no simula seguridad mirando HTML) y usa solo
// pacientes ficticios. Cada caso: token de captura, token de operador y ausencia.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../src/',import.meta.url);
let ctx;
function nuevoContexto() {
  ctx=vm.createContext({console:{log(){},warn(){},error(){}}});
  for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())
    vm.runInContext(readFileSync(new URL(f,root),'utf8'),ctx,{filename:f});
}
nuevoContexto();
const CAPTURA='a'.repeat(64);
const OPERADOR='b'.repeat(64);
const props=new Map();
props.set('CAPTURA_ACCESS_TOKEN',CAPTURA);
props.set('OPERADOR_ACCESS_TOKEN',OPERADOR);
ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
ctx.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
ctx.Session={getActiveUser:()=>({getEmail:()=>''})};
ctx.ContentService={createTextOutput:text=>({tipo:'texto',texto:text})};
ctx.HtmlService={createTemplateFromFile:n=>({evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
// Harness para los wrappers de operador.
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>null}),openById:()=>null};
ctx.Modelo_leerPacientes=()=>[];
ctx.Modelo_leerEventos=()=>[];
ctx.Modelo_hoja=()=>null;
ctx.Modelo_buscarPaciente=()=>null;
ctx.Log_info=()=>{};ctx.Log_warning=()=>{};ctx.Log_error=()=>{};ctx.Log_flush=()=>{};
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

t('1. CAPTURA token no abre paneles (RPC privilegiadas denegadas)',()=>{
  const casos=[
    ['api_ficha',['P-FICTICIO']],
    ['api_dashboardDatos',[]],
    ['api_controlPanel',[{}]],
    ['api_configListar',[]],
    ['api_backupListar',[]],
    ['api_rem9Datos',[2026,9,'AMARILLO',{}]],
    ['api_revisionResolver',[2,'CONFIRMAR']],
    ['api_auditoriaEjecutar',[]]
  ];
  for(const [nombre,args] of casos){
    const r=ctx[nombre](...args,CAPTURA);
    assert.equal(r.ok,false,nombre+' con CAPTURA debe negarse');
    const r2=ctx[nombre](...args);
    assert.equal(r2.ok,false,nombre+' sin token debe negarse');
  }
  const l=ctx.api_revisionListar(CAPTURA);
  assert.equal(l.casos.length,0,'api_revisionListar con CAPTURA sin casos');
});

t('2. OPERADOR token sí abre paneles autorizados',()=>{
  ctx.Modelo_leerPacientesCampos=()=>[];
  ctx.Modelo_leerEventosCampos=()=>[];
  ctx._UI_tz=()=>'America/Santiago';
  ctx._ui_isoFecha=()=>'';
  ctx.WebApp_autorizarBuscador=()=>true;
  // api_dashboardDatos usa WebApp_autorizarBuscador(token) interno; respetarlo.
  ctx.WebApp_autorizarBuscador=(tok)=>tok===OPERADOR;
  const d=ctx.api_dashboardDatos(OPERADOR);
  assert.equal(d.ok,true,'dashboardDatos con OPERADOR');
});

t('3. base URL no expone OPERADOR token (ni TOKEN_ACCESO ni TOKEN_INVITACION)',()=>{
  const html=ctx.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(html.vars.CAPTURA_ACCESO,CAPTURA);
  assert.notEqual(html.vars.CAPTURA_ACCESO,OPERADOR,'CAPTURA_ACCESO no es operador');
  assert.equal(html.vars.TOKEN_ACCESO,'','base URL no lleva TOKEN_ACCESO');
  assert.equal(html.vars.TOKEN_INVITACION,'','base URL no lleva TOKEN_INVITACION');
});

t('4. CAPTURA token no carga ficha de paciente',()=>{
  const pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PERSONA FICTICIA'};
  ctx.Modelo_leerPacientes=()=>[pac];
  ctx.Modelo_leerEventos=()=>[];
  assert.equal(ctx.WebApp_cargarPacienteEdicion('11111111-1',CAPTURA).ok,false,'ficha con CAPTURA negada');
  assert.equal(ctx.WebApp_cargarPacienteEdicion('11111111-1').ok,false,'ficha sin token negada');
});

t('5. captura pública (preflight) no devuelve candidatos con PII',()=>{
  // El preflight es PÚBLICO por diseño (canal de captura); pero no debe filtrar
  // PII de candidatos: sin PACIENTES cargados no hay candidatos ni nombres/ruts.
  ctx.Modelo_leerPacientes=()=>[];
  const r2=ctx.WebApp_previaDuplicadosV2({accion:'nuevoIngreso',rut:'11111111-1'},CAPTURA);
  assert.equal(r2.ok,true,'preflight público para captura');
  const cands=r2.candidatos||r2.posibles||r2.coincidencias||[];
  assert.equal(cands.length,0,'preflight sin candidatos (sin PII de pacientes reales)');
});

t('6. REM requiere OPERADOR',()=>{
  ctx.Modelo_hoja=()=>null;
  assert.equal(ctx.api_rem9Datos(2026,9,'AMARILLO',{},CAPTURA).ok,false,'REM con CAPTURA negado');
  assert.equal(ctx.api_remExportarPdf(2026,9,'AMARILLO',CAPTURA).ok,false,'REM PDF con CAPTURA negado');
  assert.equal(ctx.api_rem9Datos(2026,9,'AMARILLO',{},'').ok,false,'REM sin token negado');
});

t('7. configuración requiere OPERADOR',()=>{
  assert.equal(ctx.api_configListar(CAPTURA).ok,false,'config con CAPTURA negado');
  assert.equal(ctx.api_configGuardar('CLAVE','X',CAPTURA).ok,false,'config guardar con CAPTURA negado');
  assert.equal(ctx.api_configAgregar('CLAVE','X','',CAPTURA).ok,false,'config agregar con CAPTURA negado');
  assert.equal(ctx.api_configListar('').ok,false,'config sin token negado');
});

t('8. backup requiere OPERADOR',()=>{
  for(const nombre of ['api_backupListar','api_backupToggle','api_backupConfigLeer','api_backupPodar','api_backupFolder'])
    assert.equal(ctx[nombre](CAPTURA).ok,false,nombre+' con CAPTURA negado');
  assert.equal(ctx.api_backupCrear('MANUAL',CAPTURA).ok,false,'backupCrear con CAPTURA negado');
  assert.equal(ctx.api_backupProgramar('LUNES',3,CAPTURA).ok,false,'backupProgramar con CAPTURA negado');
});

t('9. revisión requiere OPERADOR',()=>{
  const r=ctx.api_revisionResolver(2,'CONFIRMAR',CAPTURA);
  assert.equal(r.ok,false,'revision resolver con CAPTURA negada');
  const r0=ctx.api_revisionResolver(2,'CONFIRMAR');
  assert.equal(r0.ok,false,'revision resolver sin token negada');
  const l=ctx.api_revisionListar(CAPTURA);
  assert.equal(l.casos.length,0,'revisión listar con CAPTURA sin casos');
});

t('10. CentroPruebas wrappers requieren OPERADOR',()=>{
  const casos=[
    ['api_calidadSincronizarCola',[]],
    ['api_calidadNormalizarFormatoRuts',[]],
    ['api_amarilloImportarTodo',[true]],
    ['api_amarilloDedupHistorico',[true]],
    ['api_estratRecalcularPaciente',['P-FICTICIO']],
    ['api_auditoriaEjecutar',[]]
  ];
  for(const [nombre,args] of casos){
    const r=ctx[nombre](...args,CAPTURA);
    assert.equal(r.ok,false,nombre+' con CAPTURA negado');
    const r0=ctx[nombre](...args);
    assert.equal(r0.ok,false,nombre+' sin token negado');
  }
});
console.log('Seguridad capacidades v0.10.3: '+pruebas+'/'+pruebas);