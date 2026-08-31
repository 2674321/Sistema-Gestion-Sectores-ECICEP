/**
 * Sistema ECICEP Unificado — 24_Formulario
 * Puerta de entrada controlada vía Google Form (v0.9.0 — DEC-048).
 *
 * El formulario es SOLO captura + validación + normalización; NUNCA una base
 * paralela ni acceso directo a PACIENTES. Tras validarse:
 *   - NUEVO_INGRESO      → fila canónica en INGRESO_<SECTOR> y el pipeline
 *                          existente (Ingresos_procesarTodasLasHojas) decide
 *                          CREAR_PACIENTE / ENLAZAR_EXISTENTE / REVISION.
 *   - CONTROL/SEGUIMIENTO→ reusan api_registrarEvento (recalcula próximo control).
 *   - ACTUALIZAR_DATOS   → campos operativos (teletono/observaciones) + evento OTRO.
 *
 * Núcleo puro (testeable en node, determinista): Form_validarRespuesta,
 * Form_procesarLote, Form_metricas, Form_simularRespuestas, mapeos y estados.
 * Los wrappers GAS (captura, trigger, persistencia, LockService) están
 * claramente separados y solo operan en Apps Script.
 *
 * Idempotencia: clave = Response ID real del formulario (FormResponse.getId()).
 * - La hoja técnica FORM_RESPUESTAS guarda estados RECIBIDO → … → PROCESADO.
 * - Las respuestas PROCESADO nunca se reprocesan.
 * - Los eventos clínicos llevan FUENTE 'FORM|<responseId>|<ACCIÓN>' como marca:
 *   un reintento seguro detecta la marca y no duplica el evento.
 * - Las filas de ingreso anexadas no se vuelven a anexar (INGRESO_FILA) y el
 *   pipeline ignora las ya INGRESADO (idempotencia nativa).
 */

// ---------------------------------------------------------------------------
// NÚCLEO PURO — config y mapeo
// ---------------------------------------------------------------------------

function Form_campos() { return FORM_CONFIG.CAMPOS; }

/** Columnas físicas de FORM_RESPUESTAS (única especificación). */
function Form_columnas() { return FORM_RESPUESTAS_COLUMNAS; }

/** PURA: mapeo tolerante de encabezados → índice de columna (por contenido,
 *  jamás por número fijo). Devuelve {idx:{clave→indice}, desconocidos:[]}. */
function Form_mapeoEncabezados(encabezados) {
  var idx = {}, desconocidos = [];
  (encabezados || []).forEach(function (h, i) {
    if (!Utl_vacio(h)) idx[Utl_claveAlnum(h)] = i;
    else desconocidos.push(i);
  });
  return { idx: idx, desconocidos: desconocidos };
}

/** PURA: marca de trazabilidad 'FORM|<responseId>|<ACCIÓN>'. */
function Form_marcadorFuente(responseId, accion) {
  return FORM_CONFIG.MARCAS.PREFIJO + Utl_texto(responseId) + '|' + Utl_texto(accion);
}

/** PURA: nombre de la puerta de ingreso por sector canónico. */
function Form_sectorHojaIngreso(sector) {
  var s = Utl_texto(sector).toUpperCase();
  if (s === 'NARANJO') return 'INGRESO_NARANJO';
  if (s === 'AMARILLO') return 'INGRESO_AMARILLO';
  if (s === 'VERDE') return 'INGRESO_VERDE';
  return '';
}

/** PURA: hoy en ISO (sobrescribible con opciones.hoy para tests). */
function Form_hoy(opciones) {
  return (opciones && opciones.hoy) ? opciones.hoy : (function () {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  })();
}

/** PURA: resumen legible de errores por campo para MOTIVO/cola. */
function Form_erroresTexto(errores) {
  return (errores || []).map(function (e) {
    return Utl_texto(e.campo) + ': ' + Utl_texto(e.mensaje);
  }).join(' · ');
}

// ---------------------------------------------------------------------------
// NÚCLEO PURO — validación y normalización de una respuesta
// ---------------------------------------------------------------------------

/**
 * PURA: valida y normaliza una respuesta cruda contro la acción solicitada.
 * Reusa los normalizadores existentes (Norm_*) — jamás duplica reglas.
 * @param {Object} respuesta  crudo por campo: {ACCION, RUT, NOMBRE, SEXO,
 *                            FECHA_NACIMIENTO, SECTOR, ESTRATIFICACION,
 *                            TELEFONOS, FECHA_EVENTO, PROFESIONAL, OBSERVACIONES}
 * @param {Object} [opciones] {hoy:'YYYY-MM-DD'}
 * @returns {ok, errores:[{campo,mensaje}], normalizado, accion}
 */
