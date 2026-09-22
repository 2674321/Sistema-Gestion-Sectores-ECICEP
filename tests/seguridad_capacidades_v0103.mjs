#!/usr/bin/env node
// Seguridad ECICEP — ACCESO UNIVERSAL (v0.10.4, DEC-068 supera DEC-067).
// Sustituye la separación de capacidades CAPTURA ≠ OPERADOR de v0.10.3:
// una sola credencial (CAPTURA_ACCESS_TOKEN conservado) habilita TODAS las
// funciones; OPERADOR_ACCESS_TOKEN solo como legacy. Casos por wrapper:
// credencial universal, legacy v0.10.3, token inválido y ausencia.
// Ejecuta los wrappers en VM (no simula seguridad mirando HTML) y usa solo
// pacientes ficticios.
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
const UNIVERSAL='a'.repeat(64);
const LEGACY='b'.repeat(64);
const INVALIDO='0'.repeat(64);
const props=new Map();
props.set('CAPTURA_ACCESS_TOKEN',UNIVERSAL);
props.set('OPERADOR_ACCESS_TOKEN',LEGACY);
ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
ctx.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
ctx.Session={getActiveUser:()=>({getEmail:()=>''})};
ctx.ContentService={createTextOutput:text=>({tipo:'texto',texto:text})};
ctx.HtmlService={createTemplateFromFile:n=>({evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>null}),openById:()=>null};
ctx.Modelo_leerPacientes=()=>[];
ctx.Modelo_leerEventos=()=>[];
ctx.Modelo_hoja=()=>null;
ctx.Modelo_buscarPaciente=()=>null;
ctx.Log_info=()=>{};ctx.Log_warning=()=>{};ctx.Log_error=()=>{};ctx.Log_flush=()=>{};
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

t('1. Token inválido o ausente no abre paneles (RPC privilegiadas denegadas)',()=>{
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
    const r=ctx[nombre](...args,INVALIDO);
    assert.equal(r.ok,false,nombre+' con token inválido negado');
    const r2=ctx[nombre](...args);
    assert.equal(r2.ok,false,nombre+' sin token negado');
  }
  const l=ctx.api_revisionListar(INVALIDO);
  assert.equal(l.casos.length,0,'api_revisionListar con token inválido sin casos');
});

t('2. La credencial universal sí abre los paneles autorizados',()=>{
  const original=ctx.WebApp_autorizarBuscador;
  ctx.WebApp_autorizarBuscador=(tok)=>tok===UNIVERSAL;
  ctx.Modelo_leerPacientesCampos=()=>[];
  ctx.Modelo_leerEventosCampos=()=>[];
  ctx._UI_tz=()=>'America/Santiago';
  ctx._ui_isoFecha=()=>'';
  const d=ctx.api_dashboardDatos(UNIVERSAL);
  assert.equal(d.ok,true,'dashboardDatos con credencial universal');
  ctx.WebApp_autorizarBuscador=original;
});

t('3. La base URL se sirve como página operativa con la credencial universal',()=>{
  const html=ctx.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(html.vars.CAPTURA_ACCESO,UNIVERSAL);
  assert.equal(html.vars.TOKEN_ACCESO,UNIVERSAL,'TOKEN_ACCESO recibe la credencial universal');
  assert.equal(html.vars.TOKEN_INVITACION,UNIVERSAL,'TOKEN_INVITACION recibe la credencial universal');
  assert.equal(html.vars.MODO_OPERADOR,true,'la página base opera como operador');
});

t('4. La ficha carga con la credencial universal; inválido o ausencia no',()=>{
  const pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PERSONA FICTICIA'};
  ctx.Modelo_leerPacientes=()=>[pac];
  ctx.Modelo_leerEventos=()=>[];
  assert.equal(ctx.WebApp_cargarPacienteEdicion('11111111-1',UNIVERSAL).ok,true,'ficha con credencial universal');
  assert.equal(ctx.WebApp_cargarPacienteEdicion('11111111-1',INVALIDO).ok,false,'ficha con token inválido negada');
  assert.equal(ctx.WebApp_cargarPacienteEdicion('11111111-1').ok,false,'ficha sin token negada');
});

