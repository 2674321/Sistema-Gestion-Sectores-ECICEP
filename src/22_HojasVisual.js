// ===========================================================================
// 👁 HOJAS VISUALES v0.8.9.4 — Layout DEFINITIVO por CONTRATO
// ---------------------------------------------------------------------------
// Principios (ticket: contrato físico de hojas):
// - El layout NO se decide a mano aquí: se toma del CONTRATO (00_Config).
//   VISUAL = {tituloRow:1, seccionesRow:2, encabezosRow:3, datosDesdeRow:4}
//   SIMPLE = {encabezadosRow:1, datosDesdeRow:2}
// - NUNCA se hacen deleteRows/insertRows a ciegas: la migración detecta el
//   estado real, solo inserta/borra filas cuando es verificablemente seguro
//   (filas extra vacías) y ante ambigüedad devuelve ESTRUCTURA_AMBIGUA sin
//   tocar la hoja (la instrucción visual queda pendiente).
// - Se elimina el concepto "fila buscador": la búsqueda real es el Sidebar.
//   La fila 2 muestra las SECCIONES con títulos reales sobre columnas reales.
// - Filas 1..headerRow son INFORMATIVAS coloreadas; los encabezados reales
//   (nombres de columna) viven SIEMPRE en headerRow. Rangos de datos en 4.
// - Idempotente real: aplicar 1 = aplicar 2 = aplicar 3 (no duplica ni
//   desplaza datos). Las hojas de layout simple (EVENTOS, etc.) se respetan.
// ===========================================================================

/**
 * PURA: normaliza nombre de hoja para lookup de configuración.
 */
function HVis_normalizarNombreHoja(nombre) {
  var n = Utl_texto(nombre).toUpperCase().trim();
  if (n === 'INGRESO_NARANJA') return 'INGRESO_NARANJO';
  return n;
}

/**
 * PURA: obtiene configuración de secciones para una hoja.
 * @returns {Array|null} array de secciones o null si la hoja no tiene config.
 */
function HVis_obtenerSecciones(nombreHoja) {
  var clave = HVis_normalizarNombreHoja(nombreHoja);
  var tipo = TIPO_SECCIONES_POR_HOJA[clave];
  if (!tipo) return null;
  var cfg = SECCIONES_HOJAS[tipo];
  if (!cfg) return null;
  return cfg.map(function (s) {
    return { id: s.id, nombre: s.nombre, color: s.color, columnas: s.columnas };
  });
}

/**
 * PURA: verifica si una hoja tiene configuración de secciones.
 */
function HVis_tieneSecciones(nombreHoja) {
  return HVis_obtenerSecciones(nombreHoja) !== null;
}

/**
 * PURA: construye mapa columna → índice (1-based) desde encabezados reales.
 */
function HVis_mapaColumnas(encabezados) {
  var mapa = {};
  (encabezados || []).forEach(function (h, i) {
    var k = Utl_texto(h).trim().toUpperCase();
    if (k && !(k in mapa)) mapa[k] = i + 1;
  });
  return mapa;
}

/**
 * PURA: valida qué columnas de una sección existen realmente.
 */
function HVis_validarSeccion(seccion, mapaColumnas) {
  var existentes = [], faltantes = [];
  (seccion.columnas || []).forEach(function (c) {
    var k = Utl_texto(c).trim().toUpperCase();
    if (mapaColumnas[k]) existentes.push({ nombre: c, indice: mapaColumnas[k] });
    else faltantes.push(c);
  });
  return { existentes: existentes, faltantes: faltantes };
}

/**
 * PURA: columnas esperadas de encabezados para una hoja visual
 * (unión de las columnas declaradas en sus secciones, preservando orden).
 */
function HVis_columnasEsperadas(nombreHoja) {
  var secciones = HVis_obtenerSecciones(nombreHoja);
  var salida = [];
  (secciones || []).forEach(function (s) {
    (s.columnas || []).forEach(function (c) {
      if (salida.indexOf(c) === -1) salida.push(c);
    });
  });
  return salida;
}

