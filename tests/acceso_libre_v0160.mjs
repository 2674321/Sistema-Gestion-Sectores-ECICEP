#!/usr/bin/env node
// ACCESO LIBRE ECICEP — v0.16.0 (DEC-097, supera DEC-068).
// Contrato vigente: el sistema NO pide permisos ni credenciales.
//   A. ACCESO_LIBRE ausente (por defecto) => ACCESO LIBRE: WebApp_autorizar
//      concede SIEMPRE, sin sesión y sin token (incluido '' / undefined / basura).
//   B. Válvula de seguridad: ACCESO_LIBRE = 0/false/no/off/cerrado devuelve el
//      comportamiento cerrado (sesión o token universal). Es la única forma de
//      volver a pedir credenciales, y es deliberada.
//   C. La clave `?acceso=` ya NO es credencial: se conserva para que los
//      enlaces/QR impresos no cambien. WebApp_claveUniversal_ NUNCA lanza.
//   D. doGet sirve cualquier vista SIN token y SIN sesión (acceso libre real).
//   E. El cliente ya no oculta funciones y conserva la auto-recuperación.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../src/',import.meta.url);
let c;
function nuevoContexto() {
  c=vm.createContext({console:{log(){},warn(){},error(){}}});
  for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())
    vm.runInContext(readFileSync(new URL(f,root),'utf8'),c,{filename:f});
}
const CANONICO='a'.repeat(64);
const LEGACY='b'.repeat(64);
const INVALIDO='9'.repeat(64);
let props=new Map();
function sembrarProps(objeto){
  props=new Map(Object.entries(objeto||{}));
  c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):'',setProperty:(k,v)=>props.set(k,v)})};
}
let tryLockLlamadas=0,lockOcupado=false;
function sembrarLock(ocupado){
  lockOcupado=!!ocupado;tryLockLlamadas=0;
  c.LockService={getScriptLock:()=>({tryLock:function(){tryLockLlamadas++;return !lockOcupado;},releaseLock(){}}),getPreemptionMode:()=>{}};
}
function baseMocks(){
  c.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
  c.ContentService={createTextOutput:text=>({tipo:'texto',texto:text,setMimeType(){return this;}}),MimeType:{JSON:'JSON'}};
  c.HtmlService={createTemplateFromFile:n=>({evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
}
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

nuevoContexto();baseMocks();sembrarLock(false);

// Ausencia de ACCESO_LIBRE = sistema libre. Es el estado de fábrica: nadie
// tiene que ejecutar un paso de "autorizar" para que el sistema funcione.
sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO});

t('A1. Sin ACCESO_LIBRE el sistema es libre y autoriza siempre',()=>{
  assert.equal(props.has('ACCESO_LIBRE'),false,'la propiedad no existe por defecto');
  assert.equal(c.WebApp_accesoLibre_(),true);
  assert.equal(c.WebApp_autorizar(CANONICO),true,'token canónico');
  assert.equal(c.WebApp_autorizar(INVALIDO),true,'token inválido también: no hay credencial que comprobar');
  assert.equal(c.WebApp_autorizar(''),true,'token vacío');
  assert.equal(c.WebApp_autorizar(undefined),true,'token ausente');
  assert.equal(c.WebApp_autorizar(null),true,'token nulo');
  assert.equal(c.WebApp_autorizarBuscador(''),true);
  assert.equal(c.WebApp_autorizarCaptura(undefined),true);
});

t('A2. Los alias heredados de capacidad siguen delegando y conceden',()=>{
  assert.equal(c.WebApp_claveCaptura_(),CANONICO);
  assert.equal(c.WebApp_claveOperador_(),CANONICO);
  assert.equal(c.WebApp_claveCompartida_(),CANONICO);
  assert.equal(c.WebApp_autorizarBuscador('lo-que-sea'),true);
  assert.equal(c.WebApp_autorizarCaptura('lo-que-sea'),true);
});

t('B. Válvula ACCESO_LIBRE: solo un 0/false/no/off/cerrado explícito cierra el sistema',()=>{
  for(const v of ['1','true','si','sí','SI','on','abierto','']){
    sembrarProps({ACCESO_LIBRE:v,CAPTURA_ACCESS_TOKEN:CANONICO});
    assert.equal(c.WebApp_accesoLibre_(),true,'valor "'+v+'" = libre');
    assert.equal(c.WebApp_autorizar(INVALIDO),true,'valor "'+v+'" autoriza sin token');
  }
  for(const v of ['0','false','no','NO','off','cerrado','Cerrado']){
    sembrarProps({ACCESO_LIBRE:v,CAPTURA_ACCESS_TOKEN:CANONICO,OPERADOR_ACCESS_TOKEN:LEGACY});
    assert.equal(c.WebApp_accesoLibre_(),false,'valor "'+v+'" = cerrado');
    assert.equal(c.WebApp_autorizar(CANONICO),true,'cerrado: el token canónico sigue entrando');
    assert.equal(c.WebApp_autorizar(LEGACY),true,'cerrado: el legacy de transición sigue entrando');
    assert.equal(c.WebApp_autorizar(INVALIDO),false,'cerrado: token inválido rechazado');
    assert.equal(c.WebApp_autorizar(''),false,'cerrado: token vacío rechazado');
    assert.equal(c.WebApp_autorizar(undefined),false,'cerrado: token ausente rechazado');
  }
  // Modo cerrado + sesión activa entra sin token (contrato heredado v0.10.3).
  sembrarProps({ACCESO_LIBRE:'0',CAPTURA_ACCESS_TOKEN:CANONICO});
  c.Session={getActiveUser:()=>({getEmail:()=>'trabajador@cesfam.cl'})};
  assert.equal(c.WebApp_autorizar(''),true,'cerrado: la sesión activa habilita');
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
});

t('C1. La clave ?acceso= se conserva para los enlaces impresos, pero ya no es credencial',()=>{
  sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO});sembrarLock(false);
  assert.equal(c.WebApp_claveUniversal_(),CANONICO,'la clave existente no se toca');
  assert.equal(tryLockLlamadas,0,'con clave presente no se consulta el lock');
  assert.equal(c.WebApp_urlCompartida_(),c.ECICEP_webAppUrl()+'?acceso='+CANONICO,
    'los enlaces y QR ya emitidos conservan exactamente su forma');
});

