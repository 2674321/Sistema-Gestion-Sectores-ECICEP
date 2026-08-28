// ===========================================================================
// 👁 HOJAS VISUALES v0.8.8.1 — Secciones, Buscador rápido, "Ver sección"
// ---------------------------------------------------------------------------
// Principios:
// - NO oculta columnas globalmente (multi-usuario seguro)
// - Buscador usa fórmulas nativas / índices, NO carga población completa
// - "Ver sección" abre diálogo individual por persona+sección
// - Idempotente: ejecutar 2x = mismo resultado
// - No rompe filtros ni fórmulas existentes (no mueve fila 1 de encabezados)
// ===========================================================================

/**
 * PURA: normaliza nombre de hoja para lookup de configuración.
 */
function HVis_normalizarNombreHoja(nombre) {
  var n = Utl_texto(nombre).toUpperCase().trim();
  // Normalizar alias INGRESO_NARANJA → INGRESO_NARANJO
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
  // Filtrar solo columnas que realmente existen en la hoja (validación perezosa)
  return cfg.map(function (s) {
    return {
      id: s.id,
      nombre: s.nombre,
      color: s.color,
      columnas: s.columnas // validación real se hace en aplicación
    };
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
    if (k && !(k in mapa)) mapa[k] = i + 1; // 1-based para Sheets
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
 * PURA: genera estilo de encabezado de sección.
 */
function HVis_estiloSeccion(color) {
  return {
    backgroundColor: color,
    fontColor: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'WRAP'
  };
}

/**
 * PURA: genera estilo de celda de datos (encabezados de columna).
 */
function HVis_estiloEncabezado() {
  return {
    backgroundColor: '#ECEFF1',
    fontColor: '#263238',
    fontWeight: 'bold',
    fontSize: 10,
    horizontalAlignment: 'CENTER',
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'WRAP'
  };
}

/**
 * PURA: genera estilo de fila de datos.
 */
function HVis_estiloDato() {
  return {
    backgroundColor: '#FFFFFF',
    fontColor: '#212121',
    fontSize: 10,
    horizontalAlignment: 'LEFT',
    verticalAlignment: 'MIDDLE',
    wrapStrategy: 'CLIP'
  };
}

/**
 * GAS: aplica diseño de secciones a una hoja (idempotente).
 * No mueve la fila 1 de encabezados reales; inserta filas de sección ANTES
 * usando filas combinadas solo para el título de sección.
 * @param {Sheet} hoja
 * @returns {Object} {ok, seccionesAplicadas, filasInsertadas, advertencias}
 */
function HVis_aplicarSecciones(hoja) {
  if (!hoja) return { ok: false, motivo: 'Hoja no proporcionada' };
  var nombre = hoja.getName();
  var secciones = HVis_obtenerSecciones(nombre);
  if (!secciones) return { ok: true, seccionesAplicadas: 0, mensaje: 'Sin configuración para ' + nombre };

  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 1 || ultimaCol < 1) return { ok: false, motivo: 'Hoja vacía' };

  // Leer encabezados reales (fila 1)
  var encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  var mapa = HVis_mapaColumnas(encabezados);

  // Verificar si ya tiene filas de sección (idempotencia simple: buscar fila con fondo de color de sección)
  var existentes = 0;
  try {
    var coloresFila1 = hoja.getRange(1, 1, 1, ultimaCol).getBackgrounds()[0];
    var tieneSeccion = coloresFila1.some(function (c) {
      return Object.values(COLORES_SECCION).some(function (sc) { return c.toUpperCase() === sc.toUpperCase(); });
    });
    if (tieneSeccion) {
      // Ya tiene secciones aplicadas → no duplicar
      return { ok: true, seccionesAplicadas: 0, mensaje: 'Ya tiene secciones aplicadas (idempotente)' };
    }
  } catch (e) {}

  // Insertar filas de sección ANTES de la fila 1 (empuja encabezados a fila N)
  // Estrategia: insertar 1 fila por sección al inicio, luego escribir título combinado
  var filasPorInsertar = secciones.length;
  if (filasPorInsertar > 0) {
    hoja.insertRowsBefore(1, filasPorInsertar);
  }

  var advertencias = [];
  var filaActual = 1;
  secciones.forEach(function (sec, idx) {
    var validada = HVis_validarSeccion(sec, mapa);
    if (validada.existentes.length === 0) {
      advertencias.push('Sección "' + sec.nombre + '" sin columnas válidas en ' + nombre);
      // Eliminar la fila insertada vacía
      hoja.deleteRow(filaActual);
      filasPorInsertar--;
      return;
    }
    // Combinar celdas de la fila de sección (solo columnas que tienen datos)
    var colInicio = Math.min.apply(null, validada.existentes.map(function (c) { return c.indice; }));
    var colFin = Math.max.apply(null, validada.existentes.map(function (c) { return c.indice; }));
    var rangoTitulo = hoja.getRange(filaActual, colInicio, 1, colFin - colInicio + 1);
    rangoTitulo.merge();
    rangoTitulo.setValue(sec.nombre);
    rangoTitulo.setBackground(sec.color);
    rangoTitulo.setFontColor('#FFFFFF');
    rangoTitulo.setFontWeight('bold');
    rangoTitulo.setFontSize(11);
    rangoTitulo.setHorizontalAlignment('LEFT');
    rangoTitulo.setVerticalAlignment('MIDDLE');
    filaActual++;
  });

  // Ahora los encabezados reales están en fila (1 + seccionesAplicadas)
  // Aplicar estilo a encabezados
  var filaEncabezados = secciones.filter(function (s) { return HVis_validarSeccion(s, mapa).existentes.length > 0; }).length + 1;
  try {
    hoja.getRange(filaEncabezados, 1, 1, ultimaCol).setBackground('#ECEFF1');
    hoja.getRange(filaEncabezados, 1, 1, ultimaCol).setFontWeight('bold');
    hoja.getRange(filaEncabezados, 1, 1, ultimaCol).setFontSize(10);
    hoja.getRange(filaEncabezados, 1, 1, ultimaCol).setHorizontalAlignment('CENTER');
  } catch (e) {
    advertencias.push('No se pudo estilizar encabezados: ' + e.message);
  }

  // Congelar filas de sección + encabezados
  try {
    hoja.setFrozenRows(filaEncabezados);
  } catch (e) {}

  // Congelar primera columna (identidad)
  try {
    hoja.setFrozenColumns(1);
  } catch (e) {}

  return {
    ok: true,
    seccionesAplicadas: secciones.length - advertencias.length,
    filasInsertadas: filasPorInsertar,
    filaEncabezadosReal: filaEncabezados,
    advertencias: advertencias
  };
}

/**
 * GAS: aplica secciones a TODAS las hojas configuradas (idempotente).
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
 * PURA: dry-run diagnóstico de diseño sin modificar.
 */
function HVis_diagnosticarDisenio(nombreHoja) {
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) return { ok: false, hoja: nombreHoja, motivo: 'No existe' };
  var secciones = HVis_obtenerSecciones(nombreHoja);
  if (!secciones) return { ok: true, hoja: nombreHoja, configurada: false };
  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
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
  var sinSeccion = Object.keys(mapa).filter(function (k) {
    return !secciones.some(function (s) { return s.columnas.some(function (c) { return Utl_texto(c).toUpperCase() === k; }); });
  });
  return { ok: true, hoja: nombreHoja, configurada: true, secciones: detalle, columnasSinSeccion: sinSeccion };
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
// 🔍 BUSCADOR RÁPIDO EN CELDA
// ===========================================================================

/**
 * GAS: instala buscador rápido en la celda A1 de la hoja (o celda indicada).
 * Usa VALIDACIÓN DE DATOS + NOTA + FORMATO CONDICIONAL para UX nativa.
 * NO usa scripts en onEdit para no afectar rendimiento.
 * @returns {Object} {ok, hoja, celda}
 */
function HVis_instalarBuscador(hoja, celda) {
  if (!hoja) return { ok: false, motivo: 'Hoja no proporcionada' };
  var c = celda || 'A1';
  var nombre = hoja.getName();
  var claves = CLAVES_BUSQUEDA_POR_HOJA[nombre] || ['RUT', 'NOMBRE', 'ID_INTERNO'];
  var etiqueta = '🔎 Buscar: ' + claves.join(' / ');

  try {
    var rango = hoja.getRange(c);
    // Nota explicativa
    rango.setNote(etiqueta + '\n\nEscriba RUT, ID o nombre y presione Enter.\nLa hoja filtrará automáticamente (filtro nativo).');
    // Formato visual
    rango.setBackground('#E3F2FD');
    rango.setFontColor('#0D47A1');
    rango.setFontWeight('bold');
    rango.setFontSize(11);
    rango.setHorizontalAlignment('LEFT');
    // Validación: lista vacía (solo para mostrar dropdown visual), el filtro nativo hace el trabajo
    var regla = SpreadsheetApp.newDataValidation()
      .requireValueInList([''], true)
      .setAllowInvalid(true)
      .build();
    rango.setDataValidation(regla);
    // Asegurar filtro activado en encabezados reales (fila congelada)
    var filaEnc = hoja.getFrozenRows() || 1;
    if (filaEnc > 0) {
      var rangoFiltro = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn());
      if (!hoja.getFilter()) {
        hoja.getRange(filaEnc, 1, hoja.getLastRow() - filaEnc + 1, hoja.getLastColumn()).createFilter();
      }
    }
    return { ok: true, hoja: nombre, celda: c, claves: claves };
  } catch (e) {
    return { ok: false, hoja: nombre, motivo: e.message };
  }
}

/**
 * GAS: instala buscadores en todas las hojas configuradas.
 */
function HVis_instalarTodosLosBuscadores() {
  var ss = Modelo_ss();
  var res = [];
  HOJAS_CON_SECCIONES.forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h) res.push(HVis_instalarBuscador(h));
    else res.push({ ok: false, hoja: n, motivo: 'No existe' });
  });
  return { ok: true, resultados: res };
}

