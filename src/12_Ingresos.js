/**
 * Sistema ECICEP Unificado — 12_Ingresos
 * Orquestador ETAPA 3b: INGRESO_* → STAGING → VALIDACIÓN → IDENTIFICACIÓN →
 * DECISIÓN → PACIENTES + EVENTOS.
 *
 * Núcleo PURO (Ingresos_procesarFilas): opera sobre un store en memoria
 * {pacientes:[], eventos:[]} con idGen inyectable → determinista y testeable
 * en node. El store es APPEND-ONLY: nunca modifica registros previos.
 *
 * Wrapper GAS (Ingresos_procesarTodasLasHojas): adapta Sheets↔store,
 * escribe por lotes y registra la ejecución con el Log existente.
 * La decisión de escritura (gate) es explícita por fila (DEC-024/025):
 *   BLOQUEADO | REVISION | CREAR_PACIENTE | ENLAZAR_EXISTENTE.
 */

// ---------------------------------------------------------------------------
// Adaptador hoja de ingreso → sector canónico
// ---------------------------------------------------------------------------

function Ingresos_hojaASector(nombreHoja) {
  var k = Utl_texto(nombreHoja).toUpperCase().replace(/\s+/g, '_');
  return HOJAS_INGRESO[k] || '';
}

/** Contrato único de columnas físicas de las hojas INGRESO_* (DEC-029). */
function Ingresos_columnasHoja() {
  return INGRESO_COLUMNAS.slice();
}

/**
 * PURA: mapea los encabezados físicos de una hoja INGRESO_* a campos del
 * modelo. Traduce el canónico de encabezado 'TELEFONO' al campo del modelo
 * 'TELEFONOS' (contrato instalador↔adaptador, corrección ETAPA 3b).
 * @param {Array} encabezados fila 1 cruda
 * @returns {campos:{campoModelo:idxCol}, estadoIdx:number, notaIdx:number,
 *           desconocidos:[{col, texto}]}
 */
function Ingresos_mapearEncabezadosHoja(encabezados) {
  var campos = {}, estadoIdx = -1, notaIdx = -1, desconocidos = [];
  (encabezados || []).forEach(function (h, i) {
    var clave = Utl_claveAlnum(h);
    if (clave === 'ESTADOINGRESO') { estadoIdx = i; return; }
    if (clave === 'NOTASISTEMA') { notaIdx = i; return; }
    if (clave === '') return;
    var m = Norm_mapearEncabezado(h);
    // traducción encabezado→modelo: TELEFONO (canonico de FONO/CELULAR/TELEFONOS)
    var campo = (m.canonico === 'TELEFONO') ? 'TELEFONOS' : m.canonico;
    if (m.conocido && CAMPOS_INGRESO_OPERATIVOS.indexOf(campo) !== -1) {
      if (campos[campo] === undefined) campos[campo] = i;
    } else {
      desconocidos.push({ col: i + 1, texto: Utl_texto(h) });
    }
  });
  return { campos: campos, estadoIdx: estadoIdx, notaIdx: notaIdx, desconocidos: desconocidos };
}

// ---------------------------------------------------------------------------
// Capa pura
// ---------------------------------------------------------------------------

/**
 * Construye el objeto PACIENTE completo (29 campos del modelo v2) desde la
 * fila normalizada. FECHA_ACTUALIZACION queda null: la fija el escritor real.
 */
