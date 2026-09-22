#!/usr/bin/env node
// V4: carga autorizada, edición parcial, concurrencia, idempotencia y corrección histórica.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../src/',import.meta.url);
function nucleo(){const c=vm.createContext({console:{log(){},warn(){},error(){}}});for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,root),'utf8'),c,{filename:f});return c;}
let ok=0;function test(name,fn){fn();ok++;console.log('[PASS] '+name);}
const a={id:'P-FICTICIO',rutOriginal:'11111111-1',campos:{PROXIMO_CONTROL:{anterior:'',valor:'2026-10-15'},NOMBRE:{anterior:'PACIENTE ORIGINAL',valor:'PACIENTE CORREGIDO'}},atenciones:[]};
const p={captureId:'Cp4-'+'a'.repeat(32),accion:'actualizarDatos',rut:'11111111-1',profesional:'MEDICO/A',actualizacion:a};
function validar(c,entry){return c.Captura_v2_validar(entry,{catalogo:['MEDICO/A']});}
test('V4 valida edición parcial y conserva V2/V3',()=>{const c=nucleo();assert.equal(validar(c,p).ok,true);for(const v of [2,3]){const old={...p,captureId:p.captureId.replace('Cp4','Cp'+v)};delete old.actualizacion;assert.equal(validar(c,old).ok,true);assert.equal(validar(c,{...old,actualizacion:a}).ok,false);}assert.equal(c.CAPTURE_CONTRACT_VERSION,4);});
test('V4 rechaza campos técnicos, fechas imposibles y fecha de atención futura en entrega',()=>{const c=nucleo();for(const campos of [{ID_INTERNO:{anterior:'x',valor:'y'}},{PROXIMO_CONTROL:{anterior:'',valor:'2026-02-30'}}]){const v=validar(c,{...p,actualizacion:{...a,campos}});assert.equal(v.ok,false);}const v=validar(c,{...p,actualizacion:{...a,atenciones:[{tipo:'CONTROL',modo:'REGISTRAR',fecha:'2027-01-01',anterior:'',idEvento:''}]}});assert.equal(v.ok,true);});
test('Preingreso acepta estados canónicos o fecha y rechaza texto ambiguo',()=>{const c=nucleo();for(const entrada of ['NO_APLICA','PENDIENTE','2026-09-01']){const r=validar(c,{...p,actualizacion:{...a,campos:{PREINGRESO:{anterior:'',valor:entrada}}}});assert.equal(r.ok,true,entrada);}assert.equal(validar(c,{...p,actualizacion:{...a,campos:{PREINGRESO:{anterior:'',valor:'ayer'}}}}).ok,false);});
test('Cambio de orden de campos no cambia la huella; modificación sí la cambia',()=>{const c=nucleo();const norm=x=>validar(c,x).normalizado;const a2={...a,campos:{NOMBRE:a.campos.NOMBRE,PROXIMO_CONTROL:a.campos.PROXIMO_CONTROL}};assert.equal(c.Captura_v2_canonica(norm(p)),c.Captura_v2_canonica(norm({...p,actualizacion:a2})));assert.notEqual(c.Captura_v2_canonica(norm(p)),c.Captura_v2_canonica(norm({...p,actualizacion:{...a,campos:{...a.campos,NOMBRE:{...a.campos.NOMBRE,valor:'OTRO NOMBRE'}}}})));});
function memoria(){const c=nucleo(),pac={ID_INTERNO:'P-FICTICIO',RUT:'11111111-1',NOMBRE:'PACIENTE ORIGINAL',PROXIMO_CONTROL:'',ULTIMO_CONTROL:'2026-09-01',SECTOR:'VERDE',ESTRATIFICACION:'G2'},eventos=[{ID_EVENTO:'EV-ANTERIOR',ID_INTERNO:pac.ID_INTERNO,TIPO_EVENTO:'CONTROL',FECHA_EVENTO:'2026-09-01',FUENTE:'HISTORICO',DESCRIPCION:''}],escritos=[];let actualizar=0,vistas=0;
 c.Captura_v2_usuarioActual=()=> 'ficticio@example.test';c.WebApp_usuarioActivo=()=>c.Captura_v2_usuarioActual();c.Form_hoy=()=> '2026-09-17';c.Modelo_buscarPaciente=id=>id===pac.ID_INTERNO?{obj:pac,idx:0}:null;c.Modelo_leerPacientes=()=>[pac];c.Modelo_leerEventos=()=>c.Captura_eventosVigentes_(eventos);c.Modelo_invalidarLecturas=()=>{};c.Modelo_asegurarEsquemaPacientes_=()=>({ok:true});c.Modelo_refrescarVistasSectores_=()=>{vistas++;return{ok:true};};c.Modelo_hoja=()=>({getRange:()=>({setValues:v=>{escritos.push(v);c.MODELO_PACIENTE.forEach((x,i)=>{pac[x.campo]=v[0][i];});}})});c.Modelo_filaFisica=()=>2;c.Modelo_filaDesdeObjeto=o=>c.MODELO_PACIENTE.map(x=>o[x.campo]??'');c.Estrat_recalcularPaciente_=()=>({ok:true});c.Patologias_guardarPaciente_=(id,codigos,otras)=>{pac.CONDICIONES=codigos.join(';');pac.OTRAS_PATOLOGIAS=otras;return{ok:true};};c.Paciente_aplicarCampos_=(id,campos)=>{actualizar++;Object.assign(pac,campos);return{ok:true};};c.Captura_v2_marcaEnEventos=marca=>{const e=eventos.find(e=>e.FUENTE===marca);return e?{idInterno:e.ID_INTERNO,idEvento:e.ID_EVENTO}:null;};
 c.Eventos_registrarPaciente_=q=>{eventos.push({ID_EVENTO:'EV-NUEVO-'+eventos.length,ID_INTERNO:q.idInterno,TIPO_EVENTO:q.tipoEvento,FECHA_EVENTO:q.fecha,FUENTE:q.fuente,DESCRIPCION:q.descripcion});return{ok:true};};
 return {c,pac,eventos,escritos,get actualizar(){return actualizar;},get vistas(){return vistas;}};}