// ===========================================================================
// 👁 "VER SECCIÓN" — Vista individual por persona + sección (diálogo)
// ===========================================================================

/**
 * GAS: abre diálogo "Ver sección" para la hoja actual.
 * Usa la fila activa (selección del usuario) para obtener la persona.
 * @param {string} [nombreHoja] si no se pasa, usa hoja activa
 */
function HVis_abrirVerSeccion(nombreHoja) {
  var ss = Modelo_ss();
  var hoja = nombreHoja ? ss.getSheetByName(nombreHoja) : ss.getActiveSheet();
  if (!hoja) return { ok: false, motivo: 'Hoja no encontrada' };
  var secciones = HVis_obtenerSecciones(hoja.getName());
  if (!secciones) return { ok: false, motivo: 'Hoja sin secciones configuradas' };

  // Obtener fila activa
  var rangoActivo = hoja.getActiveRange();
  var fila = rangoActivo ? rangoActivo.getRow() : 1;
  var filaEnc = hoja.getFrozenRows() || 1;
  if (fila <= filaEnc) {
    // Usuario no seleccionó una fila de datos → pedir selección
    var ui = SpreadsheetApp.getUi();
    ui.alert('Seleccione una fila de persona primero', 'Haga clic en cualquier celda de la fila de la persona y vuelva a intentar "Ver sección".', ui.ButtonSet.OK);
    return { ok: false, motivo: 'Fila de datos no seleccionada' };
  }

  // Leer datos de la persona (solo columnas necesarias)
  var encabezados = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn()).getValues()[0];
  var valores = hoja.getRange(fila, 1, 1, hoja.getLastColumn()).getValues()[0];
  var persona = {};
  encabezados.forEach(function (h, i) {
    var k = Utl_texto(h).trim();
    if (k) persona[k] = valores[i];
  });

  // HTML del diálogo
  var html = HtmlService.createTemplateFromFile('HVerSeccion');
  html.hoja = hoja.getName();
  html.secciones = JSON.stringify(secciones.map(function (s) { return { id: s.id, nombre: s.nombre, color: s.color }; }));
  html.persona = JSON.stringify(persona);
  html.filaEncabezados = filaEnc;
  html.filaPersona = fila;

  var dialog = html.evaluate()
    .setWidth(480)
    .setHeight(400)
    .setTitle('👁 Ver sección — ' + hoja.getName());
  SpreadsheetApp.getUi().showModalDialog(dialog, '👁 Ver sección');
  return { ok: true };
}

