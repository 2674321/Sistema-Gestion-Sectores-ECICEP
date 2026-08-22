/**
 * Sistema ECICEP Unificado — 06_Modelo
 * Acceso a la base PACIENTES y creación de la estructura del Spreadsheet.
 * Única puerta de entrada a las hojas del sistema para el resto de módulos.
 */

var _MODELO_SS = null;

/** Spreadsheet activo (ligado) con fallback por ID. */
function Modelo_ss() {
  if (_MODELO_SS) return _MODELO_SS;
  _MODELO_SS = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ECICEP.SPREADSHEET_ID);
  return _MODELO_SS;
}

function Modelo_hoja(nombre) {
  return Modelo_ss().getSheetByName(nombre);
}

/** Nombres de columnas del modelo en orden. */
function Modelo_campos() {
  return MODELO_PACIENTE.map(function (c) { return c.campo; });
}

/**
 * Genera un ID interno único: EC-<base36 tiempo>-<aleatorio>.
 * No depende de RUT (permite corregir un RUT sin romper referencias).
 */
function Modelo_nuevoIdInterno() {
  var t = Date.now().toString(36).toUpperCase();
  var r = Math.floor(Math.random() * 1679616).toString(36).toUpperCase(); // 36^4
  while (r.length < 4) r = '0' + r;
  return 'EC-' + t + '-' + r;
}

// ---------------------------------------------------------------------------
// Instalación / reparación de estructura (idempotente)
// ---------------------------------------------------------------------------

var _MODELO_HOJAS_DEF = {};
_MODELO_HOJAS_DEF[HOJAS.CONFIG] = ['CLAVE', 'VALOR', 'DESCRIPCION'];
_MODELO_HOJAS_DEF[HOJAS.PACIENTES] = null; // usa MODELO_PACIENTE
_MODELO_HOJAS_DEF[HOJAS.STAGING_IMPORT] = ['ID_PROVISIONAL', 'ARCHIVO_ORIGEN', 'HOJA_ORIGEN', 'FILA_ORIGEN', 'SECTOR_ORIGEN', 'ESTADO_VALIDACION', 'ERRORES', 'WARNINGS', 'IDENTIFICACION', 'VALORES_ORIGINALES', 'NORMALIZADO', 'FUENTE'];
_MODELO_HOJAS_DEF[HOJAS.EVENTOS] = COLUMNAS_EVENTOS;
// Puertas de entrada por sector (contrato único INGRESO_COLUMNAS, DEC-029)
Object.keys(HOJAS_INGRESO).forEach(function (h) { _MODELO_HOJAS_DEF[h] = INGRESO_COLUMNAS; });
// Vistas operativas sectoriales (derivadas de PACIENTES — nunca bases independientes)
HOJAS_SECTOR.forEach(function (h) { _MODELO_HOJAS_DEF[h] = COLUMNAS_SECTOR_VISTA; });
_MODELO_HOJAS_DEF[HOJAS.LOG] = ['FECHA', 'NIVEL', 'MODULO', 'OPERACION', 'MENSAJE', 'DURACION_MS', 'CONTEXTO'];
_MODELO_HOJAS_DEF[HOJAS.CONFLICTOS] = ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE', 'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR'];
_MODELO_HOJAS_DEF[HOJAS.FUENTES] = ['ARCHIVO', 'SECTOR', 'HOJAS', 'ESTADO_REGISTRO', 'ULTIMA_LECTURA', 'OBSERVACIONES'];

var _CONFIG_SEMILLA = [
  ['VERSION', ECICEP.VERSION, 'Versión del sistema instalada'],
  ['AMBIENTE', ECICEP.AMBIENTE, 'DESARROLLO | PRODUCCION'],
  ['SPREADSHEET_ID', ECICEP.SPREADSHEET_ID, 'ID de este spreadsheet'],
  ['NIVEL_LOG', CFG_LOG.NIVEL, 'DEBUG | INFO | WARNING | ERROR'],
  ['TTL_CACHE_SEG', CFG_CACHE.TTL_DEFECTO_SEG, 'TTL por defecto de caché (segundos)'],
  ['ANO_MIN_FECHAS', CFG_FECHAS.ANO_MIN, 'Año mínimo plausible para fechas'],
  ['ANO_MAX_FECHAS', CFG_FECHAS.ANO_MAX, 'Año máximo plausible para fechas'],
  ['RESPONSABLE_NARANJO', '', 'Correo del responsable del sector (pendiente #13)'],
  ['RESPONSABLE_AMARILLO', '', 'Correo del responsable del sector (pendiente #13)'],
  ['RESPONSABLE_VERDE', '', 'Correo del responsable del sector (pendiente #13)']
];

