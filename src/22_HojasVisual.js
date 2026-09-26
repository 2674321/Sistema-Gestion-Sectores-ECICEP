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
  var ancho = Math.max(hoja.getLastColumn() || 0, 1);
  var bloque = hoja.getRange(1, 1, hr - 1, ancho).getValues();
  for (var r = 0; r < bloque.length; r++) {
    var noVacios = bloque[r].filter(function (x) { return !Utl_vacio(x); });
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
/**
 * PURA: título contractual de la barra superior de una hoja visual.
 * El escritor y el fast-path deben consumir esta misma función; si cada uno
 * deriva el texto por separado, una portada correcta puede parecer desfasada y
 * provocar la reescritura completa del layout en cada instalación.
 */
function HVis_tituloEsperado_(nombre) {
  nombre = Utl_texto(nombre).toUpperCase();
  var sector = HVis_detectarSectorHoja(nombre);
  if (nombre.indexOf('INGRESO_') === 0) {
    return 'INGRESOS — ' + sector + ' · v' + ECICEP.VERSION + ' · ← INICIO';
  }
  if (nombre.indexOf('SECTOR_') === 0) {
    return 'SECTOR ' + sector + ' · VISTA AUTOMÁTICA · datos derivados';
  }
  return 'SISTEMA ECICEP';
}

/**
 * GAS: ¿la hoja ya tiene el DESIGN_SYSTEM visual aplicado? Chequeo barato
 * (3 lecturas: título, fila de secciones, encabezados) para que el pipeline no
 * reescriba estilos en CADA envío de la Web App (re-estilizar todas las
 * INGRESO_* por submit era gran parte de los ~15s de latencia). Ante cualquier
 * anomalía devuelve false → se ejecuta el formateo completo como antes.
 */
function HVis_yaFormateada(hoja) {
  try {
    var nombre = hoja.getName();
    var esperado = HVis_tituloEsperado_(nombre);
    var hr = Modelo_headerRow(nombre);
    if (hr < 1) return false;
    // LECTURA ÚNICA del bloque completo 1..hr (antes 3 lecturas separadas:
    // título, fila de secciones y encabezados) → 1 RPC en vez de 3+.
    var ancho = Math.max(hoja.getLastColumn() || 0, 1);
    var bloque = hoja.getRange(1, 1, hr, ancho).getValues();
    if (bloque[0] == null || bloque[1] == null) return false;
    if (Utl_claveAlnum(Utl_texto(bloque[0][0])) !== Utl_claveAlnum(esperado)) return false;
    // SAS-025: todas las secciones DECLARADAS deben estar pintadas en la fila de
    // secciones. Una vista migrada 15→16 (MIG-001) que pinta solo 3 de 4
    // secciones (la columna OBSERVACIONES quedó sin etiqueta) devuelve false →
    // se fuerza el formateo real. No hay RPC extra: los datos ya están en bloque.
    var hdr = bloque[hr - 1];
    var secciones = HVis_obtenerSecciones(nombre) || [];
    var plan = HVis_calcularPlan(nombre, secciones, HVis_mapaColumnas(hdr));
    if (plan.secciones.length !== secciones.length) return false;
    for (var i = 0; i < plan.secciones.length; i++) {
      var sec = plan.secciones[i];
      var actual = bloque[1][sec.colInicio - 1];
      if (Utl_claveAlnum(actual) !== Utl_claveAlnum(sec.nombre)) return false;
    }
    var esp = HVis_especVisual(nombre);
    if (typeof hoja.getFrozenRows === 'function' && hoja.getFrozenRows() !== esp.frozenRows) return false;
    if (typeof hoja.getFrozenColumns === 'function' && hoja.getFrozenColumns() !== esp.frozenColumns) return false;
    var titulo = hoja.getRange(1, 1);
    if (typeof titulo.getBackground === 'function' &&
        !HVis_mismosColor(titulo.getBackground(), esp.colorTitulo)) return false;
    if (typeof titulo.getFontColor === 'function' &&
        !HVis_mismosColor(titulo.getFontColor(), esp.tintaTitulo)) return false;
    var enc = hoja.getRange(hr, 1, 1, ancho);
    if (typeof enc.getBackgrounds === 'function' && !enc.getBackgrounds()[0]
      .every(function (b) { return HVis_mismosColor(b, esp.encabezados.fondo); })) return false;
    return true;
  } catch (e) { return false; }
}

function HVis_normalizarLayout(hoja, opciones) {
  opciones = opciones || {};
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
    // Modelo_crearEstructura_ crea el andamiaje en hojas vacías; en ambigua
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
    // Fast-path rendimiento: hoja ya con DESIGN_SYSTEM aplicado → no reescribir
    // título/secciones/encabezados (el pipeline formatea en cada envío; de aquí
    // venían gran parte de los ~15s por submit). `forzar:true` (Instalar/reparar)
    // salta el fast-path para que una hoja con secciones incompletas se repare.
    if (!opciones.forzar && HVis_yaFormateada(hoja)) {
      salida.secciones = secciones.length;
      salida.advertencias = advertencias;
      salida.filaEncabezados = hr;
      salida.estado = 'OK';
      salida.fast = true;
      return salida;
    }
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

  // ===== FILA 1: TÍTULO (barra de identidad, full width) =====
  if (escribibles) {
  try {
    // v0.8.9.6: color = RAMPA de la familia del sector (identidad vibrante);
    // tinta única TINTA_SECCION (≥4.5:1 sobre todas las rampas), altura
    // estandarizada y borde de DESIGN_SYSTEM (Parte 4/Rampa).
    var rTitulo = hoja.getRange(1, 1, 1, ultimaCol);
    try { rTitulo.breakApart(); } catch (eB) {}
    rTitulo.merge();
    rTitulo.setValue(HVis_tituloEsperado_(nombre));
    rTitulo.setBackground(colorSector);
    rTitulo.setFontColor(TINTA_SECCION);
    rTitulo.setFontWeight('bold');
    rTitulo.setFontSize(PULIDO_BARRAS.titulo);
    rTitulo.setHorizontalAlignment(DESIGN_SYSTEM.CENTRO);
    rTitulo.setVerticalAlignment(DESIGN_SYSTEM.MEDIO);
    rTitulo.setBorder(true, true, true, true, false, false,
      DESIGN_SYSTEM.BORDES.titulo, SpreadsheetApp.BorderStyle.SOLID_THICK);
    hoja.setRowHeight(1, DESIGN_SYSTEM.ALTURAS.barra);
  } catch (eT) { advertencias.push('Fila título: ' + (eT && eT.message || eT)); }

  // ===== FILA 2: SECCIONES (títulos reales sobre columnas reales) =====
  var seccionesAplicadas = 0;
  try {
    var hrActual = Modelo_headerRow(nombre);
    // Reutiliza la fila ya leída por HVis_buscarFilaEncabezados (en estado OK
    // su fila física es hr): evita re-leer la misma fila para el mapa de
    // columnas (antes 1 getValues adicional por hoja).
    var encReales = (buscado.encabezados && buscado.encabezados.length === ultimaCol)
      ? buscado.encabezados
      : hoja.getRange(hrActual, 1, 1, ultimaCol).getValues()[0];
    var mapa = HVis_mapaColumnas(encReales);
    var plan = HVis_calcularPlan(nombre, secciones, mapa);
    // Limpiar residuos de secciones previas en la fila de secciones
    try {
      var rSec = hoja.getRange(plan.seccionesRow, 1, 1, ultimaCol);
      rSec.breakApart();
      rSec.clear();
      rSec.setBackground(DESIGN_SYSTEM.SUPERFICIE.residuo);
    } catch (eC) {}
    // v0.8.9.6: rampa interna de la familia (barra/sección/encabezado) → cada
    // hoja de sector queda monocromática en su identidad; PACIENTES usa la
    // paleta COLORES_SECCION (familia GENERAL). Mismas propiedades estructurales.
    var familia = HVis_familiaHoja(nombre);
    var rampa = PALETA_SECCION[familia] || null;
    // BATCH (rendimiento): valores y estilos de TODAS las secciones se aplican
    // sobre la fila completa en una llamada por propiedad (setValues +
    // matrices de estilo). Solo los merges quedan individuales: Range.merge
    // no tiene variante batch en la API clásica.
    var filaSecciones = [];
    var bgs = [], tinta = [], pesos = [], tams = [], hAligns = [], vAligns = [];
    var bTop = [], bBtm = [], bLft = [], bRgt = [], bVer = [], bHor = [];
    var cBordes = [], eBordes = [];
    for (var j = 0; j < ultimaCol; j++) {
      filaSecciones.push('');
      bgs.push(DESIGN_SYSTEM.SUPERFICIE.residuo);
      tinta.push(TINTA_SECCION);
      pesos.push('bold');
      tams.push(PULIDO_BARRAS.seccion);
      hAligns.push(DESIGN_SYSTEM.CENTRO);
      vAligns.push(DESIGN_SYSTEM.MEDIO);
      bTop.push(false); bBtm.push(false); bLft.push(false); bRgt.push(false);
      bVer.push(false); bHor.push(false);
      cBordes.push(DESIGN_SYSTEM.BORDES.seccion);
      eBordes.push(SpreadsheetApp.BorderStyle.SOLID_THICK);
    }
    plan.secciones.forEach(function (sec, ix) {
      var color = rampa ? rampa.seccion[ix % rampa.seccion.length] : sec.color;
      for (var c = sec.colInicio; c <= sec.colFin; c++) {
        if (c === sec.colInicio) filaSecciones[c - 1] = sec.nombre;
        bgs[c - 1] = color;
        bBtm[c - 1] = true;
      }
    });
    var rFilaSec = hoja.getRange(plan.seccionesRow, 1, 1, ultimaCol);
    rFilaSec.setValues([filaSecciones]);
    rFilaSec.setBackgrounds([bgs]);
    rFilaSec.setFontColors([tinta]);
    rFilaSec.setFontWeights([pesos]);
    rFilaSec.setFontSizes([tams]);
    rFilaSec.setHorizontalAlignments([hAligns]);
    rFilaSec.setVerticalAlignments([vAligns]);
    rFilaSec.setBorders([bTop], [bBtm], [bLft], [bRgt], [bVer], [bHor],
      [cBordes], [eBordes]);
    plan.secciones.forEach(function (sec) {
      hoja.getRange(plan.seccionesRow, sec.colInicio, 1, sec.colFin - sec.colInicio + 1).merge();
      seccionesAplicadas++;
    });
    hoja.setRowHeight(plan.seccionesRow, DESIGN_SYSTEM.ALTURAS.seccion);
  } catch (eS) { advertencias.push('Filas de secciones: ' + (eS && eS.message || eS)); }

  // ===== ENCABEZADOS REALES: normalizar etiquetas a canónicas =====
  try {
    var hrEnc = Modelo_headerRow(nombre);
    // Misma fila ya leída (buscado.encabezados): evita re-leerla para corregir
    // etiquetas (antes 1 getValues adicional por hoja).
    var filaEncActual = (buscado.encabezados && buscado.encabezados.length === ultimaCol)
      ? buscado.encabezados
      : hoja.getRange(hrEnc, 1, 1, ultimaCol).getValues()[0];
    var mapaE = HVis_mapaColumnas(filaEncActual);
    // BATCH: corregir etiquetas en memoria y escribir TODO en un solo
    // setValues de la fila (antes un setValue por etiqueta a corregir).
    var filaCorregida = filaEncActual.slice();
    var correcciones = 0;
    esperadas.forEach(function (c) {
      var idx = mapaE[Utl_texto(c).toUpperCase()];
      if (!idx) return;
      var actual = Utl_texto(filaEncActual[idx - 1]);
      if (Utils_similarEtiqueta(c, actual)) return;
      filaCorregida[idx - 1] = c;
      correcciones++;
    });
    if (correcciones) hoja.getRange(hrEnc, 1, 1, ultimaCol).setValues([filaCorregida]);
    var rngEnc = hoja.getRange(hrEnc, 1, 1, ultimaCol);
    // v0.8.9.6: encabezados UNIFORMES (Parte 6) — una sola especificación
    // PULIDO_ENCABEZADO consumida por 22_HojasVisual y 06_Modelo por igual.
    rngEnc.setFontWeight(PULIDO_ENCABEZADO.peso).setFontSize(PULIDO_ENCABEZADO.fuente)
      .setHorizontalAlignment(DESIGN_SYSTEM.ENCABEZADOS.horizontal)
      .setVerticalAlignment(DESIGN_SYSTEM.ENCABEZADOS.vertical)
      .setBackground(PULIDO_ENCABEZADO.fondo).setFontColor(PULIDO_ENCABEZADO.tinta)
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    hoja.setRowHeight(hrEnc, PULIDO_ENCABEZADO.alturaVisual);
    if (correcciones) advertencias.push('Etiquetas de encabezados normalizadas: ' + correcciones);
  } catch (eEnc) { advertencias.push('Encabezados: ' + (eEnc && eEnc.message || eEnc)); }

  // ===== CONGELAR filas de encabezados y primera columna =====
  try { hoja.setFrozenRows(Modelo_headerRow(nombre)); } catch (eF1) { advertencias.push('FrozenRows: ' + (eF1 && eF1.message || eF1)); }
  // La fila 1 está combinada a lo ancho; congelar una parte de esa celda
  // provoca el error de Google Sheets "parte de una celda combinada".
  try { hoja.setFrozenColumns(0); } catch (eF2) {}
  }

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
function HVis_aplicarSecciones(hoja, opciones) {
  if (!hoja) return { ok: false, motivo: 'Hoja no proporcionada' };
  var nombre = hoja.getName();
  var secciones = HVis_obtenerSecciones(nombre);
  if (!secciones) return { ok: true, seccionesAplicadas: 0, motivo: 'Sin configuración para ' + nombre };

  var r = HVis_normalizarLayout(hoja, opciones);
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
 * PURA: identidad de diseño de una hoja (v0.8.9.6, DESIGN_SYSTEM).
 * Devuelve la CLAVE de RAMPA/COLORES_SECTOR que aplica: AMARILLO, NARANJO o
 * VERDE para las hojas del sector; EVENTOS usa GENERAL (identidad neutra) —
 * el legado que la asociaba a NARANJO fue corregido para evitar herencia
 * de colores sectoriales; el resto (PACIENTES, INICIO, hojas técnicas) es
 * GENERAL (azul de sistema).
 */
function HVis_identidad(nombre) {
  var familia = HVis_familiaHoja(nombre);
  if (familia) return familia;
  var n = Utl_texto(nombre).toUpperCase();
  if (n.indexOf('EVENTOS') !== -1) return 'GENERAL';
  return 'GENERAL';
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
  var _tF = Date.now();
  var ss = Modelo_ss();
  var estados = {}, fallidas = [];
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    var _tHojaF = Date.now();
    var hoja = ss.getSheetByName(nombre);
    if (hoja && hoja.getLastRow() >= Modelo_headerRow(nombre)) {
      var r = HVis_aplicarSecciones(hoja);
      estados[nombre] = r.estado || 'OK';
      if (r.ok === false) fallidas.push(nombre + ': ' + (r.motivo || r.estado || 'formato incompleto'));
      console.log('[PIPE] formatearIngresos ' + nombre + ': ' + (Date.now() - _tHojaF) + 'ms estado=' + estados[nombre] + ' fast=' + (r.fast ? 'si' : 'no'));;
    }
  });
  console.log('[PIPE] formatearIngresos total: ' + (Date.now() - _tF) + 'ms');
  estados._fallidas = fallidas;
  Log_info('HojasVisual', 'formatearIngresos', JSON.stringify(estados));
  Log_flush();
  return estados;
}

/**
 * @deprecated v0.14 — compatibilidad. La reparación global de secciones vive
 * en el motor único (subtareas formato:* → Presentacion_formatearHoja_ →
 * HVis_reconciliarHoja). Para retoques puntuales usar HVis_aplicarSecciones
 * (una hoja) o HVis_formatearIngresos (puertas INGRESO_*).
 * GAS: aplica el sistema visual a todas las hojas con secciones.
 */
function HVis_aplicarTodasLasSecciones(opciones) {
  var ss = Modelo_ss();
  var resultados = [];
  HOJAS_CON_SECCIONES.forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (hoja) {
      var r = HVis_aplicarSecciones(hoja, opciones);
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
      filasSuperioresEscribibles: HVis_filasSuperioresEscribibles(hoja, Math.max(hoja.getLastColumn() || 0, 1), HVis_detectarSectorHoja(nombreHoja)),
      // v0.8.9.6: CAMBIOS PENDIENTES frente al DESIGN_SYSTEM (solo lectura).
      visual: HVis_pendientesVisual(hoja)
    }
  };
}

