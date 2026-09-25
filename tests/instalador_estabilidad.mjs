#!/usr/bin/env node
// Regresiones del instalador: acceso compartido, diagnóstico previo y fallos reales.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
const props = new Map();
c.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, v)
}) };
c.Utilities = { getUuid: () => '12345678-1234-4123-8123-123456789abc', formatDate: () => '' };
c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
const clave = c.WebApp_claveCompartida_();
assert.equal(c.api_instalarEtapas('').motivo, 'ACCESO_DENEGADO');
assert.equal(c.api_instalarDiagnostico('').motivo, 'ACCESO_DENEGADO');
assert.equal(c.api_instalarPaso('runtime', '').motivo, 'ACCESO_DENEGADO');
assert.equal(c.api_instalarEtapas(clave).ok, true);
const diagnosticarReal = c.Instalar_diagnosticar;
c.Instalar_diagnosticar = () => ({ ok: true, diagnostico: { resumen: { fasesPendientes: [] } } });
assert.equal(c.api_instalarDiagnostico(clave).ok, true);
let llamadas = 0;
c.Instalar_pRuntime = () => { llamadas++; return { ok: false, motivo: 'FALLO_SIMULADO' }; };
c.Log_error = () => {}; c.Log_flush = () => {};
assert.equal(c.api_instalarPaso('runtime', clave).motivo, 'FALLO_SIMULADO');
assert.equal(llamadas, 1);
assert.equal(c.api_instalarPaso('runtime', '').motivo, 'ACCESO_DENEGADO');
assert.equal(llamadas, 1);
// v0.14: Instalar_pVisual es wrapper del motor único (subtareas formato:* +
// complementarias del plan, sin pipeline paralelo). Simula un fallo de subtarea.
const tareaRealV = c.Presentacion_ejecutarTarea_;
c.Presentacion_ejecutarTarea_ = t => t.id === 'formato:PACIENTES'
  ? { ok: false, motivo: 'PACIENTES: fallo simulado' } : { ok: true, detalle: {} };
assert.equal(c.Instalar_pVisual().ok, false);
c.Presentacion_ejecutarTarea_ = tareaRealV;
c.Modelo_leerPacientes = () => []; c.Modelo_leerEventos = () => [];
c.Modelo_hoja = () => ({});
c.Modelo_escanearEstructura = () => ({});
c.Mig_clasificarInstalacion = () => ({ estado: 'INCOMPLETA', version: '1' });
assert.equal(c.Instalar_pVerificar().ok, false);
// Un esquema ilegible o posterior bloquea la migración aun si faltan hojas.
c.Mig_clasificarInstalacion = () => ({ estado: 'INCOMPLETA', version: 'abc', objetivo: '1', pendientes: [], sectoresDivergentes: [] });
let migraciones = 0;
c.Mig_ejecutarDeclaradas = () => { migraciones++; return { ok: true }; };
assert.equal(c.Instalar_pVersionado().motivo, 'VERSION_DESCONOCIDA');
assert.equal(c.Mig_ejecutarPersistente().motivo, 'VERSION_DESCONOCIDA');
assert.equal(migraciones, 0);
c.Mig_clasificarInstalacion = () => ({ estado: 'INCOMPLETA', version: '2', objetivo: '1', pendientes: [], sectoresDivergentes: [] });
assert.equal(c.Mig_ejecutarPersistente().motivo, 'ESQUEMA_DIVERGENTE');
assert.equal(migraciones, 0);
let estructuraEscrita = 0;
c.Modelo_crearEstructura_ = () => { estructuraEscrita++; return { creadas: [], existentes: [] }; };
assert.equal(c.Instalar_ejecutarPolitica().motivo, 'ESQUEMA_DIVERGENTE');
assert.equal(estructuraEscrita, 0);
c.Mig_schemaLeido = () => '3';
assert.equal(c.api_instalarPaso('estructura', clave).motivo, 'ESQUEMA_DIVERGENTE');
assert.equal(estructuraEscrita, 0);
c.Modelo_validarIngresos = () => ({ fallidas: ['INGRESO_VERDE: error'] });
c.Modelo_ss = () => ({});
assert.equal(c.Instalar_pValidaciones().ok, false);
c.Modelo_aplicarDiseno = () => ({ fallidas: ['PACIENTES: error'] });
assert.equal(c.Instalar_pDiseno().ok, false);
// v0.14 §9: INICIO pertenece al motor (subtarea 'inicio'): el wrapper delega en
// Presentacion_ejecutarTarea_ (que usa Inicio_construir_) + verificación con
// Inicio_diagnosticarVisual_, sin Modelo_disenoHojas ni toques a otras hojas.
c.Modelo_ss = () => ({ getSheetByName: n => n === 'INICIO' ? { hoja: 'INICIO' } : null });
c.Inicio_construir_ = () => ({ ok: true });
c.Inicio_diagnosticarVisual_ = () => ({ ok: false, diferencias: ['SECTOR_VERDE: formato simulado'] });
assert.match(c.Instalar_pInicio().motivo, /SECTOR_VERDE/);
c.Inicio_diagnosticarVisual_ = () => ({ ok: true, diferencias: [] });
c.Inicio_construir_ = () => ({ ok: false, motivo: 'Inicio_construir_ falló' });
assert.match(c.Instalar_pInicio().motivo, /Inicio_construir_/);
c.Inicio_construir_ = () => ({ ok: true });
assert.equal(c.Instalar_pInicio().ok, true);
c.Hojas_colorearRutIngresos = () => ({ coloreadas: 0, fallidas: ['INGRESO_VERDE: RUT simulado'] });
c.Hojas_ocultarTecnicas = () => ({}); c.Hojas_proteger = () => ({}); c.Hojas_filtros = () => ({});
assert.match(c.Presentacion_ejecutarTarea_({ id: 'accesorios', nombre: 'Ayudas' }).motivo, /INGRESO_VERDE/);
c.Estrat_recalcularTodos_ = () => ({ ok: false, motivo: 'SIN_HOJA_PACIENTES' });
c.Control_recalcularTodos = () => ({ ok: true, cambios: 0, total: 0 });
assert.equal(c.Instalar_pDerivados().ok, false);
// Los nombres y las hojas vacías solo se reportan; ningún paso de instalar borra.
let borradas = 0;
const hoja = (nombre, datos) => ({ getName: () => nombre,
  getLastRow: () => datos.some(f => f.some(v => v !== '')) ? datos.length : 0 });
