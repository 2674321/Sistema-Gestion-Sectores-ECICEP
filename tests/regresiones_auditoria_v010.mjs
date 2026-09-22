#!/usr/bin/env node
// Regresiones de la auditoría v0.10.1 (source sync, backup e idempotencia).
// Reproduce y bloquea los hallazgos confirmados de la auditoría final:
//   B2 idempotencia por FUENTE con literal crudo  → clave canónica de comparación
//   B3 hojas autorizadas ausentes leídas en silencio → preflight estructural
//   B4 instalador sin respaldo antes de la primera mutación → backup previo
//   B5 MIG-002 INGRESO_* escribe SALUD_MENTAL por posición → por nombre, sin pisar
//   B8 SALUD_MENTAL: nunca se infiere desde texto libre ni se sobreescribe
//   B9 Instalar repetido no infla FUENTE/STAGING_IMPORT, sin duplicar eventos
//   Una sola lectura real de fuentes entre dry-run y ejecución (sin drift).
// Solo datos sintéticos; ninguna hoja, red ni dependencia externa.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

function backend() {
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  for (const f of readdirSync(new URL('src/', root)).filter((f) => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(read('src/' + f), ctx, { filename: f });
  }
  const props = new Map();
  ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => props.get(k) || '',
    setProperty: (k, v) => props.set(k, v)
  }) };
  ctx.Utilities = { getUuid: () => '12345678-1234-4123-8123-123456789abc', formatDate: () => '' };
  ctx.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheetByName: () => null }),
    openById: () => null,
    BorderStyle: { SOLID_THICK: 'SOLID_THICK', SOLID: 'SOLID', DOTTED: 'DOTTED', DASHED: 'DASHED', DOUBLE: 'DOUBLE' },
    WrapStrategy: { WRAP: 'WRAP', OVERFLOW: 'OVERFLOW', CLIP: 'CLIP', CLAMP: 'CLAMP' },
    newDataValidation: () => ({ build: () => ({}) }),
    newConditionalFormatRule: () => ({ build: () => ({}) })
  };
  // Logs hacia LOG son I/O de GAS: neutralizar en el harness.
  ctx.Log_info = () => {};
  ctx.Log_error = () => {};
  ctx.Log_warning = () => {};
  ctx.Log_flush = () => {};
  return ctx;
}
const expr = (c, e) => vm.runInContext(e, c);
// neutraliza de forma segura cualquier según-quien sea una función real
let passed = 0;
function test(name, run) { run(); passed++; console.log('[PASS] ' + name); }

// ---------------------------------------------------------------------------
// B2 — idempotencia por FUENTE con clave canónica
// ---------------------------------------------------------------------------
test('B2: Fuentes_claveDedupe_ ignora caja, espacios, tildes y formato de fila', () => {
  const c = backend();
  const a = c.Fuentes_claveDedupe_('ECICEP NARANJO|Ingresos Enero |123');
  const b = c.Fuentes_claveDedupe_('ECICEP Naranjo|Ingresos Enero|00123');
  assert.equal(a, b);
  assert.equal(a, 'ECICEPNARANJO|INGRESOSENERO|123');
});
test('B2: la carga no vuelve a generar evento si el FUENTE del evento previo tiene drift de literal', () => {
  const c = backend();
  const fila = c.Fuentes_crearFila({ archivo: 'ECICEP NARANJO', hoja: 'Ingresos Enero ', fila: 2, sector: 'NARANJO' }, { RUT: '12345678-5', NOMBRE: 'ANA PEREZ' }, 7);
  c.Fuentes_leerStagingAutorizado = () => [c.Fuentes_normalizar(fila)];
  c.Fuentes_contarHojasAutorizadas = () => ({ hojas: 1 });
  c.Fuentes_preflightFuentes = () => ({ ok: true, fuentes: [], bloqueantes: [] });
  c.Modelo_leerPacientes = () => [];
  c.Modelo_leerEventos = () => [{ FUENTE: 'ECICEP NARANJO|Ingresos Enero|2' }];
  let procesadas = 0;
  c.Ingresos_procesarFilas = (nuevas) => { procesadas += nuevas.length; return { resumen: {}, resultados: [] }; };
  const r = c.Fuentes_cargaReal({ ejecutar: false, actualizar: true });
  assert.equal(r.ok, true);
  assert.equal(r.resumen.yaImportadas, 1);
  assert.equal(procesadas, 0);
  assert.equal(r.resumen.registros, 1);
});

