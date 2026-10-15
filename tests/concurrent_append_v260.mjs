import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
const all = fs.readFileSync(new URL('../src/06_Modelo.js', import.meta.url), 'utf8');
const src = all.slice(all.indexOf('var _CACHE_TTL_SEG'), all.indexOf('/** PURA: convierte una fila cruda'));
function harness(busy=false) {
  let locked=false, mutations=0, rows=[], derivadoFueraDelLock=false, reconstruido=false;
  const c={console,Date,ECICEP:{},HOJAS:{},CFG_CACHE:{PREFIJO:'T:',MAX_BYTES:99999},
    Ecicep_conLock_(fn){if(busy||locked)return{ok:false,motivo:'SERVICIO_OCUPADO'};locked=true;try{return fn()}finally{locked=false}},
    CacheService:undefined,PropertiesService:undefined,Sistema_marcarAuditoriaStale_(){},Inicio_marcarDirty_(){},
    _cacheBorrarClaves_(){}, Utl_texto_:String}; vm.createContext(c); vm.runInContext(src,c);
  // El "commit pesado" se prepara (reconstruir índice) FUERA del lock; solo la
  // sección corta entra al lock. `derivado` corre después, ya sin lock.
  const writer = id => {
    reconstruido = true;
    return c.Modelo_commitAtomico_({
      revalidar(){ return rows.includes(id) ? { ok:false, motivo:'DUPLICADO' } : { ok:true }; },
      commit(){ rows.push(id); mutations++; return { id }; },
      verificar(){ return { ok: rows.includes(id) }; },
      derivado(){ derivadoFueraDelLock = !locked; return { ok:true }; }
    });
  };
  return { writer, rows, get mutations(){return mutations}, get reconstruido(){return reconstruido}, get derivadoFueraDelLock(){return derivadoFueraDelLock} };
}
// Dos writers parten del mismo estado; cada commit termina en una fila distinta.
const h=harness(); assert.equal(h.writer('P1').ok,true); assert.equal(h.writer('P2').ok,true); assert.deepEqual(h.rows,['P1','P2']);
// La unicidad se relee bajo lock: el reingreso del mismo id se rechaza.
assert.equal(h.writer('P1').motivo,'DUPLICADO'); assert.equal(h.mutations,2);
// Lock ocupado → SERVICIO_OCUPADO y cero escrituras.
const b=harness(true); assert.equal(b.writer('P1').motivo,'SERVICIO_OCUPADO'); assert.equal(b.mutations,0);
// Reconstrucción pesada fuera del lock; trabajo derivado posterior sin lock.
assert.equal(h.reconstruido,true); assert.equal(h.derivadoFueraDelLock,true,'el trabajo derivado no corre bajo lock');
console.log('concurrent_append_v260: PASS');
