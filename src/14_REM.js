/**
 * Sistema ECICEP Unificado — 14_REM
 * Generador mensual del REM desde EVENTOS (REM.md §1-4).
 *
 * Alcance implementado: BLOQUE A (100% generable desde ECICEP):
 *   conteos TIPO × RIESGO_G(snapshot) × SECTOR + indicadores "Tiene…" por paciente.
 * Los totales e indicadores son DERIVADOS al momento de generar (#25):
 * nunca se almacenan como dato maestro; regenerar el mismo período con los
 * mismos eventos produce la misma tabla (reproducible).
 * Bloque B (edad/sexo) requiere PENDIENTES #14; bloque C (atenciones externas)
 * requiere PENDIENTES #17 — se declaran como no disponibles, sin inventar datos.
 * Definiciones operativas PLAN_CUIDADO / GESTION_CASO_* (#15): se cuentan por
 * TIPO_EVENTO tal cual registrado; cambiar la definición solo ajusta filtros aquí.
 */

var REM_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
                 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

var REM_CONCEPTOS = [
  { clave: 'INGRESO',         etiqueta: 'Ingreso integral',         tipos: ['INGRESO'],              niveles: ['G1', 'G2', 'G3'] },
  { clave: 'CONTROL',         etiqueta: 'Control integral',         tipos: ['CONTROL'],              niveles: ['G1', 'G2', 'G3'] },
  { clave: 'SEGUIMIENTO',     etiqueta: 'Seguimiento a distancia',  tipos: ['SEGUIMIENTO'],          niveles: ['G1', 'G2', 'G3'] },
  { clave: 'PLAN_CUIDADO',    etiqueta: 'Plan de cuidado',          tipos: ['PLAN_CUIDADO'],         niveles: ['G1', 'G2', 'G3'] },
  { clave: 'GC_INGRESO',      etiqueta: 'Gestión de casos ingreso', tipos: ['GESTION_CASO_INGRESO'], niveles: ['G2', 'G3'] },
  { clave: 'GC_EGRESO',       etiqueta: 'Gestión de casos egreso',  tipos: ['GESTION_CASO_EGRESO'],  niveles: ['G2', 'G3'] }
];

// ---------------------------------------------------------------------------
// Núcleo PURA (node + GAS)
// ---------------------------------------------------------------------------

/** PURA: extrae {anio, mes} de una fecha Date o string ISO 'YYYY-MM-DD…'.
 *  @returns null si no es interpretable. */
function Rem_periodoDeFecha(v) {
  if (v instanceof Date) return { anio: v.getFullYear(), mes: v.getMonth() + 1 };
  var m = Utl_texto(v).match(/^(\d{4})-(\d{2})/);
  return m ? { anio: +m[1], mes: +m[2] } : null;
}

/** PURA: eventos del período (año/mes naturales) con filtro sector opcional
 *  ('TODOS' | NARANJO | AMARILLO | VERDE). */
function Rem_filtrarPeriodo(eventos, anio, mes, filtroSector) {
  var filtro = Utl_texto(filtroSector).trim().toUpperCase() || 'TODOS';
  return (eventos || []).filter(function (e) {
    var p = Rem_periodoDeFecha(e.FECHA_EVENTO);
    if (!p || p.anio !== Number(anio) || p.mes !== Number(mes)) return false;
    if (filtro !== 'TODOS' && Utl_texto(e.SECTOR).toUpperCase() !== filtro) return false;
    return true;
  });
}

/** PURA: matriz del Bloque A — conteos por concepto × nivel G según snapshot
 *  RIESGO_G. Totales derivados (suma), jamás almacenados.
 *  Eventos del tipo correcto SIN snapshot G no clasifican en columna: se
 *  reportan aparte en sinRiesgo (visibilidad, no silencio).
 *  @returns {filas:[{clave,etiqueta,G1,G2,G3,total}], totalGeneral:{G1,G2,G3,total}, sinRiesgo} */
function Rem_matrizBloqueA(eventosPeriodo) {
  var sinRiesgo = 0;
  var filas = REM_CONCEPTOS.map(function (c) {
    var fila = { clave: c.clave, etiqueta: c.etiqueta, G1: 0, G2: 0, G3: 0, total: 0 };
    (eventosPeriodo || []).forEach(function (e) {
      if (c.tipos.indexOf(Utl_texto(e.TIPO_EVENTO).toUpperCase()) === -1) return;
      var g = Utl_texto(e.RIESGO_G).toUpperCase();
      if (g === '') sinRiesgo++;
      if (c.niveles.indexOf(g) === -1) return;
      fila[g]++;
      fila.total++;
    });
    return fila;
  });
  var totalGeneral = { G1: 0, G2: 0, G3: 0, total: 0 };
  filas.forEach(function (f) {
    totalGeneral.G1 += f.G1; totalGeneral.G2 += f.G2;
    totalGeneral.G3 += f.G3; totalGeneral.total += f.total;
  });
  return { filas: filas, totalGeneral: totalGeneral, sinRiesgo: sinRiesgo };
}

/** PURA: indicadores booleanos "Tiene…" por paciente con ≥1 evento en el
 *  período. Ordenados por nombre para lectura estable (reproducible).
 *  @returns [{id,rut,nombre,sector,eventos,ingreso,control,seguimiento,
 *             planCuidado,gcIngreso,gcEgreso}] */