/**
 * Crea/repara las hojas del sistema sin tocar datos existentes.
 * Elimina "Hoja 1" SOLO si existe y está completamente vacía.
 * @returns {creadas:[], existentes:[], hojaPredeterminadaEliminada:boolean}
 */
function Modelo_crearEstructura() {
  var res = { creadas: [], existentes: [], hojaPredeterminadaEliminada: false };
  var ss = Modelo_ss();

  Object.keys(_MODELO_HOJAS_DEF).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      res.creadas.push(nombre);
      var encabezados = _MODELO_HOJAS_DEF[nombre] || Modelo_campos();
      Utl_escribirBloque(hoja, 1, 1, [encabezados]);
    } else {
      res.existentes.push(nombre);
    }
  });

  _modelo_formatearPacientes(ss.getSheetByName(HOJAS.PACIENTES));
  _modelo_sembrarConfig(ss.getSheetByName(HOJAS.CONFIG), res.creadas.indexOf(HOJAS.CONFIG) !== -1);

  // Hoja predeterminada: eliminar solo si vacía (regla de no destrucción)
  var hoja0 = ss.getSheetByName(HOJAS.HOJA_PREDETERMINADA);
  if (hoja0 && ss.getSheets().length > 1) {
    var datos = hoja0.getDataRange().getValues();
    var vacia = datos.every(function (fila) { return fila.every(function (c) { return c === ''; }); });
    if (vacia) { ss.deleteSheet(hoja0); res.hojaPredeterminadaEliminada = true; }
  }

  Log_info('Modelo', 'crearEstructura', 'creadas=' + res.creadas.join(',') + ' existentes=' + res.existentes.join(','));
  Log_flush();
  return res;
}

/** Formato base de PACIENTES: encabezado fijo, anchos, fechas, técnicas ocultas. */
function _modelo_formatearPacientes(hoja) {
  if (!hoja) return;
  hoja.setFrozenRows(1);
  var rangoEnc = hoja.getRange(1, 1, 1, MODELO_PACIENTE.length);
  rangoEnc.setFontWeight('bold').setBackground('#0b5394').setFontColor('#ffffff');

  // Anchos razonables según tipo
  for (var i = 0; i < MODELO_PACIENTE.length; i++) {
    var tipo = MODELO_PACIENTE[i].tipo;
    var ancho = (tipo === 'fecha') ? 100 : (tipo === 'enum' ? 110 : (tipo === 'bool' ? 90 : 160));
    hoja.setColumnWidth(i + 1, ancho);
    if (tipo === 'fecha') {
      hoja.getRange(2, i + 1, hoja.getMaxRows() - 1, 1).setNumberFormat(CFG_FECHAS.FORMATO_HOJA);
    }
  }

  // Columnas técnicas: agrupadas y ocultas (visibles solo si el usuario expande)
  var primeraTecnica = -1, contador = 0;
  for (var j = 0; j < MODELO_PACIENTE.length; j++) {
    if (MODELO_PACIENTE[j].tecnico) {
      if (primeraTecnica === -1) primeraTecnica = j + 1;
      contador++;
    }
  }
  if (primeraTecnica > 0 && contador > 0) {
    try {
      hoja.getRange(1, primeraTecnica, 1, contador).shiftColumnGroupDepth(1);
      var grupo = hoja.getColumnGroup(primeraTecnica, contador);
      grupo.collapse();
    } catch (e) {
      hoja.hideColumns(primeraTecnica, contador); // fallback seguro
    }
  }
}

/** Siembra CONFIG solo si la hoja es nueva o no tiene las claves base. */
function _modelo_sembrarConfig(hoja, esNueva) {
  if (!hoja) return;
  var existentes = {};
  if (!esNueva && hoja.getLastRow() > 1) {
    Utl_leerBloque(hoja).slice(1).forEach(function (f) { existentes[f[0]] = true; });
  }
  var filas = _CONFIG_SEMILLA.filter(function (f) { return esNueva || !existentes[f[0]]; });
  if (filas.length) {
    var inicio = hoja.getLastRow() + 1;
    Utl_escribirBloque(hoja, Math.max(inicio, 2), 1, filas);
  }
}