function Form_validarRespuesta(respuesta, opciones) {
  var v = respuesta || {};
  var err = [], n = {};
  function no(campo, msg) { err.push({ campo: campo, mensaje: msg }); }
  var accion = Utl_colapsarEspacios(Utl_texto(v.ACCION)).toUpperCase();
  n.ACCION = accion;

  if (FORM_CONFIG.ACCIONES.VALIDOS.indexOf(accion) === -1) {
    no('ACCION', 'Acción no válida: "' + Utl_texto(v.ACCION) + '"');
  }

  // RUT (obligatorio para todas las acciones)
  var rut = Norm_normalizarRut(v.RUT);
  n.RUT = rut.rut;
  n.RUT_CUERPO = rut.cuerpo;
  n.RUT_ESTADO = rut.estado;
  if (rut.estado === 'VACIO') no('RUT', 'RUT ausente');
  else if (rut.estado === 'INVALIDO') no('RUT', rut.detalle);
  else if (rut.estado === 'SIN_DV') no('RUT', 'RUT sin dígito verificador: el formulario exige RUT completo');

  // Campos según acción
  var esIngreso = accion === 'NUEVO_INGRESO';
  var esClinica = accion === 'REGISTRAR_CONTROL' || accion === 'REGISTRAR_SEGUIMIENTO';

  if (esIngreso) {
    var nom = Norm_normalizarNombre(v.NOMBRE);
    n.NOMBRE = nom.nombre;
    if (!nom.ok) no('NOMBRE', 'Nombre ausente o incompleto');

    n.SEXO = Norm_normalizarSexo(v.SEXO);

    var nac = Norm_normalizarFecha(v.FECHA_NACIMIENTO,
      { min: CFG_FECHAS.ANO_MIN_NACIMIENTO, max: CFG_FECHAS.ANO_MAX });
    n.FECHA_NACIMIENTO = nac.iso;
    if (nac.estado === 'VACIO') no('FECHA_NACIMIENTO', 'Fecha de nacimiento ausente');
    else if (nac.estado !== 'VALIDA') no('FECHA_NACIMIENTO', nac.detalle + (nac.detalle ? '' : 'Fecha de nacimiento inválida'));

    var sec = Norm_normalizarSector(v.SECTOR);
    n.SECTOR = sec.sector;
    if (sec.estado === 'VACIO') no('SECTOR', 'Sector ausente');
    else if (sec.estado === 'INVALIDO') no('SECTOR', 'Sector inválido: "' + Utl_texto(v.SECTOR) + '"');
    else if (SECTORES_RESPONSABLES.indexOf(n.SECTOR) === -1) no('SECTOR', 'Sector no admitido por formulario: "' + n.SECTOR + '"');
    else if (!Form_sectorHojaIngreso(n.SECTOR)) no('SECTOR', 'Sin puerta de ingreso para "' + n.SECTOR + '"');

    n.ESTRATIFICACION = Norm_normalizarEstratificacion(v.ESTRATIFICACION);
    n.ESTRAT_ORIGEN = Utl_colapsarEspacios(Utl_texto(v.ESTRATIFICACION)).toUpperCase();
    if (n.ESTRAT_ORIGEN !== '' && ['G1', 'G2', 'G3'].indexOf(n.ESTRATIFICACION) === -1) {
      no('ESTRATIFICACION', 'Estratificación inválida: "' + Utl_texto(v.ESTRATIFICACION) + '"');
    }

    n.FECHA_INGRESO = Form_hoy(opciones);
  }

  if (esClinica) {
    var fEv = Norm_normalizarFecha(v.FECHA_EVENTO);
    n.FECHA_EVENTO = fEv.iso;
    if (fEv.estado === 'VACIO') {
      no('FECHA_EVENTO', 'Fecha del evento ausente');
    } else if (fEv.estado !== 'VALIDA') {
      no('FECHA_EVENTO', fEv.detalle || 'Fecha del evento inválida');
    }
  }

  if (accion === 'ACTUALIZAR_DATOS') {
    // solo campos operativos en caso match; la identidad se resuelve aguas abajo
  }

  // Campos compartidos (opcionales). El teléfono NO bloquea un ingreso válido:
  // si viene inválido se registra vacío (el pipeline emite advertencias).
  var tel = Norm_normalizarTelefono(v.TELEFONOS !== undefined ? v.TELEFONOS : '');
  n.TELEFONOS = tel.telefonos.join('/');
  n.PROFESIONAL = Utl_colapsarEspacios(Utl_texto(v.PROFESIONAL)).toUpperCase();
  n.OBSERVACIONES = Utl_texto(v.OBSERVACIONES).trim();
  n.DESCRIPCION = '';

  return { ok: err.length === 0, errores: err, normalizado: n, accion: accion };
}

/**
 * PURA: fila canónica para anexar en INGRESO_<SECTOR> (orden INGRESO_COLUMNAS).
 * ESTADO_INGRESO va vacío (el pipeline lo escribe) y NOTA_SISTEMA lleva la
 * marca de trazabilidad 'FORM|<responseId>|INGRESO'.
 */
function Form_filaCanonicaIngreso(normalizado, marca, opciones) {
  return [
    normalizado.NOMBRE || '',
    normalizado.RUT || '',
    normalizado.SEXO || '',
    normalizado.FECHA_NACIMIENTO || '',
    normalizado.TELEFONOS || '',
    normalizado.FECHA_INGRESO || Form_hoy(opciones),
    normalizado.ESTRATIFICACION || '',
    '',
    normalizado.OBSERVACIONES || '',
    '',
    marca || ''
  ];
}

// ---------------------------------------------------------------------------
// NÚCLEO PURO — procesamiento de lote (decisiones, sin I/O)
// ---------------------------------------------------------------------------

/**
 * PURA: decide por cada respuesta pendiente qué hacer. No ejecuta efectos.
 * @param {Object[]} respuestas  [{responseId, accion, crudo, estadoPrevio,
 *                                reintentos, ingresoHoja, ingresoFila}]
 * @param {Object} ctx  {indiceRut:{RUT-canónico→paciente}, marcas:{FUENTE→true}}
 * @param {Object} [opciones] {hoy}
 * @returns {decisiones:[{responseId, accion, decision, motivo, idInterno,
 *                        normalizado, errores, ingreso:{sector,hoja,fila}}],
 *            resumen:{...}}
 * decision: SALTAR | ERROR | CUARENTENA | CLINICA | ANEXAR
 *           (CUARENTENA = persona no encontrada / requiere decisión humana)
 */
