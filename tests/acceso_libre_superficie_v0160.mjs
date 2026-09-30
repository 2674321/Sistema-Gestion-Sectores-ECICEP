#!/usr/bin/env node
// Superficie de acceso ECICEP — ACCESO LIBRE (v0.16.0, DEC-097, supera DEC-068).
// Sustituye a "Seguridad ACCESO UNIVERSAL" (v0.10.3/0.10.4). En ACCESO LIBRE
// NINGUNA RPC se deniega por credencial: no hay token que comprobar. Lo que
// este suite verifica es que la ausencia de credenciales no-produce:
//   1. ningún wrapper corta con ACCESO_DENEGADO (con token, sin token o inválido);
//   2. el preflight no filtra PII de pacientes reales;
//   3. el webhook conserva su secreto propio (integración, no personas);
//   4. la válvula ACCESO_LIBRE, si el propietario la cierra, sí deniega.
// Se ejecutan los wrappers en VM (no se "simula" seguridad leyendo HTML) y
// solo se usan pacientes ficticios.
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
props.set('WEBHOOK_TOKEN','secreto-webhook');
ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):'',setProperty:(k,v)=>props.set(k,v)})};
ctx.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
ctx.Session={getActiveUser:()=>({getEmail:()=>''})};
ctx.ContentService={createTextOutput:text=>({tipo:'texto',texto:text,setMimeType(){return this;}}),MimeType:{JSON:'JSON'}};
ctx.HtmlService={createTemplateFromFile:n=>({evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>null}),openById:()=>null};
ctx.Modelo_leerPacientes=()=>[];
ctx.Modelo_leerEventos=()=>[];
ctx.Modelo_hoja=()=>null;
ctx.Modelo_buscarPaciente=()=>null;
ctx.Log_info=()=>{};ctx.Log_warning=()=>{};ctx.Log_error=()=>{};ctx.Log_flush=()=>{};
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

/** Ejecuta una RPC y describe el resultado sin dejar que una excepción de
 *  negocio (el harness no tiene libro) se confunda con un rechazo de acceso. */
function invocar(nombre,args){
  try { return {r:ctx[nombre](...args)}; }
  catch(e){ return {error:String(e&&e.message||e)}; }
}
function noDeniega(nombre,args,etiqueta){
  const {r,error}=invocar(nombre,args);
  if(r) assert.notEqual(r.motivo,'ACCESO_DENEGADO',nombre+' '+etiqueta+': no se deniega por acceso');
  else assert.ok(!/ACCESO/.test(error),nombre+' '+etiqueta+': el fallo no es de acceso ('+error+')');
}

const RPCS=[
  ['api_ficha',['P-FICTICIO']],
  ['api_dashboardDatos',[]],
  ['api_controlPanel',[{}]],
  ['api_configListar',[]],
  ['api_configGuardar',['CLAVE','X']],
  ['api_configAgregar',['CLAVE','X','']],
  ['api_configEliminar',['CLAVE']],
  ['api_responsablesListar',[]],
  ['api_backupListar',[]],
  ['api_backupToggle',[]],
  ['api_backupConfigLeer',[]],
  ['api_backupPodar',[]],
  ['api_backupFolder',[]],
  ['api_backupCrear',['MANUAL']],
  ['api_backupProgramar',['LUNES',3]],
  ['api_rem9Datos',[2026,9,'AMARILLO',{}]],
  ['api_remExportarPdf',[2026,9,'AMARILLO']],
  ['api_revisionResolver',[2,'CONFIRMAR']],
  ['api_auditoriaEjecutar',[]],
  ['api_logLeer',[10]],
  ['api_sistemaEstadoSalud',[]],
  ['api_fuentesImpacto',['CONSERVADOR']],
  ['api_calidadSincronizarCola',[]],
  ['api_calidadNormalizarFormatoRuts',[]],
  ['api_amarilloImportarTodo',[true]],
  ['api_amarilloDedupHistorico',[true]],
  ['api_estratRecalcularPaciente',['P-FICTICIO']],
  ['api_ingresosPendientes',[]],
  ['api_ingresoIncorporar',['HOJA',2]],
  ['api_ingresosIncorporarValidos',[{}]],
  ['api_registrarEvento',[{}]],
  ['api_fichaGuardarCambios',['P-FICTICIO',{}]],
  ['api_instalarEtapas',[]],
  ['api_instalarDiagnostico',[]],
  ['api_patologiasAbrir',['P-FICTICIO']],
  ['api_duplaAbrir',['P-FICTICIO']],
  ['api_webappEstado',[]],
  ['api_actualizarPaciente',['P-FICTICIO',{PROXIMO_CONTROL:'2026-10-20'}]]
];

t('1. Ninguna RPC se deniega por credenciales: con token, sin token o inválido',()=>{
  for(const [nombre,args] of RPCS){
    noDeniega(nombre,[...args,UNIVERSAL],'con enlace');
    noDeniega(nombre,[...args,INVALIDO],'con enlace inválido');
    noDeniega(nombre,[...args,''],'sin enlace');
  }
});