/**
 * PURA: proporción (0..1) de columnas esperadas presentes en una fila real,
 * comparando por clave normalizada (acentos/espacios/símbolos).
 */
function HVis_coincidenciaEncabezados(fila, esperadas) {
  if (!esperadas || !esperadas.length) return 0;
  var set = {};
  (fila || []).forEach(function (h) {
    var k = Utl_claveAlnum(h);
    if (k) set[k] = true;
  });
  var halladas = 0;
  esperadas.forEach(function (e) { if (set[Utl_claveAlnum(e)]) halladas++; });
  return halladas / esperadas.length;
}

/**
 * GAS: localiza la fila física de los encabezados REALES (primeras 8 filas).
 * @returns {Object} {fila, coincidencia, encabezados}
 */
function HVis_buscarFilaEncabezados(hoja, esperadas) {
  if (!hoja || !esperadas || !esperadas.length) {
    return { fila: 0, coincidencia: 0, encabezados: [] };
  }
  var cuantas = Math.min(hoja.getLastRow(), 8);
  if (cuantas < 1) return { fila: 0, coincidencia: 0, encabezados: [] };
  var ancho = Math.max(hoja.getLastColumn() || 0, 1);
  var bloque = hoja.getRange(1, 1, cuantas, ancho).getValues();
  var mejor = { fila: 0, coincidencia: 0, encabezados: [] };
  for (var i = 0; i < cuantas; i++) {
    var c = HVis_coincidenciaEncabezados(bloque[i], esperadas);
    if (c > mejor.coincidencia) {
      mejor = { fila: i + 1, coincidencia: c, encabezados: bloque[i] };
    }
  }
  return mejor;
}

/**
 * PURA/GAS: detecta hoja vacía (sin valores en absoluto).
 */
function HVis_hojaVacia(hoja) {
  try {
    return hoja.getLastRow() < 1;
  } catch (e) { return false; }
}

/**
 * GAS: ¿el bloque de filas [desde .. desde+cuantas) está completamente vacío?
 */
function HVis_rangoVacio(hoja, desde, cuantas) {
  try {
    if (cuantas < 1) return true;
    var ancho = Math.max(hoja.getLastColumn() || 0, 1);
    var vals = hoja.getRange(desde, 1, cuantas, ancho).getValues();
    for (var i = 0; i < vals.length; i++) {
      for (var j = 0; j < vals[i].length; j++) {
        if (!Utl_vacio(vals[i][j])) return false;
      }
    }
    return true;
  } catch (e) { return false; }
}

/**
 * GAS: calcula el plan de aplicación para una hoja (sin modificar nada).
 * PURA cuando se invoca sin hoja real (pruebas node).
 * @returns {Object} plan con secciones válidas y filas del contrato.
 */
function HVis_calcularPlan(nombreHoja, secciones, mapa) {
  var visual = Modelo_esHojaVisual(nombreHoja);
  var layout = visual ? CONTRATO_LAYOUT_VISUAL : CONTRATO_LAYOUT_SIMPLE;
  var plan = {
    secciones: [],
    filasTotales: layout.encabezadosRow,
    advertencias: [],
    tituloRow: layout.tituloRow,
    seccionesRow: layout.seccionesRow,
    filaSector: layout.tituloRow,
    filaEncabezados: layout.encabezadosRow,
    datosDesdeRow: layout.datosDesdeRow,
    esVisual: visual
  };
  var seccionesValidas = (secciones || []).filter(function (s) {
    return s && mapa && HVis_validarSeccion(s, mapa).existentes.length > 0;
  });
  plan.secciones = seccionesValidas.map(function (sec) {
    var validada = HVis_validarSeccion(sec, mapa);
    var colInicio = Math.min.apply(null, validada.existentes.map(function (c) { return c.indice; }));
    var colFin = Math.max.apply(null, validada.existentes.map(function (c) { return c.indice; }));
    return {
      id: sec.id,
      nombre: sec.nombre,
      color: sec.color,
      colInicio: colInicio,
      colFin: colFin
    };
  });
  return plan;
}