function Form_procesarLote(respuestas, ctx, opciones) {
  ctx = ctx || {};
  var marcas = ctx.marcas || {};
  var respuestasN = respuestas || [];
  var decisiones = [];
  var resumen = {
    leidos: respuestasN.length,
    saltados: 0, error: 0, cuarentena: 0, clinica: 0, anexos: 0, validos: 0
  };

  for (var i = 0; i < respuestasN.length; i++) {
    var r = respuestasN[i];
    var sobr = {
      responseId: Utl_texto(r.responseId),
      accion: Utl_colapsarEspacios(Utl_texto((r.crudo && r.crudo.ACCION))).toUpperCase(),
      decision: 'SALTAR', motivo: '', idInterno: '', normalizado: null, errores: [],
      ingreso: null,
      filaFisica: r.filaFisica !== undefined ? r.filaFisica : '',
      estadoPrevio: r.estadoPrevio || 'RECIBIDO',
      reintentos: Number(r.reintentos) || 0,
      ingresoHoja: r.ingresoHoja || '', ingresoFila: r.ingresoFila || ''
    };
    if (!sobr.responseId) { sobr.motivo = 'SIN_RESPONSE_ID'; resumen.saltados += 1; decisiones.push(sobr); continue; }
    if (r.estadoPrevio === 'PROCESADO') { sobr.motivo = 'YA_PROCESADO'; resumen.saltados += 1; decisiones.push(sobr); continue; }

    // Validación + normalización
    var valid = Form_validarRespuesta(r.crudo, opciones);
    sobr.accion = valid.accion;
    sobr.normalizado = valid.normalizado;
    sobr.errores = valid.errores;
    if (!valid.ok) {
      sobr.decision = 'ERROR';
      sobr.motivo = Form_erroresTexto(valid.errores);
      resumen.error += 1;
      decisiones.push(sobr);
      continue;
    }

    var esIngreso = valid.accion === 'NUEVO_INGRESO';

    if (esIngreso) {
      // Idempotencia: si ya se anexó la fila (INGRESO_FILA registrado) no anexar de nuevo
      if (!Utl_vacio(r.ingresoFila)) {
        sobr.decision = 'YA_ANEXADO';
        sobr.motivo = 'Fila de ingreso ya anexada (fila ' + r.ingresoFila + ')';
        sobr.ingreso = { sector: valid.normalizado.SECTOR, hoja: r.ingresoHoja || '', fila: r.ingresoFila || '' };
        resumen.saltados += 1;
        decisiones.push(sobr);
        continue;
      }
      sobr.decision = 'ANEXAR';
      sobr.ingreso = {
        sector: valid.normalizado.SECTOR,
        hoja: Form_sectorHojaIngreso(valid.normalizado.SECTOR),
        fila: ''
      };
      resumen.anexos += 1; resumen.validos += 1;
      decisiones.push(sobr);
      continue;
    }

    // Acciones clínicas sobre persona EXISTENTE (identidad por RUT exacto, ley exacta)
    var paciente = (ctx.indiceRut && valid.normalizado.RUT) ? ctx.indiceRut[Utl_texto(valid.normalizado.RUT).toUpperCase()] : null;
    if (!paciente) {
      sobr.decision = 'CUARENTENA';
      sobr.motivo = 'PERSONA_NO_ENCONTRADA: el RUT no existe en la base (¿usar "Nuevo ingreso"?)';
      resumen.cuarentena += 1;
      decisiones.push(sobr);
      continue;
    }
    var marca = Form_marcadorFuente(sobr.responseId, valid.accion);
    if (marcas[marca]) {
      sobr.decision = 'PROCESADO_YA';
      sobr.motivo = 'Evento con esta marca ya registrado (reintento seguro)';
      sobr.idInterno = paciente.ID_INTERNO || '';
      resumen.saltados += 1;
      decisiones.push(sobr);
      continue;
    }
    sobr.decision = 'CLINICA';
    sobr.idInterno = paciente.ID_INTERNO || '';
    resumen.clinica += 1; resumen.validos += 1;
    decisiones.push(sobr);
  }

  return { decisiones: decisiones, resumen: resumen };
}

// ---------------------------------------------------------------------------
// NÚCLEO PURO — estados de resultado y métricas
// ---------------------------------------------------------------------------

/**
 * PURA: traduce el estado de una fila INGRESO_* (escrito por el pipeline) al
 * estado interno del formulario. Solo el pipeline decide duplicados/revisión.
 */
function Form_mapearResultadoFila(estadoIngreso, nota) {
  var estado = Utl_texto(estadoIngreso).toUpperCase();
  if (estado === 'INGRESADO') return { estado: 'PROCESADO', motivo: 'Respuesta procesada por el pipeline de ingresos' };
  if (estado === 'DUPLICADO' || estado === 'REQUIERE_REVISION') return { estado: 'REQUIERE_REVISION', motivo: nota || ('Requiere revisión (' + estado + ')') };
  if (estado === 'ERROR') return { estado: 'ERROR', motivo: nota || 'Error del pipeline' };
  return { estado: 'ERROR', motivo: 'Sin resultado del pipeline (' + (estado || 'SIN_ESTADO') + ')' };
}

/**
 * PURA: métricas agregadas (sin cargar todos los datos en el panel).
 * @param {Object[]} filas  [{ESTADO, ACCION, FECHA_FORMS}]
 */
function Form_metricas(filas) {
  var m = {
    total: 0, porEstado: {}, porAccion: {}, pendientes: 0, procesados: 0,
    revision: 0, error: 0, ultimaCaptura: ''
  };
  (filas || []).forEach(function (f) {
    m.total += 1;
    var est = Utl_texto(f.ESTADO).toUpperCase() || 'RECIBIDO';
    m.porEstado[est] = (m.porEstado[est] || 0) + 1;
    var acc = Utl_texto(f.ACCION).toUpperCase() || 'SIN_ACCION';
    m.porAccion[acc] = (m.porAccion[acc] || 0) + 1;
    var fs = Utl_texto(f.FECHA_FORMS);
    if (fs > m.ultimaCaptura) m.ultimaCaptura = fs;
    if (est === 'RECIBIDO' || est === 'VALIDANDO' || est === 'VALIDO') m.pendientes += 1;
    else if (est === 'PROCESADO') m.procesados += 1;
    else if (est === 'REQUIERE_REVISION') m.revision += 1;
    else if (est === 'ERROR') m.error += 1;
  });
  return m;
}

/**
 * PURA: simulador determinista de respuestas del formulario.
 * @param {number} cantidad  10 | 100 | 500 | 1000 | 3000
 * @param {Object} [opciones] {semilla, porcentajeInvalidos}
 * @returns [{responseId, crudo:{...}}]
 */
