#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const ctx = vm.createContext({ console: { log(){}, warn(){}, error(){} }, JSON, Date, Math });
for (const f of ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js']) {
  vm.runInContext(read(f), ctx, { filename: f });
}

function sheet(rows, opts={}) {
  let writes = 0;
  const set = (r,c,v) => { while(rows.length<r) rows.push([]); while(rows[r-1].length<c) rows[r-1].push(''); rows[r-1][c-1]=v; };
  return {
    get writes(){ return writes; }, get rows(){ return rows; },
    getLastRow:()=>rows.length, getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),
    getRange(r,c,n=1,m=1){
      const range = {
        getValues(){
          if (opts.failLookup && r === 2 && m === 1) throw new Error('LOOKUP_IO');
          return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>(rows[r-1+i]||[])[c-1+j]??''));
        },
        setValues(vals){ writes++; vals.forEach((row,i)=>row.forEach((v,j)=>set(r+i,c+j,v))); if(opts.concurrentAppend && r>1){ rows.push(['OTRA_FILA']); opts.concurrentAppend=false; } },
        setValue(v){ writes++; set(r,c,v); },
        createTextFinder(q){ return { matchEntireCell(){ return this; }, findNext(){ if(opts.failLookup) throw new Error('LOOKUP_IO'); for(let i=r-1;i<r-1+n;i++) if(String((rows[i]||[])[c-1])===String(q)) return {getRow:()=>i+1}; return null; } }; }
      };
      return range;
    }
  };
}

const headers = Array.from(ctx.Form_columnas_());
const basePayload = {captureId:'Cp4-'+('d'.repeat(32)),accion:'nuevoIngreso',rut:'12345678-5',nombre:'PACIENTE TEST',sector:'VERDE',fechaIngreso:'2026-10-01'};
ctx.Captura_v2_ahora_=()=> '2026-10-13T10:00:00'; ctx.Hojas_asegurarCapacidadGestionada_=()=>{};

// captureId: error de lookup => fail closed, cero escrituras.
{
  const h=sheet([headers, headers.map((_,i)=>i===headers.indexOf('RESPONSE_ID')?'Cp4-'+('e'.repeat(32)):'')],{failLookup:true}); ctx.Modelo_hoja_=()=>h;
  const reg=ctx.Captura_v2_nuevoRegistro_(basePayload,{usuario:'',fechaRecepcion:'2026-10-13'});
  const r=ctx.Captura_v2_persistirRegistro_(reg);
  assert.equal(r.ok,false); assert.equal(r.motivo,'CAPTUREID_LOOKUP_FAILED'); assert.equal(h.writes,0);
}

// Confirmación relee la fila escrita aunque otro append cambie getLastRow().
{
  const h=sheet([headers],{concurrentAppend:true}); ctx.Modelo_hoja_=()=>h;
  const reg=ctx.Captura_v2_nuevoRegistro_(basePayload,{usuario:'',fechaRecepcion:'2026-10-13'});
  const r=ctx.Captura_v2_persistirRegistro_(reg);
  assert.equal(r.ok,true); assert.equal(r.filaFisica,2); assert.equal(h.rows.length,3);
}

// RUT: validador puro no consulta; guard GAS distingue libre/duplicado/fallo.
{
  let leyo=false; ctx.Modelo_leerPacientes_=()=>{leyo=true;throw Error('NO');};
  assert.equal(ctx.Paciente_validarCampo_('RUT','12.345.678-5',{}).ok,true); assert.equal(leyo,false);
  ctx.Modelo_leerPacientesCampos_=()=>[{ID_INTERNO:'P2',RUT:'12345678-5'}];
  assert.equal(ctx.Paciente_comprobarUnicidadRut_('12345678-5','P1').estado,'RUT_DUPLICADO');
  assert.equal(ctx.Paciente_comprobarUnicidadRut_('12345678-5','P2').estado,'RUT_LIBRE');
  ctx.Modelo_leerPacientesCampos_=()=>{throw Error('SHEETS_DOWN');};
  assert.equal(ctx.Paciente_comprobarUnicidadRut_('12345678-5','P1').estado,'RUT_UNICIDAD_NO_VERIFICABLE');
}

// Ficha parcial: lectura fallida no equivale a lista vacía.
{
  const p={ID_INTERNO:'P1',RUT:'12345678-5',NOMBRE:'TEST',SECTOR:'VERDE'};
  ctx.Modelo_buscarPaciente_=()=>({obj:p,idx:0});
  ctx.Modelo_leerEventosCampos_=()=>{throw Error('EVENTOS_DOWN');};
  ctx.Ingresos_buscarPendientesPorRut_=()=>{throw Error('INGRESOS_DOWN');};
  ctx.Control_filasPanel_=()=>({filas:[]}); ctx._UI_controlConfig_=()=>({freq:{},aviso:1});
  ctx.Profesionales_catalogo_=()=>[]; ctx.Utilities={formatDate:()=> '2026-10-13'};
  const r=ctx.Ficha_construir_('P1',{});
  assert.equal(r.ficha.eventos.length,0);
  assert.equal(r.ficha.meta.integridad.eventos,'NO_DISPONIBLE');
  assert.equal(r.ficha.meta.integridad.ingresoPendiente,'NO_DISPONIBLE');
}