/**
 * PURA: estado macro del layout actual según el contrato (sin modificar).
 * @returns {String} 'VACIA' | 'OK' | 'MIGRABLE_ABRIR' | 'MIGRABLE_CIERRE' | 'AMBIGUA' | 'NO_VISUAL'
 */
function HVis_estadoEstructura(nombreHoja, encabezados, filaEnc, hoja) {
  if (!Modelo_esHojaVisual(nombreHoja)) return 'NO_VISUAL';
  var hr = Modelo_headerRow(nombreHoja);
  if (!filaEnc) return HVis_hojaVacia(hoja) ? 'VACIA' : 'AMBIGUA';
  if (filaEnc === hr) return 'OK';
  if (filaEnc < hr) {
    var superioresVacias = HVis_rangoVacio(hoja, 1, filaEnc - 1);
    return superioresVacias ? 'MIGRABLE_ABRIR' : 'AMBIGUA';
  }
  var intersticioVacias = HVis_rangoVacio(hoja, hr, filaEnc - hr);
  return intersticioVacias ? 'MIGRABLE_CIERRE' : 'AMBIGUA';
}

/**
 * GAS: ¿las filas sobre los encabezados (1..headerRow-1) se pueden sobrescribir
 * con título/secciones? Solo si están vacías o son de un layout previo nuestro
 * (barra de sector, buscador heredado, o secciones ya aplicadas).
 */
function HVis_filasSuperioresEscribibles(hoja, ultimaCol, sectorHoja) {
  var hr = Modelo_headerRow(hoja.getName());
  if (hr <= 1) return true;
  if (HVis_hojaVacia(hoja)) return true;
  var marcadores = ['SEGUIMIENTO', 'CONTROLES', 'IDENTIDAD', 'CLINICO', 'CL&#205;NICO',
    'CRC', 'DATOS PERSONALES', 'IDENTIFICACION', 'SECTORIZACION', 'INGRESO',
    'EVENTO', 'AUDITORIA', 'TECNICO', 'OBSERVACIONES'].map(function (x) { return Utl_claveAlnum(x); });
  var sector = Utl_claveAlnum(sectorHoja || '');
  for (var r = 1; r < hr; r++) {
    var ancho = Math.max(hoja.getLastColumn() || 0, 1);
    var vals = hoja.getRange(r, 1, 1, ancho).getValues()[0];
    var noVacios = vals.filter(function (x) { return !Utl_vacio(x); });
    if (!noVacios.length) continue;
    var texto = Utl_claveAlnum(noVacios.join(' '));
    var esPropio = marcadores.some(function (m) { return texto.indexOf(m) !== -1; })
      || (sector && texto.indexOf(sector) !== -1);
    if (!esPropio) return false;
  }
  return true;
}

/**
 * GAS: normalización idempotente del layout de una hoja VISUAL.
 * 1) Localiza los encabezados reales (primeras 8 filas).
 * 2) Decide migración segura e inserta/borra filas SOLO cuando es verificable.
 * 3) Reinstala fila 1 (título) y fila 2 (secciones) — idempotente.
 * 4) Normaliza etiquetas de encabezados a sus nombres canónicos.
 * Devuelve {pre, post, advertencias}. NUNCA toca datos.
 */