/**
 * PURA: especificación visual que el DESIGN_SYSTEM exige para una hoja
 * (Parte 20). No lee la hoja: declara el ESTADO DESEADO (título por
 * identidad, secciones por rampa/paleta, fila de encabezados estándar).
 */
function HVis_especVisual(nombre) {
  var familia = HVis_familiaHoja(nombre);
  var identidad = HVis_identidad(nombre);
  var det = HVis_detectarSectorHoja(nombre);
  var secciones = HVis_obtenerSecciones(nombre) || [];
  var colorTitulo = HVis_colorPorSector(det);
  var colorSecciones;
  if (familia) {
    // Hoja de sector → rampa interna de su familia (monocromática).
    colorSecciones = secciones.map(function (s, i) {
      return PALETA_SECCION[familia].seccion[i % PALETA_SECCION[familia].seccion.length];
    });
  } else {
    // PACIENTES → paleta semántica general; resto sin secciones.
    colorSecciones = secciones.map(function (s) { return s.color; });
  }
  return {
    hoja: nombre,
    identidad: identidad,
    familia: familia,
    visual: Modelo_esHojaVisual(nombre),
    colorTitulo: colorTitulo,
    tintaTitulo: TINTA_SECCION,
    colorSecciones: colorSecciones,
    tabColor: typeof Hojas_colorPestana_ === 'function' ? Hojas_colorPestana_(nombre) : colorTitulo,
    frozenRows: HOJAS_UX[nombre] && HOJAS_UX[nombre].frozenRows !== undefined
      ? HOJAS_UX[nombre].frozenRows : Modelo_headerRow(nombre),
    frozenColumns: HOJAS_UX[nombre] && HOJAS_UX[nombre].frozenColumns !== undefined
      ? HOJAS_UX[nombre].frozenColumns : 0,
    encabezados: {
      fila: Modelo_headerRow(nombre),
      fondo: PULIDO_ENCABEZADO.fondo,
      tinta: PULIDO_ENCABEZADO.tinta,
      peso: PULIDO_ENCABEZADO.peso,
      tamanio: PULIDO_ENCABEZADO.fuente,
      altura: Modelo_esHojaVisual(nombre)
        ? PULIDO_ENCABEZADO.alturaVisual
        : PULIDO_ENCABEZADO.alturaSimple
    }
  };
}

