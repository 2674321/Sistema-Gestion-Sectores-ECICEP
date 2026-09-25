#!/usr/bin/env node
// v0.13.0 — Convergencia de la presentación: subplan por hoja, subtareas de
// paridad no fatales y verificación final con contrato estricto (§6/§7/§10).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// T1: el subplan de diseño tiene una subtarea por hoja + inicio/paridad/verificar.
const plan = c.PRESENTACION_SUBPLAN_DISENO;
const ids = Array.from(plan, t => t.id);
assert.ok(ids.includes('formato:INGRESO_NARANJO') && ids.includes('formato:SECTOR_VERDE'));
assert.ok(ids.includes('inicio') && ids.includes('paridad:INGRESO') &&
  ids.includes('paridad:SECTOR') && ids.includes('verificar'));
assert.equal(ids[0], 'base');
assert.equal(ids[ids.length - 1], 'verificar');
ok('T1 subplan por hoja con inicio y paridades antes de verificar');

// T2: VerificacionResultado_ es null-safe antes de la primera verificación.
assert.equal(c.Presentacion_VerificacionResultado_(), null);
ok('T2 memo null-safe');

// T3: paridad divergente NO es un fallo de subtarea (se reporta y continúa).
c.HVis_compararFamilia_ = () => ({ ok: false, cantidadDiferencias: 1, diferencias:
  [{ hoja: 'INGRESO_AMARILLO', propiedad: 'identidad.colorPrincipal' }] });
const rParidad = c.Presentacion_ejecutarTarea_({ id: 'paridad:INGRESO', nombre: 'Paridad visual INGRESO' });
assert.equal(rParidad.ok, true, 'la subtarea de paridad no interrumpe');
assert.equal(c.Presentacion_VerificacionResultado_(), rParidad.detalle,
  'la paridad deja su reporte en el memo (aún no la verificación global)');
ok('T3 paridad: tarea reporta divergencias sin fallar');

// T4: verificar con divergencias termina ok:true y el memo queda ok:false.
c.Modelo_ss = () => ({ getSheetByName: () => null });
c.HVis_diagnosticarTodas = () => ({ diagnostico: {} });
const rVer = c.Presentacion_ejecutarTarea_({ id: 'verificar', nombre: 'Verificación final de presentación' });
assert.equal(rVer.ok, true, 'verificar no es una subtarea fatal');
assert.equal(c.Presentacion_VerificacionResultado_().ok, false);
ok('T4 verificar: subtarea no fatal, resultado estricto en memo');

// T5: el resultado del paso de presentación expone la verificación final.
const src35 = readFileSync(new URL('35_Presentacion.js', root), 'utf8');
assert.match(src35, /verificacion: _PRESENTACION_VERIFICACION_MEMO/);
ok('T5 el paso diseno transporta la verificación al finalizador');

// T6: fingerprint de presentación derivado por contenido.
const pp = c.Presentacion_fingerprintEsperado_();
assert.match(pp, /^pp013\|[0-9a-f]{8}$/);
ok('T6 fingerprint de presentación pp013|fnv1a32 sobre contratos visuales');

// T7: integración — paridad real divergente mantiene ok:false en el plan completo.
c.Modelo_aplicarDiseno = () => ({ ok: true });
c.Hojas_formatoCondicional = () => ({ ok: true, aplicadas: 0, errores: [] });
c.Hojas_colorearRutIngresos = () => ({ coloreadas: 0, fallidas: [] });
c.Hojas_ocultarTecnicas = () => ({ ocultas: 0 });
c.Hojas_proteger = () => ({ protecciones: 0 });
c.Hojas_filtros = () => ({ filtros: 0 });
c.Inicio_construir_ = () => ({ ok: true });
const paso = c.Presentacion_ejecutarPaso_('diseno', 'ECICEP_TEST_CONVERGENCIA');
assert.equal(paso.ok, true);
assert.equal(paso.verificacion.ok, false, 'el instalador ve la presentación incompleta');
ok('T7 plan completo termina pero declara presentación incompleta');

console.log('Convergencia presentación v0.13 — ' + n + '/' + n + ' PASS');