function HVis_normalizarLayout(hoja) {
  var nombre = hoja.getName();
  var secciones = HVis_obtenerSecciones(nombre);
  var ultimaCol = Math.max(hoja.getLastColumn() || 0, 1);
  var advertencias = [];
  var salida = { ok: true, pre: '', post: '', secciones: 0, insertadas: 0, borradas: 0 };
  if (!secciones) return { ok: true, secciones: 0, pre: 'sin_config', post: 'sin_config' };
  if (!Modelo_esHojaVisual(nombre)) {
    return { ok: true, secciones: 0, pre: 'NO_VISUAL', post: 'NO_VISUAL', motivo: 'layout simple' };
  }

  var hr = Modelo_headerRow(nombre);
  var esperadas = HVis_columnasEsperadas(nombre);
  var buscado = HVis_buscarFilaEncabezados(hoja, esperadas);
  var filaEnc = buscado.fila;
  var estado = HVis_estadoEstructura(nombre, buscado.encabezados, filaEnc, hoja);
  salida.pre = estado;

  // --- Migración segura (sin delete/insert a ciegas) ---
  if (estado === 'VACIA' || estado === 'AMBIGUA') {
    // Modelo_crearEstructura crea el andamiaje en hojas vacías; en ambigua
    // NO tocamos nada: la fila de encabezados está desplazada con datos
    // que no permite inferir cabida → instrucción visual pendiente.
    salida.post = estado;
  } else if (estado === 'MIGRABLE_ABRIR') {
    // Encabezados por encima del objetivo y filas superiores verificablemente
    // vacías → insertar (hr - filaEnc) filas al inicio; los encabezados caen
    // exactamente en hr y los datos se desplazan juntos sin perder nada.
    var aInsertar = hr - filaEnc;
    hoja.insertRowsBefore(1, aInsertar);
    salida.insertadas = aInsertar;
    salida.post = 'OK';
  } else if (estado === 'MIGRABLE_CIERRE') {
    // Encabezados por debajo del objetivo y el intersticio verificado vacío
    // → eliminar SOLO esas filas vacías (riesgo nulo sobre datos).
    hoja.deleteRows(hr, filaEnc - hr);
    salida.borradas = filaEnc - hr;
    salida.post = 'OK';
  } else if (estado === 'OK') {
    salida.post = 'OK';
  }

  if (salida.post !== 'OK') {
    salida.advertencias = advertencias;
    salida.secciones = 0;
    salida.filaEncabezados = filaEnc;
    salida.estado = salida.post;
    return salida;
  }

  var sectorHoja = HVis_detectarSectorHoja(nombre);
  var colorSector = HVis_colorPorSector(sectorHoja);

  // --- Solo sobrescribimos filas superiores si es seguro ---
  var escribibles = HVis_filasSuperioresEscribibles(hoja, ultimaCol, sectorHoja);
  if (!escribibles) {
    advertencias.push('Filas superiores con datos propios no reconocidos: no se tocaron.');
  }

  // ===== FILA 1: TÍTULO (barra de sector, full width) =====
  try {
    var rTitulo = hoja.getRange(1, 1, 1, ultimaCol);
    try { rTitulo.breakApart(); } catch (eB) {}
    rTitulo.merge();
    rTitulo.setValue(sectorHoja ? 'SECTOR ' + sectorHoja : 'SISTEMA ECICEP');
    rTitulo.setBackground(colorSector);
    rTitulo.setFontColor(TINTA_SECCION);
    rTitulo.setFontWeight('bold');
    rTitulo.setFontSize(PULIDO_BARRAS.titulo);
    rTitulo.setHorizontalAlignment('CENTER');
    rTitulo.setVerticalAlignment('MIDDLE');
    rTitulo.setBorder(true, true, true, true, false, false, '#D8DEE4', SpreadsheetApp.BorderStyle.SOLID_THICK);
    hoja.setRowHeight(1, 28);
  } catch (eT) { advertencias.push('Fila título: ' + (eT && eT.message || eT)); }

  // ===== FILA 2: SECCIONES (títulos reales sobre columnas reales) =====
  var seccionesAplicadas = 0;
  try {
    var hrActual = Modelo_headerRow(nombre);
    var encReales = hoja.getRange(hrActual, 1, 1, ultimaCol).getValues()[0];
    var mapa = HVis_mapaColumnas(encReales);
    var plan = HVis_calcularPlan(nombre, secciones, mapa);
    // Limpiar residuos de secciones previas en la fila de secciones
    try {
      var rSec = hoja.getRange(plan.seccionesRow, 1, 1, ultimaCol);
      rSec.breakApart();
      rSec.clear();
      rSec.setBackground('#F4F6F8');
    } catch (eC) {}
    var familia = HVis_familiaHoja(nombre);
    var secuencias = PALETA_SECCION[familia] || null;
    plan.secciones.forEach(function (sec) {
      var rng = hoja.getRange(plan.seccionesRow, sec.colInicio, 1, sec.colFin - sec.colInicio + 1);
      try { rng.breakApart(); } catch (eB) {}
      rng.merge();
      rng.setValue(sec.nombre);
      rng.setBackground(secuencias ? secuencias[plan.secciones.indexOf(sec)] : sec.color);
      rng.setFontColor(TINTA_SECCION);
      rng.setFontWeight('bold');
      rng.setFontSize(PULIDO_BARRAS.seccion);
      rng.setHorizontalAlignment('CENTER');
      rng.setVerticalAlignment('MIDDLE');
      rng.setBorder(false, false, true, false, false, false, '#C9D2DA', SpreadsheetApp.BorderStyle.SOLID_THICK);
      seccionesAplicadas++;
    });
    hoja.setRowHeight(plan.seccionesRow, 26);
  } catch (eS) { advertencias.push('Filas de secciones: ' + (eS && eS.message || eS)); }

  // ===== ENCABEZADOS REALES: normalizar etiquetas a canónicas =====
  try {
    var hrEnc = Modelo_headerRow(nombre);
    var filaEncActual = hoja.getRange(hrEnc, 1, 1, ultimaCol).getValues()[0];
    var mapaE = HVis_mapaColumnas(filaEncActual);
    var correcciones = 0;
    esperadas.forEach(function (c) {
      var idx = mapaE[Utl_texto(c).toUpperCase()];
      if (!idx) return;
      var actual = Utl_texto(filaEncActual[idx - 1]);
      if (Utils_similarEtiqueta(c, actual)) return;
      hoja.getRange(hrEnc, idx).setValue(c);
      correcciones++;
    });
    var filasDatos = Math.max(hoja.getLastRow() - hrEnc, 1);
    var rngEnc = hoja.getRange(hrEnc, 1, 1, ultimaCol);
    rngEnc.setFontWeight(PULIDO_ENCABEZADO.peso).setFontSize(PULIDO_ENCABEZADO.fuente)
      .setHorizontalAlignment('CENTER').setVerticalAlignment('MIDDLE')
      .setBackground('#0E5C68').setFontColor('#FFFFFF')
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    hoja.setRowHeight(hrEnc, PULIDO_ENCABEZADO.alturaVisual);
    if (correcciones) advertencias.push('Etiquetas de encabezados normalizadas: ' + correcciones);
  } catch (eEnc) { advertencias.push('Encabezados: ' + (eEnc && eEnc.message || eEnc)); }

  // ===== CONGELAR filas de encabezados y primera columna =====
  try { hoja.setFrozenRows(Modelo_headerRow(nombre)); } catch (eF1) { advertencias.push('FrozenRows: ' + (eF1 && eF1.message || eF1)); }
  try { hoja.setFrozenColumns(1); } catch (eF2) {}

  salida.secciones = seccionesAplicadas;
  salida.advertencias = advertencias;
  salida.filaEncabezados = Modelo_headerRow(nombre);
  salida.estado = salida.post;
  return salida;
}