function Ingresos_pacienteDesdeNormalizado(n, fila, idInterno) {
  return {
    ID_INTERNO: idInterno,
    RUT: n.RUT,
    NOMBRE: n.NOMBRE,
    SEXO: n.SEXO || '',
    FECHA_NACIMIENTO: n.FECHA_NACIMIENTO || '',
    TELEFONOS: n.TELEFONOS || '',
    TELEFONO_OBS: n.TELEFONO_OBS || '',
    SECTOR: n.SECTOR,
    ESTRATIFICACION: n.ESTRATIFICACION || '',
    ESTADO: n.ESTADO || 'PENDIENTE',
    DUPLA_INGRESO: n.DUPLA_INGRESO || '',
    PROFESIONAL_SEGUIMIENTO: n.PROFESIONAL_SEGUIMIENTO || '',
    PREINGRESO: n.PREINGRESO || '',
    FECHA_INGRESO: n.FECHA_INGRESO || '',
    ULTIMO_SEGUIMIENTO: '',
    ULTIMO_CONTROL: '',
    PROXIMO_CONTROL: n.PROXIMO_CONTROL || '',
    COMPOSICION_CONTROL: '',
    OBSERVACIONES: n.OBSERVACIONES || '',
    CONDICIONES: '',
    NOMBRE_NORMALIZADO: n.NOMBRE_CLAVE || Norm_claveNombre(n.NOMBRE),
    RUT_DV_VALIDO: n.RUT_ESTADO === 'OK',
    RUT_SIN_DV: n.RUT_ESTADO === 'SIN_DV',
    ESTRAT_ORIGEN: n.ESTRAT_ORIGEN || '',
    ESTRAT_CALCULADA: '',
    ESTRAT_FECHA_CALCULO: '',
    FUENTE: Fuentes_fuenteOrigen(fila),
    FECHA_ACTUALIZACION: null,
    REQUIERE_REVISION: false
  };
}

/** Gate explícito de escritura (DEC-024/025). */
function Ingresos_decidirEscritura(fila) {
  if (!fila || !fila.NORMALIZADO || !fila.NORMALIZADO.RUT_ESTADO) return 'BLOQUEADO';
  if (fila.ESTADO_VALIDACION === 'ERROR') return 'BLOQUEADO';
  var r = fila.RESULTADO_IDENTIFICACION ? fila.RESULTADO_IDENTIFICACION.resultado : '';
  if (r === 'MATCH_EXACTO' || r === 'MATCH_PARCIAL') return 'ENLAZAR_EXISTENTE';
  if (r === 'SIN_MATCH') return 'CREAR_PACIENTE';
  return 'REVISION'; // POSIBLE_DUPLICADO sin confirmar · REQUIERE_REVISION · sin identificar
}

/**
 * Procesa un lote de filas de staging YA NORMALIZADAS contra el store.
 * - store: {pacientes:[], eventos:[]} — se muta SOLO añadiendo (append-only).
 * - opciones: {nuevoId():string, confirmarNuevos:boolean, evSecuenciaInicial:number}
 *
 * Métricas separadas por concepto (corrección ETAPA 3b):
 *   validacionOk / validacionWarning / validacionError  → resultado del VALIDADOR
 *   bloqueados                                          → filas que NO se escriben por error
 *   nuevos / existentes                                 → decisión de escritura
 *   revision                                            → requieren decisión humana
 *   eventosCreados                                      → eventos realmente generados
 */