// ---------------------------------------------------------------------------
// Lectura de la base (por bloques + índices en memoria)
// ---------------------------------------------------------------------------

/** Lee PACIENTES completo como array de objetos canónicos. */
function Modelo_leerPacientes() {
  var hoja = Modelo_hoja(HOJAS.PACIENTES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var valores = Utl_leerBloque(hoja);
  var campos = valores[0];
  var salida = [];
  for (var f = 1; f < valores.length; f++) {
    var obj = {};
    for (var c = 0; c < campos.length; c++) obj[campos[c]] = valores[f][c];
    salida.push(obj);
  }
  return salida;
}

/** Map RUT normalizado → índice dentro del array de Modelo_leerPacientes. */
function Modelo_indicePorRut(pacientes) {
  return Utl_mapaPor(pacientes, function (p) { return Utl_texto(p.RUT); });
}

// ---------------------------------------------------------------------------
// Escrituras por lotes (ETAPA 3b) — solo entorno GAS
// ---------------------------------------------------------------------------

/** Convierte un objeto canónico a fila según orden MODELO_PACIENTE. */
function Modelo_filaDesdeObjeto(obj) {
  return Modelo_campos().map(function (campo) {
    var v = obj[campo];
    return (v === undefined || v === null) ? '' : v;
  });
}

/**
 * HARD GUARD: toda escritura a PACIENTES/EVENTOS exige un contexto
 * de autorización explícito. Sin él → WRITE_BLOCKED (DEC-033).
 */
var _AUTORIZACION_IMPORT = 'IMPORT_AUTORIZADO';

function Modelo_guardEscritura(contexto) {
  if (!contexto || contexto.autorizacion !== _AUTORIZACION_IMPORT) {
    var msg = 'WRITE_BLOCKED_IN_DRY_RUN: se intentó ' + (contexto && contexto.operacion ? contexto.operacion : 'escritura') +
              ' sin autorización IMPORT_AUTORIZADO';
    Log_error('Modelo', 'guardEscritura', msg);
    throw new Error(msg);
  }
}

/**
 * Agrega pacientes nuevos en UNA escritura. Los objetos deben venir completos
 * desde la capa de ingresos; aquí solo se fija FECHA_ACTUALIZACION.
 * @param {Array} objetos pacientes canónicos
 * @param {Object} [contexto] REQUERIDO: {autorizacion:'IMPORT_AUTORIZADO', operacion:'...'}
 */
function Modelo_agregarPacientes(objetos, contexto) {
  Modelo_guardEscritura(contexto || {});
  if (!objetos || !objetos.length) return 0;
  var ahora = new Date();
  var filas = objetos.map(function (o) {
    o.FECHA_ACTUALIZACION = ahora;
    return Modelo_filaDesdeObjeto(o);
  });
  var hoja = Modelo_hoja(HOJAS.PACIENTES);
  return Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, filas);
}

/**
 * Agrega eventos en UNA escritura respetando append-only.
 * @param {Array} eventos
 * @param {string} registradoPor
 * @param {Object} [contexto] REQUERIDO: {autorizacion:'IMPORT_AUTORIZADO'}
 */
function Modelo_agregarEventos(eventos, registradoPor, contexto) {
  Modelo_guardEscritura(contexto || {});
  if (!eventos || !eventos.length) return 0;
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(HOJAS.EVENTOS);
  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.EVENTOS);
    Utl_escribirBloque(hoja, 1, 1, [COLUMNAS_EVENTOS]);
  }
  var ahora = new Date();
  var filas = eventos.map(function (ev) {
    ev.FECHA_REGISTRO = ahora;
    ev.REGISTRADO_POR = ev.REGISTRADO_POR || registradoPor || '';
    return COLUMNAS_EVENTOS.map(function (c) {
      var v = ev[c];
      return (v === undefined || v === null) ? '' : v;
    });
  });
  return Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, filas);
}

/**
 * Agrega casos a la cola de revisión (CONFLICTOS) en UNA escritura.
 * Omite casos cuyo idProvisional ya tenga un ABIERTO previo (idempotente).
 */