t('C2. WebApp_claveUniversal_ NUNCA lanza: sin clave y con contención devuelve ""',()=>{
  sembrarProps({});sembrarLock(false);
  const creada=c.WebApp_claveUniversal_();
  assert.ok(creada&&/^[0-9a-f]{64}$/.test(creada),'crea clave universal de 64 hex');
  assert.equal(tryLockLlamadas,1,'lock solo para crear');
  assert.equal(props.get('CAPTURA_ACCESS_TOKEN'),creada,'la clave creada se persiste');
  const antes=tryLockLlamadas;
  assert.equal(c.WebApp_claveUniversal_(),creada);
  assert.equal(tryLockLlamadas,antes,'no recrea ni consulta lock con clave presente');
  // Antes esto abortaba la request entera; ahora degrada a "" sin romper nada.
  sembrarProps({});sembrarLock(true);
  assert.equal(c.WebApp_claveUniversal_(),'','contención sin clave: "" en vez de lanzar');
});

t('C3. Sin clave, la URL compartida sigue siendo usable y las vistas usan "?"',()=>{
  sembrarProps({});sembrarLock(true); // sin clave y con lock ocupado
  const base=c.ECICEP_webAppUrl();
  assert.equal(c.WebApp_urlCompartida_(),base,'URL desnuda en vez de cadena vacía');
  assert.ok(c.WebApp_urlCompartida_().length>0,'nunca devuelve URL vacía');
  assert.equal(c.WebApp_urlVista_('portal'),base+'?vista=portal','separador "?" cuando no hay consulta');
  assert.equal(c.WebApp_urlVista_('rem'),base+'?vista=rem');
  assert.equal(c.WebApp_urlCaptura_(),base);
  assert.equal(c.WebApp_urlOperadorVista_('ficha'),base+'?vista=ficha');
  sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO});sembrarLock(false);
  assert.equal(c.WebApp_urlVista_('portal'),base+'?acceso='+CANONICO+'&vista=portal','con clave: "&"');
});

t('D1. doGet sirve la captura sin token y sin sesión (acceso libre)',()=>{
  sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO});sembrarLock(false);
  const html=c.doGet({parameter:{}});
  assert.equal(html.tipo,'html','la vista por defecto se sirve sin credencial');
  assert.equal(html.vars.MODO_OPERADOR,true,'siempre modo operador');
  assert.equal(html.vars.PORTAL_URL,c.ECICEP_webAppUrl()+'?acceso='+CANONICO+'&vista=portal');
});

t('D2. doGet sirve CUALQUIER vista sin token: nadie ve "enlace no válido"',()=>{
  const base=c.ECICEP_webAppUrl();
  for(const vista of ['portal','pacientes','ingresos','revision','ficha','controles',
      'estadisticas','configuracion','backups','registro','instalar','rem','generarRem']){
    const r=c.doGet({parameter:{vista}});
    assert.equal(r.tipo,'html',vista+' se sirve sin token');
    assert.equal(r.vars.TOKEN_ACCESO,CANONICO,vista+' recibe la credencial en TOKEN_ACCESO');
    assert.equal(r.vars.TOKEN_INVITACION,CANONICO,vista+' recibe la credencial en TOKEN_INVITACION');
  }
  assert.equal(c.doGet({parameter:{}}).tipo,'html');
  assert.equal(c.doGet({parameter:{acceso:'',vista:'portal'}}).tipo,'html','token vacío: se sirve igual');
  assert.equal(c.doGet({parameter:{acceso:INVALIDO,vista:'portal'}}).tipo,'html','token inválido: se sirve igual');
  const inexistente=c.doGet({parameter:{vista:'noExiste'}});
  assert.equal(inexistente.tipo,'texto','una vista inexistente sí se explica');
});