t('5. El preflight no devuelve candidatos con PII sin pacientes cargados',()=>{
  ctx.Modelo_leerPacientes=()=>[];
  const r2=ctx.WebApp_previaDuplicadosV2({accion:'nuevoIngreso',rut:'11111111-1'},UNIVERSAL);
  assert.equal(r2.ok,true,'preflight autorizado con credencial universal');
  const cands=r2.candidatos||r2.posibles||r2.coincidencias||[];
  assert.equal(cands.length,0,'preflight sin candidatos (sin PII de pacientes reales)');
});

t('6. REM requiere credencial válida',()=>{
  ctx.Modelo_hoja=()=>null;
  assert.equal(ctx.api_rem9Datos(2026,9,'AMARILLO',{},INVALIDO).ok,false,'REM con token inválido negado');
  assert.equal(ctx.api_remExportarPdf(2026,9,'AMARILLO',INVALIDO).ok,false,'REM PDF con token inválido negado');
  assert.equal(ctx.api_rem9Datos(2026,9,'AMARILLO',{},'').ok,false,'REM sin token negado');
});

t('7. Configuración requiere credencial válida',()=>{
  assert.equal(ctx.api_configListar(INVALIDO).ok,false,'config con token inválido negado');
  assert.equal(ctx.api_configGuardar('CLAVE','X',INVALIDO).ok,false,'config guardar negado');
  assert.equal(ctx.api_configAgregar('CLAVE','X','',INVALIDO).ok,false,'config agregar negado');
  assert.equal(ctx.api_configListar('').ok,false,'config sin token negado');
});

t('8. Backups requieren credencial válida',()=>{
  for(const nombre of ['api_backupListar','api_backupToggle','api_backupConfigLeer','api_backupPodar','api_backupFolder'])
    assert.equal(ctx[nombre](INVALIDO).ok,false,nombre+' con token inválido negado');
  assert.equal(ctx.api_backupCrear('MANUAL',INVALIDO).ok,false,'backupCrear negado');
  assert.equal(ctx.api_backupProgramar('LUNES',3,INVALIDO).ok,false,'backupProgramar negado');
});

t('9. Revisión requiere credencial válida',()=>{
  const r=ctx.api_revisionResolver(2,'CONFIRMAR',INVALIDO);
  assert.equal(r.ok,false,'revision resolver con token inválido negada');
  const r0=ctx.api_revisionResolver(2,'CONFIRMAR');
  assert.equal(r0.ok,false,'revision resolver sin token negada');
  const l=ctx.api_revisionListar(INVALIDO);
  assert.equal(l.casos.length,0,'revisión listar con token inválido sin casos');
});

t('10. Wrappers de CentroPruebas requieren credencial válida',()=>{
  const casos=[
    ['api_calidadSincronizarCola',[]],
    ['api_calidadNormalizarFormatoRuts',[]],
    ['api_amarilloImportarTodo',[true]],
    ['api_amarilloDedupHistorico',[true]],
    ['api_estratRecalcularPaciente',['P-FICTICIO']],
    ['api_auditoriaEjecutar',[]]
  ];
  for(const [nombre,args] of casos){
    const r=ctx[nombre](...args,INVALIDO);
    assert.equal(r.ok,false,nombre+' con token inválido negado');
    const r0=ctx[nombre](...args);
    assert.equal(r0.ok,false,nombre+' sin token negado');
  }
  const legacy=ctx.api_estratRecalcularPaciente('P-FICTICIO',LEGACY);
  assert.notEqual(legacy.motivo,'ACCESO_DENEGADO','legacy autoriza (falla de negocio, no de acceso)');
});
console.log('Seguridad ACCESO UNIVERSAL: '+pruebas+'/'+pruebas);