function Ingresos_procesarFilas(filasStaging, store, opciones) {
  opciones = opciones || {};
  var confirmarNuevos = !!opciones.confirmarNuevos;
  var seqPac = 0, seqEv = (opciones.evSecuenciaInicial || 1) - 1;
  var indices = Iden_construirIndices(store.pacientes);

  var resultados = [], pacientesNuevos = [], eventos = [];
  var resumen = {
    leidos: filasStaging.length,
    validacionOk: 0, validacionWarning: 0, validacionError: 0,
    validos: 0, conError: 0, bloqueados: 0,
    nuevos: 0, existentes: 0, revision: 0, eventosCreados: 0
  };

  function registrar(fila, estado, nota, idInterno, idEvento) {
    resultados.push({
      idProvisional: fila.ID_PROVISIONAL,
      hoja: fila.HOJA_ORIGEN,
      filaOrigen: fila.FILA_ORIGEN,
      estado: estado,
      nota: Utl_texto(nota),
      idInterno: idInterno || '',
      idEvento: idEvento || ''
    });
  }

  filasStaging.forEach(function (fila) {
    // 0) DEFENSA: si la fila llegó cruda (sin normalizar), se normaliza aquí.
    //    Nunca bloquear por un defecto de integración aguas arriba.
    if (!fila.NORMALIZADO || !fila.NORMALIZADO.RUT_ESTADO) {
      Fuentes_normalizar(fila);
    }

    // métrica de VALIDACIÓN (independiente del gate)
    if (fila.ESTADO_VALIDACION === 'OK') resumen.validacionOk += 1;
    else if (fila.ESTADO_VALIDACION === 'WARNING') resumen.validacionWarning += 1;

    // 1) IDENTIFICAR siempre contra el estado actual del store
    //    (incluye pacientes creados dentro de este mismo lote)
    var iden = Iden_identificar(fila.NORMALIZADO, indices);
    fila.RESULTADO_IDENTIFICACION = iden;

    // 2) GATE de escritura
    var decision;
    if (fila.ESTADO_VALIDACION === 'ERROR') decision = 'BLOQUEADO';
    else if (iden.resultado === 'POSIBLE_DUPLICADO' && confirmarNuevos) decision = 'CREAR_PACIENTE';
    else decision = Ingresos_decidirEscritura(fila);

    if (decision === 'BLOQUEADO') {
      resumen.validacionError += 1;
      resumen.bloqueados += 1;
      resumen.conError += 1;
      registrar(fila, 'ERROR',
        fila.ERRORES[0] ? (fila.ERRORES[0].campo + ': ' + fila.ERRORES[0].mensaje) : 'error de validación');
      return;
    }
    if (decision === 'REVISION') {
      resumen.revision += 1;
      registrar(fila, 'REQUIERE_REVISION',
        iden.criterio || 'requiere revisión manual', iden.idPaciente);
      return;
    }

    // 3) preparar el EVENTO (los warnings NO bloquean)
    if (decision === 'CREAR_PACIENTE') {
      // entidad nueva: jamás enlazar al candidato existente (DEC-025)
      fila.RESULTADO_IDENTIFICACION = { resultado: 'SIN_MATCH', idPaciente: '', criterio: '', confianza: '' };
    }
    seqEv += 1;
    var ev = Ev_desdeStaging(fila, { secuencia: seqEv });
    if (!ev.ok) {
      resumen.revision += 1;
      registrar(fila, 'REQUIERE_REVISION', ev.motivo);
      return;
    }

    // 4) escritura en el store (append-only)
    var idInterno = '';
    if (decision === 'CREAR_PACIENTE') {
      seqPac += 1;
      var paciente = Ingresos_pacienteDesdeNormalizado(
        fila.NORMALIZADO, fila, opciones.nuevoId ? opciones.nuevoId(seqPac, fila) : ('EC-' + ('000000' + seqPac).slice(-6)));
      store.pacientes.push(paciente);
      pacientesNuevos.push(paciente);
      idInterno = paciente.ID_INTERNO;
      ev.evento.ID_INTERNO = idInterno; // enlazar el evento a la entidad recién creada
      resumen.nuevos += 1;
      indices = Iden_construirIndices(store.pacientes); // índice al día para el resto del lote
    } else {
      idInterno = fila.RESULTADO_IDENTIFICACION.idPaciente;
      resumen.existentes += 1;
    }
    store.eventos.push(ev.evento); // nunca reemplaza eventos previos
    eventos.push(ev.evento);
    resumen.eventosCreados += 1;
    resumen.validos += 1;
    registrar(fila, 'INGRESADO',
      decision === 'CREAR_PACIENTE' ? 'Nuevo paciente creado' : 'Registrado sobre paciente existente',
      idInterno, ev.evento.ID_EVENTO);
  });

  return { resultados: resultados, resumen: resumen, pacientesNuevos: pacientesNuevos, eventos: eventos };
}