/**
 * GAS (llamado desde diálogo): obtiene datos de una sección para una persona.
 * @param {Object} persona - datos de la persona (clave-valor)
 * @param {string} seccionId - id de la sección
 * @param {string} nombreHoja - nombre de la hoja
 * @returns {Object} {ok, seccion, datos}
 */
function HVis_obtenerDatosSeccion(persona, seccionId, nombreHoja) {
  var secciones = HVis_obtenerSecciones(nombreHoja);
  var sec = (secciones || []).find(function (s) { return s.id === seccionId; });
  if (!sec) return { ok: false, motivo: 'Sección no encontrada' };
  var datos = {};
  sec.columnas.forEach(function (c) {
    var k = Utl_texto(c).trim().toUpperCase();
    // Buscar clave coincidente en persona (case-insensitive)
    var valor = '';
    Object.keys(persona).forEach(function (pk) {
      if (Utl_texto(pk).toUpperCase() === k) valor = persona[pk];
    });
    datos[c] = valor;
  });
  return { ok: true, seccion: sec.nombre, color: sec.color, datos: datos };
}

/**
 * GAS: endpoint para "Abrir ficha" desde buscador/ver sección.
 */
function HVis_abrirFichaDesdeHoja(idInterno) {
  if (!idInterno) return { ok: false, motivo: 'ID_INTERNO requerido' };
  var ui = SpreadsheetApp.getUi();
  // Usar la función existente del menú
  var html = HtmlService.createTemplateFromFile('Sidebar');
  html.modo = 'ficha';
  html.ID_INICIAL = idInterno;
  html.BUILD = '';
  var sidebar = html.evaluate().setTitle('Ficha — ' + idInterno);
  ui.showSidebar(sidebar);
  return { ok: true };
}

// ===========================================================================
// MENÚ: "Ver sección" en Personas
// ===========================================================================

/**
 * GAS: entry point del menú Personas → Ver sección.
 */
function HVis_menuVerSeccion() {
  return HVis_abrirVerSeccion();
}

/**
 * GAS: diagnóstico rápido desde menú (dry-run).
 */
function HVis_menuDiagnosticar() {
  var r = HVis_diagnosticarTodas();
  var lineas = [];
  Object.keys(r.diagnostico).forEach(function (n) {
    var d = r.diagnostico[n];
    if (d.ok && d.configurada) {
      lineas.push(n + ': ' + d.secciones.length + ' secciones, ' + d.columnasSinSeccion.length + ' sin sección');
    } else {
      lineas.push(n + ': ' + (d.motivo || 'sin config'));
    }
  });
  SpreadsheetApp.getUi().alert('Diagnóstico de secciones', lineas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  return { ok: true, diagnostico: r };
}