t('D3. El acceso libre NO abre el webhook: su secreto es de integración, no de personas',()=>{
  sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO,WEBHOOK_TOKEN:'secreto-webhook'});
  const mala=c.doGet({parameter:{token:'otro',action:'noExiste'}});
  assert.equal(mala.tipo,'texto');
  assert.ok(mala.texto.indexOf('NO_AUTORIZADO')!==-1,'un token de webhook equivocado se rechaza igual');
  const buena=c.doGet({parameter:{token:'secreto-webhook',action:'noExiste'}});
  assert.ok(buena.texto.indexOf('ACCIÓN_INVALIDA')!==-1,'con el secreto correcto llega al despacho (no es una vista HTML)');
});

t('E. El cliente nunca oculta funciones por falta de capacidad',()=>{
  const html=readFileSync(new URL('CapturaWeb.html',root),'utf8');
  assert.ok(!html.includes('if(!window.ECICEP_MODO_OPERADOR)'),'sin gating por MODO_OPERADOR');
  assert.ok(!html.includes('cardActualizar");if(a)a.style.display="none"'),'cardActualizar nunca se oculta');
  assert.ok(html.includes('id="cardActualizar"'),'la tarjeta ACTUALIZAR_DATOS sigue presente en el DOM');
  assert.ok(html.includes('_recargarAcceso'),'auto-recuperación definida');
  assert.ok(html.includes('ecicep_captureId'),'preserva captureId en la recarga');
  assert.ok(html.includes('ecicep_reload_acceso'),'recarga una sola vez');
});

t('F. RPC y flujo de captura: con acceso libre todo opera, sin importar el token',()=>{
  sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO});sembrarLock(false);
  c.Modelo_leerPacientes=()=>[];c.Modelo_leerEventos=()=>[];
  c.Form_esquemaFormulario=()=>({});
  c.WebApp_profesionalesDropdown=()=>[{nombre:'Pro.'+'f',profesion:'MEDICO',id:1}];
  for(const tok of [CANONICO,LEGACY,INVALIDO,'']){
    const ei=c.WebApp_estadoInicial(tok);
    assert.equal(ei.url,c.WebApp_urlCompartida_(),'estadoInicial autoriza con token "'+tok+'"');
    assert.ok(Array.isArray(ei.profesionales),'estadoInicial entrega catálogo con "'+tok+'"');
    assert.equal(c.WebApp_previaDuplicadosV2({accion:'nuevoIngreso'},tok).ok,true,'preflight con "'+tok+'"');
    assert.equal(c.WebApp_capturarEstado('Cp4-'+'a'.repeat(32),tok).ok,false,
      'estado: anónimo (sin datos) pero AUTORIZADO con "'+tok+'"');
  }
  c.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock(){}})};
  c.Captura_v2_enviar=()=>({ok:true});
  const ocupado=c.WebApp_capturarEnviar({},'');
  assert.equal(ocupado.ok,false,'servicio ocupado: el motivo es el lock, nunca el acceso');
});

t('G. La atribución nunca bloquea el envío (causa raíz del error en producción)',()=>{
  sembrarProps({CAPTURA_ACCESS_TOKEN:CANONICO});sembrarLock(false);
  c.Modelo_leerPacientes=()=>[];c.Modelo_leerEventos=()=>[];
  c.Form_esquemaFormulario=()=>({});
  c.WebApp_profesionalesDropdown=()=>[{nombre:'Pro.'+'f',profesion:'MEDICO',id:1}];
  // Sin sesión de Google es el caso real del QR anónimo. Antes el ctx quedaba
  // con usuario='' y Captura_v2_enviar rechazaba con "acceso denegado",
  // perdiendo el registro. Ahora siempre hay atribución.
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
  for(const tok of [CANONICO,LEGACY,INVALIDO,'']){
    const ctx=c.Captura_v2_ctx(tok);
    assert.ok(ctx.usuario,'ctx con token "'+tok+'": la atribución no puede quedar vacía');
    assert.equal(ctx.usuario,'ACCESO_LIBRE','etiqueta estable para el acceso anónimo');
  }
  c.Session={getActiveUser:()=>({getEmail:()=>'trabajador@cesfam.cl'})};
  assert.equal(c.Captura_v2_ctx('').usuario,'trabajador@cesfam.cl','con sesión se atribuye el correo real');
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
  // Y el envío llega de verdad al pipeline, sin token y sin sesión.
  c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
  c.Captura_v2_enviar=(p,ctx)=>({ok:true,recibido:true,usuario:ctx.usuario});
  for(const tok of [CANONICO,INVALIDO,'']){
    const r=c.WebApp_capturarEnviar({},tok);
    assert.equal(r.ok,true,'envío aceptado con token "'+tok+'"');
    assert.equal(r.usuario,'ACCESO_LIBRE','y sale registrado con la etiqueta estable');
  }
});

console.log('Acceso libre v0.16.0: '+pruebas+'/'+pruebas);