function Rem_indicadoresPorPaciente(eventosPeriodo) {
  var mapa = {};
  (eventosPeriodo || []).forEach(function (e) {
    var id = Utl_texto(e.ID_INTERNO);
    if (!id) return;
    var r = mapa[id];
    if (!r) {
      r = mapa[id] = { id: id, rut: Utl_texto(e.RUT), nombre: Utl_texto(e.NOMBRE),
                       sector: Utl_texto(e.SECTOR), eventos: 0,
                       ingreso: false, control: false, seguimiento: false,
                       planCuidado: false, gcIngreso: false, gcEgreso: false };
    }
    r.eventos++;
    switch (Utl_texto(e.TIPO_EVENTO).toUpperCase()) {
      case 'INGRESO':              r.ingreso = true; break;
      case 'CONTROL':              r.control = true; break;
      case 'SEGUIMIENTO':          r.seguimiento = true; break;
      case 'PLAN_CUIDADO':         r.planCuidado = true; break;
      case 'GESTION_CASO_INGRESO': r.gcIngreso = true; break;
      case 'GESTION_CASO_EGRESO':  r.gcEgreso = true; break;
    }
  });
  return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) {
    return a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0;
  });
}

/** PURA: línea de cabecera reproducible del informe. */
function Rem_cabecera(anio, mes, filtroSector) {
  var filtro = Utl_texto(filtroSector).trim().toUpperCase() || 'TODOS';
  return 'REM ECICEP — ' + REM_MESES[Number(mes) - 1] + ' ' + Number(anio) +
         ' · Sector: ' + filtro;
}

// ---------------------------------------------------------------------------
// Envoltorio GAS
// ---------------------------------------------------------------------------

/**
 * GAS: genera la hoja REM_SALIDA para el período solicitado.
 * Sobrescribe la hoja completa (regeneración reproducible).
 * @param {number|string} anio  ej: 2026
 * @param {number|string} mes   1..12
 * @param {string} [sectorFiltro] 'TODOS' | NARANJO | AMARILLO | VERDE
 */
function Rem_generar(anio, mes, sectorFiltro) {
  anio = Number(anio); mes = Number(mes);
  if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO (use anio y mes 1..12)');
  var filtro = Utl_texto(sectorFiltro).trim().toUpperCase() || 'TODOS';

  var periodo = Rem_filtrarPeriodo(Modelo_leerEventos(), anio, mes, filtro);
  var matriz = Rem_matrizBloqueA(periodo);
  var indicadores = Rem_indicadoresPorPaciente(periodo);

  var regla = CFG_ESTRATIFICACION.REGLA_DISPONIBLE
    ? ('REGLA ' + Utl_texto(CFG_ESTRATIFICACION.VERSION_REGLA))
    : 'MANUAL/FUENTE';

  var salida = [];
  salida.push([Rem_cabecera(anio, mes, filtro)]);
  salida.push(['Generado:', new Date(), 'Regla estratificación:', regla]);
  salida.push([]);
  salida.push(['BLOQUE A — RESUMEN POR NIVEL G']);
  salida.push(['CONCEPTO', 'G1', 'G2', 'G3', 'TOTAL']);
  matriz.filas.forEach(function (f) {
    salida.push([f.etiqueta, f.G1, f.G2, f.G3, f.total]);
  });
  salida.push(['TOTAL', matriz.totalGeneral.G1, matriz.totalGeneral.G2,
               matriz.totalGeneral.G3, matriz.totalGeneral.total]);
  if (matriz.sinRiesgo > 0) {
    salida.push(['(Eventos del período sin snapshot G, no clasificables: ' + matriz.sinRiesgo + ')']);
  }
  salida.push([]);
  salida.push(['INDICADORES POR PACIENTE — ' + indicadores.length + ' con actividad en el período']);
  salida.push(['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'EVENTOS', 'TIENE_INGRESO',
               'TIENE_CONTROL', 'TIENE_SEGUIMIENTO', 'TIENE_PLAN', 'TIENE_GC_INGRESO', 'TIENE_GC_EGRESO']);
  indicadores.forEach(function (r) {
    salida.push([r.id, r.rut, r.nombre, r.sector, r.eventos, r.ingreso, r.control,
                 r.seguimiento, r.planCuidado, r.gcIngreso, r.gcEgreso]);
  });
  salida.push([]);
  salida.push(['NOTA: Bloque B (demografía) pendiente de FECHA_NACIMIENTO/SEXO (#14); ' +
               'bloque C (atenciones) pendiente de definición de fuente externa (#17). ' +
               'TOTAL e indicadores son derivados al momento de generar (#25).']);

  var ss = Modelo_ss();
  var hoja = ss.getSheetByName('REM_SALIDA');
  if (!hoja) hoja = ss.insertSheet('REM_SALIDA');
  hoja.clear();
  Utl_escribirBloque(hoja, 1, 1, salida);

  Log_info('REM', 'generar', Rem_cabecera(anio, mes, filtro) +
           ' · eventos=' + periodo.length + ' · pacientes=' + indicadores.length);
  Log_flush();

  return { ok: true, cabecera: Rem_cabecera(anio, mes, filtro),
           eventosPeriodo: periodo.length, pacientesConActividad: indicadores.length,
           sinRiesgo: matriz.sinRiesgo, filasEscritas: salida.length };
}
