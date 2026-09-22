#!/usr/bin/env node
// Acceso Web App — ACCESO UNIVERSAL ECICEP (v0.10.4, DEC-068).
// Una sola credencial (CAPTURA_ACCESS_TOKEN conservado) habilita TODAS las
// funciones operativas: captura, ficha, paneles y RPC administrativas.
// OPERADOR_ACCESS_TOKEN (v0.10.3) se acepta como legacy de transición.
// Con el enlace del sistema se puede capturar y administrar; sin token o con
// token inválido toda RPC se niega (ACCESO_DENEGADO).
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../src/',import.meta.url);
const c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,root),'utf8'),c,{filename:f});
const TOKEN_UNIVERSAL='a'.repeat(64);
const TOKEN_LEGACY='b'.repeat(64);
const TOKEN_INVALIDO='0'.repeat(64);
assert.notEqual(TOKEN_UNIVERSAL,TOKEN_LEGACY,'tokens mock distintos');
const props=new Map();
props.set('CAPTURA_ACCESS_TOKEN',TOKEN_UNIVERSAL);
props.set('OPERADOR_ACCESS_TOKEN',TOKEN_LEGACY);
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
c.Utilities={getUuid:()=> 'c7c0d1e1-cafe-4bad-8ead-' + 'arrowofdmg',formatDate:()=>''};
c.Session={getActiveUser:()=>({getEmail:()=>''})};
c.ContentService={createTextOutput:text=>({tipo:'texto',texto:text})};
let plantillas=0,plantillaArchivo='';
c.HtmlService={createTemplateFromFile:n=>{plantillas++;plantillaArchivo=n;return {evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}},XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

t('La URL base abre la captura con la credencial universal en las tres variables',()=>{
  const html=c.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(plantillaArchivo,'CapturaWeb');
  assert.equal(html.vars.CAPTURA_ACCESO,TOKEN_UNIVERSAL);
  assert.equal(html.vars.TOKEN_ACCESO,TOKEN_UNIVERSAL,'página operativa recibe la credencial universal');
  assert.equal(html.vars.TOKEN_INVITACION,TOKEN_UNIVERSAL);
  assert.equal(html.vars.MODO_OPERADOR,true,'MODO_OPERADOR activo en el canal de captura');
  assert.ok(html.vars.PORTAL_URL,'la página operativa siempre ofrece el portal');
  assert.equal(c.doGet({parameter:{vista:'captura'}}).tipo,'html');
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1').ok,false);
  assert.equal(c.WebApp_estadoInicial('').ok,false);
  assert.equal(c.WebApp_capturarEnviar({}).ok,false);
  assert.equal(c.WebApp_previaDuplicadosV2({accion:'nuevoIngreso'},'x').ok,false);
  assert.equal(c.WebApp_capturarEstado('Cp4-'+'a'.repeat(32),'x').ok,false);
});

t('La URL universal es única: QR, captura y vistas usan la misma credencial',()=>{
  const url=c.WebApp_urlCompartida_();
  assert.equal(url,c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL);
  assert.equal(c.WebApp_urlCompartida_(),c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL);
  assert.equal(c.WebApp_urlCaptura_(),c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL);
  assert.equal(c.WebApp_urlVista_('controles'),c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL+'&vista=controles');
  const baseTpl=plantillas;
  assert.equal(c.doGet({parameter:{acceso:TOKEN_UNIVERSAL}}).tipo,'html');
  assert.equal(plantillaArchivo,'CapturaWeb');
  assert.equal(plantillas,baseTpl+1);
  assert.equal(c.Captura_v2_ctx(TOKEN_UNIVERSAL).usuario,'ACCESO_COMPARTIDO');
  assert.equal(c.Captura_v2_ctx('').usuario,'');
});

t('Todas las vistas operativas abren con la credencial universal (y con el legacy v0.10.3)',()=>{
  const rutas={portal:'PortalWeb',pacientes:'Sidebar',revision:'Sidebar',ficha:'Sidebar',controles:'Controles',estadisticas:'Dashboard',configuracion:'Configuracion',backups:'Backup',registro:'LogVisor',instalar:'Instalador',rem:'RemVista',generarRem:'RemGenerador'};
  for(const vista of Object.keys(rutas)){
    const ok=c.doGet({parameter:{acceso:TOKEN_UNIVERSAL,vista}});
    assert.equal(ok.tipo,'html',vista+' con credencial universal abre');
    assert.equal(plantillaArchivo,rutas[vista],vista);
    assert.equal(ok.vars.TOKEN_ACCESO,TOKEN_UNIVERSAL,vista+'→ TOKEN_ACCESO universal');
    const leg=c.doGet({parameter:{acceso:TOKEN_LEGACY,vista}});
    assert.equal(leg.tipo,'html',vista+' con legacy OPERADOR abre (transición)');
  }
  assert.equal(c.doGet({parameter:{acceso:TOKEN_INVALIDO,vista:'controles'}}).tipo,'texto');
  assert.equal(c.doGet({parameter:{acceso:'',vista:'controles'}}).tipo,'texto');
  assert.equal(c.doGet({parameter:{acceso:TOKEN_UNIVERSAL,vista:'noExiste'}}).tipo,'texto');
  c.Session={getActiveUser:()=>({getEmail:()=> 'otra-cuenta@example.org'})};
  assert.equal(c.doGet({parameter:{vista:'configuracion'}}).tipo,'html');
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
});

t('La ficha de Sheets usa la credencial universal para buscar y actualizar la agenda',()=>{
  let plantilla;
  c.Utilities.formatDate=()=>'';c._UI_tz=()=>'';
  c._UI_get=()=>({showSidebar(){}});
  c.HtmlService.createTemplateFromFile=()=>plantilla={evaluate(){return {setTitle(){return this;}};}};
  c._ui_sidebar('pacientes','Pacientes ECICEP');
  assert.equal(plantilla.TOKEN_INVITACION,TOKEN_UNIVERSAL,'sidebar recibe la credencial universal');
  const sidebar=readFileSync(new URL('Sidebar.html',root),'utf8');
  assert.match(sidebar,/\.api_actualizarPaciente\(P_ACTUAL,\{PROXIMO_CONTROL:inp\.value\},TOKEN_INVITACION\)/);
});

t('Cada RPC se autoriza: con la credencial universal pasa, sin token o inválido se niega',()=>{
  let capturas=0;c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
  c.Captura_v2_enviar=(payload,ctx)=>{capturas++;assert.equal(ctx.usuario,'ACCESO_COMPARTIDO');return {ok:true};};
  assert.equal(c.WebApp_capturarEnviar({},TOKEN_UNIVERSAL).ok,true);
  assert.equal(c.WebApp_capturarEnviar({},TOKEN_LEGACY).ok,true,'legacy v0.10.3 sigue autorizando captura (transición)');
  assert.equal(c.WebApp_capturarEnviar({},'').ok,false);
  assert.equal(c.WebApp_capturarEnviar({},TOKEN_INVALIDO).ok,false);
  assert.equal(capturas,2);
  assert.equal(c.WebApp_estadoInicial(TOKEN_UNIVERSAL).url,c.WebApp_urlCompartida_());
  assert.equal(c.api_webappEstado(TOKEN_UNIVERSAL).url,c.WebApp_urlCompartida_());
  assert.equal(c.api_webappEstado(TOKEN_LEGACY).url,c.WebApp_urlCompartida_());
  assert.equal(c.api_webappEstado('').ok,false);
});

t('La ficha carga con la credencial universal y se actualiza con la misma credencial',()=>{
  const pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PERSONA FICTICIA',PROXIMO_CONTROL:''};
  c.Modelo_leerPacientes=()=>[pac];c.Modelo_leerEventos=()=>[];
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1',TOKEN_UNIVERSAL).ok,true,
    'ficha abre con la credencial universal');
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1',TOKEN_LEGACY).ok,true,
    'ficha abre con legacy v0.10.3 (transición)');
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1','').ok,false);
  assert.equal(c.WebApp_cargarPacienteEdicion('11111111-1',TOKEN_INVALIDO).ok,false);
  c.Modelo_buscarPaciente=()=>({obj:pac,idx:0});c.Modelo_asegurarEsquemaPacientes_=()=>({ok:true});
  let filas=0;c.Modelo_hoja=()=>({getRange:()=>({setValues(){filas++;}})});
  c.Modelo_filaFisica=()=>2;c.Modelo_filaDesdeObjeto=o=>[o.PROXIMO_CONTROL];
  c.Modelo_invalidarLecturas=()=>{};c.Log_info=()=>{};c.Log_flush=()=>{};
  assert.equal(c.api_actualizarPaciente(pac.ID_INTERNO,{PROXIMO_CONTROL:'2026-10-20'}).ok,false);
  assert.equal(c.api_actualizarPaciente(pac.ID_INTERNO,{PROXIMO_CONTROL:'2026-10-20'},TOKEN_UNIVERSAL).ok,true,
    'api_actualizarPaciente acepta la credencial universal');
  assert.equal(filas,1);
});