// ---------------------------------------------------------------------------
// Wrapper GAS — lectura de hojas, persistencia por lotes y trazabilidad
// ---------------------------------------------------------------------------

function _ingresosUsuarioActual() {
  try {
    if (typeof Session !== 'undefined') return Session.getActiveUser().getEmail();
  } catch (e) { /* sin sesión (node) */ }
  return '';
}

/**
 * Lee una hoja INGRESO_* y produce filas de staging normalizadas.
 * Ignora filas vacías y las ya procesadas (ESTADO_INGRESO = INGRESADO).
 * @returns {staging:[], hoja:Object|null}
 */
function Ingresos_leerHoja(nombreHoja) {
  var hoja = Modelo_ss().getSheetByName(nombreHoja);
  if (!hoja) return { staging: [], hoja: null };
  var valores = Utl_leerBloque(hoja);
  if (valores.length < 2) return { staging: [], hoja: hoja };
  var mapa = Ingresos_mapearEncabezadosHoja(valores[0]);
  var idxCampos = mapa.campos;
  var idxEstado = mapa.estadoIdx, idxNota = mapa.notaIdx;
  var sector = Ingresos_hojaASector(nombreHoja);
  var staging = [];
  for (var f = 1; f < valores.length; f++) {
    var filaVal = valores[f];
    var nombreRaw = idxCampos.NOMBRE !== undefined ? filaVal[idxCampos.NOMBRE] : '';
    var rutRaw = idxCampos.RUT !== undefined ? filaVal[idxCampos.RUT] : '';
    if (Utl_vacio(nombreRaw) && Utl_vacio(rutRaw)) continue;
    var estadoPrevio = idxEstado >= 0 ? Utl_texto(filaVal[idxEstado]).toUpperCase() : '';
    if (estadoPrevio === 'INGRESADO') continue; // idempotencia del procesamiento
    var v = {};
    CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
      if (idxCampos[c] !== undefined) v[c] = filaVal[idxCampos[c]];
    });
    // La fila sale del lector YA NORMALIZADA y validada (corrección ETAPA 3b:
    // el defecto histórico era entregar filas crudas al orquestador)
    staging.push(Fuentes_normalizar(Fuentes_crearFila(
      { archivo: 'HOJA_INGRESO', hoja: nombreHoja, fila: f + 1, sector: sector }, v)));
  }
  return { staging: staging, hoja: hoja };
}

/**
 * Escribe de vuelta los estados de procesamiento en las hojas INGRESO_*.
 * Lectura y escritura por bloques (nunca setValue por celda).
 */
function Ingresos_escribirEstados(resultados) {
  try {
    if (typeof SpreadsheetApp === 'undefined' || !resultados || !resultados.length) return;
    var ss = Modelo_ss();
    var porHoja = Utl_agruparPor(resultados, function (r) { return r.hoja; });
    Object.keys(porHoja).forEach(function (nombreHoja) {
      var hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;
      var ultima = hoja.getLastRow();
      if (ultima < 2) return;
      var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
      var colEstado = -1, colNota = -1;
      encabezados.forEach(function (h, i) {
        var clave = Utl_claveAlnum(h);
        if (clave === 'ESTADOINGRESO') colEstado = i + 1;
        else if (clave === 'NOTASISTEMA') colNota = i + 1;
      });
      if (colEstado < 0 || colNota < 0) return;
      var desde = Math.min(colEstado, colNota), ancho = Math.abs(colEstado - colNota) + 1;
      var bloque = hoja.getRange(2, desde, ultima - 1, ancho).getValues();
      var offsetEstado = colEstado - desde, offsetNota = colNota - desde;
      porHoja[nombreHoja].forEach(function (r) {
        var filaHoja = Number(r.filaOrigen) - 2; // índice 0-based dentro del bloque (fila 2 = 0)
        if (isNaN(filaHoja) || filaHoja < 0 || filaHoja >= bloque.length) return;
        bloque[filaHoja][offsetEstado] = r.estado;
        bloque[filaHoja][offsetNota] = r.nota;
      });
      hoja.getRange(2, desde, ultima - 1, ancho).setValues(bloque);
    });
  } catch (e) {
    Log_error('Ingresos', 'escribirEstados', e && e.message ? e.message : String(e));
  }
}