/**
 * GAS: devuelve los CAMBIOS PENDIENTES del diseño de una hoja frente a la
 * especificación (Parte 20). NO modifica la hoja. Ej.: CAMBIOS PENDIENTES = 0
 * cuando el diseño ya cumple el DESIGN_SYSTEM (idempotencia verificable).
 */
function HVis_pendientesVisual(hoja) {
  if (!hoja) return { hoja: '', pendientes: ['Hoja inexistente'] };
  var nombre = hoja.getName();
  var pendientes = [];
  var esp = HVis_especVisual(nombre);
  try {
    var lastC = Math.max(hoja.getLastColumn() || 0, 1);
    var hrA = Modelo_headerRow(nombre);
    var rEnc = hoja.getRange(hrA, 1, 1, lastC);
    if (esp.visual) {
      if (hoja.getLastRow() >= 1) {
        var r1 = hoja.getRange(1, 1);
        if (!HVis_mismosColor(r1.getBackground(), esp.colorTitulo))
          pendientes.push('fila1 color=' + r1.getBackground() + ' → ' + esp.colorTitulo);
        if (!HVis_mismosColor(r1.getFontColor(), esp.tintaTitulo))
          pendientes.push('fila1 tinta=' + r1.getFontColor() + ' → ' + esp.tintaTitulo);
        if (r1.getFontSize() !== PULIDO_BARRAS.titulo)
          pendientes.push('fila1 tamaño=' + r1.getFontSize() + ' → ' + PULIDO_BARRAS.titulo);
        if (hoja.getRowHeight(1) !== DESIGN_SYSTEM.ALTURAS.barra)
          pendientes.push('fila1 altura=' + hoja.getRowHeight(1));
      }
      // fila 2: secciones (solo si los encabezados están en su fila contractual)
      if (hoja.getLastRow() >= 2 && !HVis_hojaVacia(hoja)) {
        var plan = HVis_calcularPlan(nombre, esp.colorSecciones ? HVis_obtenerSecciones(nombre) : [], HVis_mapaColumnas(rEnc.getValues()[0]));
        if (plan) {
          var bgSecc = hoja.getRange(plan.seccionesRow, 1, 1, lastC).getBackgrounds()[0];
          esp.colorSecciones.forEach(function (esperado, i) {
            var sec = plan.secciones[i];
            if (!sec) return;
            // SAS-025: validar TODO el intervalo colInicio..colFin (antes solo la
            // primera columna). De lo contrario, CONTROLES 12..15 con la 12
            // correcta pero la 15 sin color pasaba como si estuviera formateada.
            var malas = [];
            for (var col = sec.colInicio; col <= sec.colFin; col++) {
              if (col < 1 || col > lastC) continue;
              if (!HVis_mismosColor(bgSecc[col - 1], esperado)) malas.push(col);
            }
            if (malas.length)
              pendientes.push('sección ' + sec.id + ' cols ' + malas.join(',') + ' color→' + esperado);
          });
        }
      }
      if (hoja.getRowHeight(plan && plan.seccionesRow || 2) !== DESIGN_SYSTEM.ALTURAS.seccion)
        pendientes.push('fila secciones altura=' + hoja.getRowHeight((plan && plan.seccionesRow) || 2));
    }
    if (hoja.getLastRow() >= hrA) {
      var bgs = rEnc.getBackgrounds()[0];
      var okEnc = bgs.every(function (b) { return HVis_mismosColor(b, esp.encabezados.fondo); });
      if (!okEnc) pendientes.push('encabezados fondo≠' + esp.encabezados.fondo);
      var fcs = rEnc.getFontColors()[0];
      var okTinta = fcs.every(function (c) { return HVis_mismosColor(c, esp.encabezados.tinta); });
      if (!okTinta) pendientes.push('encabezados tinta≠' + esp.encabezados.tinta);
      var okBold = rEnc.getFontWeights()[0].every(function (w) { return w !== 'normal'; });
      if (!okBold) pendientes.push('encabezados peso≠bold');
      var okSize = rEnc.getFontSizes()[0].every(function (s) { return s === esp.encabezados.tamanio; });
      if (!okSize) pendientes.push('encabezados tamaño≠' + esp.encabezados.tamanio);
      if (hoja.getRowHeight(hrA) !== esp.encabezados.altura)
        pendientes.push('encabezados altura=' + hoja.getRowHeight(hrA) + ' → ' + esp.encabezados.altura);
    }
    if (typeof hoja.getTabColor === 'function' &&
        !HVis_mismosColor(hoja.getTabColor(), esp.tabColor)) pendientes.push('TAB_COLOR');
    if (typeof hoja.getFrozenRows === 'function' && hoja.getFrozenRows() !== esp.frozenRows)
      pendientes.push('FREEZE_ROWS');
    if (typeof hoja.getFrozenColumns === 'function' && hoja.getFrozenColumns() !== esp.frozenColumns)
      pendientes.push('FREEZE_COLUMNS');
    if (typeof hoja.getColumnWidth === 'function' && hoja.getLastRow() >= hrA) {
      var etiquetas = rEnc.getValues()[0];
      etiquetas.forEach(function (et, i) {
        if (!Utl_texto(et)) return;
        var ancho = Modelo_anchoColumna(et);
        if (hoja.getColumnWidth(i + 1) !== ancho) pendientes.push('ANCHO:' + Utl_texto(et));
      });
      var iniDatos = Modelo_dataStartRow(nombre);
      etiquetas.forEach(function (et, i) {
        var campo = Utl_texto(et).toUpperCase(), celda = hoja.getRange(iniDatos, i + 1);
        if (typeof celda.getNumberFormat === 'function') {
          var esperado = Formato_especificacionCampo_(campo).formato;
          if (esperado && celda.getNumberFormat() !== esperado) pendientes.push('FORMATO:' + campo);
        }
        if (Hojas_validacionCampo_(campo) &&
            typeof celda.getDataValidation === 'function' && !celda.getDataValidation())
          pendientes.push('VALIDACION:' + campo);
        if ((campo === 'ESTADO_INGRESO' || campo === 'PROXIMO_CONTROL') &&
            typeof hoja.getRange(hrA, i + 1).getNote === 'function' && !hoja.getRange(hrA, i + 1).getNote())
          pendientes.push('NOTA:' + campo);
      });
      if (nombre === HOJAS.PACIENTES && typeof hoja.isColumnHiddenByUser === 'function') {
        ['ID_INTERNO','NOMBRE_NORMALIZADO','RUT_DV_VALIDO','RUT_SIN_DV','FUENTE','FECHA_ACTUALIZACION']
          .forEach(function (campo) {
            var colT = Hojas_columnaCampo_(nombre, campo);
            if (colT > 0 && !hoja.isColumnHiddenByUser(colT)) pendientes.push('OCULTA:' + campo);
          });
      }
    }
  } catch (eD) {
    pendientes.push('no inspeccionable: ' + (eD && eD.message || eD));
  }
  return { hoja: nombre, identidad: esp.identidad, visual: esp.visual,
           pendientes: pendientes, cantidadPendientes: pendientes.length };
}

