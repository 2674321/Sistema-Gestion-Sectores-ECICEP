import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm';
const all=fs.readFileSync(new URL('../src/06_Modelo.js',import.meta.url),'utf8');const src=all.slice(all.indexOf('var _CACHE_TTL_SEG'),all.indexOf('/** PURA: convierte una fila cruda'));
let epoch='10',puts=0; const props={getProperty(){return epoch},setProperty(k,v){epoch=v}};
const c={console,Date,ECICEP:{},HOJAS:{},CFG_CACHE:{PREFIJO:'T:',MAX_BYTES:99999,TTL_DEFECTO_SEG:60},PropertiesService:{getScriptProperties(){return props}},CacheService:{getScriptCache(){return{put(){puts++},get(){return null},remove(){}}}},Modelo_hoja_(){return null},Modelo_leerBloqueCabecera_(){return[['H'],['V']]},Utl_texto_:String}; vm.createContext(c);vm.runInContext(src,c);
const e0=c.Cache_epochLeer_(); epoch='11'; assert.equal(c.Cache_putSiEpochVigente_('PACIENTES',[['x']],e0),false); assert.equal(puts,0);
assert.equal(c.Cache_putSiEpochVigente_('PACIENTES',[['x']],11),true); assert.equal(puts,1);
c.PropertiesService={getScriptProperties(){throw Error('down')}}; assert.equal(c.Cache_epochLeer_(),null); assert.equal(c.Cache_putSiEpochVigente_('PACIENTES',[['x']],null),false);
console.log('cache_epoch_v260: PASS');
