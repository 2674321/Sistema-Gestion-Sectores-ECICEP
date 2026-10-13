// v255 (DEC-110) — Ciclo de vida de la sesión de operador (OPSESS).
import assert from 'node:assert/strict';
import { crearContextoOperador, sha256Hex } from './helpers/operador_vm.mjs';

const h = crearContextoOperador();
const c = h.c;

// Sin configurar: no hay login posible.
assert.equal(c.WebApp_operadorIniciar('cualquiera').codigo, 'OPERADOR_NO_CONFIGURADO');

// Configuración: solo hash, mínimo de largo.
assert.equal(c.WebApp_operadorConfigurarClave_('corta').codigo, 'CLAVE_OPERADOR_CORTA');
const clave = 'clave-operador-segura-2026';
assert.equal(c.WebApp_operadorConfigurarClave_(clave).ok, true);
assert.equal(h.props.get('ECICEP_OPERATOR_SECRET_SHA256'), sha256Hex(clave));
assert.equal(JSON.stringify([...h.props.values()]).includes(clave), false, 'nunca se guarda el plaintext');

// Credenciales inválidas no filtran el hash.
const mala = c.WebApp_operadorIniciar('incorrecta');
assert.equal(mala.codigo, 'CREDENCIALES_INVALIDAS');
assert.equal(JSON.stringify(mala).includes(sha256Hex(clave)), false);

// Login correcto: token opaco + TTL.
const log = c.WebApp_operadorIniciar(clave);
assert.equal(log.ok, true, JSON.stringify(log));
assert.match(log.sessionToken, /^OPS-[0-9a-f]{64}$/);
assert.equal(log.expiresIn, 21600);
assert.equal(h.cache.get('OPSESS:' + sha256Hex(log.sessionToken)), '1', 'la sesión vive en cache');

// Uso válido y cierre.
c.WebApp_operadorMapa_().ping_v255_ = () => ({ ok: true, pong: true });
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'ping_v255_', []).pong, true);
assert.equal(c.WebApp_operadorCerrar(log.sessionToken).ok, true);
assert.equal(c.WebApp_operadorRpc(log.sessionToken, 'ping_v255_', []).codigo, 'OPERADOR_SESION_REQUERIDA', 'revocada');
delete c.WebApp_operadorMapa_().ping_v255_;

// Expiración de sesión (cache purgada).
const log2 = c.WebApp_operadorIniciar(clave);
h.cache.remove('OPSESS:' + sha256Hex(log2.sessionToken));
assert.equal(c.WebApp_operadorRpc(log2.sessionToken, 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA');

// Fail-closed si CacheService no está disponible.
h.setCacheOn(false);
assert.equal(c.WebApp_operadorIniciar(clave).codigo, 'OPERADOR_NO_DISPONIBLE');
assert.equal(c.WebApp_operadorRpc(log2.sessionToken, 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA');
h.setCacheOn(true);

// Rate limit de intentos fallidos: 20 fallos registrados; el 21º ya se limita.
h.cache.remove('OPLOGIN_FAIL_COUNT');
for (let i = 0; i < 19; i++)
  assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'CREDENCIALES_INVALIDAS', 'fallo ' + (i + 1));
assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'CREDENCIALES_INVALIDAS', 'fallo 20');
assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'OPERADOR_LOGIN_TEMPORALMENTE_LIMITADO', 'fallo 21 (saturado)');

// La clave CORRECTA nunca queda bloqueada por el throttle (anti-DoS) y resetea el contador.
const log3 = c.WebApp_operadorIniciar(clave);
assert.equal(log3.ok, true, 'la clave correcta bypassa el throttle: ' + JSON.stringify(log3));
assert.match(log3.sessionToken, /^OPS-[0-9a-f]{64}$/);
assert.equal(h.cache.get('OPSESS:' + sha256Hex(log3.sessionToken)), '1', 'OPSESS creado aun con el contador saturado');
assert.equal(h.cache.get('OPLOGIN_FAIL_COUNT'), null, 'el login correcto limpia el contador');

// Un fallo posterior abre un contador nuevo (empieza en 1, no continúa en 20).
assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'CREDENCIALES_INVALIDAS');
assert.equal(h.cache.get('OPLOGIN_FAIL_COUNT'), '1', 'contador nuevo tras el login correcto');
h.cache.remove('OPLOGIN_FAIL_COUNT');
console.log('operator_session_v255: OPSESS (login/uso/logout/TTL/rate-limit) PASS');
