// ===========================================================================
// 👁 HOJAS VISUALES v0.8.8.3 — Secciones reales, Buscador prominente
// ---------------------------------------------------------------------------
// Principios:
// - Secciones con título visible + merged cells sobre columnas reales
// - Buscador prominente en área superior (no solo A1)
// - NO oculta columnas globalmente (multi-usuario seguro)
// - Buscador usa filtros nativos, NO carga población
// - Idempotente real: detecta estado actual vs deseado y aplica solo diff
// - No rompe filtros ni fórmulas; encabezados reales permanecen identificables
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
 * PURA: calcula el plan de aplicación para una hoja (sin modificar).
 * @returns {Object} {secciones: [{nombre, color, colInicio, colFin, filaBuscador, filaSeccion, filaEncabezados}], filasTotales, advertencias}
 */
function HVis_calcularPlan(hoja, secciones, mapa) {
  var plan = { secciones: [], filasTotales: 0, advertencias: [], filaBuscador: 1 };
  var filaActual = 1;
  
  // Fila 1: Buscador (siempre)
  plan.filaBuscador = 1;
  filaActual = 2;
  
  // Filas de sección (una por sección con columnas válidas)
  var seccionesValidas = secciones.filter(function (s) {
    return HVis_validarSeccion(s, mapa).existentes.length > 0;
  });
  
  seccionesValidas.forEach(function (sec, idx) {
    var validada = HVis_validarSeccion(sec, mapa);
    var colInicio = Math.min.apply(null, validada.existentes.map(function (c) { return c.indice; }));
    var colFin = Math.max.apply(null, validada.existentes.map(function (c) { return c.indice; }));
    plan.secciones.push({
      id: sec.id,
      nombre: sec.nombre,
      color: sec.color,
      colInicio: colInicio,
      colFin: colFin,
      filaSeccion: filaActual,
      filaEncabezados: filaActual + 1 + idx // se ajusta después
    });
    filaActual++;
  });
  
  // La fila de encabezados reales queda después de buscador + secciones
  plan.filaEncabezadosReales = 1 + 1 + seccionesValidas.length; // buscador + secciones + 1 (base 1)
  plan.filasTotales = plan.filaEncabezadosReales;
  
  // Actualizar filaEncabezados en cada sección
  plan.secciones.forEach(function (s, idx) {
    s.filaEncabezados = plan.filaEncabezadosReales;
  });
  
  return plan;
}

/**
 * PURA: detecta estado actual de la hoja (para idempotencia real).
 */
function HVis_detectarEstadoActual(hoja, secciones, mapa) {
  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 1 || ultimaCol < 1) return { tieneEstructura: false };
  
  // Leer primeras filas para detectar estructura
  var maxFilasLeer = Math.min(10, ultimaFila);
  var valores = hoja.getRange(1, 1, maxFilasLeer, ultimaCol).getValues();
  var fondos = hoja.getRange(1, 1, maxFilasLeer, ultimaCol).getBackgrounds();
  
  // Buscar fila de buscador (fila 1 debería tener formato de buscador)
  var tieneBuscador = false;
  try {
    var notaA1 = hoja.getRange('A1').getNote() || '';
    tieneBuscador = notaA1.indexOf('🔎') !== -1 || notaA1.indexOf('Buscar') !== -1;
  } catch (e) {}
  
  // Detectar filas de sección (filas con color de sección y texto)
  var seccionesDetectadas = 0;
  var filaEncabezadosDetectada = -1;
  
  for (var f = 0; f < maxFilasLeer; f++) {
    var filaValores = valores[f];
    var filaFondos = fondos[f];
    var tieneColorSeccion = filaFondos.some(function (c) {
      return Object.values(COLORES_SECCION).some(function (sc) { 
        return c && c.toUpperCase() === sc.toUpperCase(); 
      });
    });
    var tieneTextoSeccion = filaValores.some(function (v) {
      var t = Utl_texto(v).toUpperCase();
      return SECCIONES_HOJAS && Object.values(SECCIONES_HOJAS).some(function(arr) {
        return arr.some(function(s) { return t.indexOf(Utl_texto(s.nombre).toUpperCase()) !== -1; });
      });
    });
    
    if (tieneColorSeccion && tieneTextoSeccion) {
      seccionesDetectadas++;
    }
    // Detectar fila de encabezados (fila con muchos valores no vacíos, fondo gris claro)
    if (filaEncabezadosDetectada === -1 && !tieneColorSeccion) {
      var noVacios = filaValores.filter(function(v) { return Utl_texto(v) !== ''; }).length;
      if (noVacios > 3) { // heurística: fila de encabezados tiene muchas celdas con texto
        filaEncabezadosDetectada = f + 1; // 1-based
      }
    }
  }
  
  return {
    tieneEstructura: true,
    tieneBuscador: tieneBuscador,
    seccionesDetectadas: seccionesDetectadas,
    filaEncabezadosDetectada: filaEncabezadosDetectada,
    seccionesEsperadas: secciones.filter(function(s) { return HVis_validarSeccion(s, mapa).existentes.length > 0; }).length
  };
}

