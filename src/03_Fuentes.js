/**
 * Sistema ECICEP Unificado — 03_Fuentes
 * STAGING_IMPORT: estructura de filas de importación controlada,
 * validador estructural y aplicación de la normalización existente.
 *
 * Núcleo puro (testeable en node, determinista). Las funciones I/O hacia la
 * hoja STAGING_IMPORT están claramente separadas y solo operan en GAS.
 * Reglas: nunca se descarta el valor original; los defectos se convierten en
 * resultados trazables (ERROR/WARNING), jamás en crashes.
 */

var _FUENTES_SEQ = 0;

/**
 * Crea una fila de staging con trazabilidad completa.
 * @param {Object} origen {archivo, hoja, fila, sector}
 * @param {Object} valores  valores crudos mapeados a campos canónicos
 * @param {number} [secuencia] opcional → ID determinista (pruebas)
 */
function Fuentes_crearFila(origen, valores, secuencia) {
  var id;
  if (typeof secuencia === 'number') {
    id = 'SG-' + ('0000' + secuencia).slice(-4);
  } else {
    _FUENTES_SEQ += 1;
    id = 'SG-' + Date.now().toString(36).toUpperCase() + '-' + ('00' + _FUENTES_SEQ % 1296).slice(-2) +
         Math.floor(Math.random() * 36).toString(36).toUpperCase();
  }
  return {
    ID_PROVISIONAL: id,
    ARCHIVO_ORIGEN: Utl_texto(origen && origen.archivo),
    HOJA_ORIGEN: Utl_texto(origen && origen.hoja),
    FILA_ORIGEN: (origen && origen.fila) || '',
    SECTOR_ORIGEN: Utl_colapsarEspacios(Utl_texto(origen && origen.sector)).toUpperCase(),
    VALORES_ORIGINALES: valores || {},
    NORMALIZADO: {},
    ERRORES: [],
    WARNINGS: [],
    ESTADO_VALIDACION: 'PENDIENTE',
    RESULTADO_IDENTIFICACION: null
  };
}

/** Cadena de trazabilidad estándar archivo|hoja|fila. */
function Fuentes_fuenteOrigen(filaStaging) {
  return Utl_texto(filaStaging.ARCHIVO_ORIGEN) + '|' + Utl_texto(filaStaging.HOJA_ORIGEN) + '|' + Utl_texto(filaStaging.FILA_ORIGEN);
}

/**
 * Verificación estructural previa: presencia de campos críticos crudos.
 * @returns {ok:boolean, faltantes:[]}
 */
function Fuentes_validarEstructura(valores, requeridos) {
  var req = requeridos || ['RUT', 'NOMBRE'];
  var faltantes = [];
  req.forEach(function (campo) {
    if (Utl_vacio((valores || {})[campo])) faltantes.push(campo);
  });
  return { ok: faltantes.length === 0, faltantes: faltantes };
}

/**
 * Aplica los normalizadores existentes sobre la fila y produce el resultado
 * de validación (ERROR/WARNING/OK) sin efectos secundarios externos.
 * El valor original siempre se conserva en VALORES_ORIGINALES.
 */
