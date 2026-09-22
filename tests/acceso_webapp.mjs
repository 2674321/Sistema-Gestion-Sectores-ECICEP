#!/usr/bin/env node
// Acceso compartido sin cuenta Google: la URL base abre el canal de captura
// (QR impreso permanente); las demás vistas exigen el enlace compartido vigente.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../src/',import.meta.url);
const c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,root),'utf8'),c,{filename:f});
const props=new Map(),uuid='12345678-1234-4123-8123-123456789abc';
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
c.Utilities={getUuid:()=>uuid,formatDate:()=>''};
c.Session={getActiveUser:()=>({getEmail:()=>''})};
c.ContentService={createTextOutput:text=>({tipo:'texto',texto:text})};
let plantillas=0,plantillaArchivo='';
c.HtmlService={createTemplateFromFile:n=>{plantillas++;plantillaArchivo=n;return {evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}},XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}
t('La URL base abre la captura (sin cuenta ni token); ficha y RPC exigen enlace vigente',()=>{
  const html=c.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(plantillaArchivo,'CapturaWeb');
  assert.equal(html.vars.CAPTURA_ACCESO,props.get('CAPTURA_ACCESS_TOKEN'));
  assert.equal(c.doGet({parameter:{vista:'captura'}}).tipo,'html');
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1').ok,false);
  assert.equal(c.WebApp_estadoInicial('').ok,false);
  assert.equal(c.WebApp_capturarEnviar({}).ok,false);
  assert.equal(c.WebApp_previaDuplicadosV2({accion:'nuevoIngreso'},'x').ok,false);
  assert.equal(c.WebApp_capturarEstado('Cp4-'+'a'.repeat(32),'x').ok,false);
});
t('El QR genera clave propia y el mismo enlace funciona sin cuenta',()=>{
  const url=c.WebApp_urlCompartida_(),clave=props.get('CAPTURA_ACCESS_TOKEN');
  assert.match(clave,/^[0-9a-f]{64}$/);
  assert.equal(props.has('WEBHOOK_TOKEN'),false);
  assert.equal(url,c.ECICEP_webAppUrl()+'?acceso='+clave);
  assert.equal(c.WebApp_urlCompartida_(),url);
  const baseTpl=plantillas;
  assert.equal(c.doGet({parameter:{acceso:clave}}).tipo,'html');
  assert.equal(plantillaArchivo,'CapturaWeb');
  assert.equal(plantillas,baseTpl+1);
  assert.equal(c.Captura_v2_ctx(clave).usuario,'ACCESO_COMPARTIDO');
  assert.equal(c.Captura_v2_ctx('').usuario,'');
});
t('El mismo enlace abre funciones clínicas y paneles sin cuenta Google',()=>{
  const clave=props.get('CAPTURA_ACCESS_TOKEN');
  const rutas={portal:'PortalWeb',pacientes:'Sidebar',revision:'Sidebar',ficha:'Sidebar',controles:'Controles',estadisticas:'Dashboard',configuracion:'Configuracion',backups:'Backup',registro:'LogVisor',instalar:'Instalador',rem:'RemVista',generarRem:'RemGenerador'};
  for(const [vista,archivo] of Object.entries(rutas)){
    assert.equal(c.doGet({parameter:{acceso:clave,vista}}).tipo,'html',vista);
    assert.equal(plantillaArchivo,archivo,vista);
    assert.equal(c.doGet({parameter:{vista}}).tipo,'texto',vista+' sin clave');
  }
  assert.equal(c.doGet({parameter:{acceso:clave,vista:'noExiste'}}).tipo,'texto');
  c.Session={getActiveUser:()=>({getEmail:()=> 'otra-cuenta@example.org'})};
  assert.equal(c.doGet({parameter:{vista:'configuracion'}}).tipo,'texto');
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
  assert.equal(c.WebApp_urlVista_('controles'),c.WebApp_urlCompartida_()+'&vista=controles');
});
t('La ficha de Sheets usa la misma clave para buscar y actualizar la agenda',()=>{
  const clave=props.get('CAPTURA_ACCESS_TOKEN');
  let plantilla;
  c.Utilities.formatDate=()=>'';c._UI_tz=()=>'';
  c._UI_get=()=>({showSidebar(){}});
  c.HtmlService.createTemplateFromFile=()=>plantilla={evaluate(){return {setTitle(){return this;}};}};
  c._ui_sidebar('pacientes','Pacientes ECICEP');
  assert.equal(plantilla.TOKEN_INVITACION,clave);
  const sidebar=readFileSync(new URL('Sidebar.html',root),'utf8');
  assert.match(sidebar,/\.api_actualizarPaciente\(P_ACTUAL,\{PROXIMO_CONTROL:inp\.value\},TOKEN_INVITACION\)/);
});
t('La autorización se comprueba en cada RPC de captura',()=>{
  const clave=props.get('CAPTURA_ACCESS_TOKEN');
  let capturas=0;c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
  c.Captura_v2_enviar=(payload,ctx)=>{capturas++;assert.equal(ctx.usuario,'ACCESO_COMPARTIDO');return {ok:true};};
  assert.equal(c.WebApp_capturarEnviar({},clave).ok,true);
  assert.equal(c.WebApp_capturarEnviar({},'').ok,false);
  assert.equal(capturas,1);
  assert.equal(c.WebApp_estadoInicial(clave).url,c.WebApp_urlCompartida_());
  assert.equal(c.api_webappEstado(clave).url,c.WebApp_urlCompartida_());
  assert.equal(c.api_webappEstado('').ok,false);
});
t('La ficha carga y actualiza desde otra cuenta sin email con enlace válido',()=>{
  const clave=props.get('CAPTURA_ACCESS_TOKEN');
  const pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PERSONA FICTICIA',PROXIMO_CONTROL:''};
  c.Modelo_leerPacientes=()=>[pac];c.Modelo_leerEventos=()=>[];
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1','').ok,false);
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1',clave).ok,true);
  c.Modelo_buscarPaciente=()=>({obj:pac,idx:0});c.Modelo_asegurarEsquemaPacientes=()=>({ok:true});
  let filas=0;c.Modelo_hoja=()=>({getRange:()=>({setValues(){filas++;}})});
  c.Modelo_filaFisica=()=>2;c.Modelo_filaDesdeObjeto=o=>[o.PROXIMO_CONTROL];
  c.Modelo_invalidarLecturas=()=>{};c.Log_info=()=>{};c.Log_flush=()=>{};
  assert.equal(c.api_actualizarPaciente(pac.ID_INTERNO,{PROXIMO_CONTROL:'2026-10-20'}).ok,false);
  assert.equal(c.api_actualizarPaciente(pac.ID_INTERNO,{PROXIMO_CONTROL:'2026-10-20'},clave).ok,true);
  assert.equal(filas,1);
});
t('Dupla, registro, configuración y backups usan el acceso compartido',()=>{
  const clave=props.get('CAPTURA_ACCESS_TOKEN');
  assert.equal(c.api_duplaGuardar('P-FICTICIO',[]).motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_logLeer(10).motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_configGuardar('CLAVE','VALOR').motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_configAgregar('CLAVE','VALOR','').motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_configEliminar('CLAVE').motivo,'ACCESO_DENEGADO');
  for(const nombre of ['api_backupListar','api_backupToggle','api_backupConfigLeer','api_backupPodar','api_backupFolder'])
    assert.equal(c[nombre]().motivo,'ACCESO_DENEGADO',nombre);
  assert.equal(c.api_backupCrear('MANUAL').motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_backupProgramar('LUNES',3).motivo,'ACCESO_DENEGADO');
  c.Modelo_hoja=()=>null;
  assert.equal(c.api_logLeer(10,clave).ok,true);
  c.Backup_listar=()=>({items:[],autoCount:0,manCount:0});
  c.Backup_triggerInstalado=()=>false;
  c._config_leerValores=()=>({});
  assert.equal(c.api_backupListar(clave).ok,true);
  c.Backup_crear=()=>({ok:true});
  assert.equal(c.api_backupCrear('MANUAL',clave).ok,true);
  const sidebar=readFileSync(new URL('Sidebar.html',root),'utf8');
  assert.match(sidebar,/\.api_duplaGuardar\(pid,DUPLA_SELECCIONADAS\.slice\(\),TOKEN_INVITACION\)/);
  for(const [archivo, llamadas] of [
    ['LogVisor.html',['api_logLeer']],
    ['Configuracion.html',['api_configGuardar','api_configAgregar','api_configEliminar']],
    ['Backup.html',['api_backupListar','api_backupCrear','api_backupToggle','api_backupProgramar','api_backupConfigLeer','api_backupPodar','api_backupFolder']]
  ]){
    const html=readFileSync(new URL(archivo,root),'utf8');
    assert.match(html,/data-acceso="<\?= TOKEN_ACCESO \?>"/);
    for(const llamada of llamadas)assert.match(html,new RegExp('\\.'+llamada+'\\([^;]*ECICEP_ACCESO\\)'));
  }
});
t('Regresión: todo constructor inyecta el token antes de evaluate()',()=>{
  const clave=props.get('CAPTURA_ACCESS_TOKEN');
  assert.ok(clave);
  const ui={showModalDialog(){},showSidebar(){}};
  c._UI_get=()=>ui;
  for(const d of c.UICFG_DIALOGOS){
    const html=readFileSync(new URL(d.plantilla+'.html',root),'utf8');
    const necesitaAcceso=/TOKEN_ACCESO/.test(html);
    const necesitaInvitacion=/TOKEN_INVITACION/.test(html);
    if(!necesitaAcceso && !necesitaInvitacion)continue;
    let vars=null;
    c.HtmlService={createTemplateFromFile:()=>({evaluate(){vars=this;return {setTitle(){return this;},setWidth(){return this;},setHeight(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
    c[d.opener](d.opener==='UI_abrirFicha'?'11111111-1':undefined);
    assert.ok(vars, d.opener+' debió crear plantilla '+d.plantilla);
    if(necesitaAcceso)assert.equal(vars.TOKEN_ACCESO,clave,d.opener+' → TOKEN_ACCESO en '+d.plantilla);
    if(necesitaInvitacion)assert.equal(vars.TOKEN_INVITACION,clave,d.opener+' → TOKEN_INVITACION en '+d.plantilla);
  }
  const controles=readFileSync(new URL('Controles.html',root),'utf8');
  assert.match(controles,/\.api_controlPanel\(\{[^}]*\},\s*ECICEP_ACCESO\)/);
  assert.match(controles,/\.api_controlActualizarUltimo\([^;]*,\s*ECICEP_ACCESO\)/);
  const sidebar=readFileSync(new URL('Sidebar.html',root),'utf8');
  assert.ok(!/var ID_INICIAL = \(typeof ID_INICIAL !== 'undefined'\) \? ID_INICIAL : '';/.test(sidebar),
    'Sidebar.html no debe auto-sombrar ID_INICIAL (hoisting)');
  assert.match(sidebar,/id_inicial_safe|ID_INICIAL_SAFE/);
});
console.log('Acceso Web App: '+pruebas+'/'+pruebas);
