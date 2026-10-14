#!/usr/bin/env node
// v255 (DEC-110) — Allowlist RPC pública: la superficie debe ser mínima y
// explícita. Antes ~709 funciones públicas; ahora < 15. Toda RPC de operador
// se privatiza con `_` y solo es alcanzable por el gateway OPSESS.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const allow = JSON.parse(readFileSync(new URL('./rpc_public_allowlist.json', import.meta.url), 'utf8'));
const archivos = readdirSync(src).filter(f => /\.(?:js|gs)$/.test(f)).sort();
const funciones = [];
for (const a of archivos) {
  const s = readFileSync(new URL(a, src), 'utf8');
  for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) if (!m[1].endsWith('_')) funciones.push(m[1]);
}
const pub = [...new Set(funciones)].sort();
const esperado = [...new Set([...allow.runtime, ...allow.public_capture, ...allow.public_auth, ...(allow.public_temporary || [])])].sort();
assert.deepEqual(pub, esperado, 'la superficie RPC cambió sin revisión de allowlist');
assert.ok(pub.length < 15, 'la superficie pública debe ser < 15');

// Operador/administración que NO puede ser público.
for (const nombre of ['Instalar_pIntegridad', 'Instalar_pMigraciones', 'Instalar_pFuentes',
  'Fuentes_cargaReal', 'Limpieza_ejecutar', 'Backup_podar', 'api_buscar', 'api_ficha',
  'api_instalarPaso', 'api_integridadReparar', 'WebApp_cargarPacienteEdicion', 'Modelo_leerPacientes',
  'Form_operativoInstalar']) {
  assert.ok(!pub.includes(nombre), nombre + ' no puede ser RPC pública');
}
// Estado retirado que no debe reaparecer.
for (const retirado of ['Form_procesarAhora', 'UI_formularioPanel', 'api_formularioEstado',
  'api_formularioProcesar', 'api_formularioControl', 'api_formularioReprocesar']) {
  assert.ok(!pub.includes(retirado), retirado + ' legacy debe permanecer retirado');
}

// Gateway explícito.
const auth = readFileSync(new URL('37_OperadorAuth.js', src), 'utf8');
for (const m of ['WebApp_operadorIniciar', 'WebApp_operadorCerrar', 'WebApp_operadorRpc'])
  assert.match(auth, new RegExp('function ' + m + '\\s*\\('), m + ' debe existir');
assert.match(auth, /WEBAPP_OPERATOR_RPC_/, 'debe existir el mapa explícito');
assert.doesNotMatch(auth, /globalThis\s*\[|eval\s*\(|new\s+Function/, 'sin despacho dinámico');
console.log('RPC allowlist vNEXT (DEC-110): ' + pub.length + ' funciones públicas; críticos internos privados');