function Fuentes_normalizar(fila) {
  var v = fila.VALORES_ORIGINALES || {};
  var n = {};
  var err = [], warn = [];
  function nota(arr, campo, mensaje) { arr.push({ campo: campo, mensaje: mensaje }); }

  // --- RUT ---
  var rut = Norm_normalizarRut(v.RUT);
  n.RUT = rut.rut;
  n.RUT_CUERPO = rut.cuerpo;
  n.RUT_ESTADO = rut.estado;
  if (rut.estado === 'VACIO') nota(err, 'RUT', 'RUT ausente');
  else if (rut.estado === 'INVALIDO') nota(err, 'RUT', rut.detalle);
  else if (rut.estado === 'SIN_DV') nota(warn, 'RUT', 'RUT sin dígito verificador');

  // --- NOMBRE ---
  var nom = Norm_normalizarNombre(v.NOMBRE);
  n.NOMBRE = nom.nombre;
  n.NOMBRE_CLAVE = Norm_claveNombre(nom.nombre);
  if (!nom.ok) nota(err, 'NOMBRE', 'Nombre ausente o incompleto');
  else if (n.NOMBRE.indexOf(' ') === -1) nota(warn, 'NOMBRE', 'Nombre de una sola palabra');

  // --- SEXO ---
  n.SEXO = Norm_normalizarSexo(v.SEXO);
  if (!Utl_vacio(v.SEXO) && n.SEXO === '') nota(warn, 'SEXO', 'Valor de sexo no reconocido, se descarta');

  // --- SECTOR (crítico; independiente de estratificación) ---
  // Regla DEC-019: si la fila no trae sector explícito, hereda el del ORIGEN
  // (hoja/archivo de ingreso); nunca al revés.
  var sectorCrudo = Utl_vacio(v.SECTOR) ? fila.SECTOR_ORIGEN : v.SECTOR;
  var sec = Norm_normalizarSector(sectorCrudo);
  n.SECTOR = sec.sector;
  if (sec.estado === 'VACIO') nota(err, 'SECTOR', 'Sector ausente');
  else if (sec.estado === 'INVALIDO') nota(err, 'SECTOR', 'Sector inválido: "' + Utl_texto(sectorCrudo) + '"');

  // Compatibilidad: sector declarado explícito vs sector del origen
  if (!Utl_vacio(v.SECTOR) && !Utl_vacio(fila.SECTOR_ORIGEN)) {
    var orig = Norm_normalizarSector(fila.SECTOR_ORIGEN);
    if (sec.estado === 'OK' && orig.estado === 'OK' && sec.sector !== orig.sector) {
      nota(err, 'SECTOR', 'Sector declarado "' + sec.sector + '" no coincide con el origen "' + orig.sector + '"');
    }
  }

  // --- ESTRATIFICACIÓN (dimensión independiente; nunca se infiere) ---
  n.ESTRATIFICACION = Norm_normalizarEstratificacion(v.ESTRATIFICACION);
  n.ESTRAT_ORIGEN = Utl_colapsarEspacios(Utl_texto(v.ESTRATIFICACION)).toUpperCase();
  if (n.ESTRAT_ORIGEN !== '' && n.ESTRATIFICACION === '') {
    nota(warn, 'ESTRATIFICACION', 'Valor original no clasificable ("' + n.ESTRAT_ORIGEN + '"): queda pendiente');
  }

  // --- ESTADO ---
  n.ESTADO = Norm_normalizarEstado(v.ESTADO);

  // --- FECHAS ---
  ['FECHA_NACIMIENTO', 'FECHA_INGRESO', 'PROXIMO_CONTROL'].forEach(function (campo) {
    // Los nacimientos admiten años mucho más antiguos que los eventos
    var rango = (campo === 'FECHA_NACIMIENTO')
      ? { min: CFG_FECHAS.ANO_MIN_NACIMIENTO, max: CFG_FECHAS.ANO_MAX }
      : undefined;
    var r = Norm_normalizarFecha(v[campo], rango);
    n[campo] = r.iso;
    n[campo + '_ESTADO'] = r.estado;
    if (r.estado === 'INVALIDA') {
      nota(campo === 'FECHA_INGRESO' ? err : warn, campo, r.detalle);
    } else if (r.estado === 'NO_RECONOCIDA') {
      nota(warn, campo, 'Texto no reconocible como fecha: "' + Utl_texto(v[campo]) + '"');
    } else if (r.estado === 'MES_ANO') {
      nota(warn, campo, 'Solo mes/año');
    }
  });

  // --- PREINGRESO (fecha o estado textual) ---
  var pre = Norm_normalizarFecha(v.PREINGRESO);
  if (pre.estado === 'VALIDA' || pre.estado === 'MES_ANO') n.PREINGRESO = pre.iso;
  else if (pre.estado === 'NO_RECONOCIDA') n.PREINGRESO = Utl_texto(v.PREINGRESO).trim().toUpperCase();
  else n.PREINGRESO = '';

  // --- TELÉFONOS ---
  var tel = Norm_normalizarTelefono(v.TELEFONOS !== undefined ? v.TELEFONOS : v.TELEFONO);
  n.TELEFONOS = tel.telefonos.join('/');
  n.TELEFONO_OBS = tel.observaciones.join('; ');
  if (tel.estado === 'PARCIAL') nota(warn, 'TELEFONOS', tel.detalle);
  else if (tel.telefonos.length === 0) nota(warn, 'TELEFONOS', 'Sin teléfono válido');

  // --- Texto libre normalizado ---
  n.DUPLA_INGRESO = Utl_colapsarEspacios(Utl_texto(v.DUPLA_INGRESO)).toUpperCase();
  n.PROFESIONAL_SEGUIMIENTO = Utl_colapsarEspacios(Utl_texto(v.PROFESIONAL_SEGUIMIENTO)).toUpperCase();
  n.OBSERVACIONES = Utl_texto(v.OBSERVACIONES).trim();

  // --- Tipo de evento (opcional en la fuente) ---
  n.TIPO_EVENTO = Norm_normalizarTipoEvento(v.TIPO_EVENTO);
  if (!Utl_vacio(v.TIPO_EVENTO) && TIPOS_EVENTO.VALIDOS.indexOf(n.TIPO_EVENTO) === -1) {
    nota(err, 'TIPO_EVENTO', 'Tipo de evento inválido: "' + Utl_texto(v.TIPO_EVENTO) + '"');
  }

  fila.NORMALIZADO = n;
  fila.ERRORES = err;
  fila.WARNINGS = warn;
  fila.ESTADO_VALIDACION = err.length ? 'ERROR' : (warn.length ? 'WARNING' : 'OK');
  return fila;
}