function Modelo_agregarConflictos(filas, idProvisionalKey) {
  if (!filas || !filas.length) return 0;
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(HOJAS.CONFLICTOS);
  if (!hoja) return 0;
  var existentes = {};
  if (hoja.getLastRow() > 1) {
    Utl_leerBloque(hoja).slice(1).forEach(function (f) {
      try { existentes[JSON.parse(f[5]).idProvisional] = true; } catch (e) { /* fila antigua */ }
    });
  }
  var nuevos = filas.filter(function (f) { return !existentes[idProvisionalKey(f)]; });
  if (!nuevos.length) return 0;
  return Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, nuevos);
}

// ---------------------------------------------------------------------------
// Ficha de paciente (ETAPA 4)
// ---------------------------------------------------------------------------

var _FICHA_CAMPOS_OPERATIVOS = ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO',
  'TELEFONOS', 'TELEFONO_OBS', 'SECTOR', 'ESTRATIFICACION', 'ESTADO', 'DUPLA_INGRESO',
  'PROFESIONAL_SEGUIMIENTO', 'PREINGRESO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO',
  'ULTIMO_CONTROL', 'PROXIMO_CONTROL', 'COMPOSICION_CONTROL', 'OBSERVACIONES'];

/**
 * Ficha consolidada: datos operativos del paciente + historial desde EVENTOS
 * (orden cronológico ascendente). Lee siempre desde las bases centrales.
 */
function Modelo_fichaPaciente(idInterno) {
  var pacientes = Modelo_leerPacientes();
  var paciente = null;
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { paciente = pacientes[i]; break; }
  }
  if (!paciente) return null;

  var eventos = Modelo_leerEventos().filter(function (e) {
    return Utl_texto(e.ID_INTERNO) === Utl_texto(idInterno);
  }).sort(function (a, b) {
    return Utl_texto(a.FECHA_EVENTO) < Utl_texto(b.FECHA_EVENTO) ? -1 :
           Utl_texto(a.FECHA_EVENTO) > Utl_texto(b.FECHA_EVENTO) ? 1 : 0;
  });

  var ficha = {};
  _FICHA_CAMPOS_OPERATIVOS.forEach(function (c) { ficha[c] = paciente[c]; });
  ficha.EDAD = Utl_edadDesde(paciente.FECHA_NACIMIENTO);
  ficha.eventos = eventos.map(function (e) {
    return { fecha: e.FECHA_EVENTO, tipo: e.TIPO_EVENTO, sector: e.SECTOR,
             riesgo: e.RIESGO_G, profesional: e.PROFESIONAL, descripcion: e.DESCRIPCION };
  });
  return ficha;
}

// ---------------------------------------------------------------------------
// Limpieza de datos de prueba (ETAPA 4.0)
// ---------------------------------------------------------------------------

/** PURA: true si el paciente es eliminable como dato de prueba.
 *  Exige AMBAS señales: RUT dentro del set de prueba Y origen = HOJA_INGRESO. */
function Limpieza_esPacienteDePrueba(paciente, rutsPrueba) {
  var fuente = Utl_texto(paciente.FUENTE);
  if (fuente.indexOf('HOJA_INGRESO') !== 0) return false;
  return rutsPrueba.indexOf(Utl_texto(paciente.RUT).toUpperCase()) !== -1;
}

/**
 * GAS: recolecta las filas de INGRESO_* marcadas con la marca de prueba.
 * @returns {ruts:[], hojas:{hoja:[filasSheet]}, totalFilas:number}
 */
function Limpieza_colectar() {
  var ruts = [], hojas = {}, totalFilas = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (nombreHoja) {
    var hoja = Modelo_ss().getSheetByName(nombreHoja);
    if (!hoja) return;
    var valores = Utl_leerBloque(hoja);
    if (valores.length < 2) return;
    var idxRut = -1, idxNombre = -1, idxNota = -1;
    (valores[0] || []).forEach(function (h, i) {
      var clave = Utl_claveAlnum(h);
      if (clave === 'RUT') idxRut = i;
      else if (clave === 'NOMBRE') idxNombre = i;
      else if (clave === 'NOTASISTEMA') idxNota = i;
    });
    for (var f = 1; f < valores.length; f++) {
      var nota = idxNota >= 0 ? Utl_texto(valores[f][idxNota]) : '';
      if (nota.indexOf(MARCA_DATOS_PRUEBA) === -1) continue;
      var rutNorm = Norm_normalizarRut(idxRut >= 0 ? valores[f][idxRut] : '');
      if (rutNorm.rut) ruts.push(rutNorm.rut.toUpperCase());
      if (!hojas[nombreHoja]) hojas[nombreHoja] = [];
      hojas[nombreHoja].push(f + 1); // fila real en la hoja
      totalFilas += 1;
    }
  });
  return { ruts: ruts, hojas: hojas, totalFilas: totalFilas };
}