// Rollback: solo declara éxito si la relectura exacta coincide.
{
  const snap={ID_INTERNO:'P1',RUT:'12345678-5',SECTOR:'VERDE',ESTRATIFICACION:'G2',ESTADO:'PENDIENTE'};
  const vals=Array.from(ctx.Modelo_filaDesdeObjeto_(snap));
  let persisted=vals.slice();
  ctx.Modelo_filaFisica_=()=>4; ctx.Modelo_invalidarLecturas_=()=>{};
  ctx.Modelo_hoja_=()=>({getRange:()=>({setValues:v=>{persisted=v[0].slice();},getValues:()=>[persisted.slice()]})});
  assert.equal(ctx.Ficha_rollbackPacienteVerificado_(0,snap,'TEST').ok,true);
  ctx.Modelo_hoja_=()=>({getRange:()=>({setValues(){},getValues:()=>[vals.map((v,i)=>i===ctx.Modelo_campos_().indexOf('SECTOR')?'ROJO':v)]})});
  ctx.Modelo_agregarConflictos_=()=>1;
  const rb=ctx.Ficha_rollbackPacienteVerificado_(0,snap,'TEST');
  assert.equal(rb.ok,false); assert.equal(rb.motivo,'RELECTURA_DIVERGENTE');
}

// Estado de INGRESO: setValues fallido se devuelve al llamador, no se traga.
{
  ctx.SpreadsheetApp={};
  const h={getLastRow:()=>2,getLastColumn:()=>2,getRange:(r,c,n,m)=>({
    getValues:()=>r===1?[['ESTADO_INGRESO','NOTA_SISTEMA']]:[['','']],
    setValues:()=>{throw Error('WRITE_DOWN');}
  })};
  ctx.Modelo_ss_=()=>({getSheetByName:()=>h});
  ctx.Ingresos_layoutHoja_=()=>({hr:1,encabezados:['ESTADO_INGRESO','NOTA_SISTEMA'],mapa:{}});
  const estado=ctx.Ingresos_escribirEstados_([{hoja:'INGRESO_VERDE',filaOrigen:2,estado:'INGRESADO',nota:'ok'}]);
  assert.equal(estado.ok,false); assert.equal(estado.fallidas.length,1);
}

// Derivación determinista: orden físico no cambia máximos.
{
  const eventos=[
    {ID_INTERNO:'P1',TIPO_EVENTO:'CONTROL',FECHA_EVENTO:'2026-09-10'},
    {ID_INTERNO:'P1',TIPO_EVENTO:'CONTROL',FECHA_EVENTO:'2026-01-10'},
    {ID_INTERNO:'P1',TIPO_EVENTO:'SEGUIMIENTO',FECHA_EVENTO:'2026-08-01'},
    {ID_INTERNO:'P1',TIPO_EVENTO:'CONTROL',FECHA_EVENTO:'fecha mala'}
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.Control_maximosEventoPorPaciente_(eventos))),{P1:{CONTROL:'2026-09-10',SEGUIMIENTO:'2026-08-01'}});
}

// REM B conserva masa en cada dimensión y solo incluye actividad del período.
{
  const pacientes=[
    {ID_INTERNO:'P1',SEXO:'F',FECHA_NACIMIENTO:'1980-01-01',ESTRATIFICACION:'G2',SECTOR:'VERDE'},
    {ID_INTERNO:'P2',SEXO:'M',FECHA_NACIMIENTO:'2010-01-01',ESTRATIFICACION:'G1',SECTOR:'NARANJO'},
    {ID_INTERNO:'P3',SEXO:'F',FECHA_NACIMIENTO:'1970-01-01',ESTRATIFICACION:'G3',SECTOR:'AMARILLO'}
  ];
  const d=ctx.Rem_demografia_(pacientes,[{ID_INTERNO:'P1'},{ID_INTERNO:'P2'}],'2026-10-31');
  assert.equal(d.total,2);
  for(const dim of ['sexo','edad','estratificacion','sector']) assert.equal(d[dim].reduce((s,x)=>s+x.total,0),d.total);
}

assert.match(read('Sidebar.html'),/Historial temporalmente no disponible/);
console.log('data_integrity_v257: PASS');
