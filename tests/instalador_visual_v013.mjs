#!/usr/bin/env node
// v0.13.0 — Instalador visual: Instalar_pInicio solo-INICIO (§9), diagnóstico
// con paridad (§20) y cierre de UI con presentación incompleta (§21).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// T1: Instalar_pInicio usa SOLO el constructor de INICIO (delegación única).
const src20 = readFileSync(new URL('20_Instalador.js', root), 'utf8');
const pInicio = src20.match(/function Instalar_pInicio\([\s\S]*?\n\}/)?.[0] || '';
assert.ok(pInicio, 'Instalar_pInicio existe');
assert.match(pInicio, /Inicio_construir_\(ss/);
assert.doesNotMatch(pInicio, /Modelo_disenoHojas\(/, 'no hay llamada a Modelo_disenoHojas');
ok('T1 Instalar_pInicio delega en Inicio_construir_ (sin Modelo_disenoHojas)');

// T2: Instalar_pInicio devuelve {ok, inicio, verificacion, motivo}.
c.Inicio_construir_ = () => ({ ok: true });
c.Inicio_diagnosticarVisual_ = () => ({ ok: true, diferencias: [] });
c.Modelo_ss = () => ({ getSheetByName: () => ({}) });
const rPi = c.Instalar_pInicio();
assert.equal(rPi.ok, true);
assert.ok(rPi.inicio && rPi.verificacion);
ok('T2 retorno {ok,inicio,verificacion} sin errores');

// T3: fallo del constructor de INICIO se reporta como motivo.
c.Inicio_construir_ = () => { throw new Error('MERGE_CRUZA_FREEZE'); };
const rFail = c.Instalar_pInicio();
assert.equal(rFail.ok, false);
assert.match(String(rFail.motivo || ''), /MERGE_CRUZA_FREEZE/);
ok('T3 fallo de Inicio_construir_ llega como motivo del paso');

// T4: diagnóstico instala paridad/inicio en visualProfundo (solo lectura).
c.Inicio_construir_ = ({ ok: true });
c.HVis_compararFamilia_ = () => ({ ok: true, cantidadDiferencias: 0, diferencias: [] });
c.HVis_diagnosticarTodas = () => ({ diagnostico: {} });
c.Hojas_formatoCondicional = () => ({ aplicadas: 0 });
c.Triggers_diagnosticarIngresoOnEdit_ = () => ({ estado: 'OK', total: 0 });
const diag = c.Instalar_diagnosticar();
const vp = diag.diagnostico.visualProfundo;
assert.ok(vp && vp.paridad && vp.paridad.ingreso && vp.paridad.sector, 'paridad presente');
assert.ok(diag.diagnostico.resumen.fasesCompletas.includes('paridad:INGRESO'));
assert.ok(diag.diagnostico.resumen.fasesCompletas.includes('paridad:SECTOR'));
ok('T4 Instalar_diagnosticar expone paridad INGRESO/SECTOR (§20)');

// T5: paridad divergente queda pendiente en el resumen.
c.HVis_compararFamilia_ = () => ({ ok: false, cantidadDiferencias: 2, diferencias: [] });
const diagDiver = c.Instalar_diagnosticar();
assert.ok(diagDiver.diagnostico.resumen.fasesPendientes.includes('paridad:INGRESO'));
ok('T5 paridad divergente → fase pendiente paridad:INGRESO');

// T6: HTML del instalador declara las filas de diagnóstico Paridad INGRESO/SECTOR.
const html = readFileSync(new URL('Instalador.html', root), 'utf8');
assert.match(html, /id="diagParidadIngreso"/);
assert.match(html, /id="diagParidadSector"/);
ok('T6 HTML: filas de diagnóstico Paridad INGRESO y Paridad SECTOR');

// T7: helpers de resumen de paridad en la UI.
const fnConteo = (html.match(/function contarDiferenciasVisuales\([\s\S]*?\n\}/) || [''])[0];
const fnParidad = (html.match(/function resumenParidadOk\([\s\S]*?\n\}/) || [''])[0];
const resumenOk = new Function(fnConteo + '\n' + fnParidad + '\nreturn resumenParidadOk;')();
assert.equal(resumenOk({ ok: true }), true);
assert.equal(resumenOk({ ok: false, diferencias: [] }), false);
ok('T7 resumenParidadOk clasifica convergencia');

// T8: cierre UI con presentación incompleta (botón de reintento + títulos).
assert.match(html, /id="btnRetryPresentacion"/);
assert.match(html, /INSTALACIÓN FUNCIONAL \/ PRESENTACIÓN INCOMPLETA/);
assert.match(html, /resumenVerificacionIncompleta\(/);
ok('T8 HTML: botón Reintentar presentación y título de instalación funcional/incompleta');

// T9: total de fases diagnósticas (estructura, versionado, visual, 2 paridades,
// inicio, conflictos, validaciones, formato, ocultas, trigger).
const src = readFileSync(new URL('20_Instalador.js', root), 'utf8');
assert.match(src, /diagnostico\.resumen\.totalFases = 11/);
ok('T9 resumen declara 11 fases diagnósticas');

console.log('Instalador visual v0.13 — ' + n + '/' + n + ' PASS');