/**
 * GAS: RECONCILIACIÓN VISUAL (Parte 17) — ESTADO ACTUAL → DESEADO (especi)
 * → APLICAR (aplicarSecciones) → VERIFICAR (pendientesVisual).
 * Devuelve CAMBIOS PENDIENTES tras aplicar; 0 = hoja alineada al DESIGN_SYSTEM.
 */
/** PURA: firma estable de pendientes para detectar no-convergencia (v0.14.2
 *  §10): normaliza cada pending a su raíz (sin valores) y ordena, de modo que
 *  el mismo drift produce siempre la misma firma. Sin PII (solo propiedades). */
function HVis_firmaPendientes_(pendientes) {
  return (pendientes || []).map(function (p) {
    var t = Utl_texto(p).split('[')[0].split('.')[0].replace(/\s*[=→:].*$/, '').trim();
    return t || 'otra';
  }).sort().join('|');
}

function HVis_reconciliarHoja(hoja, opciones) {
  if (!hoja) return { hoja: '', ok: false, motivo: 'Hoja inexistente' };
  // HVis es owner exclusivo de la estructura superior; formatos, anchos,
  // validaciones y pestañas pertenecen a sus fases declarativas.
  opciones = opciones || { layout: true };
  var nombre = hoja.getName();
  if (!HVis_obtenerSecciones(nombre)) {
    return { hoja: nombre, ok: true, sinConfig: true, pendientes: 0 };
  }
  var esp = HVis_especVisual(nombre);
  var antes = HVis_pendientesVisual(hoja);
  var firmaAntes = HVis_firmaPendientes_(antes.pendientes);
  var requiereLayout = opciones.layout !== false && (antes.pendientes || []).some(function (p) {
    return p.indexOf('fila') === 0 || p.indexOf('sección') === 0 || p.indexOf('encabezados') === 0;
  });
  var aplicado = requiereLayout ? HVis_aplicarSecciones(hoja) : { estado: 'OK', secciones: 0 };
  // v0.14.3: aplicarSecciones devuelve estado COMPUESTO 'pre → post' (más
  // 'OK' plano en fast-path); compararlo con 'OK' fallaba SIEMPRE que había
  // reparación real (ej. motivo 'OK → OK'). La señal de fallo es `ok`.
  if (aplicado.ok === false) {
    return { hoja: nombre, ok: false, motivo: aplicado.motivo || aplicado.estado };
  }
  // v0.14.2 §1-2: FREEZE_ROWS/FREEZE_COLUMNS también se REPARAN aquí (antes
  // solo se detectaban en la verificación → loop detectar-sin-converger).
  // Solo si difieren del contrato (fast-path 0 setters); respeta la fuente
  // canónica (frozenColumns 0 en visuales con barra fusionada: jamás se
  // introduce un freeze mayor aquí).
  var freezeReparado = [];
  try {
    if (typeof hoja.getFrozenRows === 'function' && typeof hoja.setFrozenRows === 'function' &&
        hoja.getFrozenRows() !== esp.frozenRows) {
      hoja.setFrozenRows(esp.frozenRows); freezeReparado.push('FREEZE_ROWS');
    }
    if (typeof hoja.getFrozenColumns === 'function' && typeof hoja.setFrozenColumns === 'function' &&
        hoja.getFrozenColumns() !== esp.frozenColumns) {
      hoja.setFrozenColumns(esp.frozenColumns); freezeReparado.push('FREEZE_COLUMNS');
    }
  } catch (eF) {
    return { hoja: nombre, ok: false, codigo: 'PRESENTACION_FREEZE_BLOQUEADO',
      propiedad: 'FREEZE', motivo: nombre + ' · FREEZE no reparable: ' + (eF && eF.message || eF) };
  }
  var verificado = HVis_pendientesVisual(hoja);
  var pendientesLayout = (verificado.pendientes || []).filter(function (p) {
    return p.indexOf('fila') === 0 || p.indexOf('sección') === 0 ||
      p.indexOf('encabezados') === 0 || p.indexOf('FREEZE_') === 0;
  });
  if (pendientesLayout.length === 0) {
    return { hoja: nombre, ok: true, pendientes: 0,
      seccionesAplicadas: aplicado.secciones, freezeReparado: freezeReparado };
  }
  var firmaDespues = HVis_firmaPendientes_(pendientesLayout);
  var primer = pendientesLayout[0] || '';
  var raiz = primer.replace(/\s*[=→:].*$/, '').trim() || 'otra';
  var detalle = nombre + ' · ' + raiz +
    (raiz.indexOf('FREEZE_ROWS') === 0 && typeof hoja.getFrozenRows === 'function'
      ? ' actual=' + hoja.getFrozenRows() + ' esperado=' + esp.frozenRows :
     raiz.indexOf('FREEZE_COLUMNS') === 0 && typeof hoja.getFrozenColumns === 'function'
      ? ' actual=' + hoja.getFrozenColumns() + ' esperado=' + esp.frozenColumns : '') +
    (pendientesLayout.length > 1 ? ' (+' + (pendientesLayout.length - 1) + ' más)' : '');
  if ((requiereLayout || freezeReparado.length) && firmaDespues === firmaAntes)
    return { hoja: nombre, ok: false, codigo: 'PRESENTACION_SIN_CONVERGENCIA',
      propiedad: raiz, motivo: 'La reparación no modificó el drift detectado: ' + detalle };
  return { hoja: nombre, ok: false, codigo: 'PRESENTACION_HOJA_NO_CONVERGE',
    propiedad: raiz, motivo: detalle,
    pendientes: pendientesLayout.length, detalles: pendientesLayout,
    seccionesAplicadas: aplicado.secciones };
}

