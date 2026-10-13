// v255 (DEC-110) — Frontera RPC del gateway de operador.
// Toda RPC de operador es privada (`_`), solo alcanzable por `WebApp_operadorRpc`
// con sesión OPSESS válida y presente en el mapa explícito. Sin despacho dinámico.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearContextoOperador } from './helpers/operador_vm.mjs';

const { c } = crearContextoOperador();

// 1. El gateway existe y el mapa es explícito/cubierto.
assert.equal(typeof c.WebApp_operadorRpc, 'function');
const mapa = c.WebApp_operadorMapa_();
const metodos = Object.keys(mapa);
assert.ok(metodos.length >= 60, 'el mapa debe cubrir la lista auditada de RPC operativas (' + metodos.length + ')');
for (const m of metodos) assert.ok(m && m.indexOf('__') === -1, 'método válido: ' + m);

// 2. Sin sesión → sesión requerida (fail-closed).
assert.equal(c.WebApp_operadorRpc('', 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA');
assert.equal(c.WebApp_operadorRpc('OPS-invalido', 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA');
assert.equal(c.WebApp_operadorRpc(null, 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA');

// 3. Con sesión válida pero método fuera de allowlist → denegado.
c.WebApp_operadorConfigurarClave_('clave-operador-de-prueba-0001');
const log = c.WebApp_operadorIniciar('clave-operador-de-prueba-0001');
assert.equal(log.ok, true);
for (const malo of ['metodo_inexistente', 'api_buscar__', 'constructor', '__proto__', 'prototype']) {
  assert.equal(c.WebApp_operadorRpc(log.sessionToken, malo, []).codigo, 'RPC_OPERADOR_NO_PERMITIDA',
    malo + ' debe ser denegado');
}

// 4. Un método allowlisted ejecuta su función real (no un nombre inventado).
c.WebApp_operadorMapa_().prueba_limite_ = () => ({ ok: true, tocado: true });
const ejec = c.WebApp_operadorRpc(log.sessionToken, 'prueba_limite_', []);
assert.equal(ejec.ok, true); assert.equal(ejec.tocado, true);
delete c.WebApp_operadorMapa_().prueba_limite_;

// 4b. `args` malformado → fail-closed y la función destino NO se ejecuta.
//     Array (vacío/1/2), null y undefined se aceptan (null/undefined → []).
let invocada = 0;
c.WebApp_operadorMapa_().args_limite_ = (a, b) => { invocada += 1; return { ok: true, a, b }; };
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'args_limite_', []).ok, true);
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'args_limite_', ['x']).a, 'x');
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'args_limite_', ['x', 'y']).b, 'y');
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'args_limite_', null).ok, true);
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'args_limite_', undefined).ok, true);
const invocadaValidos = invocada;
for (const bad of [{}, 'texto', 123, true, () => {}]) {
  assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'args_limite_', bad).codigo,
    'RPC_OPERADOR_ARGUMENTOS_INVALIDOS', 'args inválido debe rechazarse: ' + typeof bad);
}
assert.equal(invocada, invocadaValidos, 'la función destino NO se ejecuta con args inválidos');
delete c.WebApp_operadorMapa_().args_limite_;

// 5. Sin despacho dinámico en el gateway.
const auth = readFileSync(new URL('../src/37_OperadorAuth.js', import.meta.url), 'utf8');
assert.doesNotMatch(auth, /globalThis\s*\[|eval\s*\(|new\s+Function|\.constructor\s*\(/);

// 6. Ninguna RPC de operador es pública (todas terminan en `_`).
for (const m of metodos) assert.equal(typeof c[m], 'undefined', m + ' no debe ser global pública');
console.log('operator_rpc_boundary_v255: gateway OPSESS fail-closed PASS (' + metodos.length + ' métodos)');