/**
 * PURA: ¿dos etiquetas se consideran "la misma" (coincidencia clave + capitalización)?
 */
function Utils_similarEtiqueta(canonica, actual) {
  return Utl_claveAlnum(canonica) === Utl_claveAlnum(actual);
}

/**
 * GAS: aplica el diseño visual a UNA hoja (idempotente real).
 */
function HVis_aplicarSecciones(hoja) {
  if (!hoja) return { ok: false, motivo: 'Hoja no proporcionada' };
  var nombre = hoja.getName();
  var secciones = HVis_obtenerSecciones(nombre);
  if (!secciones) return { ok: true, seccionesAplicadas: 0, motivo: 'Sin configuración para ' + nombre };

  var r = HVis_normalizarLayout(hoja);
  if (r.pre === 'NO_VISUAL') {
    return { ok: true, hoja: nombre, seccionesAplicadas: 0, motivo: 'layout simple (no aplica)' };
  }
  return {
    ok: r.post === 'OK',
    hoja: nombre,
    seccionesAplicadas: r.secciones,
    estado: r.pre + ' → ' + r.post,
    estructura: r.post,
    filaEncabezados: r.filaEncabezados || Modelo_headerRow(nombre),
    insertadas: r.insertadas,
    borradas: r.borradas,
    advertencias: r.motivo ? [r.motivo] : r.advertencias
  };
}

