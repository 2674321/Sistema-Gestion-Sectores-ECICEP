// v0.17.0 — el builder compatible con google.script.run conserva el Proxy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/00_OperadorRuntime.html', import.meta.url), 'utf8');
const inicio = source.indexOf('function ECICEP_run()');
const fin = source.indexOf('/* Muestra login si no hay sesión.', inicio);
assert.ok(inicio >= 0 && fin > inicio, 'bloque ECICEP_run localizable');

const llamadas = [];
const c = vm.createContext({
  ECICEP_rpcOperador(nombre, args, ok, fail) {
    llamadas.push({ nombre, args, ok, fail });
  }
});
vm.runInContext(source.slice(inicio, fin), c);

const ok = () => {};
const fail = () => {};
const run = c.ECICEP_run();
const encadenado = run.withSuccessHandler(ok).withFailureHandler(fail).withUserObject({ ignorado: true });
assert.equal(encadenado, run, 'cada builder devuelve el mismo Proxy');
encadenado.api_backupConfigLeer('trace');
assert.equal(llamadas.length, 1);
assert.equal(llamadas[0].nombre, 'api_backupConfigLeer');
assert.deepEqual(Array.from(llamadas[0].args), ['trace']);
assert.equal(llamadas[0].ok, ok);
assert.equal(llamadas[0].fail, fail);

console.log('operator_proxy_chain_v0170: handler chain conserva Proxy PASS');