// ---------------------------------------------------------------------------
// B3 — preflight estructural de las fuentes autorizadas
// ---------------------------------------------------------------------------
function abridorFake(hojasPorId) {
  return (id) => ({
    getName: () => 'FAKE_' + id,
    getSheetByName: (n) => (hojasPorId[id] || []).includes(n) ? { getName: () => n } : null,
    getSheets: () => (hojasPorId[id] || []).map((n) => ({ getName: () => n }))
  });
}
test('B3: preflight detecta hoja autorizada ausente y archivo inaccesible', () => {
  const c = backend();
  const ids = expr(c, '(function(){var out={};Object.keys(FUENTES_DRIVE).forEach(function(k){out[k]=FUENTES_DRIVE[k].id;});return out;})()');
  // Naranjo solo tiene una de sus tres hojas autorizadas
  const presentes = { [ids['ECICEP NARANJO']]: ['Ingresos Enero'] };
  const p = c.Fuentes_preflightFuentes(abridorFake(presentes));
  assert.equal(p.ok, false);
  const naranjo = p.fuentes.find((f) => f.archivo === 'ECICEP NARANJO');
  assert.equal(JSON.stringify(naranjo.faltantes.sort()), JSON.stringify(['Ingreso Febrero', 'Ingresos 2025 - 2026']));
  // archivo sin ID (o inaccesible) no puede procesarse en silencio
  const p2 = c.Fuentes_preflightFuentes(() => null);
  assert.equal(p2.ok, false);
  assert.ok(p2.bloqueantes.length > 0);
});
test('B3: Fuentes_cargaReal bloquea con HOJA_FUENTE_FALTANTE sin leer ni escribir', () => {
  const c = backend();
  let leidas = 0, eventos = 0;
  c.Fuentes_leerStagingAutorizado = () => { leidas++; return []; };
  c.Fuentes_preflightFuentes = () => ({ ok: false, fuentes: [{ archivo: 'X', faltantes: ['Y'], errores: [] }], bloqueantes: [{}] });
  c.Modelo_leerEventos = () => [];
  c.Modelo_leerPacientes = () => [];
  c.Modelo_agregarEventos = () => { eventos++; return 0; };
  const r = c.Fuentes_cargaReal({ ejecutar: true, actualizar: true });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'HOJA_FUENTE_FALTANTE');
  assert.ok(r.preflight && r.preflight.length === 1);
  assert.equal(leidas, 0);
  assert.equal(eventos, 0);
});