/**
 * Orquestador de alto nivel (menú ECICEP → 📥 Procesar ingresos).
 * Ejecuta el flujo completo sobre TODAS las hojas INGRESO_* presentes,
 * exclusivamente sobre lo que el usuario haya digitado ahí (dataset ficticio
 * en pruebas). Nunca lee los Excel completos.
 */
function Ingresos_procesarTodasLasHojas(opciones) {
  opciones = opciones || {};
  var ejecucion = 'EJ-' + Date.now().toString(36).toUpperCase();
  Log_info('Ingresos', 'procesar', 'inicio ejecución ' + ejecucion);

  // 1) leer todas las puertas de entrada
  var staging = [];
  Object.keys(HOJAS_INGRESO).forEach(function (hojaNombre) {
    staging = staging.concat(Ingresos_leerHoja(hojaNombre).staging);
  });

  var vacio = {
    ejecucion: ejecucion,
    leidos: 0, validos: 0, conError: 0, nuevos: 0, existentes: 0,
    revision: 0, eventosCreados: 0, mensaje: 'No hay ingresos pendientes'
  };
  if (!staging.length) {
    Log_info('Ingresos', 'procesar', 'sin pendientes', null, null);
    Log_flush();
    return vacio;
  }

  // 2) auditoría completa en STAGING_IMPORT (valores originales incluidos)
  Fuentes_guardarFilas(staging);

  // 3) pipeline puro sobre el store real
  var store = { pacientes: Modelo_leerPacientes(), eventos: [] };
  var salida = Ingresos_procesarFilas(staging, store, {
    nuevoId: Modelo_nuevoIdInterno,
    confirmarNuevos: !!opciones.confirmarNuevos
  });
  salida.resumen.ejecucion = ejecucion;

  // 4) persistencia por lotes
  Modelo_agregarPacientes(salida.pacientesNuevos, { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ingresos-pacientes' });
  Modelo_agregarEventos(salida.eventos, _ingresosUsuarioActual(), { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ingresos-eventos' });

  // 5) estados de vuelta en las hojas de ingreso
  Ingresos_escribirEstados(salida.resultados);

  // 5b) casos ambiguos → cola de revisión (CONFLICTOS)
  var conflicto = null;
  try {
    var filasConflicto = [];
    staging.forEach(function (f) {
      var r = f.RESULTADO_IDENTIFICACION;
      if (r && (r.resultado === 'POSIBLE_DUPLICADO' || r.resultado === 'REQUIERE_REVISION')) {
        filasConflicto.push(Rev_filaConflicto(f));
      }
    });
    if (filasConflicto.length) {
      conflicto = Modelo_agregarConflictos(filasConflicto, function (filaArr) {
        try { return JSON.parse(filaArr[5]).idProvisional || ''; } catch (e) { return ''; }
      });
    }
  } catch (e) {
    Log_warning('Ingresos', 'colaRevision', e && e.message ? e.message : String(e));
  }

  // 6) reflejar el resultado en las vistas sectoriales (derivadas, no bases)
  var vistas = null;
  try {
    if (typeof Modelo_refrescarVistasSectores === 'function') vistas = Modelo_refrescarVistasSectores();
  } catch (e) {
    Log_warning('Ingresos', 'refrescarSectores', e && e.message ? e.message : String(e));
  }

  salida.resumen.usuario = _ingresosUsuarioActual();
  salida.resumen.vistasSector = vistas;
  salida.resumen.aRevision = conflicto;
  Log_info('Ingresos', 'procesar', JSON.stringify({
    leidos: salida.resumen.leidos, nuevos: salida.resumen.nuevos,
    existentes: salida.resumen.existentes, revision: salida.resumen.revision,
    conError: salida.resumen.conError, eventos: salida.resumen.eventosCreados
  }), { ejecucion: ejecucion });
  Log_flush();

  return salida.resumen;
}

/**
 * PURA (helper del wrapper): sincroniza la caché de estado vigente de UN
 * paciente tras registrar un evento manual (último seguimiento/control).
 * @param {Object} paciente objeto canónico (se muta)
 * @param {Object} evento evento recién creado
 */
function Ingresos_sincronizarCache(paciente, evento) {
  if (!paciente || !evento) return paciente;
  var fecha = Utl_texto(evento.FECHA_EVENTO);
  if (evento.TIPO_EVENTO === 'CONTROL') paciente.ULTIMO_CONTROL = fecha;
  if (evento.TIPO_EVENTO === 'SEGUIMIENTO') paciente.ULTIMO_SEGUIMIENTO = fecha;
  if (evento.TIPO_EVENTO === 'INGRESO' && !Utl_vacio(fecha)) paciente.FECHA_INGRESO = paciente.FECHA_INGRESO || fecha;
  paciente.FECHA_ACTUALIZACION = new Date();
  return paciente;
}

/** Semilla ficticia → nombres de hoja destino según sector del origen. */
function Ingresos_hojaParaSector(sectorCanonica) {
  for (var hoja in HOJAS_INGRESO) {
    if (HOJAS_INGRESO.hasOwnProperty(hoja) && HOJAS_INGRESO[hoja] === sectorCanonica) return hoja;
  }
  return '';
}

// ---------------------------------------------------------------------------
// ETAPA 4 — Cola de revisión (CONFLICTOS)
// ---------------------------------------------------------------------------

/**
 * PURA: fila para la cola de revisión a partir de una fila de staging cuyo
 * resultado fue REQUIERE_REVISION o POSIBLE_DUPLICADO. Guarda los datos
 * necesarios para resolver después sin re-procesar la hoja de origen.
 */
function Rev_filaConflicto(filaStaging) {
  var iden = filaStaging.RESULTADO_IDENTIFICACION || {};
  return [
    new Date(),
    iden.resultado === 'POSIBLE_DUPLICADO' ? 'POSIBLE_DUPLICADO' : 'REQUIERE_REVISION',
    '',
    Utl_texto(filaStaging.NORMALIZADO.RUT),
    Utl_texto(filaStaging.NORMALIZADO.NOMBRE),
    JSON.stringify({
      idProvisional: filaStaging.ID_PROVISIONAL,
      origen: { archivo: filaStaging.ARCHIVO_ORIGEN, hoja: filaStaging.HOJA_ORIGEN, fila: filaStaging.FILA_ORIGEN },
      sectorOrigen: filaStaging.SECTOR_ORIGEN,
      valoresOriginales: filaStaging.VALORES_ORIGINALES,
      criterio: iden.criterio,
      confianza: iden.confianza,
      candidatoId: iden.idPaciente || ''
    }),
    Fuentes_fuenteOrigen(filaStaging),
    iden.idPaciente ? 'candidato:' + iden.idPaciente : '',
    'ABIERTO',
    ''
  ];
}

/**
 * PURA: prepara la escritura tras una decisión humana en la cola de revisión.
 * Los errores críticos de validación siguen bloqueando aunque exista decisión.
 * @param {Object} datos JSON guardado en CONFLICTOS.DETALLE
 * @param {string} decision 'CONFIRMAR_MATCH' | 'RECHAZAR_MATCH'
 * @param {Object} opciones {nuevoId()}
 * @returns {ok, accion:'ENLAZAR'|'CREAR', evento, pacienteNuevo, motivo}
 */
function Rev_prepararResolucion(datos, decision, opciones) {
  opciones = opciones || {};
  var res = { ok: false, accion: '', evento: null, pacienteNuevo: null, motivo: '' };
  if (!datos || !datos.valoresOriginales) { res.motivo = 'DATOS_INCOMPLETOS'; return res; }

  var fila = Fuentes_normalizar(Fuentes_crearFila({
    archivo: datos.origen.archivo || 'REVISION',
    hoja: datos.origen.hoja || '',
    fila: datos.origen.fila || '',
    sector: datos.sectorOrigen || ''
  }, datos.valoresOriginales));

  if (fila.ESTADO_VALIDACION === 'ERROR') {
    res.motivo = 'VALIDACION_ERROR: ' + (fila.ERRORES[0] ? fila.ERRORES[0].campo : '');
    return res;
  }

  if (decision === 'CONFIRMAR_MATCH') {
    if (!datos.candidatoId) { res.motivo = 'SIN_CANDIDATO'; return res; }
    fila.RESULTADO_IDENTIFICACION = {
      resultado: 'MATCH_PARCIAL', idPaciente: datos.candidatoId,
      criterio: 'Confirmado manualmente en revisión', confianza: 'HUMANA'
    };
    var ev = Ev_desdeStaging(fila, {});
    if (!ev.ok) { res.motivo = ev.motivo; return res; }
    res.ok = true; res.accion = 'ENLAZAR'; res.evento = ev.evento;
    return res;
  }

  if (decision === 'RECHAZAR_MATCH') {
    fila.RESULTADO_IDENTIFICACION = { resultado: 'SIN_MATCH', idPaciente: '', criterio: '', confianza: '' };
    var ev2 = Ev_desdeStaging(fila, {});
    if (!ev2.ok) { res.motivo = ev2.motivo; return res; }
    res.ok = true; res.accion = 'CREAR';
    res.pacienteNuevo = Ingresos_pacienteDesdeNormalizado(
      fila.NORMALIZADO, fila,
      opciones.nuevoId ? opciones.nuevoId() : ('EC-' + Date.now().toString(36).toUpperCase()));
    ev2.evento.ID_INTERNO = res.pacienteNuevo.ID_INTERNO; // enlazar evento a la entidad nueva
    res.evento = ev2.evento;
    return res;
  }

  res.motivo = 'DECISION_INVALIDA';
  return res;
}

/**
 * PURA: recorrido completo de una fila para diagnóstico (ETAPA 3b).
 * Devuelve el estado en cada etapa sin ejecutar escrituras.
 */
function Ingresos_trazarFila(filaStaging, indices) {
  var fila = filaStaging;
  var t = {
    idProvisional: fila ? fila.ID_PROVISIONAL : '',
    estadoValidacion: fila ? fila.ESTADO_VALIDACION : 'FILA_INVALIDA',
    errores: fila ? fila.ERRORES : [],
    warnings: fila ? fila.WARNINGS : [],
    identificacion: null,
    decisionGate: '',
    motivoBloqueo: ''
  };
  if (!fila || !fila.NORMALIZADO || !fila.NORMALIZADO.RUT_ESTADO) {
    t.decisionGate = 'BLOQUEADO';
    t.motivoBloqueo = 'FILA_INVALIDA';
    return t;
  }
  var iden = Iden_identificar(fila.NORMALIZADO, indices);
  fila.RESULTADO_IDENTIFICACION = iden;
  t.identificacion = { resultado: iden.resultado, criterio: iden.criterio, confianza: iden.confianza, idPaciente: iden.idPaciente };

  if (fila.ESTADO_VALIDACION === 'ERROR') {
    t.decisionGate = 'BLOQUEADO';
    t.motivoBloqueo = t.errores[0] ? (t.errores[0].campo + ': ' + t.errores[0].mensaje) : 'error de validación';
    return t;
  }
  t.decisionGate = Ingresos_decidirEscritura(fila);
  if (t.decisionGate === 'REVISION') t.motivoBloqueo = iden.criterio || 'requiere revisión manual';
  return t;
}

/**
 * Diagnóstico de integración: por cada hoja INGRESO_* reporta encabezados
 * físicos, mapeo reconocido/desconocido, filas pendientes y un histograma
 * del PRIMER error de cada fila. Escribe el reporte en la hoja DIAGNOSTICO
 * para que el usuario vea exactamente por qué falla cada fila.
 */
function Ingresos_diagnosticar() {
  var ss = Modelo_ss();
  var lineas = [];
  Object.keys(HOJAS_INGRESO).forEach(function (nombreHoja) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) {
      lineas.push([nombreHoja, 'HOJA NO EXISTE', '', '', '']);
      return;
    }
    var valores = Utl_leerBloque(hoja);
    var mapa = Ingresos_mapearEncabezadosHoja(valores[0] || []);
    var faltantes = CAMPOS_INGRESO_OPERATIVOS.filter(function (c) { return mapa.campos[c] === undefined; });
    lineas.push([nombreHoja, 'ENCABEZADOS', 'reconocidos', JSON.stringify(Object.keys(mapa.campos)), '']);
    lineas.push([nombreHoja, 'ENCABEZADOS', 'faltantes', JSON.stringify(faltantes), '']);
    if (mapa.desconocidos.length) {
      lineas.push([nombreHoja, 'DESCONOCIDOS',
        mapa.desconocidos.length + ' col', JSON.stringify(mapa.desconocidos), '']);
    }
    if (!faltantes.length && valores.length >= 2) {
      var histograma = {};
      for (var f = 1; f < valores.length; f++) {
        var filaVal = valores[f];
        var nombreRaw = mapa.campos.NOMBRE !== undefined ? filaVal[mapa.campos.NOMBRE] : '';
        var rutRaw = mapa.campos.RUT !== undefined ? filaVal[mapa.campos.RUT] : '';
        if (Utl_vacio(nombreRaw) && Utl_vacio(rutRaw)) continue;
        var v = {};
        CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
          if (mapa.campos[c] !== undefined) v[c] = filaVal[mapa.campos[c]];
        });
        var stg = Fuentes_normalizar(Fuentes_crearFila(
          { archivo: 'DIAG', hoja: nombreHoja, fila: f + 1, sector: HOJAS_INGRESO[nombreHoja] }, v));
        if (stg.ESTADO_VALIDACION === 'ERROR') {
          var e0 = stg.ERRORES[0];
          var llave = e0.campo + ': ' + e0.mensaje;
          histograma[llave] = (histograma[llave] || 0) + 1;
        } else if (stg.ESTADO_VALIDACION === 'WARNING') {
          histograma['(WARNING)'] = (histograma['(WARNING)'] || 0) + 1;
        } else {
          histograma['(OK)'] = (histograma['(OK)'] || 0) + 1;
        }
      }
      Object.keys(histograma).forEach(function (k) {
        lineas.push([nombreHoja, 'FILAS', String(histograma[k]), k, '']);
      });
    }
  });

  // volcar a hoja DIAGNOSTICO (sobrescribe contenido previo)
  var hojaD = ss.getSheetByName('DIAGNOSTICO');
  if (!hojaD) hojaD = ss.insertSheet('DIAGNOSTICO');
  hojaD.clearContents();
  Utl_escribirBloque(hojaD, 1, 1, [['HOJA', 'TIPO', 'CANTIDAD/CLAVE', 'DETALLE', '']]);
  Utl_escribirBloque(hojaD, 2, 1, lineas);
  Log_info('Ingresos', 'diagnosticar', JSON.stringify(lineas).substring(0, 450));
  Log_flush();
  return lineas;
}
