/**
 * Sistema ECICEP Unificado — 14_REM
 * Generador mensual del REM desde EVENTOS (REM.md §1-4) — SOLO LECTURA.
 *
 * CONTRATO DEL NÚCLEO PURO (lección ETAPA 8E — api_ficha):
 *   calcularREMBloqueA(eventos, {anio, mes})
 *   - eventos: objetos PLANOS y SERIALIZABLES; FECHA_EVENTO como STRING
 *     'YYYY-MM-DD…'. Ningún Date/Range/Spreadsheet entra ni sale.
 *   - La conversión Date→string la hace el envoltorio GAS con la zona horaria
 *     del proyecto (Session.getScriptTimeZone), nunca el núcleo.
 *   - @returns {periodo:{anio,mes}, conteos:[{tipo,riesgoG,sector,conteo}],
 *               fechasInvalidas} — 100% serializable.
 *
 * POLÍTICA DE VALORES FALTANTES (nada desaparece del conteo):
 *   - RIESGO_G vacío o "G" → bucket PENDIENTE (misma convención que la ficha).
 *   - SECTOR vacío → bucket SIN_SECTOR.
 *   - FECHA_EVENTO no interpretable en NINGÚN mes → fechasInvalidas (visible).
 *
 * BLOQUE A implementado (REM.md §3): tally TIPO × RIESGO_G × SECTOR + tabla
 * por concepto + indicadores "Tiene…" por paciente. Totales derivados al
 * momento de generar (#25); regeneración reproducible.
 * BLOQUES B/C: NO DISPONIBLES (#14/#17) — se declaran explícitamente, jamás
 * se rellenan con ceros o datos inventados.
 */

var REM_MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
                 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

var REM_NIVEL_PENDIENTE = 'PENDIENTE';
var REM_SECTOR_DESCONOCIDO = 'SIN_SECTOR';

var REM_CONCEPTOS = [
  { clave: 'INGRESO',      etiqueta: 'Ingreso integral',         tipos: ['INGRESO'] },
  { clave: 'CONTROL',      etiqueta: 'Control integral',         tipos: ['CONTROL'] },
  { clave: 'SEGUIMIENTO',  etiqueta: 'Seguimiento a distancia',  tipos: ['SEGUIMIENTO'] },
  { clave: 'PLAN_CUIDADO', etiqueta: 'Plan de cuidado',          tipos: ['PLAN_CUIDADO'] },
  { clave: 'GC_INGRESO',   etiqueta: 'Gestión de casos ingreso', tipos: ['GESTION_CASO_INGRESO'] },
  { clave: 'GC_EGRESO',    etiqueta: 'Gestión de casos egreso',  tipos: ['GESTION_CASO_EGRESO'] }
];

// ---------------------------------------------------------------------------
// Buckets PURA
// ---------------------------------------------------------------------------

/** PURA: bucket de riesgo. Vacío o "G" → PENDIENTE; resto tal cual en mayúsculas. */
function Rem_bucketRiesgo(g) {
  var t = Utl_texto(g).trim().toUpperCase();
  return (t === '' || t === 'G') ? REM_NIVEL_PENDIENTE : t;
}

/** PURA: bucket de sector. Vacío → SIN_SECTOR; resto tal cual en mayúsculas. */
function Rem_bucketSector(s) {
  var t = Utl_texto(s).trim().toUpperCase();
  return t === '' ? REM_SECTOR_DESCONOCIDO : t;
}

// ---------------------------------------------------------------------------
// Núcleo PURA (node + GAS) — entrada/salida 100% serializable
// ---------------------------------------------------------------------------

/** PURA: subconjunto de eventos del período por prefijo 'YYYY-MM' del string
 *  de fecha. Sin objetos Date ni zonas horarias: el string ES la verdad. */
function Rem_eventosDelPeriodo(eventos, anio, mes) {
  var prefijo = Number(anio) + '-' + (Number(mes) < 10 ? '0' : '') + Number(mes);
  return (eventos || []).filter(function (e) {
    return Utl_texto(e.FECHA_EVENTO).slice(0, 7) === prefijo;
  });
}

/**
 * PURA — CONTRATO PRINCIPAL: tally plano TIPO × RIESGO_G × SECTOR del período.
 * Ningún evento del mes desaparece: sin G → PENDIENTE, sin sector → SIN_SECTOR.
 * Fechas no interpretables en ningún mes se cuentan en fechasInvalidas.
 *
 * @param {Array<{FECHA_EVENTO:string,TIPO_EVENTO:string,RIESGO_G:string,SECTOR:string}>} eventos
 * @param {{anio:number, mes:number}} opciones
 * @returns {{periodo:{anio,mes}, conteos:Array<{tipo,riesgoG,sector,conteo}>, fechasInvalidas:number}}
 */