// ---------------------------------------------------------------------------
// B4 — respaldo previo a la primera mutación
// ---------------------------------------------------------------------------
test('B4: la primera etapa mutante crea UN respaldo por ejecución; el resto lo reutiliza', () => {
  const c = backend();
  c.Mig_schemaLeido = () => '2';
  c.SISTEMA_VERSION_SCHEMA_ACTUAL = '2';
  const cache = {};
  c.CacheService = { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = String(v); } }) };
  c.DriveApp = { getFileById: () => ({ makeCopy: () => null }) };
  let backups = 0, nombres = [];
  c.Backup_crear = (et) => { backups++; const n = 'MANUAL_ECICEP_BACKUP_' + backups; nombres.push(n); return { ok: true, nombre: n, id: 'x', url: 'u', tamano: 0 }; };
  c.Modelo_crearEstructura = () => ({ creadas: [], existentes: [], dashboardReparado: false });
  c.Fuentes_cargaReal = () => ({ ok: true, resumen: { registros: 0, nuevos: 0, existentes: 0, revision: 0 } });
  c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  const clave = c.WebApp_claveCompartida_();
  const r1 = c.api_instalarPaso('estructura', clave, 'EJEC-T1');
  assert.equal(r1.ok, true);
  assert.equal(r1.respaldo, 'MANUAL_ECICEP_BACKUP_1');
  assert.equal(backups, 1);
  // segunda etapa mutante de la MISMA ejecución: no crea otro respaldo
  const r2 = c.api_instalarPaso('fuentes', clave, 'EJEC-T1');
  assert.equal(r2.ok, true);
  assert.equal(r2.respaldo, undefined);
  assert.equal(backups, 1);
  // ejecución distinta → respaldo propio
  const r3 = c.api_instalarPaso('estructura', clave, 'EJEC-T2');
  assert.equal(r3.ok, true);
  assert.equal(backups, 2);
});
test('B4: si el respaldo falla, la etapa responde BACKUP_FALLIDO y no se ejecuta nada', () => {
  const c = backend();
  c.Mig_schemaLeido = () => '2';
  c.SISTEMA_VERSION_SCHEMA_ACTUAL = '2';
  c.DriveApp = {};
  c.Backup_crear = () => ({ ok: false, motivo: 'drive_lleno_simulado' });
  let invocada = 0;
  c.Instalar_pMigraciones = () => { invocada++; return { ok: true }; };
  const clave = c.WebApp_claveCompartida_();
  const r = c.api_instalarPaso('migraciones', clave, 'EJEC-F');
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'BACKUP_FALLIDO');
  assert.match(r.linea, /drive_lleno_simulado/);
  assert.equal(invocada, 0);
});

// ---------------------------------------------------------------------------
// B5 — MIG-002 en hojas INGRESO_* por nombre, sin pisar columnas
// ---------------------------------------------------------------------------
function hojaIngreso(pre, escrituras) {
  const headers = pre.slice();
  return {
    getLastColumn: () => headers.length,
    getRange: (fila, col, nrows, ncols) => {
      if (ncols > 1) return { getValues: () => [headers.slice(col - 1, col - 1 + ncols)] };
      return { setValue: (v) => { escrituras.push({ col, valor: v }); if (col - 1 < headers.length && headers[col - 1].trim() !== '') throw new Error('CLOBBER'); headers[col - 1] = String(v); } };
    }
  };
}
function HojasIngreso(hojas) {
  return (nombre) => hojas[nombre] || null;
}
function canonical11() {
  return ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)', 'FECHA DE INGRESO', 'ESTRATIFICACION', 'DUPLA INGRESO', 'OBSERVACIONES', 'ESTADO_INGRESO', 'NOTA_SISTEMA'];
}
test('B5: MIG-002 escribe SALUD_MENTAL solo donde falta y la celda posterior está libre', () => {
  const c = backend();
  const escrituras = [];
  const ok = hojaIngreso(canonical11(), escrituras);
  const conSM = hojaIngreso(canonical11().concat(['SALUD_MENTAL']), escrituras);
  c.Modelo_hoja = HojasIngreso({ INGRESO_VERDE: ok, INGRESO_NARANJO: conSM });
  c.Modelo_headerRow = () => 1;
  const res = c._mig002_asegurarIngresosSaludMental();
  assert.equal(res.ok, true);
  assert.equal(JSON.stringify(res.actualizadas), JSON.stringify(['INGRESO_VERDE']));
  assert.equal(JSON.stringify(escrituras.map((e) => [e.col, e.valor])), JSON.stringify([[12, 'SALUD_MENTAL']]));
  // la hoja NARANJO ya tenía SALUD_MENTAL: intacta, sin escritura
  assert.equal(res.actualizadas.length, 1);
  assert.equal(JSON.stringify(res.sinHoja), JSON.stringify(['INGRESO_NARANJA', 'INGRESO_AMARILLO']));
});
test('B5: columna ocupada tras NOTA_SISTEMA (columna personal) BLOQUEA sin pisar el dato', () => {
  const c = backend();
  const escrituras = [];
  const conExtra = hojaIngreso(canonical11().concat(['EXTRA']), escrituras);
  c.Modelo_hoja = HojasIngreso({ INGRESO_VERDE: conExtra });
  c.Modelo_headerRow = () => 1;
  const res = c._mig002_asegurarIngresosSaludMental();
  assert.equal(res.ok, false);
  assert.equal(escrituras.length, 0, 'no debe escribir sobre la columna EXTRA');
  assert.ok(res.revision.some((m) => m.indexOf('INGRESO_VERDE') === 0 && m.indexOf('ocupada') !== -1));
});
test('B5: encabezado canónico ausente o desordenado → revisión, sin escritura', () => {
  const c = backend();
  const escrituras = [];
  const sinDupla = hojaIngreso(['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)', 'FECHA DE INGRESO', 'ESTRATIFICACION', 'OBSERVACIONES', 'ESTADO_INGRESO', 'NOTA_SISTEMA'], escrituras);
  c.Modelo_hoja = HojasIngreso({ INGRESO_VERDE: sinDupla });
  c.Modelo_headerRow = () => 1;
  const r1 = c._mig002_asegurarIngresosSaludMental();
  assert.equal(r1.ok, false);
  assert.equal(escrituras.length, 0);
  const ordenado = hojaIngreso(['NOMBRE', 'SEXO', 'RUT', 'FECHA DE NACIMIENTO', 'TELEFONO(S)', 'FECHA DE INGRESO', 'ESTRATIFICACION', 'DUPLA INGRESO', 'OBSERVACIONES', 'ESTADO_INGRESO', 'NOTA_SISTEMA'], escrituras);
  c.Modelo_hoja = HojasIngreso({ INGRESO_VERDE: ordenado });
  const r2 = c._mig002_asegurarIngresosSaludMental();
  assert.equal(r2.ok, false);
  assert.equal(escrituras.length, 0);
});

