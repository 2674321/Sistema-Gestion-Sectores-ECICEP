// v255 (E29) — superficie RPC pública: contrato explícito y fail-closed.
// Toda función pública (sin guion bajo final) debe estar inventariada en la
// allowlist; las internas terminan en `_` y nunca son invocables desde el cliente.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const allow = JSON.parse(readFileSync(new URL('./rpc_public_allowlist.json', import.meta.url), 'utf8')).functions;
const archivos = readdirSync(src).filter(f => /\.(?:js|gs)$/.test(f)).sort();
const funciones = [];
for (const a of archivos) {
  const s = readFileSync(new URL(a, src), 'utf8');
  for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) if (!m[1].endsWith('_')) funciones.push(m[1]);
}
const pub = [...new Set(funciones)].sort();
assert.deepEqual(pub, [...allow].sort(), 'la superficie pública divergió de rpc_public_allowlist.json');

// Añadidos v255 que deben ser públicos (invocables, sin token).
for (const f of ['api_formWorkerEjecutarAhora', 'Form_operativoReparar', 'WebApp_verificarRecepcion']) {
  assert.ok(pub.includes(f), f + ' debe estar en la superficie pública');
}

// Clasificación por prefijo (documentada en docs/RPC_SURFACE_PLAN.md).
const resumen = {};
for (const f of pub) { const p = f.split('_')[0]; resumen[p] = (resumen[p] || 0) + 1; }
assert.ok((resumen.WebApp || 0) >= 1, 'debe haber entrypoints WebApp_');
assert.ok((resumen.api || 0) >= 1, 'debe haber entrypoints api_');

// El receptor durable no condiciona el acceso a credenciales (DEC-102).
const forms = readFileSync(new URL('36_FormsCanal.js', src), 'utf8');
const i = forms.indexOf('function WebApp_capturarRecibirDurable');
const receptor = forms.slice(i, i + 2600);
assert.doesNotMatch(receptor, /ACCESO_DENEGADO|Session\.|getActiveUser|allowlist/i, 'el receptor no puede depender de credenciales');

console.log('rpc_public_surface_v255: ' + pub.length + ' RPC públicas auditadas (' + JSON.stringify(resumen) + ')');