/**
 * PURA: detecta sector de la hoja por nombre.
 */
function HVis_detectarSectorHoja(nombre) {
  var n = (nombre || '').toUpperCase();
  if (n.indexOf('AMARILLO') !== -1) return 'AMARILLO';
  if (n.indexOf('NARANJO') !== -1) return 'NARANJO';
  if (n.indexOf('VERDE') !== -1) return 'VERDE';
  if (n === 'PACIENTES') return 'PACIENTES';
  return '';
}

/**
 * PURA: familia de color de una hoja según su sector (v0.8.9.5).
 * AMARILLO, NARANJO o VERDE para las hojas SECTOR e INGRESO del sector;
 * cadena vacía si la hoja no pertenece a ningún sector.
 */
function HVis_familiaHoja(nombre) {
  var n = Utl_texto(nombre);
  if (n.indexOf('AMARILLO') !== -1) return 'AMARILLO';
  if (n.indexOf('NARANJ') !== -1) return 'NARANJO';
  if (n.indexOf('VERDE') !== -1) return 'VERDE';
  return '';
}

/**
 * PURA: color por sector (tono MEDIO de la familia — fila 1).
 */
function HVis_colorPorSector(sector) {
  return COLORES_SECTOR[sector] || COLORES_SECTOR.DEFECTO;
}

/**
 * GAS: aplica secciones a TODAS las hojas configuradas (idempotente real).
 */
/**
 * GAS: aplica el formato visual completo (título, secciones, encabezados y
 * anchos) a las hojas de INGRESO. Idempotente. Fix v0.8.9.5: los encabezados
 * quedaban en blanco cuando la hoja se creaba fuera del instalador.
 */
function HVis_formatearIngresos() {
  var ss = Modelo_ss();
  var estados = {};
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (hoja && hoja.getLastRow() >= Modelo_headerRow(nombre)) {
      var r = HVis_aplicarSecciones(hoja);
      estados[nombre] = r.estado || 'OK';
    }
  });
  Log_info('HojasVisual', 'formatearIngresos', JSON.stringify(estados));
  Log_flush();
  return estados;
}

/**
 * GAS: aplica el sistema visual a todas las hojas con secciones.
 */
function HVis_aplicarTodasLasSecciones() {
  var ss = Modelo_ss();
  var resultados = [];
  HOJAS_CON_SECCIONES.forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (hoja) {
      var r = HVis_aplicarSecciones(hoja);
      r.hoja = nombre;
      resultados.push(r);
    } else {
      resultados.push({ hoja: nombre, ok: false, motivo: 'Hoja no existe' });
    }
  });
  Log_info('HojasVisual', 'aplicarTodas', JSON.stringify(resultados));
  Log_flush();
  return { ok: true, resultados: resultados };
}

/**
 * GAS: diagnóstico de diseño SIN modificar, alineado al contrato.
 */