/** PURA: compara colores normalizados (case-insensitive; vacíos = iguales). */
function HVis_mismosColor(a, b) {
  function norm(x) {
    var t = Utl_texto(x).toUpperCase();
    return (t === '' || t === 'TRANSPARENT') ? '' : t;
  }
  return norm(a) === norm(b);
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

// ---------------------------------------------------------------------------
// PARIDAD VISUAL v0.13.0
// ---------------------------------------------------------------------------

/** Devuelve la plantilla única de la familia e inyecta solo la identidad. */
function HVis_plantillaParaHoja_(nombreHoja) {
  var nombre = HVis_normalizarNombreHoja(nombreHoja);
  var base = null;
  if (nombre.indexOf('INGRESO_') === 0) base = PLANTILLA_VISUAL_INGRESO;
  else if (nombre.indexOf('SECTOR_') === 0) base = PLANTILLA_VISUAL_SECTOR;
  else if (nombre === 'PACIENTES') base = PLANTILLA_VISUAL_PACIENTES;
  else if (nombre === 'EVENTOS') base = PLANTILLA_VISUAL_EVENTOS;
  if (!base) return null;
  var sector = HVis_detectarSectorHoja(nombre), campos = {};
  base.columnas.forEach(function (campo) {
    var e = Formato_especificacionCampo_(campo);
    campos[e.clave] = {
      etiqueta: campo, ancho: e.ancho, numberFormat: e.formato,
      alineacion: e.alineacion, wrap: e.wrap
    };
  });
  return {
    familia: base.familia,
    layout: {
      tituloRow: base.layout.tituloRow, seccionesRow: base.layout.seccionesRow,
      encabezadosRow: base.layout.encabezadosRow, datosDesdeRow: base.layout.datosDesdeRow
    },
    columnas: base.columnas.slice(), campos: campos,
    filas: {
      titulo: base.filas.titulo, secciones: base.filas.secciones,
      encabezado: base.filas.encabezado, datos: base.filas.datos
    },
    freeze: { filas: base.freeze.filas, columnas: base.freeze.columnas },
    encabezado: base.encabezado,
    secciones: base.secciones.map(function (s) {
      return { id: s.id, nombre: s.nombre, columnas: s.columnas.slice() };
    }),
    superficie: base.superficie,
    validacionOwner: base.validacionOwner,
    condicionalOwner: base.condicionalOwner,
    identidad: {
      nombre: sector || 'GENERAL',
      colorPrincipal: sector ? HVis_colorPorSector(sector) : DESIGN_SYSTEM.MARCA.sistema,
      colorSecundario: sector && PALETA_SECCION[sector]
        ? PALETA_SECCION[sector].seccion.slice() : RAMPA.GENERAL.seccion.slice(),
      tabColor: typeof Hojas_colorPestana_ === 'function'
        ? Hojas_colorPestana_(nombre) : HVis_colorPorSector(sector)
    }
  };
}

/** Comprueba que cada columna pertenezca exactamente a una sección contigua. */
function HVis_auditarCoberturaSecciones_(columnas, secciones, excepciones) {
  if (typeof columnas === 'string') {
    var p = HVis_plantillaParaHoja_(columnas);
    if (!p) return { ok: false, faltantes: [], duplicadas: [], desconocidas: [], noContiguas: [] };
    secciones = p.secciones; columnas = p.columnas;
  }
  columnas = columnas || []; secciones = secciones || []; excepciones = excepciones || [];
  var indices = {}, conteo = {}, desconocidas = [], noContiguas = [];
  columnas.forEach(function (c, i) { indices[Utl_claveAlnum(c)] = i; });
  secciones.forEach(function (s) {
    var posiciones = [];
    (s.columnas || []).forEach(function (c) {
      var k = Utl_claveAlnum(c);
      if (indices[k] === undefined) { desconocidas.push(c); return; }
      conteo[k] = (conteo[k] || 0) + 1; posiciones.push(indices[k]);
    });
    posiciones.sort(function (a, b) { return a - b; });
    for (var i = 1; i < posiciones.length; i++) {
      if (posiciones[i] !== posiciones[i - 1] + 1) {
        noContiguas.push(s.id || s.nombre || 'SIN_ID'); break;
      }
    }
  });
  var ex = {}; excepciones.forEach(function (c) { ex[Utl_claveAlnum(c)] = true; });
  var faltantes = [], duplicadas = [];
  columnas.forEach(function (c) {
    var k = Utl_claveAlnum(c), n = conteo[k] || 0;
    if (!n && !ex[k]) faltantes.push(c);
    if (n > 1) duplicadas.push(c);
  });
  return {
    ok: !faltantes.length && !duplicadas.length && !desconocidas.length && !noContiguas.length,
    faltantes: faltantes, duplicadas: duplicadas,
    desconocidas: desconocidas, noContiguas: noContiguas
  };
}

function HVis_valorEstructural_(valor) {
  if (valor === null || valor === undefined) return '';
  if (Array.isArray(valor)) return valor.map(HVis_valorEstructural_);
  if (valor && typeof valor.getA1Notation === 'function') {
    try { return 'RANGO:' + valor.getA1Notation(); } catch (eR) { return 'RANGO'; }
  }
  if (Object.prototype.toString.call(valor) === '[object Date]')
    return 'FECHA:' + valor.toISOString();
  if (typeof valor === 'object') return String(valor);
  return String(valor);
}

/** Firma de una validación sin leer el valor de la celda. */
function HVis_firmaValidacion_(dv) {
  if (!dv) return null;
  try {
    var criterio = typeof dv.getCriteria === 'function' ? String(dv.getCriteria()) : '';
    var valores = typeof dv.getCriteriaValues === 'function'
      ? (dv.getCriteriaValues() || []).map(HVis_valorEstructural_) : [];
    // Las listas son conjuntos contractuales; el orden de presentación no
    // constituye una divergencia visual.
    valores = valores.map(function (v) {
      return Array.isArray(v) ? v.slice().map(String).sort() : v;
    });
    return {
      criterio: criterio, valores: valores,
      permitirInvalido: typeof dv.getAllowInvalid === 'function' ? dv.getAllowInvalid() === true : null,
      ayuda: typeof dv.getHelpText === 'function' ? Utl_texto(dv.getHelpText()) : ''
    };
  } catch (e) { return { error: 'VALIDACION_NO_INSPECCIONABLE' }; }
}

function HVis_firmaRangoRegla_(rango) {
  try {
    if (typeof rango.getColumn === 'function') {
      return {
        filaInicial: rango.getRow(), columnaInicial: rango.getColumn(),
        columnas: typeof rango.getNumColumns === 'function' ? rango.getNumColumns() : 1
      };
    }
    var a1 = typeof rango.getA1Notation === 'function' ? rango.getA1Notation() : '';
    return { a1: Utl_texto(a1).replace(/^.*!/, '').replace(/[0-9]+$/g, '#') };
  } catch (e) { return { error: 'RANGO_NO_INSPECCIONABLE' }; }
}

/** Firma estable de una regla condicional, independiente de cantidad de datos. */
function HVis_firmaReglaCondicional_(regla) {
  try {
    var condicion = regla && regla.getBooleanCondition && regla.getBooleanCondition();
    if (!condicion) return { criterio: 'SIN_CONDICION' };
    return {
      criterio: String(condicion.getCriteriaType ? condicion.getCriteriaType() : ''),
      valores: (condicion.getCriteriaValues ? condicion.getCriteriaValues() : [])
        .map(HVis_valorEstructural_),
      rangos: (regla.getRanges ? regla.getRanges() : []).map(HVis_firmaRangoRegla_),
      fondo: condicion.getBackground ? condicion.getBackground() : '',
      tinta: condicion.getFontColor ? condicion.getFontColor() : '',
      negrita: condicion.getBold ? condicion.getBold() === true : false,
      cursiva: condicion.getItalic ? condicion.getItalic() === true : false
    };
  } catch (e) { return { error: 'REGLA_NO_INSPECCIONABLE' }; }
}

function HVis_filaMatriz_(rango, metodo, columnas, valorDefecto) {
  try {
    if (rango && typeof rango[metodo] === 'function') {
      var m = rango[metodo]();
      if (Array.isArray(m) && Array.isArray(m[0])) return m[0].slice(0, columnas);
    }
  } catch (e) {}
  var r = []; for (var i = 0; i < columnas; i++) r.push(valorDefecto);
  return r;
}

function HVis_firmaFila_(hoja, fila, columnas) {
  if (!(fila > 0)) return null;
  var r = hoja.getRange(fila, 1, 1, columnas);
  return {
    altura: typeof hoja.getRowHeight === 'function' ? hoja.getRowHeight(fila) : null,
    fondos: HVis_filaMatriz_(r, 'getBackgrounds', columnas, ''),
    tintas: HVis_filaMatriz_(r, 'getFontColors', columnas, ''),
    fuentes: HVis_filaMatriz_(r, 'getFontFamilies', columnas, ''),
    tamanios: HVis_filaMatriz_(r, 'getFontSizes', columnas, null),
    pesos: HVis_filaMatriz_(r, 'getFontWeights', columnas, ''),
    horizontal: HVis_filaMatriz_(r, 'getHorizontalAlignments', columnas, ''),
    vertical: HVis_filaMatriz_(r, 'getVerticalAlignments', columnas, ''),
    wrap: HVis_filaMatriz_(r, 'getWraps', columnas, null)
  };
}

function HVis_firmaMerges_(hoja, filasSuperiores, columnas) {
  try {
    var rango = hoja.getRange(1, 1, filasSuperiores, columnas);
    var merges = typeof rango.getMergedRanges === 'function' ? rango.getMergedRanges() : [];
    return merges.map(function (r) {
      return {
        fila: typeof r.getRow === 'function' ? r.getRow() : 0,
        columna: typeof r.getColumn === 'function' ? r.getColumn() : 0,
        filas: typeof r.getNumRows === 'function' ? r.getNumRows() : 0,
        columnas: typeof r.getNumColumns === 'function' ? r.getNumColumns() : 0
      };
    }).sort(function (a, b) { return a.fila - b.fila || a.columna - b.columna; });
  } catch (e) { return []; }
}

/**
 * Firma estructural completa. Solo inspecciona encabezados, estilos y reglas;
 * nunca incorpora valores de pacientes ni eventos.
 */
function HVis_firmaVisualHoja_(hoja, opciones) {
  opciones = opciones || {};
  if (!hoja) return { ok: false, motivo: 'HOJA_INEXISTENTE' };
  var nombre = hoja.getName(), plantilla = HVis_plantillaParaHoja_(nombre);
  var familia = plantilla ? plantilla.familia : (HOJAS_UX[nombre] || {}).familia || 'OTRA';
  var hr = Modelo_headerRow(nombre), ini = Modelo_dataStartRow(nombre);
  // El ancho canónico de la firma es el de la PLANTILLA (rango gestionado),
  // no getLastColumn(): columnas residuales o datos fuera del diseño en una
  // sola hoja inflaban la comparación entre hojas de la misma familia con
  // cientos de diferencias falsas (.length + cada índice). DEC-086.
  var columnas = plantilla ? plantilla.columnas.length
    : Math.max(hoja.getLastColumn() || 0, 1);
  var rEnc = hoja.getRange(hr, 1, 1, columnas);
  var etiquetas = HVis_filaMatriz_(rEnc, 'getValues', columnas, '');
  var rDatos = hoja.getRange(ini, 1, 1, columnas);
  var formatos = HVis_filaMatriz_(rDatos, 'getNumberFormats', columnas, '');
  var alineaciones = HVis_filaMatriz_(rDatos, 'getHorizontalAlignments', columnas, '');
  var wraps = HVis_filaMatriz_(rDatos, 'getWraps', columnas, null);
  var fondos = HVis_filaMatriz_(rDatos, 'getBackgrounds', columnas, '');
  var tintas = HVis_filaMatriz_(rDatos, 'getFontColors', columnas, '');
  var dvs = HVis_filaMatriz_(rDatos, 'getDataValidations', columnas, null);
  var orden = [], campos = {}, validaciones = {};
  etiquetas.forEach(function (etiqueta, i) {
    if (!Utl_texto(etiqueta)) return;
    var clave = Formato_claveCampo_(etiqueta);
    orden.push(clave);
    campos[clave] = {
      etiqueta: Utl_texto(etiqueta),
      ancho: typeof hoja.getColumnWidth === 'function' ? hoja.getColumnWidth(i + 1) : null,
      numberFormat: formatos[i], alineacion: Utl_texto(alineaciones[i]).toUpperCase(),
      wrap: wraps[i], superficie: { fondo: fondos[i], tinta: tintas[i] }
    };
    var fv = HVis_firmaValidacion_(dvs[i]);
    if (fv) validaciones[clave] = fv;
  });
  var secciones = [], cfg = HVis_obtenerSecciones(nombre) || [];
  var plan = HVis_calcularPlan(nombre, cfg, HVis_mapaColumnas(etiquetas));
  var valoresSeccion = plan.seccionesRow
    ? HVis_filaMatriz_(hoja.getRange(plan.seccionesRow, 1, 1, columnas), 'getValues', columnas, '') : [];
  plan.secciones.forEach(function (s) {
    secciones.push({
      id: s.id, nombre: Utl_texto(valoresSeccion[s.colInicio - 1] || s.nombre),
      colInicio: s.colInicio, colFin: s.colFin
    });
  });
  var reglas = [];
  try {
    reglas = (typeof hoja.getConditionalFormatRules === 'function'
      ? hoja.getConditionalFormatRules() : []).map(HVis_firmaReglaCondicional_);
  } catch (eR) { reglas = [{ error: 'REGLAS_NO_INSPECCIONABLES' }]; }
  return {
    ok: true, familia: familia,
    layout: {
      tituloRow: Modelo_esHojaVisual(nombre) ? 1 : 0,
      seccionesRow: Modelo_esHojaVisual(nombre) ? 2 : 0,
      encabezadosRow: hr, datosDesdeRow: ini
    },
    columnas: { orden: orden, campos: campos },
    filas: {
      titulo: Modelo_esHojaVisual(nombre) ? HVis_firmaFila_(hoja, 1, columnas) : null,
      secciones: Modelo_esHojaVisual(nombre) ? HVis_firmaFila_(hoja, 2, columnas) : null,
      encabezado: HVis_firmaFila_(hoja, hr, columnas),
      datos: { altura: typeof hoja.getRowHeight === 'function' ? hoja.getRowHeight(ini) : null }
    },
    freeze: {
      filas: typeof hoja.getFrozenRows === 'function' ? hoja.getFrozenRows() : null,
      columnas: typeof hoja.getFrozenColumns === 'function' ? hoja.getFrozenColumns() : null
    },
    merges: HVis_firmaMerges_(hoja, Math.max(hr, 1), columnas),
    secciones: secciones,
    reglasCondicionales: reglas,
    validaciones: validaciones,
    tabColor: typeof hoja.getTabColor === 'function' ? hoja.getTabColor() : '',
    cobertura: plantilla
      ? HVis_auditarCoberturaSecciones_(plantilla.columnas, plantilla.secciones, [])
      : { ok: true, faltantes: [], duplicadas: [], desconocidas: [], noContiguas: [] }
  };
}

function HVis_colorTokenSector_(color, sector) {
  var c = Utl_texto(color).toUpperCase();
  if (!c || !sector || !PALETA_SECCION[sector]) return color;
  var primarios = [HVis_colorPorSector(sector), IDENTIDAD[sector], PALETA_SECCION[sector].barra,
    PALETA_SECCION[sector].encabezado];
  for (var i = 0; i < primarios.length; i++)
    if (c === Utl_texto(primarios[i]).toUpperCase()) return 'SECTOR_PRIMARY';
  for (var j = 0; j < PALETA_SECCION[sector].seccion.length; j++)
    if (c === Utl_texto(PALETA_SECCION[sector].seccion[j]).toUpperCase())
      return 'SECTOR_SECONDARY_' + (j + 1);
  return color;
}

function HVis_normalizarIdentidad_(valor, sector) {
  if (Array.isArray(valor)) return valor.map(function (v) { return HVis_normalizarIdentidad_(v, sector); });
  if (valor && typeof valor === 'object') {
    var o = {};
    Object.keys(valor).sort().forEach(function (k) { o[k] = HVis_normalizarIdentidad_(valor[k], sector); });
    return o;
  }
  if (typeof valor !== 'string') return valor;
  var color = HVis_colorTokenSector_(valor, sector);
  if (color !== valor) return color;
  return valor
    .replace(new RegExp('INGRESO_' + sector, 'gi'), 'INGRESO_SECTOR')
    .replace(new RegExp('SECTOR_' + sector, 'gi'), 'SECTOR_SECTOR')
    .replace(new RegExp(sector, 'gi'), 'SECTOR');
}

/** Firma neutral: elimina nombre/color particular del sector, no la geometría. */
function HVis_firmaVisualNormalizada_(hoja) {
  if (!hoja) return { ok: false, motivo: 'HOJA_INEXISTENTE' };
  var sector = HVis_detectarSectorHoja(hoja.getName());
  return HVis_normalizarIdentidad_(HVis_firmaVisualHoja_(hoja), sector);
}

function HVis_diferenciasFirmas_(esperado, actual, ruta, salida, limite) {
  salida = salida || []; ruta = ruta || ''; limite = limite || 250;
  if (salida.length >= limite) return salida;
  if (esperado === actual) return salida;
  var ae = Array.isArray(esperado), aa = Array.isArray(actual);
  if (ae || aa) {
    if (!(ae && aa)) { salida.push({ propiedad: ruta, esperado: esperado, actual: actual }); return salida; }
    if (esperado.length !== actual.length)
      salida.push({ propiedad: ruta + '.length', esperado: esperado.length, actual: actual.length });
    for (var i = 0; i < Math.max(esperado.length, actual.length) && salida.length < limite; i++)
      HVis_diferenciasFirmas_(esperado[i], actual[i], ruta + '[' + i + ']', salida, limite);
    return salida;
  }
  var oe = esperado && typeof esperado === 'object', oa = actual && typeof actual === 'object';
  if (oe || oa) {
    if (!(oe && oa)) { salida.push({ propiedad: ruta, esperado: esperado, actual: actual }); return salida; }
    var claves = {};
    Object.keys(esperado).concat(Object.keys(actual)).forEach(function (k) { claves[k] = true; });
    Object.keys(claves).sort().forEach(function (k) {
      if (salida.length < limite)
        HVis_diferenciasFirmas_(esperado[k], actual[k], ruta ? ruta + '.' + k : k, salida, limite);
    });
    return salida;
  }
  salida.push({ propiedad: ruta, esperado: esperado, actual: actual });
  return salida;
}

function HVis_serializarEstable_(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return '[' + valor.map(HVis_serializarEstable_).join(',') + ']';
  return '{' + Object.keys(valor).sort().map(function (k) {
    return JSON.stringify(k) + ':' + HVis_serializarEstable_(valor[k]);
  }).join(',') + '}';
}

function HVis_hashEstructural_(valor) {
  var s = HVis_serializarEstable_(valor), h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

/** Compara las hojas de una familia contra la primera, ya neutralizadas. */
function HVis_compararFamilia_(nombres) {
  nombres = nombres || [];
  var ss = Modelo_ss(), referencia = nombres[0] || '', refHoja = ss.getSheetByName(referencia);
  if (!refHoja) return {
    ok: false, referencia: referencia, diferencias: [{ hoja: referencia, propiedad: 'hoja', esperado: 'EXISTE', actual: 'NO_EXISTE' }],
    cantidadDiferencias: 1, hojasDivergentes: [referencia]
  };
  var firmaRef = HVis_firmaVisualNormalizada_(refHoja), diferencias = [], hashes = {};
  hashes[referencia] = HVis_hashEstructural_(firmaRef);
  nombres.slice(1).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      diferencias.push({ hoja: nombre, propiedad: 'hoja', esperado: 'EXISTE', actual: 'NO_EXISTE' });
      hashes[nombre] = 'AUSENTE'; return;
    }
    var firma = HVis_firmaVisualNormalizada_(hoja);
    hashes[nombre] = HVis_hashEstructural_(firma);
    HVis_diferenciasFirmas_(firmaRef, firma).forEach(function (d) {
      diferencias.push({ hoja: nombre, propiedad: d.propiedad, esperado: d.esperado, actual: d.actual });
    });
  });
  var grupos = {};
  nombres.forEach(function (n) { var h = hashes[n] || 'AUSENTE'; (grupos[h] || (grupos[h] = [])).push(n); });
  var mayores = Object.keys(grupos).sort(function (a, b) { return grupos[b].length - grupos[a].length; });
  var base = mayores.length && grupos[mayores[0]].length > 1 ? mayores[0] : '';
  var divergentes = base ? nombres.filter(function (n) { return hashes[n] !== base; })
    : (diferencias.length ? nombres.slice() : []);
  return {
    ok: diferencias.length === 0, referencia: referencia,
    diferencias: diferencias, cantidadDiferencias: diferencias.length,
    hojasDivergentes: divergentes, firmas: hashes
  };
}