/** Puerta final: solo filas OK/WARNING avanzan hacia identificación/eventos. */
function Fuentes_validar(fila) {
  return fila && (fila.ESTADO_VALIDACION === 'OK' || fila.ESTADO_VALIDACION === 'WARNING');
}

// ---------------------------------------------------------------------------
// ETAPA 5 — Conexión a fuentes reales en Drive
// ---------------------------------------------------------------------------

/**
 * Diagnóstico estructural de TODAS las fuentes reales sin procesar datos.
 * Lee encabezados de cada hoja configurada y reporta el mapeo al modelo.
 * @returns {ok:boolean, fuentes:[{nombre, sector, id, hojas:[...]}]}
 */
function Fuentes_diagnosticarFuentes() {
  var fuentes = [];
  Object.keys(FUENTES_DRIVE).forEach(function (nombreArchivo) {
    var cfg = FUENTES_DRIVE[nombreArchivo];
    var info = {
      nombre: nombreArchivo,
      sector: cfg.sector,
      id: cfg.id,
      accesible: false,
      hojas: []
    };
    if (!cfg.id) {
      info.motivo = 'Sin ID de spreadsheet (Excel no subido a Drive)';
      fuentes.push(info);
      return;
    }
    try {
      var ss = SpreadsheetApp.openById(cfg.id);
      info.accesible = true;
      info.nombreReal = ss.getName();
      cfg.hojas.forEach(function (nombreHoja) {
        var hoja = ss.getSheetByName(nombreHoja);
        if (!hoja) {
          info.hojas.push({ nombre: nombreHoja, existe: false });
          return;
        }
        var valores = Utl_leerBloque(hoja);
        if (!valores.length) {
          info.hojas.push({ nombre: nombreHoja, existe: true, vacia: true });
          return;
        }
        // detectar fila de encabezado (primera con ≥3 campos reconocibles)
        var headerRow = 0;
        for (var r = 0; r < Math.min(valores.length, 10); r++) {
          var reconocidos = valores[r].filter(function (c) {
            return Norm_mapearEncabezado(c).conocido;
          }).length;
          if (reconocidos >= 2) { headerRow = r; break; }
        }
        var mapa = Ingresos_mapearEncabezadosHoja(valores[headerRow] || []);
        // contar filas de datos reales (no vacías ni separadores)
        var filasDatos = 0;
        var sect_re = /^[A-ZÁÉÍÓÚÑ ]+\s?20\d{2}\s*$|^ECICEP\s*20\d{2}\s*$/i;
        for (var d = headerRow + 1; d < valores.length; d++) {
          var noVacios = valores[d].filter(function (c) { return Utl_texto(c).trim() !== ''; }).length;
          if (noVacios === 0) continue;
          if (noVacios === 1 && sect_re.test(Utl_colapsarEspacios(Utl_texto(valores[d].find(function(c){return Utl_texto(c).trim()!=='';}))))) continue;
          filasDatos += 1;
        }
        info.hojas.push({
          nombre: nombreHoja,
          existe: true,
          encabezadoFila: headerRow + 1,
          columnasReconocidas: Object.keys(mapa.campos),
          columnasFaltantes: CAMPOS_INGRESO_OPERATIVOS.filter(function (c) { return mapa.campos[c] === undefined; }),
          desconocidas: mapa.desconocidos.map(function (d) { return d.texto; }),
          filasDatosAprox: filasDatos
        });
      });
    } catch (e) {
      info.error = e && e.message ? e.message : String(e);
    }
    fuentes.push(info);
  });
  return { ok: true, fuentes: fuentes };
}