function HVis_diagnosticarDisenio(nombreHoja) {
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) return { ok: false, hoja: nombreHoja, motivo: 'No existe' };
  var secciones = HVis_obtenerSecciones(nombreHoja);
  if (!secciones) return { ok: true, hoja: nombreHoja, configurada: false };

  var visual = Modelo_esHojaVisual(nombreHoja);
  var layout = visual ? CONTRATO_LAYOUT_VISUAL : CONTRATO_LAYOUT_SIMPLE;
  var esperadas = HVis_columnasEsperadas(nombreHoja);
  var buscado = HVis_buscarFilaEncabezados(hoja, esperadas);
  var filaEnc = buscado.fila;
  var estructura = HVis_estadoEstructura(nombreHoja, buscado.encabezados, filaEnc, hoja);

  var encabezados = buscado.fila ? buscado.encabezados
    : hoja.getRange(layout.encabezadosRow, 1, 1, Math.max(hoja.getLastColumn() || 0, 1)).getValues()[0];
  var mapa = HVis_mapaColumnas(encabezados);

  var detalle = secciones.map(function (s) {
    var v = HVis_validarSeccion(s, mapa);
    return {
      seccion: s.nombre,
      color: s.color,
      columnasConfig: s.columnas.length,
      columnasExistentes: v.existentes.length,
      columnasFaltantes: v.faltantes,
      existentes: v.existentes.map(function (c) { return c.nombre; })
    };
  });

  var columnasReales = Object.keys(mapa);
  var seccionesDetectadas = detalle.filter(function (d) { return d.columnasExistentes > 0; }).length;
  var sinSeccion = columnasReales.filter(function (k) {
    return !secciones.some(function (s) {
      return s.columnas.some(function (c) { return Utl_claveAlnum(c) === Utl_claveAlnum(k); });
    });
  });

  return {
    ok: true,
    hoja: nombreHoja,
    configurada: true,
    layout: {
      tipo: visual ? 'visual' : 'simple',
      tituloRow: layout.tituloRow,
      seccionesRow: layout.seccionesRow,
      encabezadosRow: layout.encabezadosRow,
      datosDesdeRow: layout.datosDesdeRow
    },
    secciones: detalle,
    columnasSinSeccion: sinSeccion,
    estadoActual: {
      estructura: estructura,
      seccionesEsperadas: secciones.length,
      seccionesDetectadas: seccionesDetectadas,
      filaEncabezadosReal: filaEnc,
      filaEncabezadosEsperada: layout.encabezadosRow,
      filasSuperioresEscribibles: HVis_filasSuperioresEscribibles(hoja, Math.max(hoja.getLastColumn() || 0, 1), HVis_detectarSectorHoja(nombreHoja))
    }
  };
}

/**
 * GAS: diagnóstico de todas las hojas configuradas.
 */
function HVis_diagnosticarTodas() {
  var ss = Modelo_ss();
  var res = {};
  HOJAS_CON_SECCIONES.forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h) res[n] = HVis_diagnosticarDisenio(n);
    else res[n] = { ok: false, motivo: 'No existe' };
  });
  return { ok: true, diagnostico: res };
}

// ===========================================================================
// 🔍 BUSCADOR RÁPIDO — ahora SOLO vía Sidebar (no fila de hoja).
// Se mantienen por compatibilidad de API; delegan en la aplicación de layout.
// ===========================================================================
function HVis_instalarBuscador(hoja, celda) {
  return HVis_aplicarSecciones(hoja);
}

function HVis_instalarTodosLosBuscadores() {
  return HVis_aplicarTodasLasSecciones();
}

// ===========================================================================
// MENÚ: Diagnóstico de secciones (dry-run)
// ===========================================================================
function HVis_menuDiagnosticar() {
  var r = HVis_diagnosticarTodas();
  var lineas = [];
  Object.keys(r.diagnostico).forEach(function (n) {
    var d = r.diagnostico[n];
    if (d.ok && d.configurada) {
      var est = (d.estadoActual || {}).estructura;
      lineas.push(n + ': ' + d.secciones.length + ' secciones config · estructura=' +
        (est === 'OK' ? 'OK' : (est === 'NO_VISUAL' ? 'simple (no aplica)' : est)));
    } else {
      lineas.push(n + ': ' + (d.motivo || 'sin config'));
    }
  });
  SpreadsheetApp.getUi().alert('Diagnóstico de secciones', lineas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  return { ok: true, diagnostico: r };
}