function HVis_firmaProtecciones_(hoja) {
  var salida = [];
  if (!hoja || typeof hoja.getProtections !== 'function') return salida;
  try {
    var tipo = typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.ProtectionType
      ? SpreadsheetApp.ProtectionType.RANGE : 'RANGE';
    (hoja.getProtections(tipo) || []).forEach(function (p) {
      try {
        var desc = Utl_texto(p.getDescription && p.getDescription());
        var r = p.getRange && p.getRange();
        salida.push({
          owner: desc.indexOf('ECICEP') === 0 ? desc : 'MANUAL',
          aviso: p.isWarningOnly ? p.isWarningOnly() === true : null,
          fila: r && r.getRow ? r.getRow() : 0,
          columna: r && r.getColumn ? r.getColumn() : 0,
          columnas: r && r.getNumColumns ? r.getNumColumns() : 0
        });
      } catch (eP) { salida.push({ error: 'PROTECCION_NO_INSPECCIONABLE' }); }
    });
  } catch (e) { salida.push({ error: 'PROTECCIONES_NO_INSPECCIONABLES' }); }
  return salida.sort(function (a, b) {
    return HVis_serializarEstable_(a).localeCompare(HVis_serializarEstable_(b));
  });
}

function HVis_diagnosticoInicio_(ss) {
  var h = ss.getSheetByName('INICIO');
  if (!h) return { ok: false, diferencias: 1, detalle: ['INICIO_NO_EXISTE'] };
  try {
    if (typeof Inicio_verificar_ === 'function') {
      var v = Inicio_verificar_(h), ds = v.diferencias || v.fallos || [];
      return { ok: v.ok !== false && !ds.length, diferencias: ds.length || (v.ok === false ? 1 : 0), detalle: ds };
    }
    var vigente = typeof Inicio_layoutVigente_ === 'function' && Inicio_layoutVigente_(h);
    return { ok: !!vigente, diferencias: vigente ? 0 : 1,
      detalle: vigente ? [] : ['INICIO_LAYOUT_DESACTUALIZADO'] };
  } catch (e) { return { ok: false, diferencias: 1, detalle: ['INICIO_NO_INSPECCIONABLE'] }; }
}