t('2. Los wrappers de lectura nunca devuelven null (contrato de resiliencia)',()=>{
  for(const [nombre,args] of [['api_buscar',['EXISTE']],['api_ficha',['P-FICTICIO']],
      ['api_dashboardDatos',[]],['api_ingresosPendientes',[]],['api_ingresoDetalle',['HOJA',2]],
      ['api_revisionListar',[]]]){
    const {r}=invocar(nombre,args);
    assert.ok(r&&typeof r==='object',nombre+' devuelve un objeto, no null');
  }
  const l=invocar('api_revisionListar',[INVALIDO]).r;
  assert.equal(l.casos.length,0,'revisión sin casos: no se inventan pacientes');
});

t('3. La base URL se sirve como página operativa, con y sin credencial',()=>{
  const html=ctx.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(html.vars.CAPTURA_ACCESO,UNIVERSAL);
  assert.equal(html.vars.TOKEN_ACCESO,UNIVERSAL,'la página recibe el valor de enlace');
  assert.equal(html.vars.TOKEN_INVITACION,UNIVERSAL);
  assert.equal(html.vars.MODO_OPERADOR,true,'la página base opera como operador');
  for(const vista of ['portal','pacientes','ficha','controles','estadisticas','configuracion','backups','registro','instalar','rem','generarRem','revision','ingresos']){
    assert.equal(ctx.doGet({parameter:{vista}}).tipo,'html',vista+' sin credencial: se sirve');
  }
});

t('4. La ficha carga sin credencial alguna',()=>{
  const pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PERSONA FICTICIA'};
  ctx.Modelo_leerPacientes=()=>[pac];
  ctx.Modelo_leerEventos=()=>[];
  for(const tok of [UNIVERSAL,INVALIDO,'']){
    const r=ctx.WebApp_cargarPacienteEdicion('11111111-1',tok);
    assert.equal(r.ok,true,'ficha abierta con "'+tok+'" (ya no se pide el QR actualizado)');
  }
});

t('5. El preflight no devuelve candidatos con PII sin pacientes cargados',()=>{
  ctx.Modelo_leerPacientes=()=>[];
  for(const tok of [UNIVERSAL,INVALIDO,'']){
    const r2=ctx.WebApp_previaDuplicadosV2({accion:'nuevoIngreso',rut:'11111111-1'},tok);
    assert.equal(r2.ok,true,'preflight autorizado con "'+tok+'"');
    const cands=r2.candidatos||r2.posibles||r2.coincidencias||[];
    assert.equal(cands.length,0,'preflight sin candidatos (sin PII de pacientes reales)');
  }
});

t('6. El acceso libre NO abre el webhook: su secreto sigue siendo propio',()=>{
  assert.equal(ctx._wh_despachar({parameter:{token:'otro',action:'estado'}}).texto.indexOf('NO_AUTORIZADO')!==-1,true,
    'un token de webhook equivocado se rechaza aunque el sistema sea libre');
  assert.equal(ctx._wh_despachar({parameter:{action:'estado'}}).texto.indexOf('NO_AUTORIZADO')!==-1,true,
    'sin token de webhook se rechaza');
  assert.equal(ctx._wh_despachar({parameter:{token:'secreto-webhook',action:'accionInventada'}}).texto.indexOf('ACCIÓN_INVALIDA')!==-1,true,
    'con el secreto correcto se alcanza el despacho');
});

t('7. Válvula ACCESO_LIBRE: al cerrarla, el sistema vuelve a pedir credencial',()=>{
  props.set('ACCESO_LIBRE','0');
  assert.equal(ctx.WebApp_autorizarBuscador(''),false,'sin token: denegado en modo cerrado');
  assert.equal(ctx.WebApp_autorizarBuscador(INVALIDO),false,'token inválido: denegado');
  assert.equal(ctx.WebApp_autorizarBuscador(UNIVERSAL),true,'token canónico: autorizado');
  assert.equal(ctx.WebApp_autorizarBuscador(LEGACY),true,'legacy: autorizado (transición)');
  assert.equal(ctx.api_revisionListar('').casos.length,0,'RPC sin token: sin datos');
  assert.equal(ctx.api_revisionListar('').codigo,'ACCESO_DENEGADO','RPC sin token: motivo de acceso');
  assert.equal(ctx.api_revisionListar(UNIVERSAL).codigo,undefined,'con token: entra de verdad');
  assert.equal(ctx.doGet({parameter:{vista:'controles'}}).tipo,'texto','sin token: se explica el enlace');
  assert.equal(ctx.doGet({parameter:{acceso:UNIVERSAL,vista:'controles'}}).tipo,'html','con token: sirve');
  props.delete('ACCESO_LIBRE');
  assert.equal(ctx.WebApp_autorizarBuscador(''),true,'al quitar la válvula: acceso libre');
});

console.log('Superficie de acceso libre: '+pruebas+'/'+pruebas);
