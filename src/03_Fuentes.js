/**
 * Sistema ECICEP — 03_Fuentes
 * STAGING_IMPORT: estructura de filas de importación controlada,
 * validador estructural y aplicación de la normalización existente.
 *
 * Núcleo puro (testeable en node, determinista). Las funciones I/O hacia la
 * hoja STAGING_IMPORT están claramente separadas y solo operan en GAS.
 * Reglas: nunca se descarta el valor original; los defectos se convierten en
 * resultados trazables (ERROR/WARNING), jamás en crashes.
 */

var _FUENTES_SEQ = 0;

/** v0.14.1 §6 — Modos canónicos de datos (una sola fuente, sin strings
 *  dispersos). CONSERVAR: no sincroniza fuentes (reparación técnica pura).
 *  INICIAL: libro vacío, incorpora nuevos sin nada que proteger. CONSERVADOR:
 *  sincroniza sin reemplazar valores protegidos (teléfonos, estratificación,
 *  sexo, nacimiento, observaciones, salud mental). SNAPSHOT_ACTUAL: herramienta
 *  avanzada, explícita, confirmada y respaldada; puede reemplazar TELEFONOS y
 *  ESTRATIFICACION (G válida) vigentes desde las fuentes autorizadas. */
var FUENTES_MODO = {
  CONSERVAR: 'CONSERVAR',
  INICIAL: 'INICIAL',
  CONSERVADOR: 'CONSERVADOR',
  SNAPSHOT_ACTUAL: 'SNAPSHOT_ACTUAL'
};

/** PURA: normaliza el modo de merge. Solo SNAPSHOT_ACTUAL activa reemplazos;
 *  INICIAL/CONSERVADOR/cotidiano comparten la mecánica no destructiva. */
function Fuentes_normalizarModo_(modo) {
  var m = Utl_texto(modo).toUpperCase();
  if (m === FUENTES_MODO.SNAPSHOT_ACTUAL) return FUENTES_MODO.SNAPSHOT_ACTUAL;
  if (m === FUENTES_MODO.INICIAL) return FUENTES_MODO.INICIAL;
  if (m === FUENTES_MODO.CONSERVAR) return FUENTES_MODO.CONSERVAR;
  return FUENTES_MODO.CONSERVADOR;
}

/** Estado de producción del libro (v0.14.1 §2, criterio conservador):
 *  PACIENTES o EVENTOS con filas reales → producción. No depende de versión.
 *  Solo lecturas de conteo; nunca escribe. */
function Datos_estadoProduccion_() {
  var pacientes = 0, eventos = 0;
  try {
    var ss = Modelo_ss();
    var hP = ss && ss.getSheetByName(HOJAS.PACIENTES);
    if (hP) pacientes = Math.max(hP.getLastRow() - Modelo_dataStartRow(HOJAS.PACIENTES) + 1, 0);
    var hE = ss && ss.getSheetByName(HOJAS.EVENTOS);
    if (hE) eventos = Math.max(hE.getLastRow() - Modelo_dataStartRow(HOJAS.EVENTOS) + 1, 0);
  } catch (e) { /* conservador: ante duda se informa lo contado */ }
  return { tienePacientes: pacientes > 0, pacientes: pacientes, eventos: eventos,
    produccion: pacientes > 0 || eventos > 0 };
}

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

/** PURA: clave CANÓNICA de comparación para la idempotencia por FUENTE
 *  (B2). Insensible a mayúsculas/espacios/tildes de archivo y hoja y al
 *  formato numérico de la fila. La cadena FUENTE almacenada se conserva RAW
 *  para trazabilidad; SOLO la igualdad de comparación se normaliza, de modo
 *  que una hoja escrita 'Ingresos Enero ' vs 'Ingresos Enero' (drift de
 *  literal en config entre ejecuciones) no vuelva a generar eventos. */
