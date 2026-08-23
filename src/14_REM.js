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
             SECTOR: Utl_texto(e.SECTOR), RIESGO_G: Utl_texto(e.RIESGO_G),
             PROFESIONAL: Utl_texto(e.PROFESIONAL),
             DESCRIPCION: Utl_texto(e.DESCRIPCION),
             CANTIDAD: e.CANTIDAD === '' || e.CANTIDAD == null ? '' : Number(e.CANTIDAD) || '' };
  });
}

/** PURA: rellena todas las filas al ancho máximo con ''. setValues exige un
 *  rectángulo perfecto y el informe mezcla filas de distinto largo (títulos,
 *  secciones, filas vacías). No muta la entrada.
 *  @returns nueva matriz [][] rectangular. */
function _rem_aplanarAncho(filas) {
  var max = 0;
  (filas || []).forEach(function (f) { if (f && f.length > max) max = f.length; });
  return (filas || []).map(function (f) {
    var copia = (f || []).slice();
    while (copia.length < max) copia.push('');
    return copia;
  });
}

/**
 * GAS: núcleo de cálculo compartido entre Rem_generar y el exportador PDF.
 * Lectura única → normalización → filtro sector → núcleo puro.
 */
function _rem_calcula(anio, mes, filtro) {
  var eventos = _rem_normalizarEventos(Modelo_leerEventos());
  var lote = eventos.filter(function (e) {
    return filtro === 'TODOS' ? true : Rem_bucketSector(e.SECTOR) === filtro;
  });
  var bloqueA = calcularREMBloqueA(lote, { anio: anio, mes: mes });
  var enPeriodo = Rem_eventosDelPeriodo(lote, anio, mes);
  return { lote: lote, bloqueA: bloqueA, enPeriodo: enPeriodo,
           tabla: Rem_tablaDesdeConteos(bloqueA.conteos),
           indicadores: Rem_indicadoresPorPaciente(enPeriodo) };
}

/** PURA: nombre de archivo profesional y consistente. */
function remNombreArchivo(anio, mes, sectorFiltro) {
  var s = Utl_texto(sectorFiltro).trim().toUpperCase() || 'TODOS';
  var bonito = s.charAt(0) + s.slice(1).toLowerCase();
  return 'REM_' + bonito + '_' + Number(anio) + '-' +
         (Number(mes) < 10 ? '0' : '') + Number(mes) + '.pdf';
}

/**
 * GAS: genera la hoja REM_SALIDA para el período (hoja INTERNA, oculta).
 * SOLO LECTURA de EVENTOS y PACIENTES. Regenerar el mismo período con los
 * mismos datos produce la misma tabla (reproducible).
 * @param {number|string} anio  ej: 2026
 * @param {number|string} mes   1..12
 * @param {string} [sectorFiltro] 'TODOS' | NARANJO | AMARILLO | VERDE
 */