/**
 * Ejecuta la limpieza tras confirmación humana:
 * elimina SOLO pacientes/eventos identificados como prueba y las filas
 * marcadas en INGRESO_*. Refresca vistas al terminar.
 */
function Limpieza_ejecutar(colecta) {
  var resumen = { pacientes: 0, eventos: 0, filasIngreso: colecta.totalFilas };
  var ss = Modelo_ss();

  // PACIENTES: reescribe sin los de prueba
  var pacientes = Modelo_leerPacientes();
  var conservarP = pacientes.filter(function (p) { return !Limpieza_esPacienteDePrueba(p, colecta.ruts); });
  resumen.pacientes = pacientes.length - conservarP.length;
  var idsEliminados = {};
  pacientes.forEach(function (p) {
    if (!Limpieza_esPacienteDePrueba(p, colecta.ruts)) return;
    idsEliminados[Utl_texto(p.ID_INTERNO)] = true;
  });

  // EVENTOS: elimina solo los ligados a pacientes de prueba eliminados
  var eventos = Modelo_leerEventos();
  var conservarE = eventos.filter(function (e) {
    var porId = idsEliminados[Utl_texto(e.ID_INTERNO)];
    var porRut = colecta.ruts.indexOf(Utl_texto(e.RUT).toUpperCase()) !== -1;
    var esIngresoHoja = Utl_texto(e.FUENTE).indexOf('HOJA_INGRESO') === 0;
    return !(esIngresoHoja && (porId || porRut));
  });
  resumen.eventos = eventos.length - conservarE.length;

  // reescritura batch
  var hojaP = Modelo_hoja(HOJAS.PACIENTES);
  hojaP.getRange(2, 1, Math.max(hojaP.getMaxRows() - 1, 1), MODELO_PACIENTE.length).clearContent();
  if (conservarP.length) {
    Utl_escribirBloque(hojaP, 2, 1, conservarP.map(Modelo_filaDesdeObjeto));
  }
  var hojaE = Modelo_hoja(HOJAS.EVENTOS);
  if (hojaE) {
    hojaE.getRange(2, 1, Math.max(hojaE.getMaxRows() - 1, 1), COLUMNAS_EVENTOS.length).clearContent();
    if (conservarE.length) {
      Utl_escribirBloque(hojaE, 2, 1, conservarE.map(function (ev) {
        return COLUMNAS_EVENTOS.map(function (c) { return ev[c] === undefined ? '' : ev[c]; });
      }));
    }
  }

  // filas marcadas en INGRESO_* (de abajo hacia arriba para no desplazar índices)
  Object.keys(colecta.hojas).forEach(function (nombreHoja) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) return;
    colecta.hojas[nombreHoja].sort(function (a, b) { return b - a; }).forEach(function (filaSheet) {
      hoja.deleteRow(filaSheet);
    });
  });

  Modelo_refrescarVistasSectores();
  Log_info('Limpieza', 'ejecutar', JSON.stringify(resumen));
  Log_flush();
  return resumen;
}

// ---------------------------------------------------------------------------
// Vistas operativas SECTOR_* (derivadas de PACIENTES — corrección arquitectónica)
// ---------------------------------------------------------------------------

/**
 * PURA: filas de la vista para un sector, según COLUMNAS_SECTOR_VISTA.
 * Solo incluye pacientes cuyo SECTOR vigente coincida exactamente.
 * @param {Array} pacientes objetos canónicos
 * @param {string} sector NARANJO|AMARILLO|VERDE
 * @param {Map} [ultimoEventoMap] resultado de Ev_ultimoPorPaciente(eventos)
 */
