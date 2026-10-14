// v255 (DEC-110) — Todo HTML de operador llama por el gateway (ECICEP_run /
// ECICEP_lectura); ningún HTML de operador invoca google.script.run directo.
// CapturaWeb conserva SOLO las 4 RPC de captura pública.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const src = new URL('../src/', import.meta.url);
const htmls = readdirSync(src).filter(f => f.endsWith('.html')).sort();
const leer = f => readFileSync(new URL(f, src), 'utf8');

const OPERADOR = ['Sidebar.html', 'Controles.html', 'Dashboard.html', 'Configuracion.html',
  'Backup.html', 'LogVisor.html', 'Instalador.html', 'RemVista.html', 'RemGenerador.html',
  'AcercaDe.html', 'CentroPruebas.html'];

// 1. Cada página de operador incluye el runtime.
for (const f of OPERADOR) {
  assert.ok(htmls.includes(f), 'falta ' + f);
  assert.match(leer(f), /include\('00_OperadorRuntime'\)/, f + ' debe incluir el runtime de operador');
}

// 2. Ninguna página de operador usa google.script.run directo.
for (const f of OPERADOR) {
  assert.doesNotMatch(leer(f), /google\.script\.run/, f + ' no debe llamar google.script.run directo');
}

// 3. 00_Tokens sólo lo menciona en un comentario.
const tokens = leer('00_Tokens.html').split('\n');
for (const linea of tokens) if (linea.includes('google.script.run'))
  assert.match(linea, /\/\*|\*\/|\/\//, 'la mención en 00_Tokens debe ser comentario');

// 4. CapturaWeb conserva exactamente las RPC de captura pública.
const captura = leer('CapturaWeb.html');
const usos = captura.match(/google\.script\.run/g) || [];
assert.equal(usos.length, 4, 'CapturaWeb usa 4 RPC de captura directas');
for (const pub of ['WebApp_estadoInicial', 'WebApp_verificarRecepcion', 'WebApp_capturarRecibirDurable', 'api_webappEstado'])
  assert.ok(captura.includes(pub), 'CapturaWeb debe llamar ' + pub);
assert.doesNotMatch(captura, /WebApp_operador/, 'CapturaWeb no usa RPC de operador');
assert.match(captura, /window\.ECICEP_MODO_OPERADOR\s*=\s*<\?!=/, 'CapturaWeb marca modo captura (sin login)');

// 5. El runtime exporta el contrato cliente.
const runtime = leer('00_OperadorRuntime.html');
for (const fn of ['ECICEP_run', 'ECICEP_asegurarOperador', 'ECICEP_lectura', 'ECICEP_operadorLogin',
  'ECICEP_operadorLogout', 'ECICEP_operadorToken', 'ECICEP_rpcOperador', 'ECICEP_mostrarLogin',
  'ECICEP_confirmarOperacion'])
  assert.match(runtime, new RegExp('window\\.' + fn + '\\s*='), 'el runtime debe exportar ' + fn);
assert.match(runtime, /OPERADOR_CONFIRMACION_REQUERIDA/, 'el runtime ejecuta prepare/confirm/execute');
assert.match(runtime, /ECICEP_MODO_OPERADOR\s*!==\s*false/, 'la captura nunca debe mostrar login de operador');

// 6. El runtime invoca el gateway por las 3 RPC públicas de operador.
for (const rpc of ['WebApp_operadorIniciar', 'WebApp_operadorCerrar', 'WebApp_operadorRpc'])
  assert.ok(runtime.includes(rpc + '('), 'el runtime debe invocar ' + rpc);

console.log('operator_html_gateway_v255: ' + OPERADOR.length + ' vistas de operador vía gateway PASS');