/**
 * GAS: aplica diseño de secciones + buscador a una hoja (idempotente real).
 * Calcula plan → detecta estado actual → aplica solo diferencias.
 */
function HVis_aplicarSecciones(hoja) {
  if (!hoja) return { ok: false, motivo: 'Hoja no proporcionada' };
  var nombre = hoja.getName();
  var secciones = HVis_obtenerSecciones(nombre);
  if (!secciones) return { ok: true, seccionesAplicadas: 0, mensaje: 'Sin configuración para ' + nombre };

  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 1 || ultimaCol < 1) return { ok: false, motivo: 'Hoja vacía' };

  // Leer encabezados reales (asumimos que están en la fila detectada o fila 1 si no hay estructura)
  var estadoActual = HVis_detectarEstadoActual(hoja, secciones, null);
  var encabezadosReales = [];
  var filaEncabezadosReal = estadoActual.filaEncabezadosDetectada > 0 ? estadoActual.filaEncabezadosDetectada : 1;
  
  // Si ya tiene estructura completa y correcta → no tocar
  if (estadoActual.tieneEstructura && 
      estadoActual.tieneBuscador && 
      estadoActual.seccionesDetectadas === estadoActual.seccionesEsperadas &&
      estadoActual.filaEncabezadosDetectada === estadoActual.seccionesEsperadas + 2) { // buscador + secciones + 1
    return { ok: true, seccionesAplicadas: 0, mensaje: 'Estructura ya correcta (idempotente)' };
  }

  // Leer encabezados desde la fila real
  try {
    encabezadosReales = hoja.getRange(filaEncabezadosReal, 1, 1, ultimaCol).getValues()[0];
  } catch (e) {
    // Fallback: leer fila 1
    encabezadosReales = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
    filaEncabezadosReal = 1;
  }
  var mapa = HVis_mapaColumnas(encabezadosReales);

  // Calcular plan deseado
  var plan = HVis_calcularPlan(hoja, secciones, mapa);
  if (plan.secciones.length === 0) {
    return { ok: true, seccionesAplicadas: 0, mensaje: 'Sin secciones válidas' };
  }

  var advertencias = [];
  var filasAInsertar = plan.filasTotales - filaEncabezadosReal;
  
  // Si la estructura actual no coincide, reconstruir desde cero
  // Para idempotencia real: si ya hay filas de sección/buscador pero mal ubicadas, limpiar e insertar
  var necesitaReconstruir = !estadoActual.tieneEstructura || 
                           !estadoActual.tieneBuscador || 
                           estadoActual.seccionesDetectadas !== plan.secciones.length ||
                           filaEncabezadosReal !== plan.filaEncabezadosReales;

  if (necesitaReconstruir) {
    // Eliminar filas superiores existentes (buscador + secciones antiguas) si las hay
    var filasALimpiar = filaEncabezadosReal - 1;
    if (filasALimpiar > 0) {
      try { hoja.deleteRows(1, filasALimpiar); } catch (e) { advertencias.push('No se pudieron limpiar filas antiguas: ' + e.message); }
    }
    // Insertar filas nuevas (buscador + secciones)
    hoja.insertRowsBefore(1, plan.filasTotales - 1); // -1 porque fila 1 ya existe
    filaEncabezadosReal = plan.filaEncabezadosReales;
  }

  // 1. CREAR BUSCADOR en fila 1 (merged A1:D1 o similar según columnas)
  var rangoBuscador = hoja.getRange(1, 1, 1, Math.min(4, ultimaCol));
  rangoBuscador.merge();
  rangoBuscador.setValue('🔎 Buscar persona (RUT / ID / Nombre)');
  rangoBuscador.setBackground('#E3F2FD');
  rangoBuscador.setFontColor('#0D47A1');
  rangoBuscador.setFontWeight('bold');
  rangoBuscador.setFontSize(12);
  rangoBuscador.setHorizontalAlignment('LEFT');
  rangoBuscador.setVerticalAlignment('MIDDLE');
  // Nota con instrucciones
  hoja.getRange('A1').setNote('Escriba RUT, ID_INTERNO o nombre y presione Enter.\nEl filtro nativo de Sheets aplicará la búsqueda automáticamente.');

  // 2. CREAR FILAS DE SECCIÓN (una por sección válida)
  var seccionesValidas = plan.secciones;
  seccionesValidas.forEach(function (sec, idx) {
    var filaSec = 2 + idx; // fila 2 en adelante (fila 1 = buscador)
    var rangoTitulo = hoja.getRange(filaSec, sec.colInicio, 1, sec.colFin - sec.colInicio + 1);
    rangoTitulo.merge();
    rangoTitulo.setValue(sec.nombre);
    rangoTitulo.setBackground(sec.color);
    rangoTitulo.setFontColor('#FFFFFF');
    rangoTitulo.setFontWeight('bold');
    rangoTitulo.setFontSize(11);
    rangoTitulo.setHorizontalAlignment('LEFT');
    rangoTitulo.setVerticalAlignment('MIDDLE');
    // Bordes para separar visualmente
    rangoTitulo.setBorder(true, true, true, true, false, false, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_THICK);
  });

  // 3. ESTILIZAR ENCABEZADOS REALES (fila plan.filaEncabezadosReales)
  try {
    var rangoEnc = hoja.getRange(plan.filaEncabezadosReales, 1, 1, ultimaCol);
    rangoEnc.setBackground('#ECEFF1');
    rangoEnc.setFontWeight('bold');
    rangoEnc.setFontSize(10);
    rangoEnc.setHorizontalAlignment('CENTER');
    rangoEnc.setVerticalAlignment('MIDDLE');
    rangoEnc.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    // Borde inferior grueso para separar de datos
    rangoEnc.setBorder(false, false, true, false, false, false, '#90A4AE', SpreadsheetApp.BorderStyle.SOLID_THICK);
  } catch (e) {
    advertencias.push('No se pudo estilizar encabezados: ' + e.message);
  }

  // 4. CONGELAR: filas de buscador + secciones + encabezados
  try {
    hoja.setFrozenRows(plan.filaEncabezadosReales);
  } catch (e) {}
  try {
    hoja.setFrozenColumns(1);
  } catch (e) {}

  // 5. ACTIVAR FILTRO NATIVO en encabezados reales
  try {
    var rangoFiltro = hoja.getRange(plan.filaEncabezadosReales, 1, Math.max(1, hoja.getLastRow() - plan.filaEncabezadosReales + 1), ultimaCol);
    if (!hoja.getFilter()) {
      rangoFiltro.createFilter();
    }
  } catch (e) {
    advertencias.push('No se pudo crear filtro: ' + e.message);
  }

  return {
    ok: true,
    seccionesAplicadas: seccionesValidas.length,
    filaBuscador: 1,
    filaEncabezados: plan.filaEncabezadosReales,
    advertencias: advertencias
  };
}