function Modelo_vistaSectorDesdePacientes(pacientes, sector, ultimoEventoMap) {
  return (pacientes || [])
    .filter(function (p) { return Utl_texto(p.SECTOR).toUpperCase() === sector; })
    .map(function (p) {
      var ue = ultimoEventoMap ? ultimoEventoMap[Utl_texto(p.ID_INTERNO)] : null;
      return COLUMNAS_SECTOR_VISTA.map(function (c) {
        if (c === 'EDAD') return Utl_edadDesde(p.FECHA_NACIMIENTO);
        if (c === 'ULTIMO_EVENTO') return ue ? ue.etiqueta : '';
        var v = p[c];
        return (v === undefined || v === null) ? '' : v;
      });
    });
}

/**
 * Regenera el contenido de las tres hojas SECTOR_* desde PACIENTES + EVENTOS.
 * Sobrescribe SOLO el área de datos (fila 2+); los encabezados jamás se tocan.
 * @returns {SECTOR_NARANJO:n, SECTOR_AMARILLO:n, SECTOR_VERDE:n}
 */
function Modelo_refrescarVistasSectores() {
  var pacientes = Modelo_leerPacientes();
  var eventos = Modelo_leerEventos();
  var ultimo = Ev_ultimoPorPaciente(eventos);
  var conteo = {};
  HOJAS_SECTOR.forEach(function (nombreHoja) {
    var sector = nombreHoja.replace('SECTOR_', '');
    conteo[sector] = 0;
    var hoja = Modelo_ss().getSheetByName(nombreHoja);
    if (!hoja) return;
    // limpia área de datos completa antes de reescribir
    hoja.getRange(2, 1, Math.max(hoja.getMaxRows() - 1, 1), COLUMNAS_SECTOR_VISTA.length).clearContent();
    var filas = Modelo_vistaSectorDesdePacientes(pacientes, sector, ultimo);
    if (filas.length) Utl_escribirBloque(hoja, 2, 1, filas);
    conteo[sector] = filas.length;
  });
  return conteo;
}