function calcularREMBloqueA(eventos, opciones) {
  opciones = opciones || {};
  var anio = Number(opciones.anio), mes = Number(opciones.mes);
  if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
  var prefijo = anio + '-' + (mes < 10 ? '0' : '') + mes;

  var tally = {}, orden = [], fechasInvalidas = 0;
  (eventos || []).forEach(function (e) {
    var fecha = Utl_texto(e.FECHA_EVENTO);
    if (!/^\d{4}-\d{2}/.test(fecha)) { fechasInvalidas++; return; }
    if (fecha.slice(0, 7) !== prefijo) return;
    var tipo = Utl_texto(e.TIPO_EVENTO).trim().toUpperCase() || 'SIN_TIPO';
    var g = Rem_bucketRiesgo(e.RIESGO_G);
    var s = Rem_bucketSector(e.SECTOR);
    var k = tipo + '|' + g + '|' + s;
    if (!tally[k]) { tally[k] = { tipo: tipo, riesgoG: g, sector: s, conteo: 0 }; orden.push(k); }
    tally[k].conteo++;
  });
  orden.sort();
  return { periodo: { anio: anio, mes: mes },
           conteos: orden.map(function (k) { return tally[k]; }),
           fechasInvalidas: fechasInvalidas };
}

/** PURA: buckets G observados en los conteos, orden estable:
 *  G1, G2, G3, PENDIENTE, luego otros literales alfabéticos. */
function Rem_bucketsG(conteos) {
  var vistos = {};
  (conteos || []).forEach(function (c) { vistos[c.riesgoG] = true; });
  var fijos = ['G1', 'G2', 'G3', REM_NIVEL_PENDIENTE].filter(function (b) { return vistos[b]; });
  var extras = Object.keys(vistos).filter(function (b) {
    return fijos.indexOf(b) === -1;
  }).sort();
  return fijos.concat(extras);
}

/**
 * PURA: tabla del Bloque A (presentación REM.md) a partir del tally plano.
 * Cada concepto muestra TODOS los buckets observados — incluido PENDIENTE —
 * para que ningún evento quede invisible. Decisión documentada: la restricción
 * histórica GC=G2/G3 ya NO oculta valores; se muestran tal cual existen.
 * @returns {buckets:[], filas:[{clave,etiqueta,valores:{},total}], totalGeneral:{}}
 */
function Rem_tablaDesdeConteos(conteos) {
  var buckets = Rem_bucketsG(conteos);
  var filas = REM_CONCEPTOS.map(function (c) {
    var fila = { clave: c.clave, etiqueta: c.etiqueta, valores: {}, total: 0 };
    buckets.forEach(function (b) { fila.valores[b] = 0; });
    (conteos || []).forEach(function (ct) {
      if (c.tipos.indexOf(ct.tipo) === -1) return;
      if (!(ct.riesgoG in fila.valores)) fila.valores[ct.riesgoG] = 0;
      fila.valores[ct.riesgoG] += ct.conteo;
      fila.total += ct.conteo;
    });
    return fila;
  });
  var totalGeneral = { total: 0 };
  buckets.forEach(function (b) { totalGeneral[b] = 0; });
  filas.forEach(function (f) {
    buckets.forEach(function (b) { totalGeneral[b] = (totalGeneral[b] || 0) + f.valores[b]; });
    totalGeneral.total += f.total;
  });
  return { buckets: buckets, filas: filas, totalGeneral: totalGeneral };
}

/** PURA: indicadores booleanos "Tiene…" por paciente (lote YA filtrado al
 *  período). Orden estable por nombre.
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
                       sector: Rem_bucketSector(e.SECTOR), eventos: 0,
                       ingreso: false, control: false, seguimiento: false,
                       planCuidado: false, gcIngreso: false, gcEgreso: false };
    }
    r.eventos++;
    switch (Utl_texto(e.TIPO_EVENTO).trim().toUpperCase()) {
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
// Envoltorio GAS — única capa que toca hojas y convierte fechas
// ---------------------------------------------------------------------------

/** GAS: normaliza eventos leídos de la hoja a objetos planos serializables,
 *  convirtiendo FECHA_EVENTO Date→'YYYY-MM-DD' en la zona horaria del proyecto
 *  (no UTC) para que los bordes de mes queden en el mes correcto. */
function _rem_normalizarEventos(crudos) {
  var tz = Session.getScriptTimeZone();
  return (crudos || []).map(function (e) {
    var f = e.FECHA_EVENTO;
    var iso = (f instanceof Date)
      ? Utilities.formatDate(f, tz, 'yyyy-MM-dd')
      : Utl_texto(f).slice(0, 10);
    return { ID_INTERNO: Utl_texto(e.ID_INTERNO), RUT: Utl_texto(e.RUT),
             NOMBRE: Utl_texto(e.NOMBRE), FECHA_EVENTO: iso,
             TIPO_EVENTO: Utl_texto(e.TIPO_EVENTO),
             SECTOR: Utl_texto(e.SECTOR), RIESGO_G: Utl_texto(e.RIESGO_G) };
  });
}

