#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, JSON, Date, Math });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

// Caso 1: extracción de captureId desde la marca de trazabilidad
assert.equal(ctx.Ingresos_captureIdDesdeMarca_('FORM|Cp4-' + 'a'.repeat(32) + '|INGRESO'), 'Cp4-' + 'a'.repeat(32));
assert.equal(ctx.Ingresos_captureIdDesdeMarca_('FORM|prefix|INGRESO'), '');
assert.equal(ctx.Ingresos_captureIdDesdeMarca_('nota manual del operador'), '');
assert.equal(ctx.Ingresos_captureIdDesdeMarca_(''), '');

// Caso 2: Fuentes_fuenteOrigen prioriza captureId durable
const filaStaging = ctx.Fuentes_normalizar(ctx.Fuentes_crearFila(
  { archivo: 'HOJA_INGRESO', hoja: 'INGRESO_VERDE', fila: 5, sector: 'VERDE' },
  { RUT: '12.345.678-5', NOMBRE: 'TEST ORIGEN', SECTOR: 'VERDE', CAPTURE_ID: 'Cp4-' + 'b'.repeat(32) }));
filaStaging.CAPTURE_ID = 'Cp4-' + 'b'.repeat(32);
assert.equal(ctx.Fuentes_fuenteOrigen(filaStaging), 'Cp4-' + 'b'.repeat(32));

// Caso 3: clave de dedupe conserva el captureId completo, no lo trunca
const clave = ctx.Fuentes_claveDedupe_(ctx.Fuentes_fuenteOrigen(filaStaging));
assert.equal(clave.toUpperCase(), ('cp4-' + 'b'.repeat(32)).toUpperCase().replace(/[^A-Z0-9]/gi, ''));
assert.equal(clave.length >= 32, true, 'el captureId permanece íntegro en la clave de dedupe');

// Caso 4: sin captureId, el origen físico sigue funcionando (compatibilidad histórica)
const filaLegacy = ctx.Fuentes_normalizar(ctx.Fuentes_crearFila(
  { archivo: 'HOJA_INGRESO', hoja: 'INGRESO_AMARILLO', fila: 12, sector: 'AMARILLO' },
  { RUT: '9.876.543-1', NOMBRE: 'TEST LEGACY', SECTOR: 'AMARILLO' }));
assert.equal(ctx.Fuentes_fuenteOrigen(filaLegacy), 'HOJA_INGRESO|INGRESO_AMARILLO|12');

// Caso 5: Fuentes_claveDedupe_ normaliza el origen físico heredado sin romper nada
const claveLegacy = ctx.Fuentes_claveDedupe_(ctx.Fuentes_fuenteOrigen(filaLegacy));
assert.equal(claveLegacy, 'HOJAINGRESO|INGRESOAMARILLO|12');

console.log('Identidad origen captureId vNEXT: PASS');