/** Lee la hoja EVENTOS como objetos según COLUMNAS_EVENTOS. */
function Modelo_leerEventos() {
  var hoja = Modelo_hoja(HOJAS.EVENTOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var valores = Utl_leerBloque(hoja);
  var campos = valores[0];
  var salida = [];
  for (var f = 1; f < valores.length; f++) {
    var o = {};
    for (var c = 0; c < campos.length; c++) o[campos[c]] = valores[f][c];
    salida.push(o);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// ETAPA 5-INCIDENTE — Recuperación selectiva de carga accidental
// ---------------------------------------------------------------------------

/**
 * Identifica registros creados por una ejecución de carga accidental.
 * Criterio: FUENTE empieza con el nombre del archivo fuente (no HOJA_INGRESO)
 * y el registro no existía antes (no tiene marca de prueba).
 * @param {string} prefijoFuente ej: 'ECICEP NARANJO|' o 'PCTS. ECICEP DESDE 2023|'
 * @returns {pacientes:[{fila,idx,objet}], eventos:[{fila,idx,objet}]}
 */
function Recuperar_identificar(prefijoFuente) {
  var pacientes = Modelo_leerPacientes();
  var eventos = Modelo_leerEventos();

  // eventos creados desde fuentes reales (FUENTE contiene '|' con archivo|hoja|fila)
  var evAfectados = [];
  eventos.forEach(function (e, idx) {
    var f = Utl_texto(e.FUENTE);
    if (f.indexOf('HOJA_INGRESO') === 0) return; // de flujo manual, no incidente
    if (f.indexOf('|') !== -1 && f.toUpperCase().indexOf(Utl_texto(prefijoFuente).toUpperCase()) === 0) {
      evAfectados.push({ fila: idx + 2, idx: idx, objet: e });
    }
  });

  // IDs de pacientes afectados = IDs que aparecen en los eventos afectados
  var idsAfectados = {};
  evAfectados.forEach(function (e) { idsAfectados[Utl_texto(e.objet.ID_INTERNO)] = true; });

  // pacientes afectados = los cuyo ID está en el set O cuyo RUT aparece en eventos
  var pAfectados = [];
  pacientes.forEach(function (p, idx) {
    var id = Utl_texto(p.ID_INTERNO);
    if (!idsAfectados[id]) return;
    // excluir datos de prueba (esos se manejan con 🧹)
    var f = Utl_texto(p.FUENTE);
    if (f.indexOf('HOJA_INGRESO') === 0 && Utl_vacio(p.OBSERVACIONES)) return;
    pAfectados.push({ fila: idx + 2, idx: idx, objet: p });
  });

  return { pacientes: pAfectados, eventos: evAfectados };
}

/**
 * Genera un inventario legible en la hoja RECUPERACION para revisión humana.
 */
function Recuperar_inventario(prefijoFuente) {
  var datos = Recuperar_identificar(prefijoFuente);
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName('RECUPERACION');
  if (!hoja) hoja = ss.insertSheet('RECUPERACION');
  hoja.clearContents();

  var fila = 1;
  Utl_escribirBloque(hoja, fila, 1, [['=== INVENTARIO DE RECUPERACIÓN — ' + new Date().toISOString() + ' ===']]); fila++;
  Utl_escribirBloque(hoja, fila, 1, [['PACIENTES afectados:', datos.pacientes.length]]); fila++;
  Utl_escribirBloque(hoja, fila, 1, [['EVENTOS afectados:', datos.eventos.length]]); fila += 2;

  Utl_escribirBloque(hoja, fila, 1, [['--- PACIENTES ---', 'FILA_SHEET', 'ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'ESTADO', 'FUENTE']]); fila++;
  datos.pacientes.forEach(function (p) {
    Utl_escribirBloque(hoja, fila, 1, [[
      '', p.fila, p.objet.ID_INTERNO, p.objet.RUT,
      Utl_texto(p.objet.NOMBRE).substring(0, 30), p.objet.SECTOR,
      p.objet.ESTADO, Utl_texto(p.objet.FUENTE).substring(0, 40)
    ]]);
    fila++;
  });
  fila++;

  Utl_escribirBloque(hoja, fila, 1, [['--- EVENTOS ---', 'FILA_SHEET', 'ID_EVENTO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'FECHA', 'TIPO', 'FUENTE']]); fila++;
  datos.eventos.forEach(function (e) {
    Utl_escribirBloque(hoja, fila, 1, [[
      '', e.fila, e.objet.ID_EVENTO, e.objet.ID_INTERNO, e.objet.RUT,
      Utl_texto(e.objet.NOMBRE).substring(0, 25),
      e.objet.FECHA_EVENTO, e.objet.TIPO_EVENTO,
      Utl_texto(e.objet.FUENTE).substring(0, 40)
    ]]);
    fila++;
  });

  return { pacientes: datos.pacientes.length, eventos: datos.eventos.length };
}

/**
 * Ejecuta la recuperación selectiva: elimina SOLO los registros identificados.
 * NO toca registros que no estén en el inventario. Requiere confirmación previa.
 */
function Recuperar_ejecutar(prefijoFuente) {
  var datos = Recuperar_identificar(prefijoFuente);
  var ss = Modelo_ss();
  var eliminadosP = 0, eliminadosE = 0;

  // EVENTOS: eliminar filas de abajo hacia arriba
  if (datos.eventos.length) {
    var hojaE = ss.getSheetByName(HOJAS.EVENTOS);
    if (hojaE) {
      var filasE = datos.eventos.map(function (e) { return e.fila; }).sort(function (a, b) { return b - a; });
      filasE.forEach(function (f) { hojaE.deleteRow(f); eliminadosE++; });
    }
  }

  // PACIENTES: reescribir sin los afectados
  if (datos.pacientes.length) {
    var pacientes = Modelo_leerPacientes();
    var idsElim = {};
    datos.pacientes.forEach(function (p) { idsElim[Utl_texto(p.objet.ID_INTERNO)] = true; });
    var conservar = pacientes.filter(function (p) { return !idsElim[Utl_texto(p.ID_INTERNO)]; });
    var hojaP = ss.getSheetByName(HOJAS.PACIENTES);
    if (hojaP) {
      hojaP.getRange(2, 1, Math.max(hojaP.getMaxRows() - 1, 1), MODELO_PACIENTE.length).clearContent();
      if (conservar.length) {
        Utl_escribirBloque(hojaP, 2, 1, conservar.map(Modelo_filaDesdeObjeto));
      }
      eliminadosP = datos.pacientes.length;
    }
  }

  // refrescar vistas
  if (typeof Modelo_refrescarVistasSectores === 'function') Modelo_refrescarVistasSectores();

  Log_info('Recuperar', 'ejecutar', JSON.stringify({ pacientes: eliminadosP, eventos: eliminadosE }));
  Log_flush();
  return { pacientesEliminados: eliminadosP, eventosEliminados: eliminadosE };
}