/** Ejecuta diagnóstico de fuentes vía webhook. */
function Fuentes_diagnosticarFuentesJson() {
  return _wh_salida(Fuentes_diagnosticarFuentes());
}

/**
 * ETAPA 5b — Importación controlada de una muestra de una fuente real.
 * Lee N filas desde una hoja del Excel original (en Drive), las procesa
 * por el pipeline completo pero en modo DRY RUN: no escribe nada.
 * @param {string} nombreArchivo clave de FUENTES_DRIVE
 * @param {string} nombreHoja hoja a importar
 * @param {number} cantidad filas a procesar (default 10)
 * @returns reporte detallado sin escrituras
 */
function Fuentes_importarMuestra(nombreArchivo, nombreHoja, cantidad) {
  var cfg = FUENTES_DRIVE[nombreArchivo];
  if (!cfg) return { ok: false, motivo: 'ARCHIVO_DESCONOCIDO', archivos: Object.keys(FUENTES_DRIVE) };
  if (!cfg.id) return { ok: false, motivo: 'SIN_ID_DRIVE' };

  var ss = SpreadsheetApp.openById(cfg.id);
  var hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) return { ok: false, motivo: 'HOJA_NO_EXISTE', disponible: ss.getSheets().map(function(s){return s.getName();}) };

  var valores = Utl_leerBloque(hoja);
  if (valores.length < 2) return { ok: false, motivo: 'HOJA_VACIA' };

  // detectar fila de encabezado
  var headerRow = 0;
  for (var r = 0; r < Math.min(valores.length, 10); r++) {
    var reconocidos = valores[r].filter(function (c) {
      return Norm_mapearEncabezado(c).conocido;
    }).length;
    if (reconocidos >= 2) { headerRow = r; break; }
  }
  var mapa = Ingresos_mapearEncabezadosHoja(valores[headerRow] || []);

  // leer hasta `cantidad` filas de datos reales
  var sect_re = /^[A-ZÁÉÍÓÚÑ ]+\s?20\d{2}\s*$|^ECICEP\s*20\d{2}\s*$/i;
  var staging = [];
  for (var d = headerRow + 1; d < valores.length && staging.length < cantidad; d++) {
    var filaVal = valores[d];
    var noVacios = filaVal.filter(function (c) { return Utl_texto(c).trim() !== ''; }).length;
    if (noVacios === 0) continue;
    // saltar separadores de sección
    var primerValor = Utl_colapsarEspacios(Utl_texto(filaVal.find(function(c){return Utl_texto(c).trim()!=='';})));
    // separador: 1-3 celdas no vacías y alguna coincide con patrón de sección
    if (noVacios <= 3 && sect_re.test(primerValor)) continue;
    // construir valores canónicos
    var v = {};
    CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
      if (mapa.campos[c] !== undefined) v[c] = filaVal[mapa.campos[c]];
    });
    // Si no hay RUT mapeado pero la primera columna tiene valores tipo RUT,
    // asignarla (caso LISTADO 2025 de Naranjo donde la col A no tiene encabezado)
    if (v.RUT === undefined || Utl_vacio(v.RUT)) {
      for (var ci = 0; ci < Math.min(filaVal.length, 3); ci++) {
        var testRut = Norm_normalizarRut(filaVal[ci]);
        if (testRut.estado === 'OK' || testRut.estado === 'SIN_DV') {
          v.RUT = filaVal[ci];
          break;
        }
      }
    }
    staging.push(Fuentes_normalizar(Fuentes_crearFila(
      { archivo: nombreArchivo, hoja: nombreHoja, fila: d + 1, sector: cfg.sector }, v)));
  }

  // pipeline DRY RUN (no escribe nada)
  var store = { pacientes: [], eventos: [] }; // store vacío = todo será "nuevo"
  var salida = Ingresos_procesarFilas(staging, store, {
    nuevoId: function (i) { return 'DRY-' + ('0000' + i).slice(-4); }
  });

  return {
    ok: true,
    dryRun: true,
    fuente: nombreArchivo,
    hoja: nombreHoja,
    sector: cfg.sector,
    encabezadoFila: headerRow + 1,
    resumen: salida.resumen,
    detalle: staging.map(function (f, i) {
      return {
        filaOrigen: f.FILA_ORIGEN,
        estado: f.ESTADO_VALIDACION,
        rut: f.NORMALIZADO.RUT || '',
        nombre: (f.NORMALIZADO.NOMBRE || '').substring(0, 30),
        sector: f.NORMALIZADO.SECTOR,
        estratificacion: f.NORMALIZADO.ESTRATIFICACION,
        errores: f.ERRORES.map(function(e){ return e.campo+': '+e.mensaje; }),
        warnings: f.WARNINGS.map(function(w){ return w.campo+': '+w.mensaje; }),
        gate: salida.resultados[i] ? salida.resultados[i].estado : '?',
        idProvisional: f.ID_PROVISIONAL
      };
    })
  };
}