const libro = { getSheets: () => [hoja('DASHBOARD', [['dato clínico']]), hoja('Borrador', [['']])],
  deleteSheet: () => { borradas++; } };
const inventario = c.Modelo_limpiarHojasResiduales(libro);
assert.equal(borradas, 0);
assert.deepEqual(Array.from(inventario.candidatas), ['DASHBOARD', 'Borrador']);
c.Modelo_ss = () => libro;
assert.equal(c.Instalar_pLimpieza().eliminadas.length, 0);
assert.doesNotMatch(readFileSync(new URL('06_Modelo.js', root), 'utf8').match(/function Modelo_crearEstructura_\(\)\s*\{[\s\S]*?\n\}/)[0], /deleteSheet\(/);
// Las etapas de carga de datos reales (fuentes, amarillo, enriquecimiento)
// son MUTANTES: toman LockService. limpieza es de solo lectura.
c.Mig_schemaLeido = () => '2';
let bloqueos = 0;
c.LockService = { getScriptLock: () => { bloqueos++; return { tryLock: () => true, releaseLock() {} }; } };
c.Fuentes_cargaReal = () => ({ ok: true, resumen: { registros: 0, nuevos: 0, existentes: 0, revision: 0 } });
c.Amarillo_importarTodo_ = () => ({ ok: true, puerta: {}, historico: {} });
c.Act_enriquecerPacientes = () => ({ ok: true, totalPacientes: 0, revisados: 0, enriquecidos: 0, sinCambios: 0 });
for (const id of ['fuentes', 'amarillo', 'enriquecimiento'])
  assert.equal(c.api_instalarPaso(id, clave).ok, true, id);
assert.equal(bloqueos, 3, 'las etapas de carga de datos toman LockService');
assert.equal(c.api_instalarPaso('limpieza', clave).ok, true, 'limpieza');
assert.equal(bloqueos, 3, 'limpieza no toma lock');
// Si falla el bloqueo, ninguna etapa escritora puede continuar sin exclusividad.
c.Mig_schemaLeido = () => '1';
c.LockService = { getScriptLock: () => { throw Error('bloqueo no disponible'); } };
assert.equal(c.api_instalarPaso('estructura', clave).motivo, 'LOCK_NO_DISPONIBLE');
assert.equal(estructuraEscrita, 0);
delete c.LockService;
assert.equal(c.api_instalarPaso('estructura', clave).motivo, 'LOCK_NO_DISPONIBLE');
assert.equal(estructuraEscrita, 0);
// La Web App no tiene menú de Sheets y debe comunicarlo como etapa omitida.
c.SpreadsheetApp = { getUi: () => { throw Error('sin UI'); } };
let aperturasMenu = 0;
c.onOpen = () => { aperturasMenu++; return { ok: true }; };
assert.equal(c.Instalar_pMenu().omitida, true);
assert.equal(aperturasMenu, 0);
c.SpreadsheetApp.getUi = () => ({});
c.onOpen = () => ({ ok: false, motivo: 'menú fallido' });
assert.equal(c.Instalar_pMenu().motivo, 'menú fallido');
// La previa debe consultar el libro sin invocar ninguna rutina que lo escriba.
const ingreso = {
  isSheetHidden: () => false, getMaxRows: () => 100, getLastRow: () => 100,
  getRange: (_fila, columna) => ({ getDataValidation: () =>
    columna === vm.runInContext("INGRESO_COLUMNAS.indexOf('SEXO') + 1", c) ? null : {} }),
  getConditionalFormatRules: () => [{ id: 'regla' }]
};
const pacientes = { getLastRow: () => 0, isColumnHiddenByUser: () => false };
const eventos = { isColumnHiddenByUser: () => true };
const conflictos = { isSheetHidden: () => true, getLastRow: () => 0 };
const hojasLectura = new Map([
  ['INGRESO_VERDE', ingreso],
  [c.HOJAS.PACIENTES, pacientes], [c.HOJAS.EVENTOS, eventos], [c.HOJAS.CONFLICTOS, conflictos]
]);
c.Modelo_ss = () => ({ getSheetByName: nombre => hojasLectura.get(nombre) || null });
c.Modelo_escanearEstructura = () => ({ hojas: {}, criticasFaltantes: [] });
c.Mig_clasificarInstalacion = () => ({ estado: 'VIGENTE', version: '1', objetivo: '1', pendientes: [], sectoresDivergentes: [] });
c.HVis_diagnosticarTodas = () => ({ diagnostico: {} });
const prohibida = () => { throw Error('El diagnóstico escribió el libro'); };
c.Modelo_validarIngresos = prohibida;
c.Hojas_formatoCondicional = prohibida;
c.Hojas_ocultarTecnicas = prohibida;
c.Instalar_diagnosticar = diagnosticarReal;
const previa = c.Instalar_diagnosticar();
assert.equal(previa.ok, true);
assert.equal(previa.diagnostico.validaciones.aplicadas, 4);
assert.equal(previa.diagnostico.validaciones.pendientes, 1);
assert.equal(previa.diagnostico.formato.aplicados, 1);
assert.equal(previa.diagnostico.formato.pendientes, 1);
assert.equal(previa.diagnostico.ocultas.ocultadas, 5);
assert.equal(previa.diagnostico.ocultas.pendientes, 9);
const html = readFileSync(new URL('Instalador.html', root), 'utf8');
assert.match(html, /data-acceso="<\?= TOKEN_ACCESO \?>"/);
assert.match(html, /\.api_instalarEtapas\(ECICEP_ACCESO\)/);
assert.match(html, /\.api_instalarDiagnostico\(ECICEP_ACCESO\)/);
assert.match(html, /\.api_instalarPaso\(etapa\.id,ECICEP_ACCESO,_EJEC,opcionesDatos\(\)\)/,
  'llamarPaso entrega la política de datos a la etapa');
// v0.14.1 §3/§42: bloque DATOS con política explícita, confirmación y preview.
assert.match(html, /id="datosPanel"/);
assert.match(html, /name="modoDatos" value="CONSERVAR"/);
assert.match(html, /name="modoDatos" value="SNAPSHOT_ACTUAL"/);
assert.match(html, /id="optSnapshotConfirma"/);
assert.match(html, /\.api_fuentesImpacto\(ECICEP_ACCESO,modo\)/);
assert.match(html, /function iniciarInstalacion\(\)/);
assert.match(html, /_EJEC=nuevoEjecucion\(\);/);
assert.match(html, /function reintentarUltimoError\(\)/);
assert.match(html, /Se conserva la ejecución, el cursor y el respaldo existente/);
assert.match(html, /marcar\(etapa\.id,aviso\?'ADVERTENCIA':'OK'\)/);
assert.doesNotMatch(html, /fuentes:8|amarillo:6/);
assert.doesNotMatch(html, /function cargarEtapas\(\)\s*\{[\s\S]*?ejecutarSecuencia\(0\);[\s\S]*?function marcar/);
assert.equal(c.doGet ? typeof c.doGet : '', 'function');
console.log('[PASS] instalador protegido, diagnóstico previo y fallos detectados');