/**
 * GAS: aplica secciones a TODAS las hojas configuradas.
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
 * PURA: diagnóstico de diseño sin modificar.
 */
function HVis_diagnosticarDisenio(nombreHoja) {
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) return { ok: false, hoja: nombreHoja, motivo: 'No existe' };
  var secciones = HVis_obtenerSecciones(nombreHoja);
  if (!secciones) return { ok: true, hoja: nombreHoja, configurada: false };
  
  var filaEnc = 1;
  try {
    var estado = HVis_detectarEstadoActual(hoja, secciones, null);
    filaEnc = estado.filaEncabezadosDetectada > 0 ? estado.filaEncabezadosDetectada : 1;
  } catch (e) { filaEnc = 1; }
  
  var encabezados = hoja.getRange(filaEnc, 1, 1, hoja.getLastColumn()).getValues()[0];
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
  
  var estado = HVis_detectarEstadoActual(hoja, secciones, mapa);
  
  return { 
    ok: true, 
    hoja: nombreHoja, 
    configurada: true, 
    secciones: detalle, 
    columnasSinSeccion: sinSeccion,
    estadoActual: estado,
    filaEncabezadosActual: filaEnc
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
// 🔍 BUSCADOR RÁPIDO — integrado en HVis_aplicarSecciones (fila 1 merged)
// ===========================================================================

/**
 * GAS: instala/actualiza buscador (ya incluido en HVis_aplicarSecciones).
 * Se mantiene por compatibilidad pero delega en la función principal.
 */
function HVis_instalarBuscador(hoja, celda) {
  // El buscador ahora es parte integral de HVis_aplicarSecciones
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
      var est = d.estadoActual || {};
      lineas.push(n + ': ' + d.secciones.length + ' secciones config, ' + 
        (est.seccionesDetectadas || 0) + ' detectadas, ' +
        'encabezados en fila ' + (d.filaEncabezadosActual || '?'));
    } else {
      lineas.push(n + ': ' + (d.motivo || 'sin config'));
    }
  });
  SpreadsheetApp.getUi().alert('Diagnóstico de secciones', lineas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  return { ok: true, diagnostico: r };
}