function _fuentes_columnasStaging() {
  return ['ID_PROVISIONAL', 'ARCHIVO_ORIGEN', 'HOJA_ORIGEN', 'FILA_ORIGEN', 'SECTOR_ORIGEN',
          'ESTADO_VALIDACION', 'ERRORES', 'WARNINGS', 'IDENTIFICACION',
          'VALORES_ORIGINALES', 'NORMALIZADO', 'FUENTE'];
}

/** Guarda filas de staging por lotes. Solo GAS; en node devuelve 0. */
function Fuentes_guardarFilas(filas) {
  try {
    if (typeof SpreadsheetApp === 'undefined' || !filas || !filas.length) return 0;
    var ss = Modelo_ss();
    var hoja = ss.getSheetByName(HOJAS.STAGING_IMPORT);
    if (!hoja) return 0;
    var salida = filas.map(function (f) {
      return [
        f.ID_PROVISIONAL, f.ARCHIVO_ORIGEN, f.HOJA_ORIGEN, f.FILA_ORIGEN, f.SECTOR_ORIGEN,
        f.ESTADO_VALIDACION,
        JSON.stringify(f.ERRORES || []), JSON.stringify(f.WARNINGS || []),
        JSON.stringify(f.RESULTADO_IDENTIFICACION || {}),
        JSON.stringify(f.VALORES_ORIGINALES || {}), JSON.stringify(f.NORMALIZADO || {}),
        Fuentes_fuenteOrigen(f)
      ];
    });
    return Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, salida);
  } catch (e) {
    Log_error('Fuentes', 'guardarFilas', e && e.message ? e.message : String(e));
    Log_flush();
    return 0;
  }
}