// ---------------------------------------------------------------------------
// B8 — SALUD_MENTAL: no se infiere, no se sobreescribe
// ---------------------------------------------------------------------------
test('B8: el normalizador solo admite SI/SÍ/NO/vacío; texto clínico se descarta con aviso', () => {
  const c = backend();
  assert.equal(c.Norm_normalizarSaludMental('PS').estado, 'NO_RECONOCIDO');
  assert.equal(c.Norm_normalizarSaludMental('DEPRESION').estado, 'NO_RECONOCIDO');
  assert.equal(c.Norm_normalizarSaludMental('TRUE').estado, 'NO_RECONOCIDO');
  assert.equal(c.Norm_normalizarSaludMental('SI').estado, 'SI');
  assert.equal(c.Norm_normalizarSaludMental('SÍ').estado, 'SI');
  assert.equal(c.Norm_normalizarSaludMental('no').estado, 'NO');
  assert.equal(c.Norm_normalizarSaludMental('  ').estado, 'VACIO');
  const fila = c.Fuentes_normalizar(c.Fuentes_crearFila(
    { archivo: 'FAKE', hoja: 'H', fila: 1, sector: 'NARANJO' },
    { RUT: '12345678-5', NOMBRE: 'ANA PEREZ', SALUD_MENTAL: 'DEPRESIÓN' }, 1));
  assert.equal(fila.NORMALIZADO.SALUD_MENTAL, '');
  assert.ok(fila.WARNINGS.some((w) => w.campo === 'SALUD_MENTAL'), 'aviso de descarte');
});
test('B8: el merge jamás escribe ni modifica SALUD_MENTAL en pacientes existentes', () => {
  const c = backend();
  const paciente = { RUT: '12345678-5', SALUD_MENTAL: 'NO', FUENTE: 'ORIG' };
  const n = { RUT: '12345678-5', SALUD_MENTAL: 'SI', SEXO: '', FECHA_NACIMIENTO: '', TELEFONOS: '', ESTRATIFICACION: '', OBSERVACIONES: '', PREINGRESO: '', DUPLA_INGRESO: '', PROFESIONAL_SEGUIMIENTO: '', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '' };
  const res = c.Act_mergearPaciente(paciente, n, { modo: 'SNAPSHOT_ACTUAL' });
  assert.equal(paciente.SALUD_MENTAL, 'NO');
  assert.ok(!res.aplicados.some((a) => a.campo === 'SALUD_MENTAL'));
});

