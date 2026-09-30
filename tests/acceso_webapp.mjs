#!/usr/bin/env node
// Acceso Web App — ACCESO LIBRE ECICEP (v0.16.0, DEC-097, supera DEC-068).
// El sistema NO pide permisos ni credenciales: toda vista y toda RPC abren
// con el enlace, sin token y sin sesión. El parámetro `?acceso=` se sigue
// inyectando en las páginas solo para que los enlaces/QR ya emitidos no
// cambien; no decide nada. La válvula ACCESO_LIBRE (probada al final) es la
// única forma de volver a exigir credenciales, y es deliberada.
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
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):'',setProperty:(k,v)=>props.set(k,v)})};
c.Utilities={getUuid:()=> 'c7c0d1e1-cafe-4bad-8ead-' + 'arrowofdmg',formatDate:()=>''};
c.Session={getActiveUser:()=>({getEmail:()=>''})};
c.ContentService={createTextOutput:text=>({tipo:'texto',texto:text,setMimeType(){return this;}}),MimeType:{JSON:'JSON'}};
let plantillas=0,plantillaArchivo='';
c.HtmlService={createTemplateFromFile:n=>{plantillas++;plantillaArchivo=n;return {evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}},XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

t('La URL base abre la captura y la inyecta en las tres variables',()=>{
  const html=c.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(plantillaArchivo,'CapturaWeb');
  assert.equal(html.vars.CAPTURA_ACCESO,TOKEN_UNIVERSAL);
  assert.equal(html.vars.TOKEN_ACCESO,TOKEN_UNIVERSAL,'página operativa recibe el valor de enlace');
  assert.equal(html.vars.TOKEN_INVITACION,TOKEN_UNIVERSAL);
  assert.equal(html.vars.MODO_OPERADOR,true,'MODO_OPERADOR activo en el canal de captura');
  assert.ok(html.vars.PORTAL_URL,'la página operativa siempre ofrece el portal');
  assert.equal(c.doGet({parameter:{vista:'captura'}}).tipo,'html');
});

t('La URL universal es única: QR, captura y vistas usan el mismo valor',()=>{
  const url=c.WebApp_urlCompartida_();
  assert.equal(url,c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL);
  assert.equal(c.WebApp_urlCompartida_(),c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL);
  assert.equal(c.WebApp_urlCaptura_(),c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL);
  assert.equal(c.WebApp_urlVista_('controles'),c.ECICEP_webAppUrl()+'?acceso='+TOKEN_UNIVERSAL+'&vista=controles');
  const baseTpl=plantillas;
  assert.equal(c.doGet({parameter:{acceso:TOKEN_UNIVERSAL}}).tipo,'html');
  assert.equal(plantillaArchivo,'CapturaWeb');
  assert.equal(plantillas,baseTpl+1);
  // La atribución nunca bloquea el envío: sin sesión de Google (es el caso del
  // QR anónimo) el ctx lleva una etiqueta estable en vez de cadena vacía.
  assert.equal(c.Captura_v2_ctx(TOKEN_UNIVERSAL).usuario,'ACCESO_LIBRE');
  assert.equal(c.Captura_v2_ctx('').usuario,'ACCESO_LIBRE','sin token tampoco queda sin atribuir');
  c.Session={getActiveUser:()=>({getEmail:()=>'trabajador@cesfam.cl'})};
  assert.equal(c.Captura_v2_ctx('').usuario,'trabajador@cesfam.cl','con sesión se atribuye el correo real');
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
});

t('Todas las vistas operativas abren SIN token y SIN sesión',()=>{
  const rutas={portal:'PortalWeb',pacientes:'Sidebar',ingresos:'Sidebar',revision:'Sidebar',ficha:'Sidebar',controles:'Controles',estadisticas:'Dashboard',configuracion:'Configuracion',backups:'Backup',registro:'LogVisor',instalar:'Instalador',rem:'RemVista',generarRem:'RemGenerador'};
  for(const vista of Object.keys(rutas)){
    const sinToken=c.doGet({parameter:{vista}});
    assert.equal(sinToken.tipo,'html',vista+' abre sin token (acceso libre)');
    assert.equal(plantillaArchivo,rutas[vista],vista);
    assert.equal(sinToken.vars.TOKEN_ACCESO,TOKEN_UNIVERSAL,vista+'→ TOKEN_ACCESO');
    // El token del enlace sigue funcionando, por compatibilidad con los QR impresos.
    assert.equal(c.doGet({parameter:{acceso:TOKEN_UNIVERSAL,vista}}).tipo,'html',vista+' con enlace antiguo');
    assert.equal(c.doGet({parameter:{acceso:TOKEN_LEGACY,vista}}).tipo,'html',vista+' con enlace legacy');
    assert.equal(c.doGet({parameter:{acceso:TOKEN_INVALIDO,vista}}).tipo,'html',vista+' con enlace inválido');
  }
  assert.equal(c.doGet({parameter:{acceso:TOKEN_UNIVERSAL,vista:'noExiste'}}).tipo,'texto',
    'una vista inexistente sí se explica: no es un problema de acceso');
  const ingresos=c.doGet({parameter:{vista:'ingresos'}});
  assert.equal(ingresos.vars.modo,'ingresos','la incorporación abre el modo correcto');
});

t('Cada RPC se autoriza: con enlace, sin token o con token inválido, todas pasan',()=>{
  let capturas=0;
  c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
  c.Captura_v2_enviar=(payload,ctx)=>{capturas++;return {ok:true};};
  for(const tok of [TOKEN_UNIVERSAL,TOKEN_LEGACY,TOKEN_INVALIDO,'']){
    assert.equal(c.WebApp_capturarEnviar({},tok).ok,true,'envío autorizado con "'+tok+'"');
  }
  assert.equal(capturas,4,'los cuatro entornos llegaron al pipeline: ninguno se detuvo en el acceso');
  c.WebApp_profesionalesDropdown=()=>[{nombre:'Pro.'+'f',profesion:'MEDICO',id:1}];
  for(const tok of [TOKEN_UNIVERSAL,TOKEN_LEGACY,TOKEN_INVALIDO,'']){
    const ei=c.WebApp_estadoInicial(tok);
    assert.equal(ei.url,c.WebApp_urlCompartida_(),'estadoInicial autorizado con "'+tok+'"');
    assert.equal(c.api_webappEstado(tok).url,c.WebApp_urlCompartida_(),'webappEstado autorizado con "'+tok+'"');
  }
});

t('La ficha de Sheets usa el valor de enlace para buscar y actualizar la agenda',()=>{
  let plantilla;
  c.Utilities.formatDate=()=>'';c._UI_tz=()=>'';
  c._UI_get=()=>({showSidebar(){}});
  c.HtmlService.createTemplateFromFile=()=>plantilla={evaluate(){return {setTitle(){return this;}};}};
  c._ui_sidebar('pacientes','Pacientes ECICEP');
  assert.equal(plantilla.TOKEN_INVITACION,TOKEN_UNIVERSAL,'sidebar recibe el valor de enlace');
  const sidebar=readFileSync(new URL('Sidebar.html',root),'utf8');
  assert.match(sidebar,/\.api_fichaGuardarCambios\(P_ACTUAL,\{PROXIMO_CONTROL:\{anterior:[^,]*,valor:inp\.value\}\},TOKEN_INVITACION\)/);
});

t('La ficha carga y se actualiza con cualquier enlace (y también sin ninguno)',()=>{
  const pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PERSONA FICTICIA',PROXIMO_CONTROL:''};
  c.Modelo_leerPacientes=()=>[pac];c.Modelo_leerEventos=()=>[];
  for(const tok of [TOKEN_UNIVERSAL,TOKEN_LEGACY,TOKEN_INVALIDO,'']){
    const r=c.WebApp_cargarPacienteEdicion('11111111-1',tok);
    assert.equal(r.ok,true,'ficha abierta con "'+tok+'" (ya no se pide el QR actualizado)');
  }
  c.Modelo_buscarPaciente=()=>({obj:pac,idx:0});c.Modelo_asegurarEsquemaPacientes_=()=>({ok:true});
  let filas=0;c.Modelo_hoja=()=>({getRange:()=>({setValues(){filas++;}})});
  c.Modelo_filaFisica=()=>2;c.Modelo_filaDesdeObjeto=o=>[o.PROXIMO_CONTROL];
  c.Modelo_invalidarLecturas=()=>{};c.Log_info=()=>{};c.Log_flush=()=>{};
  for(const tok of [TOKEN_UNIVERSAL,TOKEN_INVALIDO,'']){
    const r=c.api_actualizarPaciente(pac.ID_INTERNO,{PROXIMO_CONTROL:'2026-10-20'},tok);
    assert.equal(r.ok,true,'api_actualizarPaciente acepta "'+tok+'"');
  }
  assert.equal(filas,3,'las tres actualizaciones escribieron');
});

t('RPC administrativas: todas disponibles, con enlace o sin él',()=>{
  c.Modelo_hoja=()=>null;
  c.Backup_listar=()=>({items:[],autoCount:0,manCount:0});
  c.Backup_triggerInstalado=()=>false;
  c._config_leerValores=()=>({});
  c.Backup_crear=()=>({ok:true});
  const disponibles=[
    ['api_logLeer',[10]],['api_backupListar',[]],['api_backupCrear',['MANUAL']],
    ['api_backupConfigLeer',[]],['api_configListar',[]]
  ];
  for(const tok of [TOKEN_UNIVERSAL,TOKEN_INVALIDO,'']){
    for(const [nombre,args] of disponibles){
      const r=c[nombre](...args,tok);
      assert.notEqual(r.motivo,'ACCESO_DENEGADO',nombre+' con "'+tok+'" ya no se deniega por acceso');
    }
    assert.equal(c.api_logLeer(10,tok).ok,true);
    assert.equal(c.api_backupListar(tok).ok,true);
    assert.equal(c.api_backupCrear('MANUAL',tok).ok,true);
  }
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

t('Todo constructor de dialogo inyecta el valor de enlace antes de evaluate()',()=>{
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
  assert.match(controles,/ECICEP_lectura\('api_controlPanel',\s*\[\{[\s\S]*?ECICEP_ACCESO\],/);
  assert.match(controles,/\.api_controlActualizarUltimo\([^;]*,\s*ECICEP_ACCESO\)/);
  const sidebar=readFileSync(new URL('Sidebar.html',root),'utf8');
  assert.ok(!/var ID_INICIAL = \(typeof ID_INICIAL !== 'undefined'\) \? ID_INICIAL : '';/.test(sidebar),
    'Sidebar.html no debe auto-sombrar ID_INICIAL (hoisting)');
  assert.match(sidebar,/id_inicial_safe|ID_INICIAL_SAFE/);
});

t('Válvula: con ACCESO_LIBRE=0 el sistema vuelve a pedir credencial',()=>{
  // El bucle de diálogos dejó un HtmlService mínimo: se restaura el completo.
  c.HtmlService={createTemplateFromFile:n=>{plantillaArchivo=n;return {evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}},XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
  props.set('ACCESO_LIBRE','0');
  assert.equal(c.doGet({parameter:{vista:'controles'}}).tipo,'texto','sin token: se explica el enlace no válido');
  assert.equal(c.doGet({parameter:{acceso:TOKEN_INVALIDO,vista:'controles'}}).tipo,'texto','token inválido: rechazado');
  assert.equal(c.doGet({parameter:{acceso:TOKEN_UNIVERSAL,vista:'controles'}}).tipo,'html','token canónico: entra');
  assert.equal(c.WebApp_autorizarBuscador(''),false);
  props.delete('ACCESO_LIBRE');
  assert.equal(c.doGet({parameter:{vista:'controles'}}).tipo,'html','al quitar la válvula, acceso libre otra vez');
});

console.log('Acceso Web App: '+pruebas+'/'+pruebas);
