// v0.17.0 — confirmación server-side de RPC destructivas.
import assert from 'node:assert/strict';
import { crearContextoOperador } from './helpers/operador_vm.mjs';

const h = crearContextoOperador();
const c = h.c;
const clave = 'clave-operador-nonce-segura-2026';
assert.equal(c.WebApp_operadorConfigurarClave_(clave).ok, true);
const a = c.WebApp_operadorIniciar(clave).sessionToken;
const b = c.WebApp_operadorIniciar(clave).sessionToken;
let ejecutadas = 0;
c.WebApp_operadorMapa_().api_configEliminar = () => { ejecutadas += 1; return { ok: true }; };

const prep = c.WebApp_operadorRpc(a, 'api_configEliminar', ['CLAVE_X', 'legacy']);
assert.equal(prep.codigo, 'OPERADOR_CONFIRMACION_REQUERIDA');
assert.equal(ejecutadas, 0);
assert.equal(c.WebApp_operadorRpc(b, 'api_configEliminar', ['CLAVE_X', 'legacy'], prep.confirmacion.nonce).codigo,
  'OPERADOR_CONFIRMACION_INVALIDA', 'el nonce queda ligado a OPSESS');
assert.equal(ejecutadas, 0);

const prep2 = c.WebApp_operadorRpc(a, 'api_configEliminar', ['CLAVE_X', 'legacy']);
assert.equal(c.WebApp_operadorRpc(a, 'api_configEliminar', ['CLAVE_X', 'legacy'], prep2.confirmacion.nonce).ok, true);
assert.equal(ejecutadas, 1);
assert.equal(c.WebApp_operadorRpc(a, 'api_configEliminar', ['CLAVE_X', 'legacy'], prep2.confirmacion.nonce).codigo,
  'OPERADOR_CONFIRMACION_INVALIDA');
assert.equal(ejecutadas, 1);

// El dry-run de deduplicación no requiere nonce; aplicar sí.
c.WebApp_operadorMapa_().api_amarilloDedupHistorico = dry => ({ ok: true, dry });
assert.equal(c.WebApp_operadorRpc(a, 'api_amarilloDedupHistorico', [true, 'legacy']).ok, true);
assert.equal(c.WebApp_operadorRpc(a, 'api_amarilloDedupHistorico', [false, 'legacy']).codigo,
  'OPERADOR_CONFIRMACION_REQUERIDA');

console.log('operator_destructive_nonce_v0170: prepare/binding/consume-once PASS');
