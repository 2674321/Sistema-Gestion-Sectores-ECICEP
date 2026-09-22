#!/usr/bin/env node
// ACCESO UNIVERSAL ECICEP — hotfix v0.10.4 (DEC-068 supera DEC-067).
// Garantías específicas de la versión:
//   A. Una SOLA credencial (CAPTURA_ACCESS_TOKEN conservado) habilita TODAS las
//      funciones; no existe capacidad privilegiada separada.
//   B. OPERADOR_ACCESS_TOKEN (v0.10.3) se acepta SOLO como legacy de transición.
//   C. WebApp_claveUniversal_ nunca devuelve '' cuando la clave existe (ni por
//      contención de lock ni por contingencia); el lock se usa SOLO para crear.
//   D. La página de captura siempre se sirve como página operativa (MODO_OPERADOR
//      activo) con la credencial universal en TOKEN_ACCESO/TOKEN_INVITACION y
//      PORTAL_URL; ya no oculta ACTUALIZAR_DATOS por falta de capacidad.
//   E. El cliente se auto-recupera de un token desactualizado (recarga 1 vez
//      preservando captureId).
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
function sembrarTokens(conCanonico,conLegacy){
  props=new Map();
  if(conCanonico)props.set('CAPTURA_ACCESS_TOKEN',CANONICO);
  if(conLegacy)props.set('OPERADOR_ACCESS_TOKEN',LEGACY);
  c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
}
let tryLockLlamadas=0,lockOcupado=false;
function sembrarLock(ocupado){
  lockOcupado=!!ocupado;tryLockLlamadas=0;
  c.LockService={getScriptLock:()=>({tryLock:function(){tryLockLlamadas++;return !lockOcupado;},releaseLock(){}}),getPreemptionMode:()=>{}};
}
function baseMocks(){
  c.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
  c.Session={getActiveUser:()=>({getEmail:()=>''})};
  c.ContentService={createTextOutput:text=>({tipo:'texto',texto:text})};
  c.HtmlService={createTemplateFromFile:n=>({evaluate(){return {tipo:'html',vars:this,setTitle(){return this;},setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}}),XFrameOptionsMode:{ALLOWALL:'ALLOWALL'}};
}
let pruebas=0;function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

nuevoContexto();baseMocks();sembrarTokens(true,true);sembrarLock(false);

t('A. Una sola credencial: clave canónica única para captura, operador y compartido',()=>{
  assert.equal(c.WebApp_claveUniversal_(),CANONICO);
  assert.equal(c.WebApp_claveCaptura_(),CANONICO);
  assert.equal(c.WebApp_claveOperador_(),CANONICO);
  assert.equal(c.WebApp_claveCompartida_(),CANONICO);
  assert.equal(c.WebApp_accesoUniversalValido_(CANONICO),true,'canónico válido');
  assert.equal(c.WebApp_accesoUniversalValido_(LEGACY),true,'legacy v0.10.3 válido (transición)');
  assert.equal(c.WebApp_accesoUniversalValido_(INVALIDO),false,'inválido rechazado');
  assert.equal(c.WebApp_accesoUniversalValido_(''),false);
  assert.equal(c.WebApp_accesoUniversalValido_('abc'),false,'formato no-64hex rechazado');
  assert.equal(c.WebApp_autorizar(CANONICO),true);
  assert.equal(c.WebApp_autorizarBuscador(CANONICO),true);
  assert.equal(c.WebApp_autorizarCaptura(CANONICO),true);
  assert.equal(c.WebApp_autorizarBuscador(INVALIDO),false);
});

t('B. Legacy v0.10.3 aceptado; si no existe propiedad legacy no se inventa acceso',()=>{
  sembrarTokens(true,false);sembrarLock(false);
  assert.equal(c.WebApp_accesoUniversalValido_(CANONICO),true);
  assert.equal(c.WebApp_accesoUniversalValido_(LEGACY),false,'sin propiedad legacy no hay acceso legacy');
});

t('C. claveUniversal_ nunca devuelve "" con clave presente (no toma lock) ni por contención',()=>{
  sembrarTokens(true,true);sembrarLock(false);
  assert.equal(c.WebApp_claveUniversal_(),CANONICO);
  assert.equal(tryLockLlamadas,0,'con clave presente no se consulta el lock');
  sembrarLock(true);
  assert.equal(c.WebApp_claveUniversal_(),CANONICO,'contención con clave presente: relee sin lock y la devuelve');
});

t('C2. Crear la clave con lock; si no se puede ni crear ni releer, falla (nunca "")',()=>{
  sembrarTokens(false,false);sembrarLock(false);
  assert.equal(tryLockLlamadas,0);
  const creada=c.WebApp_claveUniversal_();
  assert.ok(creada&&/^[0-9a-f]{64}$/.test(creada),'crea clave universal de 64 hex');
  assert.equal(tryLockLlamadas,1,'lock solo para crear');
  assert.equal(props.get('CAPTURA_ACCESS_TOKEN'),creada,'la clave creada se persiste');
  // segunda llamada: no vuelve a lockear ni regenera
  const antes=tryLockLlamadas;
  assert.equal(c.WebApp_claveUniversal_(),creada);
  assert.equal(tryLockLlamadas,antes,'no recrea ni consulta lock con clave presente');
  sembrarTokens(false,false);sembrarLock(true);
  assert.throws(()=>c.WebApp_claveUniversal_(),/ACCESO_UNIVERSAL_NO_INICIALIZADO/,
    'contención sin clave posible: falla en vez de devolver ""');
});

t('D. La página de captura se sirve como operativa con la credencial universal',()=>{
  sembrarTokens(true,false);sembrarLock(false);
  const html=c.doGet({parameter:{}});
  assert.equal(html.tipo,'html');
  assert.equal(html.vars.CAPTURA_ACCESO,CANONICO);
  assert.equal(html.vars.TOKEN_ACCESO,CANONICO,'TOKEN_ACCESO recibe la credencial universal');
  assert.equal(html.vars.TOKEN_INVITACION,CANONICO,'TOKEN_INVITACION recibe la credencial universal');
  assert.equal(html.vars.MODO_OPERADOR,true,'siempre modo operador');
  assert.equal(html.vars.PORTAL_URL,c.ECICEP_webAppUrl()+'?acceso='+CANONICO+'&vista=portal');
  const portal=c.doGet({parameter:{acceso:CANONICO,vista:'portal'}});
  assert.equal(portal.tipo,'html');
  assert.equal(portal.vars.TOKEN_ACCESO,CANONICO);
});

t('E. CapturaWeb.html ya no oculta ACTUALIZAR_DATOS y se auto-recupera de token desactualizado',()=>{
  const html=readFileSync(new URL('CapturaWeb.html',root),'utf8');
  assert.ok(!html.includes('if(!window.ECICEP_MODO_OPERADOR)'),'sin gating por MODO_OPERADOR');
  assert.ok(!html.includes('cardActualizar\");if(a)a.style.display=\"none\"'),'cardActualizar nunca se oculta por capacidad');
  assert.ok(html.includes('id="cardActualizar"'),'la tarjeta ACTUALIZAR_DATOS sigue presente en el DOM');
  assert.ok(html.includes('_recargarAcceso'),'auto-recuperación definida');
  assert.ok(html.includes('ACCESO_DESACTUALIZADO'),'detecta el motivo ACCESO_DESACTUALIZADO');
  assert.ok(html.includes('ecicep_captureId'),'preserva captureId en la recarga');
  assert.ok(html.includes('ecicep_reload_acceso'),'recarga una sola vez');
  assert.ok(html.includes('_capRestaurado'),'restaura captureId en el boot');
});

t('RPC y flujo de captura: con la credencial universal todo opera; inválido se niega',()=>{
  sembrarTokens(true,true);sembrarLock(false);
  c.Modelo_leerPacientes=()=>[];c.Modelo_leerEventos=()=>[];
  c.Form_esquemaFormulario=()=>({});
  const ei=c.WebApp_estadoInicial(CANONICO);
  assert.equal(ei.url,c.WebApp_urlCompartida_(),'estadoInicial con universal autorizado (devuelve url)');
  assert.ok(Array.isArray(ei.profesionales),'estadoInicial con universal entrega catálogo');
  const el=c.WebApp_estadoInicial(LEGACY);
  assert.equal(el.url,c.WebApp_urlCompartida_(),'legacy conserva acceso (transición)');
  assert.equal(c.WebApp_estadoInicial('').ok,false);
  assert.equal(c.WebApp_estadoInicial(INVALIDO).ok,false);
  assert.equal(c.WebApp_previaDuplicadosV2({accion:'nuevoIngreso'},CANONICO).ok,true,'preflight con universal');
  assert.equal(c.WebApp_previaDuplicadosV2({accion:'nuevoIngreso'},INVALIDO).ok,false,'preflight con inválido negado');
  assert.equal(c.WebApp_capturarEstado('Cp4-'+'a'.repeat(32),CANONICO).ok,false,'estado: ciudadano (sin datos) pero autorizado');
  c.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock(){}})};
  c.Captura_v2_enviar=()=>({ok:true});
  const ocupado=c.WebApp_capturarEnviar({},CANONICO);
  assert.equal(ocupado.ok,false,'servicio ocupado no es ACCESO_DENEGADO');
});
console.log('Acceso universal v0.10.4: '+pruebas+'/'+pruebas);