/** Diagnóstico profundo, sin PII y estrictamente de solo lectura. */
function Libro_diagnosticoVisualProfundo_(opciones) {
  opciones = opciones || {};
  var ss = Modelo_ss();
  var ingreso = HVis_compararFamilia_(['INGRESO_NARANJO','INGRESO_AMARILLO','INGRESO_VERDE']);
  var sector = HVis_compararFamilia_(['SECTOR_NARANJO','SECTOR_AMARILLO','SECTOR_VERDE']);
  function resumen(comp) {
    return { ok: comp.ok, diferencias: comp.cantidadDiferencias || 0,
      detalle: comp.diferencias || [], hojasDivergentes: comp.hojasDivergentes || [],
      firmas: comp.firmas || {} };
  }
  var inicio = opciones.omitirInicio ? { ok: true, diferencias: 0, detalle: [] }
    : HVis_diagnosticoInicio_(ss);
  var hojas = {}, detalle = [], total = ingreso.cantidadDiferencias + sector.cantidadDiferencias + inicio.diferencias;
  ['PACIENTES','EVENTOS'].forEach(function (nombre) {
    var h = ss.getSheetByName(nombre), d = h ? HVis_pendientesVisual(h) : { pendientes: ['NO_EXISTE'], cantidadPendientes: 1 };
    var n = d.cantidadPendientes === undefined ? (d.pendientes || []).length : d.cantidadPendientes;
    hojas[nombre] = { ok: n === 0, diferencias: n, detalle: d.pendientes || [] };
    total += n;
  });
  var tabs = { ok: true, diferencias: 0, detalle: [] };
  ['INICIO','PACIENTES','EVENTOS','INGRESO_NARANJO','INGRESO_AMARILLO','INGRESO_VERDE',
   'SECTOR_NARANJO','SECTOR_AMARILLO','SECTOR_VERDE','REM_SALIDA'].forEach(function (nombre) {
    var h = ss.getSheetByName(nombre); if (!h || typeof h.getTabColor !== 'function') return;
    var esperado = Hojas_colorPestana_(nombre), actual = h.getTabColor();
    if (!HVis_mismosColor(actual, esperado)) {
      tabs.ok = false; tabs.diferencias++; tabs.detalle.push(nombre + ':TAB_COLOR');
    }
  });
  total += tabs.diferencias;
  var objetivo = Hojas_ordenObjetivo_(), actual = [];
  try {
    actual = ss.getSheets().filter(function (h) { return !h.isSheetHidden(); })
      .map(function (h) { return h.getName(); }).filter(function (n) { return objetivo.indexOf(n) !== -1; });
  } catch (eO) {}
  var difOrden = HVis_diferenciasFirmas_(objetivo, actual);
  var orden = { ok: difOrden.length === 0, diferencias: difOrden.length, esperado: objetivo, actual: actual };
  total += orden.diferencias;
  var protFirmas = {}, protHashes = {};
  ['INGRESO_NARANJO','INGRESO_AMARILLO','INGRESO_VERDE'].forEach(function (n) {
    protFirmas[n] = HVis_firmaProtecciones_(ss.getSheetByName(n));
    protHashes[n] = HVis_hashEstructural_(protFirmas[n]);
  });
  var protOk = protHashes.INGRESO_NARANJO === protHashes.INGRESO_AMARILLO &&
    protHashes.INGRESO_NARANJO === protHashes.INGRESO_VERDE;
  var protecciones = { ok: protOk, diferencias: protOk ? 0 : 1, firmas: protHashes };
  total += protecciones.diferencias;
  var difIngreso = ingreso.diferencias || [], difSector = sector.diferencias || [];
  var nVal = difIngreso.filter(function (d) { return d.propiedad.indexOf('validaciones') === 0; }).length;
  var nReglas = difIngreso.concat(difSector).filter(function (d) {
    return d.propiedad.indexOf('reglasCondicionales') === 0;
  }).length;
  var validaciones = { ok: nVal === 0, diferencias: nVal };
  var reglas = { ok: nReglas === 0, diferencias: nReglas };
  if (!ingreso.ok) detalle.push('paridad:INGRESO:' + ingreso.cantidadDiferencias);
  if (!sector.ok) detalle.push('paridad:SECTOR:' + sector.cantidadDiferencias);
  if (!inicio.ok) detalle.push('INICIO:' + inicio.diferencias);
  Object.keys(hojas).forEach(function (n) { if (!hojas[n].ok) detalle.push(n + ':' + hojas[n].diferencias); });
  if (!tabs.ok) detalle.push('tabs:' + tabs.diferencias);
  if (!orden.ok) detalle.push('orden:' + orden.diferencias);
  if (!protecciones.ok) detalle.push('protecciones:' + protecciones.diferencias);
  return {
    ok: total === 0,
    paridad: { ingreso: resumen(ingreso), sector: resumen(sector) },
    inicio: inicio, hojas: hojas, tabs: tabs, orden: orden,
    protecciones: protecciones, validaciones: validaciones,
    reglasCondicionales: reglas,
    diferencias: total, totalDiferencias: total, detalle: detalle,
    hojasConDiferencias: ingreso.hojasDivergentes.concat(sector.hojasDivergentes)
      .concat(Object.keys(hojas).filter(function (n) { return !hojas[n].ok; }))
  };
}

