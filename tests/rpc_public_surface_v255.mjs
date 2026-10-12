// v255 (DEC-110) — Superficie RPC pública: contrato explícito y fail-closed.
//
// Captura = pública/anónima (4 RPC). Auth operador = 3 RPC. Runtime = 5.
// Toda otra función top-level termina en `_` y Apps Script la excluye de
// `google.script.run`. Cualquier global pública fuera de la allowlist falla aquí.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const allow = JSON.parse(readFileSync(new URL('./rpc_public_allowlist.json', import.meta.url), 'utf8'));
const archivos = readdirSync(src).filter(f => /\.(?:js|gs)$/.test(f)).sort();
const funciones = [];
const codigo = {};
for (const a of archivos) {
  const s = readFileSync(new URL(a, src), 'utf8');
  codigo[a] = s;
  for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) if (!m[1].endsWith('_')) funciones.push(m[1]);
}
const pub = [...new Set(funciones)].sort();
const esperado = [...new Set([...allow.runtime, ...allow.public_capture, ...allow.public_auth])].sort();
assert.deepEqual(pub, esperado, 'la superficie pública divergió de rpc_public_allowlist.json');

// Objetivo v255: menos de 15 globales públicas (antes ~709).
assert.ok(pub.length < 15, 'la superficie pública debe ser < 15, es ' + pub.length);

// PUBLIC_CAPTURE exacto y anónimo.
for (const f of allow.public_capture) assert.ok(pub.includes(f), f + ' debe ser pública (captura)');
// PUBLIC_AUTH exacto.
for (const f of allow.public_auth) assert.ok(pub.includes(f), f + ' debe ser pública (auth operador)');

// Operador/administración NO puede ser público.
for (const f of ['api_buscar', 'api_ficha', 'api_instalarPaso', 'api_backupPodar',
  'api_configGuardar', 'api_integridadReparar', 'Modelo_leerPacientes', 'Backup_podar',
  'Instalar_pIntegridad', 'Limpieza_ejecutar', 'WebApp_cargarPacienteEdicion']) {
  assert.ok(!pub.includes(f), f + ' no puede ser RPC pública (DEC-110)');
}

// El receptor durable no condiciona el acceso a credenciales (DEC-102/110).
const forms = readFileSync(new URL('36_FormsCanal.js', src), 'utf8');
const i = forms.indexOf('function WebApp_capturarRecibirDurable');
const receptor = forms.slice(i, i + 2600);
assert.doesNotMatch(receptor, /ACCESO_DENEGADO|Session\.|getActiveUser|OPSESS/i, 'la captura no puede depender de credenciales/OPSESS');

// Gateway: mapa privado y explícito, sin acceso dinámico global.
const auth = readFileSync(new URL('37_OperadorAuth.js', src), 'utf8');
assert.doesNotMatch(auth, /globalThis\s*\[|this\s*\[|new\s+Function|eval\s*\(/, 'el gateway no puede usar despacho dinámico');
assert.match(auth, /WEBAPP_OPERATOR_RPC_ = \{/, 'debe existir el mapa explícito WEBAPP_OPERATOR_RPC_');
assert.match(auth, /function WebApp_operadorMapa_\(\)/, 'el mapa se construye de forma perezosa (portable)');
const entradas = [...auth.matchAll(/^\s*"([A-Za-z_$][\w$]*)"\s*:\s*([A-Za-z_$][\w$]*)/gm)];
assert.ok(entradas.length >= 60, 'el mapa debe cubrir la lista auditada de RPC operativas');
for (const [, clave, valor] of entradas) {
  assert.ok(valor.endsWith('_'), clave + ' debe apuntar a una función privada (con `_`): ' + valor);
  assert.ok(!valor.endsWith('__'), clave + ' apunta a un nombre inválido: ' + valor);
}

const resumen = {};
for (const f of pub) { const p = f.split('_')[0]; resumen[p] = (resumen[p] || 0) + 1; }
console.log('rpc_public_surface_v255: ' + pub.length + ' RPC públicas (' + JSON.stringify(resumen) + '); ' + entradas.length + ' métodos operador allowlisted');