// ---------------------------------------------------------------------------
// B9 — Instalar repetido no infla trazabilidad ni duplica
// ---------------------------------------------------------------------------
test('B9: SNAPSHOT_ACTUAL no re-registra un TELEFONOS idéntico (no infla FUENTE en 10×)', () => {
  const c = backend();
  const paciente = { RUT: '12345678-5', TELEFONOS: '900000000', ESTRATIFICACION: 'G2', FUENTE: 'ORIG' };
  const fila = { ESTADO_VALIDACION: 'OK', NORMALIZADO: { RUT: '12345678-5', TELEFONOS: '900000000', ESTRATIFICACION: 'G2', SEXO: '', FECHA_NACIMIENTO: '', OBSERVACIONES: '', PREINGRESO: '', DUPLA_INGRESO: '', PROFESIONAL_SEGUIMIENTO: '', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '' } };
  for (let i = 0; i < 10; i++) {
    c.Act_mergearPacientesDesdeStaging([fila], [paciente], { modo: 'SNAPSHOT_ACTUAL' });
  }
  assert.equal(paciente.FUENTE, 'ORIG', 'FUENTE no crece en instalaciones repetidas');
  assert.equal(paciente.TELEFONOS, '900000000');
  assert.equal(paciente.ESTRATIFICACION, 'G2');
});
test('B9: 10× Instalar sobre el mismo origen no duplica eventos ni archiva staging repetido', () => {
  const c = backend();
  const fila = c.Fuentes_crearFila({ archivo: 'ECICEP NARANJO', hoja: 'Ingresos Enero ', fila: 2, sector: 'NARANJO' }, { RUT: '12345678-5', NOMBRE: 'ANA PEREZ', SALUD_MENTAL: 'NO' }, 3);
  c.Fuentes_normalizar(fila);
  c.Fuentes_leerStagingAutorizado = () => [fila];
  c.Fuentes_contarHojasAutorizadas = () => ({ hojas: 1 });
  c.Fuentes_preflightFuentes = () => ({ ok: true, fuentes: [], bloqueantes: [] });
  c.Modelo_leerEventos = () => [{ FUENTE: 'ECICEP NARANJO|Ingresos Enero|2' }];
  c.Modelo_leerPacientes = () => [];
  c.Modelo_asegurarEsquemaPacientes = () => ({ ok: true });
  c.Ingresos_procesarFilas = () => ({ resumen: {}, resultados: [], pacientesNuevos: [], eventos: [] });
  c.Modelo_refrescarVistasSectores = () => ({});
  c.Act_mergearPacientesDesdeStaging = () => ({ revisados: 1, actualizados: 0, sinCambios: 1, conflictos: 0, campos: 0, detalle: [] });
  let eventos = 0;
  c.Modelo_agregarEventos = () => { eventos++; return 0; };
  // STAGING_IMPORT fake para verificar dedupe de auditoría
  let filasStaging = [];
  const ST_NOMBRE = expr(c, 'HOJAS.STAGING_IMPORT');
  c.Modelo_ss = () => ({ getSheetByName: (n) => n === ST_NOMBRE ? {
    getLastRow: () => filasStaging.length,
    getRange: (f, col, nr, nc) => ({ getValues: () => Array.from({ length: nr }, (_, i) => {
      const filaSt = filasStaging[f - 1 + i] || [];
      const out = [];
      for (let j = 0; j < nc; j++) out.push(filaSt[col - 1 + j] !== undefined ? filaSt[col - 1 + j] : '');
      return out;
    }) })
  } : null });
  c.Utl_escribirBloque = (hoja, fila, col, datos) => { filasStaging = filasStaging.concat(datos); return datos.length; };
  for (let i = 0; i < 10; i++) {
    const r = c.Fuentes_cargaReal({ ejecutar: true, actualizar: true });
    assert.equal(r.ok, true);
    assert.equal(r.resumen.yaImportadas, 1, 'fila ya importada cada vez');
    if (i === 0) assert.equal(r.resumen.escritosPacientes, false);
  }
  assert.equal(eventos, 0, 'jamás se vuelve a anexar un evento de una fila ya importada');
  assert.equal(filasStaging.length, 1, 'STAGING_IMPORT archiva el origen físico UNA sola vez');
});
test('B9: Fuentes_guardarFilas es idempotente por origen (segunda llamada = 0)', () => {
  const c = backend();
  let filasStaging = [];
  const ST_NOMBRE = expr(c, 'HOJAS.STAGING_IMPORT');
  c.Modelo_ss = () => ({ getSheetByName: (n) => n === ST_NOMBRE ? {
    getLastRow: () => filasStaging.length,
    getRange: (f, col, nr, nc) => ({ getValues: () => Array.from({ length: nr }, (_, i) => {
      const filaSt = filasStaging[f - 1 + i] || [];
      const out = [];
      for (let j = 0; j < nc; j++) out.push(filaSt[col - 1 + j] !== undefined ? filaSt[col - 1 + j] : '');
      return out;
    }) })
  } : null });
  c.Utl_escribirBloque = (hoja, fila, col, datos) => { filasStaging = filasStaging.concat(datos); return datos.length; };
  const filas = [
    c.Fuentes_crearFila({ archivo: 'A', hoja: 'H1', fila: 1, sector: 'NARANJO' }, { RUT: '1', NOMBRE: 'U' }, 1),
    c.Fuentes_crearFila({ archivo: 'A', hoja: 'H1', fila: 2, sector: 'NARANJO' }, { RUT: '2', NOMBRE: 'D' }, 2)
  ];
  assert.equal(c.Fuentes_guardarFilas(filas), 2);
  assert.equal(c.Fuentes_guardarFilas(filas), 0, 'mismo origen no se re-archiva');
  assert.equal(filasStaging.length, 2);
});