/** Reparación selectiva: si todo está correcto, retorna antes de toda escritura. */
function HVis_repararDiferencias_(diagnostico, opciones) {
  opciones = opciones || {};
  var antes = diagnostico || Libro_diagnosticoVisualProfundo_();
  if (antes.ok) return { ok: true, omitida: true, escrituras: 0, antes: antes, despues: antes };
  var ss = Modelo_ss(), objetivos = {}, acciones = [];
  (antes.hojasConDiferencias || []).forEach(function (n) { objetivos[n] = true; });
  Object.keys(objetivos).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre); if (!h) return;
    if (HVis_obtenerSecciones(nombre) && Modelo_esHojaVisual(nombre)) {
      HVis_aplicarSecciones(h, { forzar: true }); acciones.push(nombre + ':layout');
    }
    if (typeof Presentacion_formatearHoja_ === 'function') {
      Presentacion_formatearHoja_(nombre); acciones.push(nombre + ':formato');
    }
    var color = Hojas_colorPestana_(nombre);
    if (typeof h.getTabColor !== 'function' || !HVis_mismosColor(h.getTabColor(), color)) {
      h.setTabColor(color); acciones.push(nombre + ':tab');
    }
  });
  if (antes.validaciones && !antes.validaciones.ok) {
    Modelo_validarIngresos(ss);
    Hojas_aplicarValidaciones_(ss, { hojas: [HOJAS.PACIENTES].concat(HOJAS_SECTOR) });
    acciones.push('validaciones');
  }
  if (antes.reglasCondicionales && !antes.reglasCondicionales.ok) {
    Hojas_formatoCondicional(ss); acciones.push('reglasCondicionales');
  }
  if (antes.protecciones && !antes.protecciones.ok) {
    Modelo_validarIngresos(ss); acciones.push('protecciones');
  }
  if (antes.tabs && !antes.tabs.ok) {
    (Hojas_ordenObjetivo_().concat(['EVENTOS'])).forEach(function (n) {
      var h = ss.getSheetByName(n); if (!h) return;
      var c = Hojas_colorPestana_(n);
      if (typeof h.getTabColor !== 'function' || !HVis_mismosColor(h.getTabColor(), c)) h.setTabColor(c);
    });
    acciones.push('tabs');
  }
  if (antes.orden && !antes.orden.ok) { Hojas_ordenar_(ss); acciones.push('orden'); }
  if (opciones.incluirInicio !== false && antes.inicio && !antes.inicio.ok &&
      typeof Inicio_refrescar_ === 'function') {
    Inicio_refrescar_({ forzar: true }); acciones.push('INICIO');
  }
  var despues = Libro_diagnosticoVisualProfundo_();
  return { ok: despues.ok, omitida: false, escrituras: acciones.length,
    acciones: acciones, antes: antes, despues: despues };
}
