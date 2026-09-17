#!/usr/bin/env node
// Contrato V3 y regresiones de agenda, exclusivamente con personas ficticias.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function backend() {
  const c = vm.createContext({ console: { log() {}, error() {} } });
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter(f => /\.(js|gs)$/.test(f)).sort()) vm.runInContext(read('src/' + f), c, { filename: f });
  return c;
}
let n = 0;
function test(name, fn) { fn(); n++; console.log('[PASS] ' + name); }
const base = { captureId: 'Cp3-' + 'a'.repeat(32), accion: 'registrarControl', rut: '11111111-1', fechaEvento: '2026-09-16', profesional: 'MEDICO/A' };
const catalogo = ['MEDICO/A'];
for (const accion of ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos']) test('V3 agenda opcional en ' + accion, () => {
  const c = backend(); const p = { ...base, accion, proximoControl: '2027-02-20' };
  if (accion !== 'registrarControl' && accion !== 'registrarSeguimiento') delete p.fechaEvento;
  if (accion === 'nuevoIngreso') Object.assign(p, { nombre: 'PERSONA FICTICIA', fechaNacimiento: '1990-01-01', fechaIngreso: '2026-09-16', sector: 'VERDE' });
  const v = c.Captura_v2_validar(p, { catalogo }); assert.equal(v.ok, true, JSON.stringify(v.errores));
  assert.equal(v.normalizado.proximoControl, p.proximoControl);
});
for (const [valor, codigo] of [['2026-02-30','FECHA_INVALIDA'],['2041-01-01','FECHA_INVALIDA'],['2014-12-31','FECHA_INVALIDA'],['20/02/2027','FECHA_INVALIDA'],[123,'TIPO_INCORRECTO']]) test('V3 rechaza agenda inválida ' + valor, () => {
  const c=backend(); const v=c.Captura_v2_validar({...base,proximoControl:valor},{catalogo});
  assert.equal(v.ok,false); assert.ok(v.errores.some(e=>e.campo==='proximoControl'&&e.codigo===codigo));
});
test('V2 mantiene huella literal y rechaza el nuevo campo incluso vacío', () => {
  const c=backend(); const p={...base,captureId:base.captureId.replace('Cp3','Cp2')};
  const v=c.Captura_v2_validar(p,{catalogo}); assert.equal(v.ok,true);
  assert.equal(c.Captura_v2_canonica(v.normalizado), 'registrarControl|captureId='+p.captureId+'|rut=11111111-1|fechaEvento=2026-09-16|profesional=MEDICO/A|profesionalSecundario=|observaciones=');
  for(const value of ['',null,'2027-02-20']) assert.ok(c.Captura_v2_validar({...p,proximoControl:value},{catalogo}).errores.some(e=>e.codigo==='CAMPO_NO_PERMITIDO'));
});
test('V3 omitido/null/vacío equivalentes; cambiar agenda cambia huella', () => {
  const c=backend(); const canon=p=>c.Captura_v2_canonica(c.Captura_v2_validar(p,{catalogo}).normalizado);
  assert.equal(canon(base),canon({...base,proximoControl:null})); assert.equal(canon(base),canon({...base,proximoControl:''}));
  assert.notEqual(canon(base),canon({...base,proximoControl:'2027-02-20'}));
});
function memory(c) {
  const rows=new Map(); const events=new Map(); let writes=0; let fail=true;
  const ctx={usuario:'ficticio@example.test',catalogo,ahora:()=> '2026-09-16 10:00:00',maxReintentos:3,
    buscarRegistro:id=>rows.get(id),persistirRegistro:r=>{rows.set(r.captureId,JSON.parse(JSON.stringify(r)));return {ok:true};},
    actualizarTrailer:(id,changes)=>{Object.assign(rows.get(id),changes);return {ok:true};},
    entregar:c.Captura_v2_entregar,aplicarAgenda:(id,date)=>{writes++;return {ok:!fail};}};
  c.Captura_v2_buscarPersonaPorRut=()=>({ID_INTERNO:'FICTICIO'});
  c.Captura_v2_marcaEnEventos=marca=>events.get(marca);
  c.api_registrarEvento=p=>{events.set(p.fuente,{idInterno:p.idInterno,idEvento:'EVENTO-FICTICIO'});return {ok:true};};
  return {ctx,rows,events,get writes(){return writes;},recover(){fail=false;}};
}
test('Fallo de agenda y reintento usan entrega real sin duplicar evento; terminal no reescribe', () => {
  const c=backend(),m=memory(c),p={...base,proximoControl:'2027-02-20'};
  assert.equal(c.Captura_v2_enviar(p,m.ctx).ok,false);
  assert.equal(m.rows.get(p.captureId).motivo,'AGENDA_NO_GUARDADA'); assert.equal(m.events.size,1);
  m.recover(); const r=c.Captura_v2_enviar(p,m.ctx); assert.equal(r.ok,true); assert.equal(r.data.estado,'PROCESADO'); assert.equal(m.events.size,1); assert.equal(m.writes,2);
  c.Captura_v2_enviar(p,m.ctx); assert.equal(m.writes,2);
  assert.equal(c.Captura_v2_enviar({...p,proximoControl:'2027-02-21'},m.ctx).errors[0].codigo,'CONFLICTO_IDEMPOTENCIA');
});
test('Sin agenda, control no llama al escritor de fecha', () => {
  const c=backend(),m=memory(c); assert.equal(c.Captura_v2_enviar(base,m.ctx).data.estado,'PROCESADO'); assert.equal(m.writes,0);
});
test('Ingreso reintentado con agenda no utiliza fast-path que omite la escritura', () => {
  const c=backend(),m=memory(c),p={...base,accion:'nuevoIngreso',nombre:'PERSONA FICTICIA',sector:'VERDE',fechaNacimiento:'1990-01-01',fechaIngreso:'2026-09-16',proximoControl:'2027-02-20'}; delete p.fechaEvento;
  let calls=0;
  m.ctx.entregar=(norm,meta)=>{calls++; if(calls>1)assert.equal(meta.previo.fila,'2');return {estado:'PROCESADO',idInterno:'FICTICIO',ingresoHoja:'INGRESO_VERDE',ingresoFila:'2'};};
  c.Form_leerFilaIngreso=()=>{throw Error('No debe usar fast-path sin agenda');};
  assert.equal(c.Captura_v2_enviar(p,m.ctx).ok,false);m.recover(); assert.equal(c.Captura_v2_enviar(p,m.ctx).data.estado,'PROCESADO'); assert.equal(calls,2); assert.equal(m.writes,2);
});
test('Persistencia real por encabezados distingue versión y recupera agenda desde traza', () => {
  for(const version of [2,3]) {
    const c=backend(),headers=Array.from(c.Form_columnas()),rows=[headers];
    c.Modelo_hoja=()=>({getLastRow:()=>rows.length,getLastColumn:()=>headers.length,getRange:(r,col,h,w)=>({getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r+i-1]?.[col+j-1]??'')),setValues:vals=>vals.forEach((row,i)=>{rows[r+i-1]??=Array(headers.length).fill('');row.forEach((v,j)=>rows[r+i-1][col+j-1]=v);})})});
    const p={...base,captureId:base.captureId.replace('Cp3','Cp'+version)};if(version===3)p.proximoControl='2027-02-20';
    const norm=c.Captura_v2_validar(p,{catalogo}).normalizado;
    const reg=c.Captura_v2_nuevoRegistro(norm,{usuario:'FICTICIO',fechaRecepcion:'2026-09-16'});
    assert.equal(c.Captura_v2_persistirRegistro(reg).ok,true);
    assert.equal(rows[1][headers.indexOf('FORM_VERSION')],version);
    assert.equal(c.Captura_v2_buscarRegistro(p.captureId).normalizado.proximoControl,p.proximoControl);
  }
});
test('Ficha guarda/borra agenda y rechaza fecha inválida sin mutar caché', () => {
  const c=backend(),p={ID_INTERNO:'FICTICIO',PROXIMO_CONTROL:'2026-12-05'}; const rows=[];
  c.WebApp_autorizarBuscador=()=>true;c.Modelo_buscarPaciente=()=>({obj:p,idx:0});c.Modelo_asegurarEsquemaPacientes=()=>({ok:true});c.Modelo_filaFisica=()=>2;
  c.Modelo_hoja=()=>({getRange:()=>({setValues:v=>rows.push(v)})});c.Modelo_invalidarLecturas=()=>{};c.Log_flush=()=>{};c.Log_info=()=>{};
  assert.equal(c.api_actualizarPaciente(p.ID_INTERNO,{PROXIMO_CONTROL:'2026-02-30'}).ok,false);assert.equal(rows.length,0);assert.equal(p.PROXIMO_CONTROL,'2026-12-05');
  for(const date of ['2027-02-20','']){assert.equal(c.api_actualizarPaciente(p.ID_INTERNO,{PROXIMO_CONTROL:date}).ok,true); const pos=c.MODELO_PACIENTE.findIndex(x=>x.campo==='PROXIMO_CONTROL'); assert.ok(pos>=0); assert.equal(rows.at(-1)[0][pos],date);}
});
test('Panel y auditoría usan agenda aun sin control o riesgo; sincronizar nunca la calcula', () => {
  const c=backend(),p={ID_INTERNO:'FICTICIO',PROXIMO_CONTROL:'2026-10-20',ULTIMO_CONTROL:'',ESTRATIFICACION:''};
  assert.equal(c.Control_filasPanel([p],{},'2026-09-16').filas[0].proximo,'2026-10-20');assert.equal(c.Aud_clasificarPersona(p,{},'2026-09-16',7).estado,'VIGENTE');
  for(const tipo of ['CONTROL','SEGUIMIENTO']){c.Ingresos_sincronizarCache(p,{TIPO_EVENTO:tipo,FECHA_EVENTO:'2026-09-16'});assert.equal(p.PROXIMO_CONTROL,'2026-10-20');}
  p.PROXIMO_CONTROL='';c.Ingresos_sincronizarCache(p,{TIPO_EVENTO:'CONTROL',FECHA_EVENTO:'2026-09-17'});assert.equal(p.PROXIMO_CONTROL,'');assert.equal(c.Control_recalcularTodos().cambios,0);
});
test('Captura y alias QR abren la misma pantalla con enlace explícito', () => {
  const c=backend(),calls=[];const output={setWidth(){return this;},setHeight(){return this;}};
  let template;c.HtmlService={createTemplateFromFile:name=>{assert.equal(name,'QRFormulario');return template={evaluate:()=>output};}};c._UI_get=()=>({showModalDialog:(o,t)=>calls.push(t)});
  c.UI_abrirFormularioCaptura();assert.equal(template.WEB_APP_URL,c.ECICEP_webAppUrl());c.UI_mostrarQR();assert.deepEqual(calls,['Captura','Captura']);
  const html=read('src/QRFormulario.html');assert.match(html,/<a[^>]+id="abrirFormulario"[^>]+href="<\?= WEB_APP_URL \?>"[^>]+target="_blank"/);assert.match(html,/qrCanvas/);assert.doesNotMatch(c.UI_abrirFormularioCaptura.toString(),/window.open|\.click\(/);
});
test('Ficha retira acción redundante, conserva representación histórica y Patologías', () => {
  const s=read('src/Sidebar.html'),tip=s.match(/(?:var|const|let) TIP\s*=\s*(\[[^;]+\])/)[1];assert.doesNotMatch(tip,/CAMBIO_ESTRATIFICACION/);assert.match(s,/CAMBIO_ESTRATIFICACION/);assert.match(s,/Patologías \/ Estratificación/);
});
test('Actualizar desde fuentes no repone una agenda quitada en ficha', () => {
  const c=backend();
  for(const date of ['', '2026-12-05']) {
    const p={PROXIMO_CONTROL:date};c.Act_mergearPaciente(p,{PROXIMO_CONTROL:'2027-01-01'});assert.equal(p.PROXIMO_CONTROL,date);
  }
});
console.log(`Agenda manual V3 — ${n}/${n}`);
