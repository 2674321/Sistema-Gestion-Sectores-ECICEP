// ===========================================================================
// 👁 HOJAS VISUALES v0.8.9.0 — Secciones reales, Buscador prominente
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
 * Layout objetivo:
 * Fila 1: Barra de sector (color del sector, full width)
 * Fila 2: Buscador (merged A1:D1 aprox)
 * Fila 3: Encabezados reales (congelados)
 * Datos empiezan en fila 4
 * @returns {Object} {filaSector:1, filaBuscador:2, filaEncabezados:3, filasTotales:3, advertencias}
 */
function HVis_calcularPlan(hoja, secciones, mapa) {
  var plan = { 
    secciones: [], 
    filasTotales: 3, 
    advertencias: [], 
    filaSector: 1,
    filaBuscador: 2,
    filaEncabezados: 3
  };
  
  // Validar secciones que tienen columnas reales
  var seccionesValidas = (secciones || []).filter(function (s) {
    return s && HVis_validarSeccion(s, mapa).existentes.length > 0;
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
  
  plan.filasTotales = 3; // Sector(1) + Buscador(2) + Encabezados(3)
  
  return plan;
}

/**
 * GAS: aplica diseño de sector + buscador + encabezados a una hoja (idempotente real).
 * Layout objetivo:
 * Fila 1: Barra de sector (color del sector, ancho completo)
 * Fila 2: Buscador (merged A1:D1 aprox)
 * Fila 3: Encabezados reales (congelados)
 * Datos empiezan en fila 4
 */
function HVis_aplicarSecciones(hoja) {
  if (!hoja) return { ok: false, motivo: 'Hoja no proporcionada' };
  var nombre = hoja.getName();
  var secciones = HVis_obtenerSecciones(nombre);
  if (!secciones) return { ok: true, seccionesAplicadas: 0, mensaje: 'Sin configuración para ' + nombre };

  var ultimaFila = hoja.getLastRow();
  var ultimaCol = hoja.getLastColumn();
  if (ultimaFila < 1 || ultimaCol < 1) return { ok: false, motivo: 'Hoja vacía' };

  // Leer encabezados reales (asumimos fila 1 actual, pero puede variar)
  var filaEncabezadosReal = 1;
  var encabezadosReales = [];
  try {
    encabezadosReales = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  } catch (e) {
    return { ok: false, motivo: 'No se pudieron leer encabezados: ' + e.message };
  }
  var mapa = HVis_mapaColumnas(encabezadosReales);

  // Detectar sector de la hoja
  var sectorHoja = HVis_detectarSectorHoja(nombre);
  var colorSector = HVis_colorPorSector(sectorHoja);

  // Calcular plan (3 filas fijas: sector, buscador, encabezados)
  var plan = HVis_calcularPlan(null, secciones, mapa);
  if (!plan || plan.filasTotales !== 3) {
    return { ok: false, motivo: 'Plan inválido' };
  }

  var advertencias = [];

  // Detectar si ya tiene la estructura correcta (filas 1-3 con formato correcto)
  if (HVis_tieneEstructuraCorrecta(hoja, sectorHoja, mapa)) {
    return { ok: true, seccionesAplicadas: 0, mensaje: 'Estructura ya correcta (idempotente)' };
  }

  // RECONSTRUIR ESTRUCTURA: limpiar filas 1-3 y recrear
  try {
    // Eliminar filas 1-3 si existen (preservar datos desde fila 4 en adelante)
    if (hoja.getLastRow() >= 3) {
      hoja.deleteRows(1, 3);
    }
  } catch (e) {
    advertencias.push('No se pudieron limpiar filas: ' + e.message);
  }

  // Insertar 3 filas nuevas al inicio (empuja datos hacia abajo)
  hoja.insertRowsBefore(1, 3);

  // ===== FILA 1: BARRA DE SECTOR =====
  var rangoSector = hoja.getRange(1, 1, 1, ultimaCol);
  rangoSector.merge();
  rangoSector.setValue(sectorHoja || 'SECTOR');
  rangoSector.setBackground(colorSector);
  rangoSector.setFontColor('#FFFFFF');
  rangoSector.setFontWeight('bold');
  rangoSector.setFontSize(12);
  rangoSector.setHorizontalAlignment('CENTER');
  rangoSector.setVerticalAlignment('MIDDLE');
  rangoSector.setBorder(true, true, true, true, false, false, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_THICK);

  // ===== FILA 2: BUSCADOR =====
  var rangoBuscador = hoja.getRange(2, 1, 1, Math.min(5, ultimaCol)); // A2:E2 aprox
  rangoBuscador.merge();
  rangoBuscador.setValue('🔎 Buscar: RUT / ID / Nombre');
  rangoBuscador.setBackground('#E3F2FD');
  rangoBuscador.setFontColor('#0D47A1');
  rangoBuscador.setFontWeight('bold');
  rangoBuscador.setFontSize(11);
  rangoBuscador.setHorizontalAlignment('LEFT');
  rangoBuscador.setVerticalAlignment('MIDDLE');
  hoja.getRange('A2').setNote('Escriba RUT, ID_INTERNO o nombre y presione Enter.\nEl filtro nativo de Sheets filtrará automáticamente.');

  // ===== FILA 3: ENCABEZADOS REALES =====
  try {
    var rangoEnc = hoja.getRange(3, 1, 1, ultimaCol);
    // Escribir encabezados reales
    rangoEnc.setValues([encabezadosReales]);
    // Estilo
    rangoEnc.setBackground('#ECEFF1');
    rangoEnc.setFontWeight('bold');
    rangoEnc.setFontSize(10);
    rangoEnc.setHorizontalAlignment('CENTER');
    rangoEnc.setVerticalAlignment('MIDDLE');
    rangoEnc.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rangoEnc.setBorder(false, false, true, false, false, false, '#90A4AE', SpreadsheetApp.BorderStyle.SOLID_THICK);
  } catch (e) {
    advertencias.push('No se pudo escribir/estilizar encabezados: ' + e.message);
  }

  // ===== CONGELAR FILAS 1-3 =====
  try { hoja.setFrozenRows(3); } catch (e) { advertencias.push('No se pudo congelar filas: ' + e.message); }
  
  // ===== CONGELAR PRIMERA COLUMNA (ID) =====
  try { hoja.setFrozenColumns(1); } catch (e) {}

  // ===== ACTIVAR FILTRO NATIVO EN ENCABEZADOS (FILA 3) =====
  try {
    var rangoFiltro = hoja.getRange(3, 1, Math.max(1, hoja.getLastRow() - 2), ultimaCol);
    if (!hoja.getFilter()) {
      rangoFiltro.createFilter();
    }
  } catch (e) {
    advertencias.push('No se pudo crear filtro: ' + e.message);
  }

  // ===== QUITAR VALIDACIONES INNECESARIAS DE COLUMNA 1 (ID) =====
  try {
    var col1 = hoja.getRange(4, 1, Math.max(1, hoja.getLastRow() - 3), 1);
    col1.setDataValidation(null);
  } catch (e) {}

  return {
    ok: true,
    seccionesAplicadas: plan.secciones.length,
    filaSector: 1,
    filaBuscador: 2,
    filaEncabezados: 3,
    advertencias: advertencias
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
  if (n === 'EVENTOS') return 'EVENTOS';
  return '';
}

/**
 * PURA: color por sector.
 */
function HVis_colorPorSector(sector) {
  var colores = {
    'AMARILLO': '#C79A00',
    'NARANJO': '#E8730A',
    'VERDE': '#2E7D32',
    'PACIENTES': '#0D47A1',
    'EVENTOS': '#EF6C00'
  };
  return colores[sector] || '#546E7A';
}

/**
 * PURA: verifica si la hoja ya tiene la estructura correcta (idempotencia).
 */
function HVis_tieneEstructuraCorrecta(hoja, sectorHoja, mapa) {
  var ultimaCol = hoja.getLastColumn();
  if (ultimaCol < 1) return false;
  
  try {
    // Verificar fila 1: sector bar
    var v1 = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
    var f1 = hoja.getRange(1, 1, 1, ultimaCol).getBackgrounds()[0];
    var colorEsperado = HVis_colorPorSector(sectorHoja);
    var sectorOk = v1[0] && v1[0].toString().toUpperCase().indexOf(sectorHoja) !== -1;
    var colorOk = f1[0] && f1[0].toUpperCase() === colorEsperado.toUpperCase();
    
    // Verificar fila 2: buscador
    var v2 = hoja.getRange(2, 1, 1, Math.min(5, ultimaCol)).getValues()[0];
    var buscadorOk = v2[0] && v2[0].toString().indexOf('🔎') !== -1;
    
    // Verificar fila 3: encabezados
    var v3 = hoja.getRange(3, 1, 1, ultimaCol).getValues()[0];
    var encabezadosOk = v3.filter(function(x) { return x !== ''; }).length > 3;
    
    // Verificar congeladas
    var congeladasOk = hoja.getFrozenRows() === 3;
    
    return sectorOk && colorOk && buscadorOk && encabezadosOk && congeladasOk;
  } catch (e) {
    return false;
  }
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
 * Verifica estructura actual vs deseada (3 filas: sector, buscador, encabezados).
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
  
  // Verificar estructura actual (3 filas esperadas)
  var estructuraOk = false;
  try {
    estructuraOk = HVis_tieneEstructuraCorrecta(hoja, HVis_detectarSectorHoja(nombreHoja), mapa);
  } catch (e) {}
  
  return { 
    ok: true, 
    hoja: nombreHoja, 
    configurada: true, 
    secciones: detalle, 
    columnasSinSeccion: sinSeccion,
    estructuraCorrecta: estructuraOk,
    filaEncabezadosEsperada: 3
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
// 🔍 BUSCADOR RÁPIDO — integrado en HVis_aplicarSecciones (fila 2 merged)
// ===========================================================================

/**
 * GAS: instala/actualiza buscador (ya incluido en HVis_aplicarSecciones).
 * Se mantiene por compatibilidad pero delega en la función principal.
 */
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
      lineas.push(n + ': ' + d.secciones.length + ' secciones config, estructura=' + (d.estructuraCorrecta ? 'OK' : 'PENDIENTE'));
    } else {
      lineas.push(n + ': ' + (d.motivo || 'sin config'));
    }
  });
  SpreadsheetApp.getUi().alert('Diagnóstico de secciones', lineas.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  return { ok: true, diagnostico: r };
}