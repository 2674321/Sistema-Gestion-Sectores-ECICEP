// v0.17.0 — El worker manual ya NO es una función pública temporal.
// `ECICEP_EJECUTAR_WORKER_AHORA` fue retirado; el worker manual permanente es
// `api_formWorkerEjecutarAhora_`, accesible SOLO vía OPSESS dentro de
// `WEBAPP_OPERATOR_RPC_`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../', import.meta.url);
const canalSrc = fs.readFileSync(new URL('src/36_FormsCanal.js', raiz), 'utf8');
const authSrc = fs.readFileSync(new URL('src/37_OperadorAuth.js', raiz), 'utf8');

// 1. La función pública temporal NO existe en ningún archivo de src.
const srcDir = new URL('src/', raiz);
for (const f of fs.readdirSync(srcDir).filter((x) => /\.(js|gs)$/.test(x))) {
  const s = fs.readFileSync(new URL('src/' + f, raiz), 'utf8');
  assert.doesNotMatch(s, /function\s+ECICEP_EJECUTAR_WORKER_AHORA\s*\(/, f + ' no debe declarar ECICEP_EJECUTAR_WORKER_AHORA');
}

// 2. El worker manual permanente existe como privado (sufijo `_`).
assert.match(canalSrc, /^function api_formWorkerEjecutarAhora_\(opciones\)/m, 'existe api_formWorkerEjecutarAhora_ privado');

// 3. Está registrado en el mapa de RPC de operador (OPSESS).
assert.match(authSrc, /"api_formWorkerEjecutarAhora":\s*api_formWorkerEjecutarAhora_/, 'registrado en WEBAPP_OPERATOR_RPC_');

// 4. El wrapper delega en Form_worker_ sin bypass ni salida extra.
function extraer(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  assert.ok(i >= 0, 'existe ' + nombre);
  const resto = src.slice(i);
  const s = resto.slice(1).search(/\nfunction\s+/);
  return s >= 0 ? resto.slice(0, s + 1) : resto;
}
const fn = extraer(canalSrc, 'api_formWorkerEjecutarAhora_');
assert.match(fn, /return\s+Form_worker_\(/, 'delega en Form_worker_');
assert.doesNotMatch(fn, /console\.log/, 'sin salida de log adicional');

const ctx = { Form_worker_: (o) => ({ ok: true, opciones: o }) };
vm.createContext(ctx);
vm.runInContext(fn, ctx);
const r = ctx.api_formWorkerEjecutarAhora_({ max: 5 });
assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true, opciones: { max: 5 } });

console.log('activation_manual_worker_v268: PASS (worker manual solo OPSESS)');