test('Carga exige sesión, RUT único y devuelve copia de datos vigentes',()=>{const m=memoria();assert.equal(m.c.WebApp_cargarPacienteEdicion('11111111-1').ok,true);m.c.Captura_v2_usuarioActual=()=>'';assert.equal(m.c.WebApp_cargarPacienteEdicion('11111111-1').ok,false);m.c.Captura_v2_usuarioActual=()=> 'autorizado';m.c.Modelo_leerPacientes=()=>[m.pac,{...m.pac,ID_INTERNO:'OTRO'}];assert.match(m.c.WebApp_cargarPacienteEdicion('11111111-1').motivo,/duplicado/i);});
test('Entrega modifica solo lo pedido y reintento no crea segundo evento',()=>{const m=memoria(),n=validar(m.c,p).normalizado,marca=m.c.Captura_v2_marca(n);assert.equal(m.c.Captura_entregarEdicion_(n,marca,{usuario:'tester'}).estado,'PROCESADO');assert.equal(m.pac.NOMBRE,'PACIENTE CORREGIDO');assert.equal(m.pac.PROXIMO_CONTROL,'2026-10-15');assert.equal(m.eventos.length,2);assert.equal(m.c.Captura_entregarEdicion_(n,marca,{usuario:'tester'}).estado,'PROCESADO');assert.equal(m.eventos.length,2);});
test('Edición concurrente de un campo se rechaza antes de escribir',()=>{const m=memoria(),n=validar(m.c,p).normalizado;m.pac.NOMBRE='CAMBIO DE OTRA PERSONA';assert.match(m.c.Captura_entregarEdicion_(n,m.c.Captura_v2_marca(n),{usuario:'tester'}).motivo,/FICHA_CAMBIO/);assert.equal(m.actualizar,0);assert.equal(m.eventos.length,1);});
test('Corrección del último control agrega auditoría y muestra fecha corregida sin duplicar CONTROL',()=>{const m=memoria(),ed={...a,campos:{},atenciones:[{tipo:'CONTROL',modo:'CORREGIR',fecha:'2026-09-05',anterior:'2026-09-01',idEvento:'EV-ANTERIOR'}]},n=validar(m.c,{...p,actualizacion:ed}).normalizado;assert.equal(m.c.Captura_entregarEdicion_(n,m.c.Captura_v2_marca(n),{usuario:'tester'}).estado,'PROCESADO');assert.equal(m.eventos.filter(e=>e.TIPO_EVENTO==='CONTROL').length,1);assert.equal(m.pac.ULTIMO_CONTROL,'2026-09-05');assert.equal(m.vistas,1,'la vista se refresca después de sincronizar la caché');assert.equal(m.c.Modelo_leerEventos().find(e=>e.ID_EVENTO==='EV-ANTERIOR').FECHA_EVENTO,'2026-09-05');assert.equal(m.eventos.find(e=>e.ID_EVENTO==='EV-ANTERIOR').FECHA_EVENTO,'2026-09-01');});
test('Una nueva atención suma exactamente un CONTROL y conserva agenda manual',()=>{const m=memoria(),ed={...a,campos:{},atenciones:[{tipo:'CONTROL',modo:'REGISTRAR',fecha:'2026-09-17',anterior:'',idEvento:''}]},n=validar(m.c,{...p,actualizacion:ed}).normalizado;assert.equal(m.c.Captura_entregarEdicion_(n,m.c.Captura_v2_marca(n),{usuario:'tester'}).estado,'PROCESADO');assert.equal(m.eventos.filter(e=>e.TIPO_EVENTO==='CONTROL').length,2);assert.equal(m.pac.ULTIMO_CONTROL,'2026-09-17');assert.equal(m.pac.PROXIMO_CONTROL,'');});
test('Fallo de auditoría se recupera por captureId sin duplicar la atención',()=>{
  const m=memoria(),ed={...a,atenciones:[{tipo:'CONTROL',modo:'REGISTRAR',fecha:'2026-09-17',anterior:'',idEvento:''}]},entrada={...p,actualizacion:ed};
  const registros=new Map(),real=m.c.Eventos_registrarPaciente_,marca=m.c.Captura_v2_marca(validar(m.c,entrada).normalizado);let fallar=true;
  m.c.Eventos_registrarPaciente_=q=>{if(q.fuente===marca&&fallar){fallar=false;return{ok:false,motivo:'AUDITORIA_TEMPORAL'};}return real(q);};
  const ctx={usuario:'ficticio@example.test',catalogo:['MEDICO/A'],ahora:()=> '2026-09-17 10:00',maxReintentos:3,
    buscarRegistro:id=>registros.get(id),persistirRegistro:r=>{registros.set(r.captureId,JSON.parse(JSON.stringify(r)));return{ok:true};},
    actualizarTrailer:(id,cam)=>{Object.assign(registros.get(id),cam);return{ok:true};},entregar:m.c.Captura_v2_entregar};
  assert.equal(m.c.Captura_v2_enviar(entrada,ctx).ok,false);
  assert.equal(m.eventos.filter(e=>e.TIPO_EVENTO==='CONTROL').length,2);
  assert.equal(registros.get(entrada.captureId).estado,'ERROR');
  const r=m.c.Captura_v2_enviar(entrada,ctx);assert.equal(r.ok,true);assert.equal(r.data.estado,'PROCESADO');
  assert.equal(m.eventos.filter(e=>e.TIPO_EVENTO==='CONTROL').length,2);assert.equal(m.eventos.filter(e=>e.FUENTE===marca).length,1);
  m.c.Captura_v2_enviar(entrada,ctx);assert.equal(m.eventos.length,3);
});
test('Paneles leen fecha corregida; evento físico y otros campos conservan su valor',()=>{
  const m=memoria(),ed={...a,campos:{},atenciones:[{tipo:'CONTROL',modo:'CORREGIR',fecha:'2026-09-05',anterior:'2026-09-01',idEvento:'EV-ANTERIOR'}]},n=validar(m.c,{...p,actualizacion:ed}).normalizado;
  assert.equal(m.c.Captura_entregarEdicion_(n,m.c.Captura_v2_marca(n),{usuario:'tester'}).estado,'PROCESADO');
  const encabezados=['ID_EVENTO','ID_INTERNO','TIPO_EVENTO','FECHA_EVENTO','FUENTE','DESCRIPCION'];
  const filas=[encabezados,...m.eventos.map(e=>encabezados.map(k=>e[k]??''))];
  m.c.Modelo_hoja=()=>({});m.c._memoLeer=()=>filas;
  const vista=m.c.Modelo_leerEventosCampos(['ID_EVENTO','FECHA_EVENTO','TIPO_EVENTO']);
  assert.equal(vista.find(e=>e.ID_EVENTO==='EV-ANTERIOR').FECHA_EVENTO,'2026-09-05');
  assert.equal(vista.find(e=>e.ID_EVENTO==='EV-ANTERIOR').TIPO_EVENTO,'CONTROL');
  assert.equal(filas[1][3],'2026-09-01');
});
test('Actualizar desde fuentes restaura la fecha efectiva sin tocar agenda ni evento físico',()=>{
  const m=memoria(),ed={...a,campos:{},atenciones:[{tipo:'CONTROL',modo:'CORREGIR',fecha:'2026-08-25',anterior:'2026-09-01',idEvento:'EV-ANTERIOR'}]},n=validar(m.c,{...p,actualizacion:ed}).normalizado;
  assert.equal(m.c.Captura_entregarEdicion_(n,m.c.Captura_v2_marca(n),{usuario:'tester'}).estado,'PROCESADO');
  m.pac.ULTIMO_CONTROL='2026-09-01';m.pac.PROXIMO_CONTROL='2026-10-15';
  m.c.Modelo_hayCorreccionesFecha_=()=>true;
  const r=m.c.Captura_reconciliarFechasCorregidas_();
  assert.equal(r.actualizados,1);assert.equal(m.pac.ULTIMO_CONTROL,'2026-08-25');
  assert.equal(m.pac.PROXIMO_CONTROL,'2026-10-15');
  assert.equal(m.eventos.find(e=>e.ID_EVENTO==='EV-ANTERIOR').FECHA_EVENTO,'2026-09-01');
  assert.equal(m.c.Captura_reconciliarFechasCorregidas_().actualizados,0);
});
test('La reconciliación respeta una atención posterior a la fecha corregida',()=>{
  const m=memoria(),ed={...a,campos:{},atenciones:[{tipo:'CONTROL',modo:'CORREGIR',fecha:'2026-08-25',anterior:'2026-09-01',idEvento:'EV-ANTERIOR'}]},n=validar(m.c,{...p,actualizacion:ed}).normalizado;
  assert.equal(m.c.Captura_entregarEdicion_(n,m.c.Captura_v2_marca(n),{usuario:'tester'}).estado,'PROCESADO');
  m.eventos.push({ID_EVENTO:'EV-POSTERIOR',ID_INTERNO:m.pac.ID_INTERNO,TIPO_EVENTO:'CONTROL',FECHA_EVENTO:'2026-09-10',FUENTE:'HISTORICO',DESCRIPCION:''});
  m.pac.ULTIMO_CONTROL='2026-09-01';m.c.Modelo_hayCorreccionesFecha_=()=>true;
  assert.equal(m.c.Captura_reconciliarFechasCorregidas_().actualizados,1);
  assert.equal(m.pac.ULTIMO_CONTROL,'2026-09-10');
});
console.log('Edición V4: '+ok+'/'+ok);