// ---------------------------------------------------------------------------
// Una sola lectura real de fuentes entre dry-run y ejecución
// ---------------------------------------------------------------------------
test('SNAPSHOT: la ejecución reutiliza el análisis dry-run (UNA lectura de fuentes)', () => {
  const c = backend();
  const fila = c.Fuentes_crearFila({ archivo: 'ECICEP NARANJO', hoja: 'Ingresos Enero', fila: 2, sector: 'NARANJO' }, { RUT: '12345678-5', NOMBRE: 'ANA PEREZ' }, 4);
  c.Fuentes_normalizar(fila);
  let lecturas = 0;
  c.Fuentes_leerStagingAutorizado = () => { lecturas++; return [fila]; };
  c.Fuentes_contarHojasAutorizadas = () => ({ hojas: 1 });
  c.Fuentes_preflightFuentes = () => ({ ok: true, fuentes: [], bloqueantes: [] });
  c.Modelo_leerPacientes = () => [];
  c.Modelo_leerEventos = () => [];
  c.Ingresos_procesarFilas = () => ({ resumen: { nuevos: 1, existentes: 0, revision: 0, conError: 0 }, resultados: [], pacientesNuevos: [], eventos: [] });
  c.Modelo_agregarEventos = () => 0;
  c.Modelo_refrescarVistasSectores = () => ({});
  c.Act_mergearPacientesDesdeStaging = () => ({ revisados: 0, actualizados: 0, sinCambios: 0, conflictos: 0, campos: 0, detalle: [] });
  const a = c.Fuentes_cargaReal({ ejecutar: false, actualizar: true });
  assert.equal(lecturas, 1);
  const r = c.Fuentes_cargaReal({ ejecutar: true, actualizar: true, ejecucionId: a.ejecucionId });
  assert.equal(r.ok, true);
  assert.equal(lecturas, 1, 'la ejecución no vuelve a leer las fuentes');
});

console.log(`\nAuditoría v0.10.1 — ${passed} regresiones blockeadas`);