function Form_simularRespuestas(cantidad, opciones) {
  opciones = opciones || {};
  var semilla = opciones.semilla === undefined ? 4815162342 : opciones.semilla;
  var x = semilla >>> 0;
  function rnd() { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }
  var nombres = ['MARIA JOSE FUENTES', 'JUAN PABLO SOTO', 'ANA CRISTINA RIVEROS', 'PEDRO ANDRES GONZALEZ', 'CAROLINA ANDREA MUNOZ', 'LUIS ALBERTO SALAS', 'VALENTINA PAZ ROJAS', 'FRANCISCO JAVIER LOPEZ', 'CAMILA ALEJANDRA TORRES', 'SEBASTIAN IGNACIO DIAZ'];
  var acciones = FORM_CONFIG.ACCIONES.VALIDOS;
  var salida = [];
  var usados = {};
  for (var i = 0; i < cantidad; i++) {
    var cuerpo = String(Math.floor(1000000 + rnd() * 8000000));
    if (usados[cuerpo]) { i -= 1; continue; }
    usados[cuerpo] = true;
    var rutCompleto = cuerpo + '-' + Norm_dvModulo11(cuerpo);
    var accion = acciones[i % acciones.length];
    var crudo = { ACCION: accion, RUT: rutCompleto };
    if (accion === 'NUEVO_INGRESO') {
      crudo.NOMBRE = nombres[i % nombres.length];
      crudo.SEXO = (i % 2) ? 'M' : 'F';
      crudo.FECHA_NACIMIENTO = (1940 + (i % 70)) + '-' + ('0' + ((i % 12) + 1)).slice(-2) + '-' + ('0' + ((i % 27) + 1)).slice(-2);
      crudo.SECTOR = SECTORES_RESPONSABLES[i % 3];
      crudo.ESTRATIFICACION = (i % 5 === 0) ? '' : 'G' + ((i % 3) + 1);
      crudo.TELEFONOS = '+569' + String(10000000 + (i % 80000000));
    }
    if (accion === 'REGISTRAR_CONTROL' || accion === 'REGISTRAR_SEGUIMIENTO') {
      crudo.FECHA_EVENTO = '2026-' + ('0' + ((i % 12) + 1)).slice(-2) + '-' + ('0' + ((i % 27) + 1)).slice(-2);
      crudo.PROFESIONAL = (i % 2) ? 'MATRONA' : 'TENS';
    }
    if (accion === 'ACTUALIZAR_DATOS') {
      crudo.TELEFONOS = '+569' + String(20000000 + (i % 7000000));
    }
    if (opciones.porcentajeInvalidos && (i % Math.round(100 / opciones.porcentajeInvalidos)) === 1) {
      crudo.RUT = 'SIN-RUT-' + i;
    }
    salida.push({ responseId: 'SIM-' + String(10000 + i), crudo: crudo });
  }
  return salida;
}