t('RPC administrativas: la credencial universal las habilita; sin token o inválido se niegan',()=>{
  for(const [nombre,args] of [
    ['api_duplaGuardar',['P-FICTICIO',[]]],
    ['api_logLeer',[10]],
    ['api_configGuardar',['CLAVE','VALOR']],
    ['api_configAgregar',['CLAVE','VALOR','']],
    ['api_configEliminar',['CLAVE']]
  ]) assert.equal(c[nombre](...args).motivo,'ACCESO_DENEGADO',nombre+' sin token');
  for(const nombre of ['api_backupListar','api_backupToggle','api_backupConfigLeer','api_backupPodar','api_backupFolder'])
    assert.equal(c[nombre]().motivo,'ACCESO_DENEGADO',nombre);
  assert.equal(c.api_backupCrear('MANUAL').motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_backupProgramar('LUNES',3).motivo,'ACCESO_DENEGADO');
  for(const [nombre,args] of [
    ['api_logLeer',[10]],
    ['api_backupCrear',['MANUAL']],
    ['api_backupListar',[]]
  ]) assert.equal(c[nombre](...args,TOKEN_INVALIDO).motivo,'ACCESO_DENEGADO',nombre+' con token inválido');
  c.Modelo_hoja=()=>null;
  assert.equal(c.api_logLeer(10,TOKEN_UNIVERSAL).ok,true);
  c.Backup_listar=()=>({items:[],autoCount:0,manCount:0});
  c.Backup_triggerInstalado=()=>false;
  c._config_leerValores=()=>({});
  assert.equal(c.api_backupListar(TOKEN_UNIVERSAL).ok,true);
  c.Backup_crear=()=>({ok:true});
  assert.equal(c.api_backupCrear('MANUAL',TOKEN_UNIVERSAL).ok,true);
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

t('Todo constructor de dialogo inyecta la credencial universal antes de evaluate()',()=>{
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
    if(necesitaAcceso)assert.equal(vars.TOKEN_ACCESO,TOKEN_UNIVERSAL,d.opener+' → TOKEN_ACCESO en '+d.plantilla);
    if(necesitaInvitacion)assert.equal(vars.TOKEN_INVITACION,TOKEN_UNIVERSAL,d.opener+' → TOKEN_INVITACION en '+d.plantilla);
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