// ---------------------------------------------------------------------------
// ETAPA 5 — Carga real controlada (análisis + ejecución con idempotencia)
// ---------------------------------------------------------------------------

/**
 * Orquestador de carga real controlada desde las fuentes autorizadas.
 * @param {Object} opciones {ejecutar:boolean}
 *   ejecutar=false → DRY RUN: analiza, reporta, NO escribe
 *   ejecutar=true  → IMPORTA: escribe PACIENTES + EVENTOS con idempotencia
 * @returns {ok, ejecucionId, dryRun, resumen, detalle[], excluidas[]}
 */
function Fuentes_cargaReal(opciones) {
  opciones = opciones || {};
  var ejecucionId = 'CARGA-' + Date.now().toString(36).toUpperCase();
  var t0 = Date.now();

  // --- FASE 5.0: snapshot previo ---
  var previo = { pacientes: 0, eventos: 0 };
  if (typeof SpreadsheetApp !== 'undefined') {
    var hp = Modelo_hoja(HOJAS.PACIENTES);
    var he = Modelo_hoja(HOJAS.EVENTOS);
    previo.pacientes = hp ? Math.max(hp.getLastRow() - 1, 0) : 0;
    previo.eventos = he ? Math.max(he.getLastRow() - 1, 0) : 0;
  }

  // --- FASE 5.1: leer fuentes autorizadas → staging ---
  var staging = [];
  Object.keys(HOJAS_AUTORIZADAS_CARGA).forEach(function (nombreArchivo) {
    var cfg = FUENTES_DRIVE[nombreArchivo];
    if (!cfg || !cfg.id) return;
    var ss = SpreadsheetApp.openById(cfg.id);
    HOJAS_AUTORIZADAS_CARGA[nombreArchivo].forEach(function (nombreHoja) {
      var hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;
      var valores = Utl_leerBloque(hoja);
      if (valores.length < 2) return;

      // detectar encabezado
      var headerRow = 0;
      for (var r = 0; r < Math.min(valores.length, 10); r++) {
        var rec = valores[r].filter(function (c) { return Norm_mapearEncabezado(c).conocido; }).length;
        if (rec >= 2) { headerRow = r; break; }
      }
      var mapa = Ingresos_mapearEncabezadosHoja(valores[headerRow] || []);

      var sect_re = /^[A-ZÁÉÍÓÚÑ ]+\s?20\d{2}\s*$|^ECICEP\s*20\d{2}\s*$/i;
      for (var d = headerRow + 1; d < valores.length; d++) {
        var filaVal = valores[d];
        var noVacios = filaVal.filter(function (c) { return Utl_texto(c).trim() !== ''; }).length;
        if (noVacios === 0) continue;
        var primerValor = Utl_colapsarEspacios(Utl_texto(filaVal.find(function(c){return Utl_texto(c).trim()!=='';})));
        if (noVacios <= 3 && sect_re.test(primerValor)) continue;

        var v = {};
        CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
          if (mapa.campos[c] !== undefined) v[c] = filaVal[mapa.campos[c]];
        });
        // RUT sin encabezado (LISTADO Naranjo pattern)
        if (Utl_vacio(v.RUT)) {
          for (var ci = 0; ci < Math.min(filaVal.length, 3); ci++) {
            var testRut = Norm_normalizarRut(filaVal[ci]);
            if (testRut.estado === 'OK' || testRut.estado === 'SIN_DV') { v.RUT = filaVal[ci]; break; }
          }
        }
        staging.push(Fuentes_normalizar(Fuentes_crearFila(
          { archivo: nombreArchivo, hoja: nombreHoja, fila: d + 1, sector: cfg.sector }, v)));
      }
    });
  });

  // --- IDEMPOTENCIA: filtrar filas ya importadas ---
  var eventosExistentes = [];
  if (typeof Modelo_leerEventos === 'function') eventosExistentes = Modelo_leerEventos();
  var fuentesYaImportadas = {};
  eventosExistentes.forEach(function (e) {
    var f = Utl_texto(e.FUENTE);
    if (f) fuentesYaImportadas[f] = true;
  });
  var yaImportadas = 0;
  staging = staging.filter(function (f) {
    var clave = Fuentes_fuenteOrigen(f);
    if (fuentesYaImportadas[clave]) { yaImportadas += 1; return false; }
    return true;
  });

  // --- FASE 5.2-3: validación + identificación ---
  var store = { pacientes: [], eventos: [] };
  if (opciones.ejecutar && typeof Modelo_leerPacientes === 'function') {
    store.pacientes = Modelo_leerPacientes();
  }

  var salida = Ingresos_procesarFilas(staging, store, {
    nuevoId: typeof Modelo_nuevoIdInterno === 'function' ? Modelo_nuevoIdInterno : function (i) {
      return 'EC-' + ('000000' + i).slice(-6);
    }
  });

  // --- FASE 5.4: reporte ---
  var resumen = salida.resumen;
  resumen.yaImportadas = yaImportadas;
  resumen.previo = previo;
  resumen.ejecucion = ejecucionId;
  resumen.ms = Date.now() - t0;

  var resultado = {
    ok: true,
    dryRun: !opciones.ejecutar,
    ejecucionId: ejecucionId,
    resumen: resumen,
    excluidas: FUENTES_EXCLUIDAS,
    detalle: staging.map(function (f, i) {
      return {
        fuenteOrigen: Fuentes_fuenteOrigen(f),
        hoja: f.HOJA_ORIGEN,
        fila: f.FILA_ORIGEN,
        estado: f.ESTADO_VALIDACION,
        nombre: (f.NORMALIZADO.NOMBRE || '').substring(0, 30),
        rut: f.NORMALIZADO.RUT,
        sector: f.NORMALIZADO.SECTOR,
        gate: salida.resultados[i] ? salida.resultados[i].estado : '?',
        nota: salida.resultados[i] ? salida.resultados[i].nota : ''
      };
    })
  };

  Log_info('Fuentes', opciones.ejecutar ? 'cargaReal' : 'cargaAnalisis',
    JSON.stringify({ leidos: resumen.leidos, nuevos: resumen.nuevos, existentes: resumen.existentes,
                     revision: resumen.revision, conError: resumen.conError, yaImportadas: yaImportadas }),
    { ejecucion: ejecucionId });

  // --- FASE 5.5: GATE — solo escribir si explícitamente se pide ---
  if (!opciones.ejecutar) return resultado;

  // --- FASE 5.6: IMPORTACIÓN ---
  if (typeof Modelo_agregarPacientes === 'function' && salida.pacientesNuevos.length) {
    Modelo_agregarPacientes(salida.pacientesNuevos);
  }
  if (typeof Modelo_agregarEventos === 'function' && salida.eventos.length) {
    Modelo_agregarEventos(salida.eventos, _ingresosUsuarioActual());
  }

  // auditoría a STAGING_IMPORT
  Fuentes_guardarFilas(staging);

  // --- FASE 5.8: refrescar vistas sectoriales ---
  if (typeof Modelo_refrescarVistasSectores === 'function') {
    resultado.vistasSector = Modelo_refrescarVistasSectores();
  }

  Log_flush();
  return resultado;
}

/**
 * Webhook action: análisis de carga real (DRY RUN).
 */
function Fuentes_analizarCarga() {
  return Fuentes_cargaReal({ ejecutar: false });
}

/**
 * Webhook action: ejecución de carga real (IMPORTA).
 */
function Fuentes_ejecutarCarga() {
  return Fuentes_cargaReal({ ejecutar: true });
}