/**
 * GAS: genera la hoja REM_SALIDA para el período. SOLO LECTURA de EVENTOS y
 * PACIENTES; escribe únicamente REM_SALIDA. El menú funciona autónomo (esta
 * función no depende del webhook). Regenerar el mismo período con los mismos
 * datos produce la misma tabla (reproducible).
 * @param {number|string} anio  ej: 2026
 * @param {number|string} mes   1..12
 * @param {string} [sectorFiltro] 'TODOS' | NARANJO | AMARILLO | VERDE
 */
function Rem_generar(anio, mes, sectorFiltro) {
  anio = Number(anio); mes = Number(mes);
  if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
  var filtro = Rem_bucketSector(Utl_texto(sectorFiltro).trim() === '' ? 'todos' : sectorFiltro);

  // 1) lectura única + normalización a contratos serializables (tz proyecto)
  var eventos = _rem_normalizarEventos(Modelo_leerEventos());

  // 2) filtro de sector sobre bucket normalizado ('' solo visible en TODOS)
  var lote = eventos.filter(function (e) {
    return filtro === 'TODOS' ? true : Rem_bucketSector(e.SECTOR) === filtro;
  });

  // 3) núcleo puro
  var bloqueA = calcularREMBloqueA(lote, { anio: anio, mes: mes });
  var enPeriodo = Rem_eventosDelPeriodo(lote, anio, mes);
  var tabla = Rem_tablaDesdeConteos(bloqueA.conteos);
  var indicadores = Rem_indicadoresPorPaciente(enPeriodo);

  // 4) armado del informe (B/C declarados NO DISPONIBLE, sin datos falsos)
  var regla = CFG_ESTRATIFICACION.REGLA_DISPONIBLE
    ? ('REGLA ' + Utl_texto(CFG_ESTRATIFICACION.VERSION_REGLA))
    : 'MANUAL/FUENTE';

  var salida = [];
  salida.push([Rem_cabecera(anio, mes, filtro)]);
  salida.push(['Generado:', new Date(), 'Regla estratificación:', regla]);
  salida.push([]);
  salida.push(['BLOQUE A — RESUMEN POR NIVEL G (snapshot RIESGO_G del evento; sin G → PENDIENTE)']);
  salida.push(['CONCEPTO'].concat(tabla.buckets).concat(['TOTAL']));
  tabla.filas.forEach(function (f) {
    salida.push([f.etiqueta].concat(tabla.buckets.map(function (b) { return f.valores[b]; }))
                 .concat([f.total]));
  });
  salida.push(['TOTAL'].concat(tabla.buckets.map(function (b) { return tabla.totalGeneral[b]; }))
               .concat([tabla.totalGeneral.total]));
  if (bloqueA.fechasInvalidas > 0) {
    salida.push(['⚠️ Eventos con fecha no interpretable (fuera de todo período): ' + bloqueA.fechasInvalidas]);
  }
  salida.push([]);
  salida.push(['DETALLE TIPO × RIESGO_G × SECTOR']);
  salida.push(['TIPO', 'RIESGO_G', 'SECTOR', 'CONTEO']);
  bloqueA.conteos.forEach(function (c) {
    salida.push([c.tipo, c.riesgoG, c.sector, c.conteo]);
  });
  salida.push([]);
  salida.push(['INDICADORES POR PACIENTE — ' + indicadores.length + ' con actividad en el período']);
  salida.push(['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'EVENTOS', 'TIENE_INGRESO',
               'TIENE_CONTROL', 'TIENE_SEGUIMIENTO', 'TIENE_PLAN', 'TIENE_GC_INGRESO', 'TIENE_GC_EGRESO']);
  indicadores.forEach(function (r) {
    salida.push([r.id, r.rut, r.nombre, r.sector, r.eventos, r.ingreso, r.control,
                 r.seguimiento, r.planCuidado, r.gcIngreso, r.gcEgreso]);
  });
  salida.push([]);
  salida.push(['BLOQUE B — DEMOGRAFÍA: NO DISPONIBLE (#14 — sin FECHA_NACIMIENTO/SEXO en fuentes)']);
  salida.push(['BLOQUE C — ATENCIONES: NO DISPONIBLE (#17 — requiere definir fuente externa)']);
  salida.push(['NOTA: TOTAL e indicadores son derivados al momento de generar (#25); ' +
               'el REM es SOLO LECTURA de EVENTOS/PACIENTES.']);

  var ss = Modelo_ss();
  var hoja = ss.getSheetByName('REM_SALIDA');
  if (!hoja) hoja = ss.insertSheet('REM_SALIDA');
  hoja.clear();
  Utl_escribirBloque(hoja, 1, 1, salida);

  Log_info('REM', 'generar', Rem_cabecera(anio, mes, filtro) +
           ' · eventos=' + enPeriodo.length + ' · pacientes=' + indicadores.length);
  Log_flush();

  return { ok: true, cabecera: Rem_cabecera(anio, mes, filtro),
           eventosPeriodo: enPeriodo.length,
           pacientesConActividad: indicadores.length,
           fechasInvalidas: bloqueA.fechasInvalidas,
           conteos: bloqueA.conteos,
           filasEscritas: salida.length };
}