function Rem_generar(anio, mes, sectorFiltro) {
  anio = Number(anio); mes = Number(mes);
  if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
  var filtro = Rem_bucketSector(Utl_texto(sectorFiltro).trim() === '' ? 'todos' : sectorFiltro);

  // cálculo compartido con el exportador PDF
  var c = _rem_calcula(anio, mes, filtro);
  var bloqueA = c.bloqueA, enPeriodo = c.enPeriodo;
  var tabla = c.tabla, indicadores = c.indicadores;

  // 4) armado del informe (B/C declarados NO DISPONIBLE, sin datos falsos)
  var regla = CFG_ESTRATIFICACION.REGLA_DISPONIBLE
    ? ('REGLA ' + Utl_texto(CFG_ESTRATIFICACION.VERSION_REGLA))
    : 'MANUAL/FUENTE';

  var salida = [], tipos = [];
  var P = function (fila, tipo) { salida.push(fila); tipos.push(tipo || ''); };
  P([Rem_cabecera(anio, mes, filtro)], 'titulo');
  P(['Generado:', new Date(), 'Regla estratificación:', regla], 'meta');
  P([], 'sep');
  P(['BLOQUE A — RESUMEN POR NIVEL G (snapshot RIESGO_G del evento; sin G → PENDIENTE)'], 'seccion');
  P(['CONCEPTO'].concat(tabla.buckets).concat(['TOTAL']), 'cols');
  tabla.filas.forEach(function (f) {
    P([f.etiqueta].concat(tabla.buckets.map(function (b) { return f.valores[b]; }))
      .concat([f.total]), 'dato');
  });
  P(['TOTAL'].concat(tabla.buckets.map(function (b) { return tabla.totalGeneral[b]; }))
    .concat([tabla.totalGeneral.total]), 'total');
  if (bloqueA.fechasInvalidas > 0) {
    P(['⚠️ Eventos con fecha no interpretable (fuera de todo período): ' + bloqueA.fechasInvalidas], 'nota');
  }
  P([], 'sep');
  P(['DETALLE TIPO × RIESGO_G × SECTOR'], 'seccion');
  P(['TIPO', 'RIESGO_G', 'SECTOR', 'CONTEO'], 'cols');
  bloqueA.conteos.forEach(function (c) {
    P([c.tipo, c.riesgoG, c.sector, c.conteo], 'detalle');
  });
  P([], 'sep');
  P(['INDICADORES POR PACIENTE — ' + indicadores.length + ' con actividad en el período'], 'seccion');
  P(['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'EVENTOS', 'TIENE_INGRESO',
     'TIENE_CONTROL', 'TIENE_SEGUIMIENTO', 'TIENE_PLAN', 'TIENE_GC_INGRESO', 'TIENE_GC_EGRESO'], 'cols');
  indicadores.forEach(function (r) {
    P([r.id, r.rut, r.nombre, r.sector, r.eventos, r.ingreso, r.control,
       r.seguimiento, r.planCuidado, r.gcIngreso, r.gcEgreso], 'ind');
  });
  P([], 'sep');
  P(['BLOQUE B — DEMOGRAFÍA: NO DISPONIBLE (#14 — sin FECHA_NACIMIENTO/SEXO en fuentes)'], 'nota');
  P(['BLOQUE C — ATENCIONES: NO DISPONIBLE (#17 — requiere definir fuente externa)'], 'nota');
  P(['NOTA: TOTAL e indicadores son derivados al momento de generar (#25); ' +
     'el REM es SOLO LECTURA de EVENTOS/PACIENTES.'], 'nota');

  var ss = Modelo_ss();
  var hoja = ss.getSheetByName('REM_SALIDA');
  if (!hoja) hoja = ss.insertSheet('REM_SALIDA');
  hoja.clear();
  var rectangulo = _rem_aplanarAncho(salida);
  Utl_escribirBloque(hoja, 1, 1, rectangulo);
  _rem_estilizarSalida(hoja, rectangulo, tipos);

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

/**
 * GAS: exporta el REM como PDF profesional vía DocumentApp (NO impresión de
 * Sheets: sin marca "Hoja de cálculo de Google"). A4 horizontal, márgenes,
 * encabezado con período/sector/fecha de generación, tablas con bordes y
 * fila de encabezado sombreada. Nombre automático REM_<Sector>_<AAAA-MM>.pdf.
 * @returns {ok, url?, nombre?, motivo?}
 */
function REM_exportarPdf(anio, mes, sectorFiltro) {
  var nombre = '';
  try {
    anio = Number(anio); mes = Number(mes);
    if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
    var filtro = Rem_bucketSector(Utl_texto(sectorFiltro).trim() === '' ? 'todos' : sectorFiltro);
    nombre = remNombreArchivo(anio, mes, filtro);

    var c = _rem_calcula(anio, mes, filtro);
    var tabla = c.tabla, indicadores = c.indicadores;
    var tz = Session.getScriptTimeZone();
    var generado = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

    var doc = DocumentApp.create(nombre);
    doc.setName(nombre);
    var body = doc.getBody();

    // A4 horizontal + márgenes
    body.setPageWidth(842).setPageHeight(595);
    body.setMarginTop(46).setMarginBottom(46).setMarginLeft(50).setMarginRight(50);

    // Encabezado del documento
    var titulo = body.appendParagraph('REM ECICEP');
    titulo.setHeading(DocumentApp.ParagraphHeading.TITLE)
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    var sub = body.appendParagraph(Rem_cabecera(anio, mes, filtro));
    sub.setHeading(DocumentApp.ParagraphHeading.HEADING2)
       .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    var meta = body.appendParagraph('Generado: ' + generado +
      ' · Regla estratificación: ' + (CFG_ESTRATIFICACION.REGLA_DISPONIBLE ?
        ('REGLA ' + Utl_texto(CFG_ESTRATIFICACION.VERSION_REGLA)) : 'MANUAL/FUENTE'));
    meta.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
        .setFontSize(9).setForegroundColor('#5B6472');

    // Bloque A — tabla resumen con encabezado sombreado
    body.appendParagraph('Bloque A — Resumen por nivel G').setHeading(
      DocumentApp.ParagraphHeading.HEADING3);
    var filasA = [['CONCEPTO'].concat(tabla.buckets).concat(['TOTAL'])];
    tabla.filas.forEach(function (f) {
      filasA.push([f.etiqueta].concat(tabla.buckets.map(function (b) { return f.valores[b]; }))
                   .concat([f.total]));
    });
    filasA.push(['TOTAL'].concat(tabla.buckets.map(function (b) { return tabla.totalGeneral[b]; }))
                 .concat([tabla.totalGeneral.total]));
    _rem_tablaDoc(body, filasA, true);

    if (c.bloqueA.fechasInvalidas > 0) {
      body.appendParagraph('Eventos con fecha no interpretable (fuera de todo período): ' +
        c.bloqueA.fechasInvalidas).setFontSize(9).setForegroundColor('#D48806');
    }

    // Indicadores por paciente
    body.appendParagraph('Indicadores por paciente (' + indicadores.length +
      ' con actividad en el período)').setHeading(DocumentApp.ParagraphHeading.HEADING3);
    if (indicadores.length) {
      var filasI = [['NOMBRE', 'RUT', 'SECTOR', 'EVENTOS', 'INGRESO', 'CONTROL',
                     'SEGUIM.', 'PLAN', 'GC ING.', 'GC EGR.']];
      indicadores.forEach(function (r) {
        filasI.push([r.nombre, r.rut, r.sector, r.eventos,
          r.ingreso ? 'Sí' : '', r.control ? 'Sí' : '', r.seguimiento ? 'Sí' : '',
          r.planCuidado ? 'Sí' : '', r.gcIngreso ? 'Sí' : '', r.gcEgreso ? 'Sí' : '']);
      });
      _rem_tablaDoc(body, filasI, true);
    } else {
      body.appendParagraph('Sin actividad en el período seleccionado.')
          .setItalic(true).setFontSize(10);
    }

    body.appendParagraph('Bloques B (demografía #14) y C (atenciones #17): no disponibles. ' +
      'Documento generado automáticamente por Sistema ECICEP — datos derivados de EVENTOS (#25).')
      .setFontSize(8).setForegroundColor('#8A93A3');

    doc.saveAndClose();
    var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(nombre);
    var archivo = DriveApp.createFile(pdfBlob);
    DriveApp.getFileById(doc.getId()).setTrashed(true);

    Log_info('REM', 'exportarPdf', nombre + ' · eventos=' + c.enPeriodo.length);
    Log_flush();
    return { ok: true, url: archivo.getUrl(), nombre: nombre };
  } catch (e) {
    Log_error('REM', 'exportarPdf', (nombre || '') + ' → ' + (e && e.message || e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Tabla DocumentApp con encabezado sombreado (marca) y bordes consistentes. */
/** Tabla DocumentApp: SANITIZACIÓN estricta (#11) — matriz de STRINGS rectangular
 *  o no se construye. Celdas sombreadas en encabezado y zebra suave. */
function _rem_tablaDoc(body, filas, conEncabezado) {
  if (!Array.isArray(filas) || !filas.length) return null;
  var limpias = filas
    .filter(function (f) { return Array.isArray(f) && f.length > 0; })
    .map(function (f) {
      return f.map(function (v) { return String(v === null || v === undefined ? '' : v); });
    });
  if (!limpias.length) return null;
  var anchoMax = Math.max.apply(null, limpias.map(function (f) { return f.length; }));
  limpias.forEach(function (f) { while (f.length < anchoMax) f.push(''); });

  var t = body.appendTable(limpias); /* string[][] puro — nunca number[] */
  for (var f = 0; f < t.getNumRows(); f++) {
    for (var col = 0; col < t.getRow(f).getNumCells(); col++) {
      var celda = t.getCell(f, col);
      celda.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      if (conEncabezado && f === 0) {
        celda.setBackgroundColor('#0E5C68')
             .setForegroundColor('#FFFFFF')
             .setFontFamily('Inter').setFontSize(9).setBold(true);
      } else {
        if (f % 2 === 0) celda.setBackgroundColor('#F1F3F6');
        celda.setFontFamily('Inter').setFontSize(9);
      }
    }
  }
  return t;
}

/** Estiliza REM_SALIDA por BLOQUES (sin loops por fila): estilos puntuales
 *  para título/secciones/encabezados/totales/notas + banding nativo sobre los
 *  tramos de datos. Rápido incluso con miles de filas. Idempotente. */
function _rem_estilizarSalida(hoja, filas, tipos) {
  var ancho = filas.reduce(function (mm, f) { return Math.max(mm, f.length); }, 1);
  var alto = filas.length;
  hoja.setFrozenRows(2);
  hoja.setFrozenColumns(1);
  hoja.setColumnWidth(1, 300);
  if (ancho > 1) hoja.getRange(2, 2, Math.max(alto - 1, 1), ancho - 1).setColumnWidth(95);

  hoja.getRange(1, 1, alto, ancho)
      .setFontFamily('Inter').setFontSize(10).setFontColor('#1C2430')
      .setVerticalAlignment('middle')
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  var ESTILOS = {
    titulo:  { bg: null,      fg: '#0E5C68', bold: true,  size: 13 },
    meta:    { fg: '#8A93A3', italic: true, size: 9 },
    seccion: { bg: '#08414A', fg: '#FFFFFF', bold: true, size: 11 },
    cols:    { bg: '#0E5C68', fg: '#FFFFFF', bold: true, size: 9, center: true },
    total:   { bg: '#E5F1F2', bold: true },
    nota:    { fg: '#8A93A3', italic: true, size: 9 }
  };
  for (var i = 0; i < tipos.length; i++) {
    var t = tipos[i];
    if (t === '' || t === 'dato' || t === 'detalle' || t === 'ind') continue;
    var st = ESTILOS[t];
    if (!st) continue;
    var rg = hoja.getRange(i + 1, 1, 1, ancho);
    if (st.bg) rg.setBackground(st.bg);
    if (st.fg) rg.setFontColor(st.fg);
    if (st.bold) rg.setFontWeight('bold');
    if (st.italic) rg.setFontStyle('italic');
    if (st.size) rg.setFontSize(st.size);
    if (st.center) rg.setHorizontalAlignment('center');
  }

  /* Banding nativo sobre tramos contiguos de datos */
  function banda(desde, hasta) {
    if (hasta < desde) return;
    var b = hoja.getRange(desde, 1, hasta - desde + 1, ancho).applyRowBanding();
    b.setFirstRowColor('#FFFFFF').setSecondRowColor('#F1F3F6');
  }
  var iniBloque = 0, tipoBloque = '';
  for (var j = 0; j < tipos.length; j++) {
    var esDato = (tipos[j] === 'detalle' || tipos[j] === 'ind');
    if (esDato && tipoBloque === '') { iniBloque = j + 2; tipoBloque = tipos[j]; }
    else if (!esDato && tipoBloque !== '') { banda(iniBloque, j + 1); tipoBloque = ''; }
  }
  if (tipoBloque !== '') banda(iniBloque, tipos.length);
}