function Fuentes_claveDedupe_(filaOString) {
  var s = Utl_texto(filaOString);
  var partes = s.split('|'), partesNorm = [];
  for (var i = 0; i < 3; i++) {
    var p = Utl_texto(partes[i]).trim();
    if (i === 2 && /^\d+$/.test(p)) p = String(Number(p));
    partesNorm.push(Utl_claveAlnum(p));
  }
  return partesNorm.join('|');
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
  // ULTIMO_CONTROL / ULTIMO_SEGUIMIENTO son fechas de estado (última vigencia),
  // tolerantes: malformadas no bloquean el ingreso del paciente (warn).
  ['FECHA_NACIMIENTO', 'FECHA_INGRESO', 'PROXIMO_CONTROL',
   'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO'].forEach(function (campo) {
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

  // --- SALUD MENTAL (indicador de la dupla; nunca se infiere) ---
  var sm = Norm_normalizarSaludMental(v.SALUD_MENTAL);
  n.SALUD_MENTAL = sm.valor;
  if (sm.estado === 'NO_RECONOCIDO') {
    nota(warn, 'SALUD_MENTAL',
      'Valor no reconocido ("' + Utl_texto(v.SALUD_MENTAL) + '"), se descarta');
  }

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

// ---------------------------------------------------------------------------
// ETAPA 5 — Conexión a fuentes reales en Drive
// ---------------------------------------------------------------------------

/**
 * PURA/GAS: resuelve una hoja por nombre exacto; si no existe, tolerante a
 * diferencias de espaciado/mayúsculas/tildes (defensa contra nombres del
 * código con/n sin espacio final, p.ej. 'Ingresos Enero'). Devuelve null si
 * no hay coincidencia.
 */
function Fuentes_resolverHoja(ss, nombre) {
  if (!ss || !nombre) return null;
  var exacta = ss.getSheetByName(nombre);
  if (exacta) return exacta;
  var objetivo = Utl_sinTildes(Utl_colapsarEspacios(String(nombre))).toUpperCase();
  var hojas = ss.getSheets ? ss.getSheets() : [];
  for (var i = 0; i < hojas.length; i++) {
    var propia = Utl_sinTildes(Utl_colapsarEspacios(String(hojas[i].getName()))).toUpperCase();
    if (propia === objetivo) return hojas[i];
  }
  return null;
}

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
        var hoja = Fuentes_resolverHoja(ss, nombreHoja);
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
  var hoja = Fuentes_resolverHoja(ss, nombreHoja);
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
    // Copia ADITIVA: mismo criterio que la carga real (FASE 5.1): cualquier
    // campo adicional con sinónimo confirmado (SEGUIMIENTO / CONTROL /
    // PRÓXIMO CONTROL / PROFESIONAL / PRE INGRESO) se conserva.
    for (var ck in mapa.campos) {
      if (v[ck] === undefined && mapa.campos[ck] !== undefined) v[ck] = filaVal[mapa.campos[ck]];
    }
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

/** Guarda filas de staging por lotes. Solo GAS; en node devuelve 0.
 *  DEDUPE de auditoría (B9): un mismo origen físico (ARCHIVO|HOJA|FILA) se
 *  archiva una sola vez en STAGING_IMPORT; repetir la instalación sobre los
 *  mismos datos NO hace crecer la trazabilidad sin límite. */
/** GAS: ¿existe una FUENTE exacta en STAGING_IMPORT? (v0.10.5 §18) Lookup
 *  puntual por TextFinder sobre la columna FUENTE — sin releer el progreso
 *  completo. Devuelve true solo con coincidencia EXACTA de celda. */
function Fuentes_fuenteExiste_(hoja, colFuente, clave) {
  if (!clave) return false;
  var ultima = hoja.getLastRow();
  if (ultima < 1) return false;
  return !!hoja.getRange(1, colFuente, ultima, 1)
    .createTextFinder(clave)
    .matchEntireCell(true)
    .findNext();
}

function Fuentes_guardarFilas(filas) {
  try {
    if (typeof SpreadsheetApp === 'undefined' || !filas || !filas.length) return 0;
    var ss = Modelo_ss();
    var hoja = ss.getSheetByName(HOJAS.STAGING_IMPORT);
    if (!hoja) return 0;
    var colFuente = 12; // FUENTE = posición 11 (0-based) → columna 12
    var porIndice = filas.length <= 5;
    // §18: lotes pequeños (rutas interactivas: una captura) → lookup puntual por
    // TextFinder por clave; lotes grandes (import masivo) → índice masivo actual.
    var existentes = {};
    var ultima = hoja.getLastRow() || 0;
    if (!porIndice && ultima > 0) {
      var vals = hoja.getRange(1, colFuente, ultima, 1).getValues();
      for (var k = 0; k < vals.length; k++) {
        var v = Utl_texto(vals[k][0]);
        if (v) existentes[v] = true;
      }
    }
    var aGuardar = [];
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      var clave = Fuentes_fuenteOrigen(f);
      if (porIndice) {
        if (Fuentes_fuenteExiste_(hoja, colFuente, clave)) continue;
        existentes[clave] = true;
      } else {
        if (existentes[clave]) continue;
        existentes[clave] = true;
      }
      aGuardar.push(f);
    }
    if (!aGuardar.length) return 0;
    var salida = aGuardar.map(function (f) {
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
// ETAPA 5 — Lectura de fuentes autorizadas (reutilizada por carga y actualización)
// ---------------------------------------------------------------------------

/**
 * GAS: lee TODAS las hojas autorizadas (HOJAS_AUTORIZADAS_CARGA) y produce
 * filas de staging normalizadas. Detecta la fila de encabezado (≥2 campos
 * reconocidos), salta separadores de sección, copia los campos operativos +
 * ADICIONALES con sinónimo confirmado (copia ADITIVA FASE 5.1) y resuelve el
 * caso LISTADO Naranjo (RUT sin encabezado en columnas A..C).
 * @returns {Array} filas de staging ya normalizadas (Fuentes_normalizar)
 */
function Fuentes_leerStagingAutorizado() {
  var staging = [];
  Object.keys(HOJAS_AUTORIZADAS_CARGA).forEach(function (nombreArchivo) {
    var cfg = FUENTES_DRIVE[nombreArchivo];
    if (!cfg || !cfg.id) return;
    var ss = SpreadsheetApp.openById(cfg.id);
    HOJAS_AUTORIZADAS_CARGA[nombreArchivo].forEach(function (nombreHoja) {
      var hoja = Fuentes_resolverHoja(ss, nombreHoja);
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
        // Copia ADITIVA de campos: primero los 9 operativos canónicos (los que el
        //  contrato SIEMPRE leyó) y luego CUALQUIER otro campo con sinónimo confirmado
        //  que el mapa conozca y cuyo encabezado esté mapeado en la fuente real. Así un
        //  campo como SEGUIMIENTO/PROXIMO_CONTROL/PROFESIONAL_SEGUIMIENTO presente en
        //  la hoja NUNCA se descarta por no estar en la lista corta (causa raíz F1/F3).
        CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
          if (mapa.campos[c] !== undefined) v[c] = filaVal[mapa.campos[c]];
        });
        for (var ck in mapa.campos) {
          if (v[ck] === undefined && mapa.campos[ck] !== undefined) v[ck] = filaVal[mapa.campos[ck]];
        }
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
  return staging;
}

/** Config solo lectura: conteo de fuentes/hojas autorizadas para reportes. */
function Fuentes_contarHojasAutorizadas() {
  var archivos = 0, hojas = 0;
  Object.keys(HOJAS_AUTORIZADAS_CARGA).forEach(function (a) {
    if (FUENTES_DRIVE[a] && FUENTES_DRIVE[a].id) {
      archivos += 1;
      hojas += (HOJAS_AUTORIZADAS_CARGA[a] || []).length;
    }
  });
  return { archivos: archivos, hojas: hojas };
}

/** PURA/GAS: preflight estructurado de las fuentes autorizadas ANTES de tocar
 *  el libro (B3): accesibilidad de cada archivo, hojas esperadas vs
 *  encontradas y motivos. Una hoja autorizada ausente (o un archivo
 *  inaccesible/desconfigurado) BLOQUEA la carga: el pipeline no puede leer en
 *  silencio y procesar un subconjunto mintiendo en los conteos.
 *  @param {Function} [abridor] inyectable en pruebas (default: SpreadsheetApp.openById)
 *  @returns {ok, fuentes:[{archivo,id,accesible,hojasEsperadas,hojasEncontradas,faltantes,errores}], bloqueantes:[...]} */
function Fuentes_preflightFuentes(abridor) {
  var abrir = abridor;
  if (!abrir && typeof SpreadsheetApp !== 'undefined') {
    abrir = function (id) { return SpreadsheetApp.openById(id); };
  }
  var fuentes = [];
  Object.keys(HOJAS_AUTORIZADAS_CARGA).forEach(function (nombreArchivo) {
    var cfg = FUENTES_DRIVE[nombreArchivo];
    var info = {
      archivo: nombreArchivo,
      sector: (cfg && cfg.sector) || '',
      id: (cfg && cfg.id) || '',
      accesible: false,
      hojasEsperadas: (HOJAS_AUTORIZADAS_CARGA[nombreArchivo] || []).slice(),
      hojasEncontradas: [],
      faltantes: [],
      errores: []
    };
    if (!cfg) { info.errores.push('ARCHIVO_DESCONFIGURADO'); fuentes.push(info); return; }
    if (!cfg.id) { info.errores.push('SIN_ID_DRIVE'); fuentes.push(info); return; }
    if (!abrir) { info.errores.push('SIN_ENTORNO_GAS'); fuentes.push(info); return; }
    try {
      var ss = abrir(cfg.id);
      if (!ss) { info.errores.push('ARCHIVO_INACCESIBLE'); fuentes.push(info); return; }
      info.accesible = true;
      info.nombreReal = typeof ss.getName === 'function' ? Utl_texto(ss.getName()) : '';
      info.hojasEsperadas.forEach(function (nombreHoja) {
        var h = Fuentes_resolverHoja(ss, nombreHoja);
        if (h) info.hojasEncontradas.push(nombreHoja);
        else info.faltantes.push(nombreHoja);
      });
    } catch (e) {
      info.errores.push(e && e.message ? e.message : String(e));
    }
    fuentes.push(info);
  });
  var bloqueantes = fuentes.filter(function (f) {
    return f.faltantes.length > 0 || (f.errores.length > 0 && f.errores.indexOf('SIN_ENTORNO_GAS') === -1);
  });
  return { ok: bloqueantes.length === 0, fuentes: fuentes, bloqueantes: bloqueantes };
}

/** PURA: informe compacto y serializable del preflight (sin datos sensibles). */
function Fuentes_preflightInforme_(preflight) {
  return (preflight.fuentes || []).map(function (f) {
    return {
      archivo: f.archivo,
      sector: f.sector,
      accesible: f.accesible,
      hojasEsperadas: f.hojasEsperadas,
      hojasEncontradas: f.hojasEncontradas,
      faltantes: f.faltantes,
      errores: f.errores
    };
  });
}

// ---------------------------------------------------------------------------
// ETAPA 5 — Carga/actualización real controlada (análisis + ejecución)
// ---------------------------------------------------------------------------

/** Memoria de análisis EN LA MISMA invocación (proceso GAS y pruebas node):
 *  la ejecución de Instalar reutiliza el análisis dry-run (UNA lectura real de
 *  fuentes) en lugar de volver a leer Drive entre previa y ejecución. Crítica
 *  limitada: se poda por antigüedad (>1h) y cada clave se elimina al usarla en
 *  ejecución. Sin PII retenida fuera de la invocación. */
var _FUENTES_ANALISIS_MEMO = {};
var _FUENTES_ANALISIS_TTL = 60 * 60 * 1000;

function _Fuentes_guardarAnalisis_(a) {
  _Fuentes_podarMemo_();
  _FUENTES_ANALISIS_MEMO[a.ejecucionId] = { ts: Date.now(), analisis: a };
}

function _Fuentes_recuperarAnalisis_(ejecucionId) {
  _Fuentes_podarMemo_();
  var e = _FUENTES_ANALISIS_MEMO[ejecucionId];
  if (!e) return null;
  return e.analisis;
}

function _Fuentes_podarMemo_() {
  var limite = Date.now() - _FUENTES_ANALISIS_TTL;
  Object.keys(_FUENTES_ANALISIS_MEMO).forEach(function (k) {
    if (_FUENTES_ANALISIS_MEMO[k].ts < limite) delete _FUENTES_ANALISIS_MEMO[k];
  });
}

/** PURA/GAS: análisis de la carga real sin efectos de escritura. Lee una sola
 *  vez las fuentes autorizadas, aplica la idempotencia por FUENTE (clave
 *  canónica B2), identifica contra el estado vigente, aplica el merge y deja
 *  `resultado` listo para reportar o ejecutar. En preflight fallido (hoja
 *  autorizada ausente/archivo inaccesible) devuelve {ok:false} y NUNCA escribe. */
function _Fuentes_analizar_(opciones, ejecucionId, t0) {
  // --- FASE 5.0: snapshot previo ---
  var previo = { pacientes: 0, eventos: 0 };
  if (typeof SpreadsheetApp !== 'undefined') {
    var hp = Modelo_hoja(HOJAS.PACIENTES);
    var he = Modelo_hoja(HOJAS.EVENTOS);
    previo.pacientes = hp ? Math.max(hp.getLastRow() - 1, 0) : 0;
    previo.eventos = he ? Math.max(he.getLastRow() - 1, 0) : 0;
  }

  // --- FASE 5.0b: preflight estructural de las fuentes (B3) ---
  var preflight = Fuentes_preflightFuentes();
  if (!preflight.ok) {
    var infPre = Fuentes_preflightInforme_(preflight);
    Log_error('Fuentes', 'preflight',
      'Bloqueada carga: ' + infPre.map(function (f) {
        return f.archivo + '·' + f.faltantes.join(',') + (f.errores.length ? '·' + f.errores.join(',') : '');
      }).join(' | '));
    return {
      ok: false,
      ejecucionId: ejecucionId,
      resultado: {
        ok: false,
        dryRun: !opciones.ejecutar,
        ejecucionId: ejecucionId,
        motivo: 'HOJA_FUENTE_FALTANTE',
        preflight: infPre,
        resumen: { registros: 0, nuevos: 0, existentes: 0, revision: 0,
                   previo: previo, ejecucion: ejecucionId, ms: Date.now() - t0,
                   preflight: infPre }
      }
    };
  }

  // --- FASE 5.1: leer fuentes autorizadas → staging ---
  var staging = Fuentes_leerStagingAutorizado();

  // --- IDEMPOTENCIA: separar filas ya importadas (no generan evento) de las nuevas.
  // Con `actualizar`, las ya importadas siguen disponibles para el MERGE de datos.
  // Comparación por clave CANÓNICA (B2): la cadena FUENTE almacenada se conserva
  // RAW para trazabilidad, pero la igualdad ignora mayúsculas/espacios/tildes y el
  // formato de la fila, de modo que un drift de literal en la config entre
  // ejecuciones no vuelve a generar eventos para la misma fila física.
  var eventosExistentes = [];
  if (typeof Modelo_leerEventos === 'function') eventosExistentes = Modelo_leerEventos();
  var fuentesYaImportadas = {};
  eventosExistentes.forEach(function (e) {
    var f = Utl_texto(e.FUENTE);
    if (f) fuentesYaImportadas[Fuentes_claveDedupe_(f)] = true;
  });
  var yaImportadas = 0;
  var stagingNuevas = [];
  var stagingReutilizables = [];
  staging.forEach(function (f) {
    var clave = Fuentes_claveDedupe_(Fuentes_fuenteOrigen(f));
    if (fuentesYaImportadas[clave]) { yaImportadas += 1; stagingReutilizables.push(f); }
    else stagingNuevas.push(f);
  });

  // --- FASE 5.2-3: validación + identificación ---
  var store = { pacientes: [], eventos: [] };
  if ((opciones.ejecutar || opciones.actualizar) && typeof Modelo_leerPacientes === 'function') {
    store.pacientes = Modelo_leerPacientes();
    // La simulación trabaja en copias: el lector comparte objetos memoizados.
    if (!opciones.ejecutar) {
      store.pacientes = store.pacientes.map(function (p) { return Object.assign({}, p); });
    }
  }

  // MERGE conservador sobre pacientes existentes (v0.9.6). Puras y testeables.
  var merge = { revisados: 0, actualizados: 0, sinCambios: 0, conflictos: 0, campos: 0, detalle: [] };
  if (opciones.actualizar) {
    merge = Act_mergearPacientesDesdeStaging(staging, store.pacientes, { modo: opciones.modo });
  }

  var salida = Ingresos_procesarFilas(stagingNuevas, store, {
    nuevoId: typeof Modelo_nuevoIdInterno === 'function' ? Modelo_nuevoIdInterno : function (i) {
      return 'EC-' + ('000000' + i).slice(-6);
    }
  });

  // --- FASE 5.4: reporte ---
  var resumen = salida.resumen;
  resumen.registros = staging.length;
  resumen.yaImportadas = yaImportadas;
  if (opciones.actualizar) resumen.merge = merge;
  resumen.previo = previo;
  resumen.ejecucion = ejecucionId;
  resumen.ms = Date.now() - t0;

  var fuentesInforme = Fuentes_contarHojasAutorizadas();
  resumen.fuentesRevisadas = fuentesInforme.hojas;
  resumen.preflight = Fuentes_preflightInforme_(preflight);

  var resultado = {
    ok: true,
    dryRun: !opciones.ejecutar,
    ejecucionId: ejecucionId,
    resumen: resumen,
    excluidas: FUENTES_EXCLUIDAS,
    detalle: stagingNuevas.map(function (f, i) {
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

  return {
    ok: true, ejecucionId: ejecucionId,
    resultado: resultado, staging: staging,
    stagingNuevas: stagingNuevas, stagingReutilizables: stagingReutilizables,
    store: store, merge: merge, salida: salida, yaImportadas: yaImportadas
  };
}

/** PURA/GAS: escritura efectiva de la carga real (FASE 5.5-5.8). Recibe el
 *  análisis (nuevo o reutilizado de la previa) y devuelve el resultado final. */
function _Fuentes_escribir_(a, opciones, t0) {
  a = a || {};
  var resultado = a.resultado || { ok: true };
  var resumen = resultado.resumen || {};
  var merge = a.merge || { actualizados: 0, conflictos: 0 };
  var salida = a.salida || {};

  if (opciones.ejecutar) Log_info('Fuentes', 'cargaReal',
    JSON.stringify({ registros: resumen.registros, nuevos: resumen.nuevos, existentes: resumen.existentes,
                     revision: resumen.revision, conError: resumen.conError,
                     yaImportadas: a.yaImportadas || 0,
                     merge: opciones.actualizar ? { revisados: merge.revisados, actualizados: merge.actualizados,
                                                    sinCambios: merge.sinCambios, conflictos: merge.conflictos,
                                                    campos: merge.campos } : undefined }),
    { ejecucion: resultado.ejecucionId || '' });

  // --- FASE 5.5: GATE — solo escribir si explícitamente se pide ---
  if (!opciones.ejecutar) return resultado;

  // eliminar el análisis reutilizado: ya no se necesita y evita retención
  if (resumen.ejecucion) delete _FUENTES_ANALISIS_MEMO[resumen.ejecucion];

  // --- FASE 5.6: IMPORTACIÓN ---
  var escritosPacientes = false;
  var escritosEventos = false;
  var actualizarPacientes = opciones.actualizar &&
    (merge.actualizados > 0 || merge.conflictos > 0 || (salida.pacientesNuevos || []).length > 0);
  if (actualizarPacientes) {
    var esquema = Modelo_asegurarEsquemaPacientes_();
    if (!esquema.ok) {
      resultado.ok = false;
      resultado.motivo = 'ESQUEMA_PACIENTES_INCOMPATIBLE';
      resumen.error = resultado.motivo + ': ' + (esquema.motivo || '');
      resumen.escritosPacientes = false;
      resumen.escritosEventos = false;
      Log_error('Fuentes', 'cargaReal-merge', resumen.error);
      Log_flush();
      return resultado;
    }
  }
  if (typeof Modelo_agregarEventos_ === 'function' && (salida.eventos || []).length) {
    Modelo_agregarEventos_(salida.eventos, _ingresosUsuarioActual(), { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'cargaReal-eventos' });
    escritosEventos = true;
  }
  if (opciones.actualizar) {
    if (actualizarPacientes) {
      var hojaP = Modelo_hoja(HOJAS.PACIENTES);
      Utl_escribirBloque(hojaP, Modelo_dataStartRow(HOJAS.PACIENTES), 1,
        a.store.pacientes.map(Modelo_filaDesdeObjeto));
      Modelo_invalidarLecturas();
      escritosPacientes = true;
    }
  } else if (typeof Modelo_agregarPacientes_ === 'function' && (salida.pacientesNuevos || []).length) {
    Modelo_agregarPacientes_(salida.pacientesNuevos, { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'cargaReal-pacientes' });
    escritosPacientes = true;
  }
  resumen.escritosPacientes = escritosPacientes;
  resumen.escritosEventos = escritosEventos;

  // auditoría a STAGING_IMPORT (dedupe: un mismo origen físico solo se archiva una vez)
  Fuentes_guardarFilas(opciones.actualizar ? a.staging : a.stagingNuevas);

  // casos ambiguos → cola de revisión (CONFLICTOS)
  var filasConflicto = [];
  var filasParaCola = opciones.actualizar ? a.staging : a.stagingNuevas;
  (filasParaCola || []).forEach(function (f) {
    var r = f.RESULTADO_IDENTIFICACION;
    var ev = f.RESULTADO_EVENTO || f.EVENTO_RESULTADO;
    if (r && (r.resultado === 'POSIBLE_DUPLICADO' || r.resultado === 'REQUIERE_REVISION')) {
      filasConflicto.push(Rev_filaConflicto(f));
    } else if (ev && (ev.motivo === 'FECHA_EVENTO_AUSENTE' || (ev.estado === 'ERROR' && /FECHA.*AUSENTE|SIN_FECHA/.test(String(ev.motivo||''))))) {
      filasConflicto.push(Rev_filaConflicto(f));
    }
  });
  if (filasConflicto.length && typeof Modelo_agregarConflictos_ === 'function') {
    resultado.aColaRevision = Modelo_agregarConflictos_(filasConflicto);
    Log_info('Fuentes', 'colaRevision', filasConflicto.length + ' enviados a CONFLICTOS');
  }

  // --- FASE 5.8: refrescar vistas sectoriales ---
  if (typeof Modelo_refrescarVistasSectores_ === 'function') {
    resultado.vistasSector = Modelo_refrescarVistasSectores_();
  }

  Log_flush();
  return resultado;
}

/**
 * Orquestador de carga real controlada desde las fuentes autorizadas.
 * @param {Object} opciones {ejecutar:boolean, actualizar:boolean, modo:string,
 *   ejecucionId? (reutiliza el análisis de una dry-run previa en la misma invocación)}
 *   ejecutar=false → DRY RUN: analiza, reporta, NO escribe
 *   ejecutar=true  → IMPORTA: escribe PACIENTES + EVENTOS con idempotencia
 *   actualizar=true → además de incorporar registros nuevos, ACTUALIZA pacientes
 *     existentes desde los datos vigentes de la fuente (merge conservador v0.9.6).
 *     Las filas ya importadas NO vuelven a generar eventos (idempotencia por FUENTE,
 *     comparación canónica insensible a espacios/caja del literal).
 *   modo: ver FUENTES_MODO (CONSERVADOR/INICIAL = mecánica cotidiana no
 *     destructiva; SNAPSHOT_ACTUAL = reemplazos TELEFONOS/ESTRATIFICACION,
 *     solo vía instalador avanzado confirmado y respaldado; CONSERVAR no
 *     debe llegar aquí con ejecutar:true).
 * Huella de escritura: antes de escribir, el preflight estructural (B3) garantiza
 * que TODAS las hojas autorizadas existen; en caso contrario devuelve
 * HOJA_FUENTE_FALTANTE sin tocar el libro.
 * @returns {ok, ejecucionId, dryRun, resumen, detalle[], excluidas[]}
 */
function Fuentes_cargaReal(opciones) {
  opciones = opciones || {};
  var ejecucionId = opciones.ejecucionId ||
    (opciones.actualizar ? 'ACT-' : 'CARGA-') + Date.now().toString(36).toUpperCase();
  var t0 = Date.now();
  // Reutilizar el análisis dry-run previo (UNA lectura real de fuentes) cuando
  // el llamador pasa su ejecucionId en la misma invocación (Instalar_pFuentes).
  var a = null;
  if (opciones.ejecucionId) a = _Fuentes_recuperarAnalisis_(ejecucionId);
  if (!a) {
    var analisis = _Fuentes_analizar_(opciones, ejecucionId, t0);
    if (!analisis.ok) return analisis.resultado;
    if (!opciones.ejecutar) _Fuentes_guardarAnalisis_(analisis);
    a = analisis;
  }
  return _Fuentes_escribir_(a, opciones, t0);
}

/** Endpoint de previsualización de impacto (v0.14.1 §39-41): dry-run SIEMPRE
 *  no destructivo que devuelve SOLO conteos (nuevos, existentes, campos que
 *  cambiarían por tipo, conflictos). Sin PII: nunca expone detalle por fila.
 *  El análisis puede reutilizarse vía ejecucionId (mismo patrón dry-run→write). */
function api_fuentesImpacto(acceso, modoDatos) {
  if (!WebApp_autorizarBuscador(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  var modo = Fuentes_normalizarModo_(modoDatos);
  if (modo === FUENTES_MODO.CONSERVAR)
    return { ok: true, modo: modo, impacto: { nuevos: 0, existentes: 0, fillOnly: 0,
      fechasAdelantadas: 0, reemplazosSnapshot: 0, conflictos: 0 },
      linea: 'Conservar datos actuales: sin lecturas de escritura ni cambios.' };
  try {
    var r = Fuentes_cargaReal({ ejecutar: false, actualizar: true, modo: modo });
    if (!r || r.ok === false) return { ok: false, modo: modo, motivo: (r && r.motivo) || 'ANALISIS_FALLIDO' };
    var res = r.resumen || {}, mg = res.merge || {};
    var impacto = (typeof Act_resumenImpactoMerge_ === 'function')
      ? Act_resumenImpactoMerge_(mg)
      : { fillOnly: mg.campos || 0, fechasAdelantadas: 0, reemplazosSnapshot: 0,
          conflictos: mg.conflictos || 0 };
    impacto.nuevos = res.nuevos || 0;
    impacto.existentes = (res.registros || 0) - (res.nuevos || 0);
    return { ok: true, modo: modo, ejecucionId: r.ejecucionId, impacto: impacto,
      linea: '+' + impacto.nuevos + ' nuevos · +' + impacto.fillOnly + ' campos · +' +
        impacto.fechasAdelantadas + ' fechas · +' + impacto.reemplazosSnapshot +
        ' reemplazos · +' + impacto.conflictos + ' conflictos' };
  } catch (e) { return { ok: false, modo: modo, motivo: e && e.message ? e.message : String(e) }; }
}
