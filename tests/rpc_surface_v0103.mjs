#!/usr/bin/env node
// La denylist histórica fue sustituida por la allowlist completa vNEXT.
await import('./seguridad_rpc_allowlist_vNEXT.mjs');
await import('./seguridad_webapp_capacidades_vNEXT.mjs');
console.log('RPC surface histórica: contrato vNEXT delegado');