/** PURA: filas pendientes de una lectura de FORM_RESPUESTAS (por estado). */
function Form_filasPendientes(valores, mapa, maxReintentos, max) {
  var camposInfo = Form_campos();
  max = typeof max === 'number' ? max : Infinity;
  var salida = [];
  for (var f = 1; f < valores.length; f++) {
    if (salida.length >= max) break;
    var fila = valores[f];
    var idx = mapa.idx;
    var estado = idx['ESTADO'] !== undefined ? Utl_texto(fila[idx['ESTADO']]).toUpperCase() : '';
    var responseId = idx['RESPONSEID'] !== undefined ? Utl_texto(fila[idx['RESPONSEID']]) : '';
    if (!responseId) continue;
    if (estado === 'PROCESADO') continue;
    if (estado === 'REQUIERE_REVISION') continue; // requieren decisión humana, no se reintentan
    if (estado === 'ERROR') {
      var reint = idx['REINTENTOS'] !== undefined ? Number(fila[idx['REINTENTOS']]) || 0 : 0;
      if (reint >= (maxReintentos || FORM_CONFIG.MAX_REINTENTOS)) continue;
    }
    var crudo = {};
    camposInfo.forEach(function (c) {
      var k = Utl_claveAlnum(c.campo);
      if (idx[k] !== undefined) crudo[c.campo] = fila[idx[k]];
    });
    salida.push({
      filaFisica: Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS) + f - 1,
      responseId: responseId,
      estadoPrevio: estado || 'RECIBIDO',
      reintentos: idx['REINTENTOS'] !== undefined ? (Number(fila[idx['REINTENTOS']]) || 0) : 0,
      ingresoHoja: idx['INGRESOHOJA'] !== undefined ? Utl_texto(fila[idx['INGRESOHOJA']]) : '',
      ingresoFila: idx['INGRESOFILA'] !== undefined ? Utl_texto(fila[idx['INGRESOFILA']]) : '',
      crudo: crudo
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// WRAPPERS GAS — instalación, diagnóstico y reparación (idempotentes)
// ---------------------------------------------------------------------------

/**
 * Instalador idempotente de la ESTRUCTURA técnica del formulario.
 * NO crea ni modifica el Google Form (DEC-047: instalación = diagnóstico +
 * preparación; la creación es una acción opcional explícita del admin).
 */
function Form_instalar() {
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  var cambios = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || Modelo_ss();
    var hoja = ss.getSheetByName(HOJAS.FORM_RESPUESTAS);
    var creada = false;
    if (!hoja) {
      hoja = ss.insertSheet(HOJAS.FORM_RESPUESTAS);
      creada = true;
      cambios.push('Hoja FORM_RESPUESTAS creada');
    }
    var cols = Form_columnas();
    var enc = hoja.getRange(1, 1, 1, cols.length).getValues()[0];
    var desalineado = false;
    cols.forEach(function (c, i) {
      if (Utl_claveAlnum(enc[i]) !== Utl_claveAlnum(c)) desalineado = true;
    });
    if (desalineado) {
      hoja.getRange(1, 1, 1, cols.length).setValues([cols]);
      cambios.push('Encabezados de FORM_RESPUESTAS realineados');
    }
    if (creada || !hoja.isSheetHidden()) {
      hoja.hideSheet();
    }
    try { hoja.setTabColor(DESIGN_SYSTEM.MARCA.tecnico); } catch (e) { /* color no crítico */ }
    Form_instalarTrigger();
    return {
      ok: true, hoja: creada ? 'creada' : 'existente', cambios: cambios,
      formIdConfigurado: !Utl_vacio(FORM_CONFIG.FORM_ID),
      version: FORM_CONFIG.FORM_VERSION,
      nota: (Utl_vacio(FORM_CONFIG.FORM_ID))
        ? 'FORM_ID sin configurar: se prepara la estructura; el formulario se crea manualmente en Google Forms y se asocia en FORM_CONFIG.'
        : 'Estructura lista; revisar diagnóstico.'
    };
  } catch (e) {
    Log_error('Formulario', 'instalar', e && e.message ? e.message : String(e));
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** GAS: trigger instalado (idempotente por handler). */
function Form_instalarTrigger() {
  if (typeof ScriptApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  try {
    if (Form_triggerInstalado()) return { ok: true, activado: false, motivo: 'Ya instalado' };
    if (Utl_vacio(FORM_CONFIG.FORM_ID)) return { ok: false, motivo: 'FORM_ID_NO_CONFIGURADO' };
    var gate = Entorno_gateGAS();
    if (!gate.ok) return { ok: false, motivo: gate.motivo, detalle: gate.detalle };
    var ss = Modelo_ss();
    ScriptApp.newTrigger('Form_onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
    return { ok: true, activado: true };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** GAS: ¿hay un trigger de envío instalado para nuestro manejador? */
function Form_triggerInstalado() {
  if (typeof ScriptApp === 'undefined') return false;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'Form_onFormSubmit') return true;
    }
  } catch (e) { /* sin permisos o sin script */ }
  return false;
}

/**
 * GAS: diagnóstico completo, SIN efectos secundarios. Incluye entorno
 * (DEV/DEMO), spreadsheet esperado, Form del entorno, mapeo pregunta→campo,
 * trigger, estructura (staging) y procesador (v0.9.1).
 */
function Form_diagnosticar() {
  var checks = [];
  if (typeof SpreadsheetApp === 'undefined') {
    return { ok: false, motivo: 'SOLO_GAS', checks: checks };
  }
  var cur = Entorno_actualGAS();

  // Entorno + recursos (puro, reutilizado por la batería de aceptación)
  var mapeo = -1;
  if (typeof FormApp !== 'undefined' && !Utl_vacio(FORM_CONFIG.FORM_ID)) {
    try {
      var form = FormApp.openById(FORM_CONFIG.FORM_ID);
      var porPregunta = form.getItems().map(function (it) { return it.getTitle(); });
      var halladas = 0;
      Form_campos().forEach(function (c) {
        if (porPregunta.indexOf(c.pregunta) !== -1) halladas += 1;
      });
      mapeo = halladas;
    } catch (e) { mapeo = -1; }
  }
  var envDiag = Entorno_diagnostico(cur.ssId, FORM_CONFIG.FORM_ID, {
    trigger: Form_triggerInstalado(),
    procesador: typeof Form_procesarPendientes === 'function' && !!FORM_CONFIG.ACTIVO,
    mapeo: mapeo,
    campos: Form_campos().length,
    carpetaBackup: Entorno_carpetaEsperada(cur.entorno)
  });

  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  checks.push({ nombre: 'estructura', ok: !!hoja, detalle: hoja ? 'Hoja FORM_RESPUESTAS presente' : 'Falta la hoja FORM_RESPUESTAS' });
  checks.push({ nombre: 'form_id', ok: !Utl_vacio(FORM_CONFIG.FORM_ID), detalle: Utl_vacio(FORM_CONFIG.FORM_ID) ? 'FORM_ID sin configurar' : 'FORM_ID: ' + FORM_CONFIG.FORM_ID });
  var formOk = false;
  if (!Utl_vacio(FORM_CONFIG.FORM_ID) && typeof FormApp !== 'undefined') {
    try { FormApp.openById(FORM_CONFIG.FORM_ID); formOk = true; } catch (e) { formOk = false; }
  }
  checks.push({ nombre: 'form_accesible', ok: formOk, detalle: formOk ? 'Formulario accesible' : 'No se puede abrir el formulario configurado' });

  checks = checks.concat(envDiag.checks);

  var metricas = Form_obtenerEstado();
  return {
    ok: checks.every(function (c) { return c.ok; }),
    checks: checks,
    entorno: envDiag.entorno,
    ssId: cur.ssId,
    metricas: metricas && metricas.metricas ? metricas.metricas : {},
    versionSistema: ECICEP.VERSION,
    versionForm: FORM_CONFIG.FORM_VERSION
  };
}

/**
 * GAS: reparación idempotente. Nunca borra datos ni recría un formulario
 * eliminado (solo informa la deuda técnica como pendiente humano).
 */
function Form_reparar() {
  var reparados = [], pendientes = [];
  var instala = Form_instalar();
  if (instala.ok && instala.cambios && instala.cambios.length) reparados = reparados.concat(instala.cambios);
  if (!Form_triggerInstalado()) {
    pendientes.push({ nombre: 'trigger', sugerencia: 'Ejecutar "📥 Formularios → Instalar" (o Form_instalar) para crear el trigger de envío' });
  }
  if (Utl_vacio(FORM_CONFIG.FORM_ID)) {
    pendientes.push({ nombre: 'form_id', sugerencia: 'Crear el formulario en Google Forms y completar FORM_CONFIG.FORM_ID' });
  }
  return { ok: pendientes.length === 0, reparados: reparados, pendientes: pendientes };
}

/**
 * GAS: estado agregado para el panel de administración (sin datos clínicos,
 * solo contadores agregados).
 */
function Form_obtenerEstado() {
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  try {
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    var filas = [];
    if (hoja && hoja.getLastRow() >= Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
      var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
      var mapa = Form_mapeoEncabezados(valores[0]);
      for (var f = 1; f < valores.length; f++) {
        filas.push({
          ESTADO: mapa.idx['ESTADO'] !== undefined ? valores[f][mapa.idx['ESTADO']] : '',
          ACCION: mapa.idx['ACCION'] !== undefined ? valores[f][mapa.idx['ACCION']] : '',
          FECHA_FORMS: mapa.idx['FECHAFORMS'] !== undefined ? valores[f][mapa.idx['FECHAFORMS']] : ''
        });
      }
    }
    var cur = Entorno_actualGAS();
    return {
      ok: true,
      entorno: { entorno: cur.entorno, ssId: cur.ssId, coincide: cur.coincide },
      config: { activo: FORM_CONFIG.ACTIVO, formId: FORM_CONFIG.FORM_ID, version: FORM_CONFIG.FORM_VERSION },
      triggerInstalado: Form_triggerInstalado(),
      metricas: Form_metricas(filas)
    };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// WRAPPERS GAS — captura y procesamiento
// ---------------------------------------------------------------------------

/** GAS: marca más reciente ya capturada (para FROM → getResponses(desde)). */
function Form_ultimaCaptura() {
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  var maxTs = '';
  if (hoja && hoja.getLastRow() >= Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
    var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
    var mapa = Form_mapeoEncabezados(valores[0]);
    for (var f = 1; f < valores.length; f++) {
      var ts = Utl_texto(valores[f][mapa.idx['FECHAFORMS']]);
      if (ts > maxTs) maxTs = ts;
    }
  }
  return maxTs;
}

/** GAS: convierte un Date a ISO YYYY-MM-DD HH:MM:SS (zona local, sin TZ). */
function Form_aIsoConHora(d) {
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/** GAS: convierte un valor (incluida fecha de FormApp) a texto crudo. */
function Form_valorCrudo(v) {
  if (v instanceof Date) return Form_aIsoConHora(v);
  if (Object.prototype.toString.call(v) === '[object Array]') return (v.length ? Utl_texto(v[0]) : '');
  return Utl_texto(v);
}

/**
 * GAS: captura respuestas nuevas del formulario y las deposita en
 * FORM_RESPUESTAS con estado RECIBIDO (idempotente por RESPONSE_ID).
 */
function Form_capturarRespuestas(opciones) {
  opciones = opciones || {};
  if (typeof FormApp === 'undefined' || typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  if (Utl_vacio(FORM_CONFIG.FORM_ID)) return { ok: false, motivo: 'FORM_ID_NO_CONFIGURADO' };
  var gate = Entorno_gateGAS();
  if (!gate.ok) return { ok: false, motivo: gate.motivo, detalle: gate.detalle };
  var form = FormApp.openById(FORM_CONFIG.FORM_ID);

  // Ventana de captura: desde la última captura (o ventana inicial para no
  // reprocesar historial previo a la instalación).
  var desde = null;
  var ultima = Form_ultimaCaptura();
  if (ultima) {
    desde = new Date(ultima); desde.setSeconds(desde.getSeconds() + 1);
  } else {
    desde = new Date(Date.now() - (FORM_CONFIG.VENTANA_CAPTURA_INICIAL_HS || 2) * 3600000);
  }

  var respuestasAPI;
  try { respuestasAPI = form.getResponses(desde); }
  catch (e) { respuestasAPI = []; }

  // Mapeo de preguntas (título) → campo (contrato CAMPOS).
  var porPregunta = {};
  Form_campos().forEach(function (c) { porPregunta[c.pregunta] = c.campo; });

  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  if (!hoja) { Form_instalar(); hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS); }
  var existentes = Form_ultimaCaptura() ? Form_idsCapturados() : [];
  var nuevas = 0, duplicadas = 0;
  var filasPlanas = [];

  respuestasAPI.forEach(function (resp) {
    var responseId = resp.getId();
    if (existentes.indexOf(responseId) !== -1) { duplicadas += 1; return; }
    var crudo = {};
    resp.getItemResponses().forEach(function (ir) {
      var campo = porPregunta[ir.getItem().getTitle()];
      if (!campo) return;
      crudo[campo] = Form_valorCrudo(ir.getResponse());
    });
    if (!crudo.ACCION) crudo.ACCION = '';
    var traza = JSON.stringify(crudo);
    var fila = Form_campos().map(function (c) { return crudo[c.campo] !== undefined ? crudo[c.campo] : ''; });
    filasPlanas.push([
      Form_aIsoConHora(resp.getTimestamp()),
      responseId,
      FORM_CONFIG.FORM_VERSION,
      (typeof Session !== 'undefined' && Session.getActiveUser()) ? Session.getActiveUser().getEmail() : ''
    ].concat(fila).concat([traza, '', '', 0, 'RECIBIDO', '', '', '', '']));
    nuevas += 1;
  });

  if (filasPlanas.length) {
    var cols = Form_columnas();
    hoja.getRange(hoja.getLastRow() + 1, 1, filasPlanas.length, cols.length).setValues(filasPlanas);
  }

  var r = { ok: true, capturadas: respuestasAPI.length, nuevas: nuevas, duplicadas: duplicadas };
  Log_info('Formulario', 'capturar', 'nuevas=' + nuevas + ' duplicadas=' + duplicadas, null, null);
  return r;
}

/** GAS: IDs de respuesta ya capturados (dedupe idempotente). */
function Form_idsCapturados() {
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  if (!hoja || hoja.getLastRow() < Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) return [];
  var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
  var mapa = Form_mapeoEncabezados(valores[0]);
  var ids = [];
  for (var f = 1; f < valores.length; f++) {
    var id = Utl_texto(valores[f][mapa.idx['RESPONSEID']]);
    if (id) ids.push(id);
  }
  return ids;
}

/** GAS: marcas de eventos clínicos existentes 'FORM|<id>|<ACCION>'. */
function Form_leerMarcas() {
  var salida = {};
  if (typeof SpreadsheetApp === 'undefined') return salida;
  try {
    var eventos = Modelo_leerEventos() || [];
    eventos.forEach(function (ev) {
      var f = Utl_texto(ev.FUENTE);
      if (f.indexOf(FORM_CONFIG.MARCAS.PREFIJO) === 0) salida[f] = { idInterno: ev.ID_INTERNO || '', idEvento: ev.ID_EVENTO || '' };
    });
  } catch (e) { /* sin eventos disponibles */ }
  return salida;
}

/** GAS: re-lee el estado de una fila de ingreso anexada (tras el pipeline). */
function Form_leerFilaIngreso(nombreHoja, filaFisica) {
  var hojaEst = Modelo_hoja(nombreHoja);
  if (!hojaEst) return { estado: 'ERROR', nota: 'HOJA_INGRESO_AUSENTE' };
  var valores = Modelo_leerBloqueCabecera(nombreHoja, hojaEst);
  if (!valores.length) return { estado: 'ERROR', nota: 'SIN_DATOS' };
  var idxDato = Number(filaFisica) - Modelo_dataStartRow(nombreHoja);
  if (isNaN(idxDato) || idxDato < 1 || idxDato >= valores.length) return { estado: 'ERROR', nota: 'FILA_INGRESO_FUERA_DE_RANGO' };
  var fila = valores[idxDato];
  var mapa = Ingresos_mapearEncabezadosHoja(valores[0]);
  return {
    estado: mapa.estadoIdx >= 0 ? Utl_texto(fila[mapa.estadoIdx]).toUpperCase() : '',
    nota: mapa.notaIdx >= 0 ? Utl_texto(fila[mapa.notaIdx]) : ''
  };
}

/**
 * GAS: manejador del trigger onFormSubmit. Captura y procesa.
 * El evento `e` NO se usa para los datos (los lee FormApp por idempotencia).
 */
function Form_onFormSubmit(e) {
  try {
    Form_capturarRespuestas({});
    return Form_procesarPendientes({});
  } catch (err) {
    Log_error('Formulario', 'onFormSubmit', err && err.message ? err.message : String(err));
    Log_flush();
    return { ok: false, motivo: err && err.message ? err.message : String(err) };
  }
}

/** GAS: actualiza columnas de resultado de respuestas específicas (por fila). */
function Form_actualizarTrailer(actualizaciones) {
  // actualizaciones: [{filaFisica, ingresoHoja, ingresoFila, reintentos, estado, motivo, idInterno, idEvento, fechaProceso}]
  var cols = Form_columnas();
  var mapa = {}; cols.forEach(function (c, i) { mapa[c] = i; });
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  if (!hoja) return;
  var cam = ['INGRESO_HOJA', 'INGRESO_FILA', 'REINTENTOS', 'ESTADO', 'MOTIVO', 'ID_INTERNO', 'ID_EVENTO', 'FECHA_PROCESO'];
  actualizaciones.forEach(function (u) {
    var arr = new Array(cols.length);
    cam.forEach(function (c) {
      if (mapa[c] === undefined) return;
      var val = u[c.toLowerCase()];
      if (val === undefined) val = '';
      arr[mapa[c]] = val;
    });
    var desde = mapa['INGRESO_HOJA'], hasta = mapa['FECHA_PROCESO'];
    var rango = u['ingresoHoja'] !== undefined || u['estado'] !== undefined;
    if (!rango) return;
    hoja.getRange(u.filaFisica, desde + 1, 1, hasta - desde + 1)
      .setValues([arr.slice(desde, hasta + 1)]);
  });
}

/**
 * GAS: procesa las respuestas pendientes (RECIBIDO/VALIDANDO/ERROR-reintentable).
 * Lectura única del estado por lote; escrituras por bloques; LockService para
 * concurrencia. Métricas en LOG sin datos personales.
 */
function Form_procesarPendientes(opciones) {
  opciones = opciones || {};
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (e) { lock = null; }
  if (lock && !lock.tryLock(30000)) return { ok: false, motivo: 'OCUPADO: otro proceso está procesando respuestas del formulario' };
  try {
    if (!FORM_CONFIG.ACTIVO) return { ok: true, resumen: { leidos: 0, notas: 'FORM_CONFIG.ACTIVO = false' } };
    var gate = Entorno_gateGAS();
    if (!gate.ok) return { ok: false, motivo: gate.motivo, detalle: gate.detalle };
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) { Form_instalar(); hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS); }
    var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
    if (valores.length < 2) return { ok: true, resumen: { leidos: 0 } };
    var mapa = Form_mapeoEncabezados(valores[0]);
    var pendientes = Form_filasPendientes(valores, mapa, FORM_CONFIG.MAX_REINTENTOS, opciones.max);
    if (!pendientes.length) return { ok: true, resumen: { leidos: 0 } };

    // contexto: pacientes e índice por RUT + marcas de eventos (una lectura)
    var pacientes = Modelo_leerPacientes() || [];
    var indiceRut = {};
    pacientes.forEach(function (p) { indiceRut[Utl_texto(p.RUT).toUpperCase()] = p; });
    var marcas = Form_leerMarcas();

    var lote = Form_procesarLote(pendientes, { indiceRut: indiceRut, marcas: marcas }, {});

    // ---- efectos por tipo ----
    // (1) anexar filas NUEVO_INGRESO (por hoja, sin duplicar: ANEXAR solo si sin INGRESO_FILA)
    var porHoja = {};
    lote.decisiones.forEach(function (d) {
      if (d.decision === 'ANEXAR' && d.ingreso && d.ingreso.hoja) {
        if (!porHoja[d.ingreso.hoja]) porHoja[d.ingreso.hoja] = [];
        porHoja[d.ingreso.hoja].push(d);
      }
    });
    var trailersAnexos = [];
    Object.keys(porHoja).forEach(function (nombreHoja) {
      var hojaI = Modelo_hoja(nombreHoja);
      lote.decisiones.forEach(function (d) {
        if (!(d.decision === 'ANEXAR' && d.ingreso && d.ingreso.hoja === nombreHoja)) return;
        if (!hojaI) { d.motivo = 'HOJA_INGRESO_AUSENTE'; return; }
        var filasNuevas = Form_filaCanonicaIngreso(d.normalizado, Form_marcadorFuente(d.responseId, 'INGRESO'), {});
        var desde = hojaI.getLastRow() + 1;
        hojaI.getRange(desde, 1, 1, filasNuevas.length).setValues([filasNuevas]);
        d.ingreso.fila = String(desde);
        trailersAnexos.push({ filaFisica: d.filaFisica, ingresoHoja: nombreHoja, ingresoFila: String(desde), reintentos: 0, estado: 'VALIDANDO', motivo: '', idInterno: '', idEvento: '', fechaProceso: '' });
      });
    });

    if (trailersAnexos.length) Form_actualizarTrailer(trailersAnexos);

    // (2) acciones clínicas (reuso completo de api_registrarEvento)
    lote.decisiones.forEach(function (d) {
      if (d.decision !== 'CLINICA') return;
      var eventoClave = (d.accion === 'REGISTRAR_CONTROL') ? 'CONTROL' : 'SEGUIMIENTO';
      var marca = Form_marcadorFuente(d.responseId, d.accion);
      if (d.accion === 'ACTUALIZAR_DATOS') {
        var pac = indiceRut[Utl_texto(d.normalizado.RUT).toUpperCase()];
        var okAct = pac ? Form_actualizarDatosPaciente(pac, d.normalizado, marca) : false;
        var evOtro = api_registrarEvento({
          idInterno: d.idInterno, tipoEvento: 'OTRO', fecha: Form_hoy({}),
          profesional: d.normalizado.PROFESIONAL, descripcion: 'ACTUALIZACION_VIA_FORM',
          observaciones: d.normalizado.OBSERVACIONES, fuente: marca, registradoPor: 'FORM v' + FORM_CONFIG.FORM_VERSION
        });
        d._ok = okAct && evOtro.ok;
        d._motivo = evOtro.ok ? (okAct ? '' : 'fallo de actualización de campos') : (evOtro.motivo || '');
      } else {
        var resp = api_registrarEvento({
          idInterno: d.idInterno, tipoEvento: eventoClave, fecha: d.normalizado.FECHA_EVENTO,
          profesional: d.normalizado.PROFESIONAL, descripcion: '',
          observaciones: d.normalizado.OBSERVACIONES, fuente: marca,
          registradoPor: 'FORM v' + FORM_CONFIG.FORM_VERSION
        });
        d._ok = resp.ok;
        d._motivo = resp.ok ? '' : (resp.motivo || '');
      }
    });

    // (3) pipeline existente solo si hay ingresos nuevos anexados
    var hayAnexos = Object.keys(porHoja).length > 0;
    var resumenPipeline = null;
    if (hayAnexos) {
      resumenPipeline = Ingresos_procesarTodasLasHojas({});
    }

    // (4) resultados finales (re-leer) e ids de evento para clínicas
    var marcasFinales = Form_leerMarcas();
    var trailers = [];
    lote.decisiones.forEach(function (d) {
      var est = 'ERROR', mot = d.motivo || '', idInt = d.idInterno || '', idEv = (marcasFinales[Form_marcadorFuente(d.responseId, d.accion)] || {}).idEvento || '';
      if (d.decision === 'SALTAR') {
        if (d.motivo === 'SIN_RESPONSE_ID') { est = 'ERROR'; }
        else { est = 'PROCESADO'; mot = d.motivo || 'Ya procesado'; }
      } else if (d.decision === 'ERROR') {
        est = 'ERROR';
      } else if (d.decision === 'CUARENTENA') {
        est = 'REQUIERE_REVISION';
      } else if (d.decision === 'PROCESADO_YA') {
        est = 'PROCESADO';
        mot = d.motivo || '';
      } else if (d.decision === 'CLINICA') {
        est = d._ok ? 'PROCESADO' : 'ERROR';
        if (!d._ok && !mot) mot = d._motivo || '';
      } else if (d.decision === 'ANEXAR' || d.decision === 'YA_ANEXADO') {
        var filaAnnex = (d.ingreso && d.ingreso.fila ? d.ingreso.fila : d.ingresoFila) || '';
        var hojaAnnex = (d.ingreso && d.ingreso.hoja ? d.ingreso.hoja : d.ingresoHoja) || '';
        if (hojaAnnex && filaAnnex) {
          var lf = Form_leerFilaIngreso(hojaAnnex, filaAnnex);
          var map = Form_mapearResultadoFila(lf.estado, lf.nota);
          est = map.estado; mot = map.motivo;
        } else {
          est = 'ERROR';
          if (!mot) mot = 'SIN_FILA_INGRESO';
        }
      }
      var reint = Number(d.reintentos) || 0;
      if (est === 'ERROR') reint += 1;
      trailers.push({
        filaFisica: d.filaFisica, ingresoHoja: (d.ingreso && d.ingreso.hoja) || d.ingresoHoja || '',
        ingresoFila: (d.ingreso && d.ingreso.fila) || d.ingresoFila || '',
        reintentos: reint, estado: est, motivo: mot, idInterno: idInt, idEvento: idEv,
        fechaProceso: Form_aIsoConHora(new Date())
      });
    });
    Form_actualizarTrailer(trailers);

    var lres = lote.resumen || {};
    var resumen = {
      leidos: lres.leidos || 0,
      nuevosIngresos: lres.anexos || 0,
      clinicas: lres.clinica || 0,
      procesados: trailers.filter(function (t) { return t.estado === 'PROCESADO'; }).length,
      revision: trailers.filter(function (t) { return t.estado === 'REQUIERE_REVISION'; }).length,
      errores: trailers.filter(function (t) { return t.estado === 'ERROR'; }).length,
      pipeline: resumenPipeline ? (resumenPipeline.nuevos || 0) : 0,
      eventosPipeline: resumenPipeline ? (resumenPipeline.eventosCreados || 0) : 0
    };
    Log_info('Formulario', 'procesar', JSON.stringify(resumen), null, null);
    Log_flush();
    return { ok: true, resumen: resumen };
  } catch (e) {
    Log_error('Formulario', 'procesar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (e2) { /* lock liberado por timeout */ }
    }
  }
}

/** GAS: procesamiento bajo demanda (botón del panel de administración). */
function Form_procesarAhora() {
  return Form_procesarPendientes({});
}

/**
 * GAS: actualiza campos OPERATIVOS de un paciente existente (identidad intacta)
 * y registra la marca de trazabilidad. Nunca toca identidad ni reglas clínicas.
 */
function Form_actualizarDatosPaciente(paciente, normalizado, marca) {
  try {
    var cambios = 0;
    if (normalizado.TELEFONOS) { paciente.TELEFONOS = normalizado.TELEFONOS; cambios += 1; }
    if (normalizado.OBSERVACIONES) { paciente.OBSERVACIONES = normalizado.OBSERVACIONES; cambios += 1; }
    if (normalizado.PROFESIONAL) { paciente.PROFESIONAL_SEGUIMIENTO = normalizado.PROFESIONAL; cambios += 1; }
    if (!cambios) return false;
    paciente.FECHA_ACTUALIZACION = Form_aIsoConHora(new Date());
    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) throw new Error('esquema incompatible');
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    var idx = null;
    var todos = Modelo_leerPacientes();
    for (var i = 0; i < todos.length; i++) if (todos[i].ID_INTERNO === paciente.ID_INTERNO) idx = i;
    if (idx === null) return false;
    hojaP.getRange(Modelo_dataStartRow(HOJAS.PACIENTES) + idx, 1, 1, MODELO_PACIENTE.length)
      .setValues([Modelo_filaDesdeObjeto(paciente)]);
    return true;
  } catch (e) {
    Log_error('Formulario', 'actualizarDatos', e && e.message ? e.message : String(e));
    return false;
  }
}

// ---------------------------------------------------------------------------
// ENDPOINTS del panel de administración (GAS)
// ---------------------------------------------------------------------------

function api_formularioEstado() { return Form_obtenerEstado(); }

function api_formularioDiagnostico() { return Form_diagnosticar(); }

function api_formularioProcesar() { return Form_procesarAhora(); }

function api_formularioInstalar() { return Form_instalar(); }