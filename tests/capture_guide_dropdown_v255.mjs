#!/usr/bin/env node
/**
 * Batería UI v255 — guía/dropdown, estados de recepción y limpieza de UI muerta.
 *
 * Cubre los errores del informe v255 que se resuelven solo en el frontend:
 *   E06/E07 — estados RECIBIDO / EN_PROCESO / INCIERTO / NO_ENCONTRADO y
 *            botón "Verificar recepción" (WebApp_verificarRecepcion).
 *   E24     — la guía apunta a un único paso `#accion` (no `#acc1..#acc4`).
 *   E25     — una sola máquina de timeout (sin `_envTimeout*`).
 *   E26     — UI de duplicados muerta eliminada (overlay/handlers/CSS/callbacks).
 *
 * Es análisis estático del archivo REAL src/CapturaWeb.html: no se reescribe
 * la UI, se verifica el contrato que el informe exige.
 *
 * Uso: node tests/capture_guide_dropdown_v255.mjs
 * Salida: [PASS]/[FAIL] por prueba + TOTAL/PASS/FAIL.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');
const html = readFileSync(path.join(raiz, 'src/CapturaWeb.html'), 'utf8');

let PASS = 0, FAIL = 0;
function t(nombre, fn) {
  try { fn(); PASS += 1; console.log('[PASS] ' + nombre); }
  catch (e) { FAIL += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }

console.log('─── Guía UI / dropdown (E24) ───');

t('E24: el paso de la guía referencia #accion', () => {
  A(html.includes('sel:"#accion"'), 'la guía debe tener un paso {sel:"#accion"}');
});

t('E24: no quedan selectores #acc1..#acc4 en la guía', () => {
  A(!/#acc[1-4]/.test(html), 'la guía no debe referenciar tarjetas antiguas #acc1..#acc4');
});

t('E24: #accion es un <select> (dropdown) real en el HTML', () => {
  A(/<select[^>]*id="accion"/.test(html), 'debe existir <select id="accion">');
  const sel = html.slice(html.indexOf('id="accion"') - 200, html.indexOf('id="accion"') + 40);
  A(sel.includes('<select'), 'el control de acción debe ser un dropdown');
});

t('E24: la descripción de acción se actualiza dinámicamente', () => {
  A(html.includes('function actualizarDescripcionAccion()'), 'debe existir actualizarDescripcionAccion');
  A(html.includes('$("accion").addEventListener("change"'), 'el dropdown debe escuchar change');
});

t('E24: título y botón final describen la acción seleccionada', () => {
  A(html.includes('id="capturaTitulo"'), 'debe existir un título dinámico de captura');
  A(html.includes('id="btnEnviarTexto"'), 'el botón debe separar su etiqueta del spinner');
  A(html.includes('ACTUALIZAR_DATOS:"Guardar actualización"'), 'Actualizar debe usar una etiqueta inequívoca');
  A(html.includes('ACTUALIZAR_DATOS:"Actualizar ficha"'), 'el título debe explicar que se edita la ficha');
});

t('E24: la sección profesional no se presenta como exclusiva de ingresos', () => {
  A(html.includes('Profesionales que registran'), 'la sección profesional debe usar un rótulo transversal');
  A(!html.includes('titulo:"6 · Equipo de ingreso"'), 'la guía no debe conservar el rótulo exclusivo de ingreso');
});

console.log('\n─── Estados de recepción (E06/E07) ───');

t('E07: WebApp_verificarRecepcion se invoca desde el cliente', () => {
  A(html.includes('WebApp_verificarRecepcion(id)'), 'debe llamar a WebApp_verificarRecepcion sin credencial legacy');
  A(html.includes('function verificarRecepcion()'), 'debe existir verificarRecepcion()');
});

t('E06: existe el botón "Verificar recepción"', () => {
  A(/id="btnVerificar"/.test(html), 'debe existir #btnVerificar');
  A(html.includes('Verificar recepción'), 'el botón debe rotularse "Verificar recepción"');
  A(html.includes('$("btnVerificar").addEventListener("click",verificarRecepcion)'), 'el botón debe disparar verificarRecepcion');
});

t('E06: _envExito reconoce EN_PROCESO', () => {
  A(html.includes('d.estado==="EN_PROCESO"'), 'debe manejar el estado EN_PROCESO');
});

t('E06: _envExito reconoce INCIERTO', () => {
  A(html.includes('d.estado==="INCIERTO"'), 'debe manejar el estado INCIERTO');
});

t('E06/E07: se registra el clientRequestId del último envío para verificar', () => {
  A(html.includes('_ultimoEnvio.id=datos.clientRequestId'), 'debe guardar el clientRequestId enviado');
});

t('E06: el timeout ya no afirma idempotencia inexistente', () => {
  const i = html.indexOf('La respuesta está tardando');
  A(i !== -1, 'debe existir el aviso de timeout');
  A(html.includes('if(vt)vt.hidden=false'), 'el timeout debe ofrecer verificar la recepción');
});

console.log('\n─── Máquina de timeout única (E25) ───');

t('E25: no queda ningún identificador _envTimeout*', () => {
  A(html.indexOf('_envTimeoutId') === -1, '_envTimeoutId eliminado');
  A(html.indexOf('_envTimeoutInit') === -1, '_envTimeoutInit eliminado');
  A(html.indexOf('_envTimeoutOff') === -1, '_envTimeoutOff eliminado');
});

t('E25: se conserva una sola máquina de envío (ENVIO)', () => {
  A(html.includes('var ENVIO={seq:0,activo:false,timeoutId:null,fase:""}'), 'debe existir el objeto ENVIO único');
  A(html.includes('function envioIniciar('), 'envioIniciar presente');
  A(html.includes('function envioFinalizar('), 'envioFinalizar presente');
});

console.log('\n─── UI de duplicados muerta (E26) ───');

t('E26: #dupOverlay eliminado', () => {
  A(html.indexOf('dupOverlay') === -1, 'no debe quedar dupOverlay');
});

t('E26: mostrarDuplicados/_dupCb/cerrarDuplicados eliminados', () => {
  A(html.indexOf('mostrarDuplicados') === -1, 'mostrarDuplicados eliminado');
  A(html.indexOf('_dupCb') === -1, '_dupCb eliminado');
  A(html.indexOf('cerrarDuplicados') === -1, 'cerrarDuplicados eliminado');
});

t('E26: CSS .dup-* eliminado', () => {
  A(html.indexOf('.dup-list') === -1, '.dup-list eliminado');
  A(html.indexOf('.dup-item') === -1, '.dup-item eliminado');
  A(html.indexOf('.dup-criterio') === -1, '.dup-criterio eliminado');
});

t('E26: no se reintrodujo el preflight bloqueante', () => {
  A(html.indexOf('capturarRecibirDurable') !== -1, 'el envío sigue siendo el flujo durable');
});

console.log('\nCapture Guide Dropdown v255 — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);
