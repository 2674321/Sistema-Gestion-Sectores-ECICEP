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

/**
 * PURA: deriva el acotado del pipeline para una captura Web App (paso 3 de
 * Form_procesarPendientes, DEC-055). Fuente autoritativa: la MARCA física
 * escrita en la hoja (inmune a pérdida de coordenadas del trailer). Fallback:
 * coordenadas registradas al anexar/reenviar. `buscadorMarca(responseId)` es
 * inyectable (GAS: Form_buscarFilaIngresoPorMarca) para poder probarlo puro.
 * Devuelve {soloHojas:[...], soloFilas:{hoja:[filas]}|null}.
 */
function Form_derivarAcotacionPaso3(filasAnexadas, buscadorMarca) {
  var hojasEnJuego = {};
  var filasEnJuego = {};
  (filasAnexadas || []).forEach(function (d) {
    if (d.decision !== 'ANEXAR' && d.decision !== 'YA_ANEXADO') return;
    var hallado = buscadorMarca ? buscadorMarca(d.responseId) : null;
    var h = null, f = '';
    if (hallado && hallado.hoja && hallado.fila) { h = hallado.hoja; f = String(hallado.fila); }
    else {
      h = (d.ingreso && d.ingreso.hoja) || d.ingresoHoja || '';
      var ff = (d.ingreso && d.ingreso.fila !== undefined && d.ingreso.fila !== '') ? d.ingreso.fila : d.ingresoFila;
      if (ff !== undefined && ff !== '' && ff !== null) f = String(ff);
    }
    if (!h) return;
    hojasEnJuego[h] = true;
    if (f) {
      if (!filasEnJuego[h]) filasEnJuego[h] = [];
      if (filasEnJuego[h].indexOf(f) === -1) filasEnJuego[h].push(f);
    }
  });
  return {
    soloHojas: Object.keys(hojasEnJuego),
    soloFilas: Object.keys(filasEnJuego).length ? filasEnJuego : null
  };
}

/** GAS: busca (barriendo la columna FUENTE/NOTA_SISTEMA) dónde quedó la fila de
 * un envío de la captura: {hoja, fila} en INGRESO_* o null. Núcleo de la
 * autoridad por marca del acotado paso 3 y del respaldo del paso 4. */
function Form_buscarFilaIngresoPorMarca(marca) {
  if (typeof SpreadsheetApp === 'undefined' || !marca) return null;
  var objetivo = Utl_texto(marca);
  var ss = Modelo_ss();
  var keys = Object.keys(HOJAS_INGRESO);
  var _tB = Date.now();
  for (var iK = 0; iK < keys.length; iK++) {
    var _tHojaB = Date.now();
    var nombreHoja = keys[iK];
    try {
      var hoja = ss.getSheetByName(nombreHoja);
      if (!hoja || hoja.getLastRow() < 1) { console.log('[PIPE] buscarMarca ' + nombreHoja + ': sin hoja/filas'); continue; }
      var ancho = Math.max(hoja.getLastColumn() || 0, 1);
      var hr = Modelo_headerRow(nombreHoja);
      var enc = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
      // Fallback legacy: encabezados reales en fila 1.
      if (enc.join('|').toUpperCase().indexOf('NOMBRE') === -1) {
        var alt0 = hoja.getRange(1, 1, 1, ancho).getValues()[0];
        if (alt0.join('|').toUpperCase().indexOf('NOMBRE') !== -1) {
          hr = 1;
          enc = alt0;
        }
      }
      // La marca de trazabilidad vive en NOTA_SISTEMA (hojas INGRESO_*) o en
      // FUENTE (EVENTOS). Se detecta la columna por encabezado y se barre SOLO
      // esa columna (rápido: una lectura por hoja); si el encabezado no es
      // reconocible, cae al barrido completo de la fila (robustez layout legacy).
      var posMarca = -1;
      enc.forEach(function (h, i) {
        var k = Utl_claveAlnum(h);
        if (k === 'FUENTE' || k === 'NOTASISTEMA' || k === 'NOTASISTEMAS' || k === 'NOTA') posMarca = i;
      });
      var n = hoja.getLastRow() - hr;
      if (n < 1) continue;
      if (posMarca >= 0) {
        var col = hoja.getRange(hr + 1, posMarca + 1, n, 1).getValues();
        for (var f = 0; f < col.length; f++) {
          if (Utl_texto(col[f][0]).indexOf(objetivo) !== -1) {
            console.log('[PIPE] buscarMarca ' + nombreHoja + ': ' + col.length + ' filas, ' + (Date.now() - _tHojaB) + 'ms — MARCA ENCONTRADA fila ' + (hr + 1 + f) + ' (total ' + (Date.now() - _tB) + 'ms)');
            return { hoja: nombreHoja, fila: hr + 1 + f };
          }
        }
      } else {
        var filasBarrido = hoja.getRange(hr + 1, 1, n, ancho).getValues();
        var buscado = objetivo.toUpperCase();
        for (var g = 0; g < filasBarrido.length; g++) {
          if (filasBarrido[g].join('|').toUpperCase().indexOf(buscado) !== -1) {
            console.log('[PIPE] buscarMarca ' + nombreHoja + ': sweep, ' + (Date.now() - _tHojaB) + 'ms — MARCA ENCONTRADA fila ' + (hr + 1 + g) + ' (total ' + (Date.now() - _tB) + 'ms)');
            return { hoja: nombreHoja, fila: hr + 1 + g };
          }
        }
      }
      console.log('[PIPE] buscarMarca ' + nombreHoja + ': ' + n + ' filas, ' + (Date.now() - _tHojaB) + 'ms sin hallazgo');
    } catch (e) {
      console.log('[PIPE] busqueda marca '+objetivo+' error en '+nombreHoja+': '+String(e));
    }
  }
  console.log('[PIPE] buscarMarca total sin hallazgo: ' + (Date.now() - _tB) + 'ms');
  return null;
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

/**
 * PURA: ¿un campo aplica a una acción? Sin `acciones` en su definición aplica
 * a TODAS (p.ej. OBSERVACIONES). `ACCION` es estructural y se excluye siempre.
 */
function Form_campoAplicaAccion(campoDef, accion) {
  if (!campoDef) return false;
  if (campoDef.campo === 'ACCION') return false;
  if (!Array.isArray(campoDef.acciones)) return true;
  return campoDef.acciones.indexOf(accion) !== -1;
}

/**
 * PURA: esquema completo del formulario derivado de FORM_CONFIG (única fuente
 * de verdad). La Web App lo consume para pintar secciones y validar campos sin
 * duplicar reglas a mano; el backend ya valida con la misma información.
 * OBSERVACIONES no declara `acciones` → aparece en todas las acciones.
 * @returns {ACCION: {secciones:{ident:bool, evento:bool, tel:bool, prof:bool,
 *          obs:bool}, camposRequeridos:[campo], mensajeExito:string}}
 */
function Form_esquemaFormulario() {
  var seccionNombres = ['ident', 'evento', 'tel', 'prof', 'obs'];
  var seccionDef = FORM_CONFIG.SECCIONES || {};
  var detalle = (FORM_CONFIG.ACCIONES.DETALLE) || {};
  var campos = FORM_CONFIG.CAMPOS || [];
  var acciones = FORM_CONFIG.ACCIONES.VALIDOS || [];
  var esquema = {};

  acciones.forEach(function (acc) {
    var camposAccion = campos.filter(function (c) { return Form_campoAplicaAccion(c, acc); });
    var secciones = {};
    seccionNombres.forEach(function (sec) {
      secciones[sec] = (seccionDef[sec] || []).some(function (campo) {
        return Form_campoAplicaAccion(
          campos.filter(function (c) { return c.campo === campo; })[0], acc);
      });
    });
    var camposRequeridos = camposAccion.filter(function (c) { return c.requerido === true; })
      .map(function (c) { return c.campo; });
    esquema[acc] = {
      secciones: secciones,
      camposRequeridos: camposRequeridos,
      mensajeExito: (detalle[acc] && detalle[acc].mensaje) || ''
    };
  });
  return esquema;
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
  n.PROFESIONAL2 = Utl_colapsarEspacios(Utl_texto(v.PROFESIONAL2 || '')).toUpperCase();
  if (n.PROFESIONAL && n.PROFESIONAL2 && n.PROFESIONAL === n.PROFESIONAL2) {
    no('PROFESIONAL2', 'Los dos profesionales deben ser diferentes');
  }
  n.OBSERVACIONES = Utl_texto(v.OBSERVACIONES).trim();
  n.DESCRIPCION = '';

  return { ok: err.length === 0, errores: err, normalizado: n, accion: accion };
}

/**
 * PURA: fila canónica para anexar en INGRESO_<SECTOR> (orden INGRESO_COLUMNAS).
 * ESTADO_INGRESO va vacío (el pipeline lo escribe) y NOTA_SISTEMA lleva la
 * marca de trazabilidad 'FORM|<responseId>|INGRESO'.
 * DUPLA se compone de PROFESIONAL + PROFESIONAL2 cuando existen.
 */
function Form_filaCanonicaIngreso(normalizado, marca, opciones) {
  var dupla = Utl_texto(normalizado.PROFESIONAL || '');
  var p2 = Utl_texto(normalizado.PROFESIONAL2 || '');
  if (p2) dupla = dupla + (dupla ? '; ' : '') + p2;
  return [
    normalizado.NOMBRE || '',
    normalizado.RUT || '',
    normalizado.SEXO || '',
    normalizado.FECHA_NACIMIENTO || '',
    normalizado.TELEFONOS || '',
    normalizado.FECHA_INGRESO || Form_hoy(opciones),
    normalizado.ESTRATIFICACION || '',
    dupla,
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
 * PURA: métricas OPERATIVAS del canal formulario (v0.9.2 — DEC-051).
 * Responde objetivamente "¿el formulario está reemplazando la captura
 * directa en la hoja?":
 *   - viaForm / manuales / pctViaForm: qué proporción de registros clínicos
 *     (controles + seguimientos + ingresos) entró por el formulario.
 *   - registrosPorForm: eventos clínicos por marca (obra/acción).
 *   - errores / rechazos / duplicadosEvitados / reprocesamientos: derivados de
 *     las respuestas (estados y reintentos).
 * Todo se calcula de datos YA persistidos (no escribe nada).
 * @param {Object[]} eventos           EVENTOS con FUENTE (el FUENTE determina
 *                                     si el registro clínico vino por el
 *                                     formulario —'FORM|…'— o por otro origen)
 * @param {Object[]} [filasRespuestas] [{ESTADO, ACCION, REINTENTOS}]
 * @returns métricas operativas agregadas
 */
function Form_metricasOperativas(eventos, filasRespuestas) {
  var m = {
    viaForm: 0, manuales: 0, pctViaForm: 0, registrosPorForm: {},
    controlesForm: 0, seguimientosForm: 0, ingresosForm: 0,
    errores: 0, rechazos: 0, duplicadosEvitados: 0, reprocesamientos: 0,
    total: 0, pendientes: 0, procesados: 0
  };
  var claves = { control: 'REGISTRAR_CONTROL', seguimiento: 'REGISTRAR_SEGUIMIENTO', ingreso: 'NUEVO_INGRESO' };

  (eventos || []).forEach(function (ev) {
    var fuente = Utl_texto(ev.FUENTE);
    if (fuente.indexOf(FORM_CONFIG.MARCAS.PREFIJO) === 0) {
      m.viaForm += 1;
      // accion = último segmento de la marca FORM|<id>|<ACCIÓN>
      var seg = fuente.split('|');
      var acc = seg.length > 2 ? Utl_texto(seg[seg.length - 1]).toUpperCase() : '';
      m.registrosPorForm[acc || 'FORM'] = (m.registrosPorForm[acc || 'FORM'] || 0) + 1;
      if (acc === claves.control) m.controlesForm += 1;
      else if (acc === claves.seguimiento) m.seguimientosForm += 1;
      else if (acc === claves.ingreso) m.ingresosForm += 1;
    } else {
      m.manuales += 1;
    }
  });

  var totalRegistros = m.viaForm + m.manuales;
  m.pctViaForm = totalRegistros > 0 ? Math.round((m.viaForm / totalRegistros) * 1000) / 10 : 0;

  (filasRespuestas || []).forEach(function (f) {
    m.total += 1;
    var est = Utl_texto(f.ESTADO).toUpperCase() || 'RECIBIDO';
    if (est === 'RECIBIDO' || est === 'VALIDANDO' || est === 'VALIDO') m.pendientes += 1;
    else if (est === 'PROCESADO') m.procesados += 1;
    else if (est === 'ERROR') { m.errores += 1; m.reprocesamientos += (Number(f.REINTENTOS) || 0); }
    else if (est === 'REQUIERE_REVISION') m.rechazos += 1;
    else if (est === 'DUPLICADO') m.duplicadosEvitados += 1;
  });

  return m;
}

/**
 * PURA: trazabilidad por-envío para el control administrativo (v0.9.2).
 * Devuelve una fila plana por respuesta: FORM_RESPONSE · MARCA · FECHA ·
 * ACCION · RUT · ID_INTERNO · ESTADO · MOTIVO · REINTENTOS · ID_EVENTO.
 * La MARCA se reconstruye con Form_marcadorFuente para que el admin pueda
 * rastrearla en EVENTOS/INGRESO hasta el ID_INTERNO.
 * @param {Object[]} filas  filas de FORM_RESPUESTAS (con todos los campos)
 * @param {Object}   mapa   {idx} mapeo encabezados (Form_mapeoEncabezados)
 * @param {Object}   [opciones] {soloPendientes|soloError}
 * @returns {Object[]} filas planas de trazabilidad
 */
function Form_trazabilidad(filas, mapa, opciones) {
  opciones = opciones || {};
  var idx = mapa.idx;
  var salida = [];
  (filas || []).forEach(function (fila, i) {
    if (i === 0) return; // encabezado
    var responseId = idx['RESPONSEID'] !== undefined ? Utl_texto(fila[idx['RESPONSEID']]) : '';
    if (!responseId) return;
    var accion = idx['ACCION'] !== undefined ? Utl_texto(fila[idx['ACCION']]) : '';
    var estado = Utl_texto(idx['ESTADO'] !== undefined ? fila[idx['ESTADO']] : '').toUpperCase();
    if (opciones.soloPendientes && estado !== 'RECIBIDO' && estado !== 'VALIDANDO' && estado !== 'VALIDO') return;
    if (opciones.soloError && estado !== 'ERROR') return;
    salida.push({
      responseId: responseId,
      marca: Form_marcadorFuente(responseId, accion || 'FORM'),
      fechaForms: idx['FECHAFORMS'] !== undefined ? Utl_texto(fila[idx['FECHAFORMS']]) : '',
      accion: accion,
      rut: idx['RUT'] !== undefined ? Utl_texto(fila[idx['RUT']]) : '',
      nombre: idx['NOMBRE'] !== undefined ? Utl_texto(fila[idx['NOMBRE']]) : '',
      idInterno: idx['IDINTERNO'] !== undefined ? Utl_texto(fila[idx['IDINTERNO']]) : '',
      idEvento: idx['IDEVENTO'] !== undefined ? Utl_texto(fila[idx['IDEVENTO']]) : '',
      estado: estado || 'RECIBIDO',
      motivo: idx['MOTIVO'] !== undefined ? Utl_texto(fila[idx['MOTIVO']]) : '',
      reintentos: idx['REINTENTOS'] !== undefined ? (Number(fila[idx['REINTENTOS']]) || 0) : 0
    });
  });
  return salida;
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
    var control = {};
    try { control = Form_refrescarControl(); } catch (e) { control = { ok: false, motivo: String(e) }; }
    return {
      ok: true, hoja: creada ? 'creada' : 'existente', cambios: cambios,
      formIdConfigurado: !Utl_vacio(FORM_CONFIG.FORM_ID),
      control: control && control.ok ? 'FORM_CONTROL actualizado' : 'FORM_CONTROL pendiente',
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
    var operativo = Form_metricasOperativas(_controlEventosResumen(), filas);
    return {
      ok: true,
      entorno: { entorno: cur.entorno, ssId: cur.ssId, coincide: cur.coincide },
      config: { activo: FORM_CONFIG.ACTIVO, formId: FORM_CONFIG.FORM_ID, version: FORM_CONFIG.FORM_VERSION },
      triggerInstalado: Form_triggerInstalado(),
      metricas: Form_metricas(filas),
      operativo: operativo
    };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** GAS: EVENTOS leídos para las métricas operativas (por FUENTE). */
function _controlEventosResumen() {
  return Modelo_leerEventos();
}

// ---------------------------------------------------------------------------
// WRAPPERS GAS — control administrativo y recuperación (v0.9.2 — DEC-051)
// ---------------------------------------------------------------------------

/** GAS: lista de trazabilidad por-envío (FORM_RESPONSE · MARCA · FECHA ·
 *  ACCION · RUT · ID_INTERNO · ESTADO · MOTIVO · REINTENTOS · ID_EVENTO).
 *  Responde "¿qué pasó con este envío?" sin exponer hojas técnicas. */
function Form_listarControl(opciones) {
  opciones = opciones || {};
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  var filas = Form_trazabilidad([], { idx: {} }, opciones);
  if (hoja && hoja.getLastRow() >= Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
    var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
    filas = Form_trazabilidad(valores, Form_mapeoEncabezados(valores[0]), opciones);
  }
  return { ok: true, filas: filas, total: filas.length };
}

/**
 * GAS: regenera por completo la hoja administrativa FORM_CONTROL (trazabilidad
 * por-envío + bloque de métricas operativas). Idempotente y de solo-escritura:
 * nunca toca FORM_RESPUESTAS ni los datos clínicos.
 */
function Form_refrescarControl() {
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || Modelo_ss();
    var hoja = ss.getSheetByName(HOJAS.FORM_CONTROL);
    if (!hoja) {
      hoja = ss.insertSheet(HOJAS.FORM_CONTROL);
      try { hoja.setTabColor(DESIGN_SYSTEM.MARCA.sistema); } catch (e) { /* color no crítico */ }
    }
    hoja.showSheet();
    hoja.clear();

    var columnas = FORM_CONFIG.CONTROL.COLUMNAS;
    var listado = Form_listarControl();
    var traz = listado.filas || [];

    var filas = [columnas];
    traz.forEach(function (t) {
      filas.push([
        t.responseId, t.marca, t.fechaForms, t.accion, t.rut, t.idInterno,
        t.estado, t.motivo, t.reintentos, t.idEvento
      ]);
    });

    // Bloque de métricas operativas: una fila en blanco + cabecera + valores
    filas.push([]);
    filas.push(['MÉTRICAS OPERATIVAS', '']);
    var oper = Form_metricasOperativas(_controlEventosResumen(), _controlRespuestasResumen());
    FORM_CONFIG.CONTROL.METRICAS.forEach(function (met) {
      filas.push([met.etiqueta, oper[met.clave] === undefined ? 0 : oper[met.clave]]);
    });

    // setValues exige un rango rectangular: se rellenan todas las filas a la
    // cantidad de columnas del contrato (las filas de métricas solo usan 2).
    var ancho = columnas.length;
    var filasNorm = filas.map(function (fila) {
      var out = fila || [];
      while (out.length < ancho) out.push('');
      return out.slice(0, ancho);
    });

    if (filasNorm.length > 0) {
      hoja.getRange(1, 1, filasNorm.length, ancho).setValues(filasNorm);
    }
    try { hoja.setFrozenRows(1); } catch (e) { /* opcional */ }

    return { ok: true, total: traz.length, metricas: oper };
  } catch (e) {
    Log_error('Formulario', 'control', e && e.message ? e.message : String(e));
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** GAS: lee FORM_RESPUESTAS como objetos {ESTADO, ACCION, REINTENTOS} para métricas. */
function _controlRespuestasResumen() {
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  var salida = [];
  if (hoja && hoja.getLastRow() >= Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
    var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
    var mapa = Form_mapeoEncabezados(valores[0]);
    for (var f = 1; f < valores.length; f++) {
      salida.push({
        ESTADO: mapa.idx['ESTADO'] !== undefined ? valores[f][mapa.idx['ESTADO']] : '',
        ACCION: mapa.idx['ACCION'] !== undefined ? valores[f][mapa.idx['ACCION']] : '',
        REINTENTOS: mapa.idx['REINTENTOS'] !== undefined ? valores[f][mapa.idx['REINTENTOS']] : ''
      });
    }
  }
  return salida;
}

/**
 * GAS: recuperación/reprocesamiento administrativo IDEMPOTENTE.
 * - `respuestaId` dado → resetea su ESTADO a RECIBIDO (y REINTENTOS) y lo
 *   reprocesa una vez. La idempotencia por marca FUENTE / INGRESO_FILA
 *   garantiza que NO duplica eventos ni filas (DEC-048/49/50).
 * - sin `respuestaId` → reprocesa el lote de pendientes completo (incluye los
 *   ERROR dentro del tope de reintentos).
 * Devuelve un resumen del procesamiento y refresca FORM_CONTROL.
 */
function Form_reprocesar(opciones) {
  opciones = opciones || {};
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  if (opciones.respuestaId) {
    var okReset = Form_reiniciarRespuesta(opciones.respuestaId);
    if (!okReset.ok) return okReset;
  }
  var procesado = Form_procesarPendientes({ forzar: true });
  if (!procesado.ok) return procesado;
  var control = Form_refrescarControl();
  return {
    ok: true,
    resumen: procesado.resumen || {},
    respuestaId: opciones.respuestaId || null,
    control: control.total
  };
}

/**
 * GAS: reinicia una respuesta errónea/atascada para permitir su reprocesamiento
 * seguro. Nunca reinicia PROCESADO. Devuelve {ok, motivo}.
 */
function Form_reiniciarRespuesta(responseId) {
  if (typeof SpreadsheetApp === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  if (!hoja) return { ok: false, motivo: 'SIN_HOJA' };
  var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
  var mapa = Form_mapeoEncabezados(valores[0]);
  var start = Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS);
  for (var f = 1; f < valores.length; f++) {
    var rid = mapa.idx['RESPONSEID'] !== undefined ? Utl_texto(valores[f][mapa.idx['RESPONSEID']]) : '';
    if (rid !== responseId) continue;
    var estado = (mapa.idx['ESTADO'] !== undefined ? Utl_texto(valores[f][mapa.idx['ESTADO']]) : '').toUpperCase();
    if (estado === 'PROCESADO') return { ok: false, motivo: 'YA_PROCESADO_NO_SE_REINICIA' };
    var filaFisica = start + f - 1;
    var cEstado = mapa.idx['ESTADO'];
    var cMotivo = mapa.idx['MOTIVO'];
    var cReint = mapa.idx['REINTENTOS'];
    if (cEstado !== undefined) hoja.getRange(filaFisica, cEstado + 1).setValue('RECIBIDO');
    if (cReint !== undefined) hoja.getRange(filaFisica, cReint + 1).setValue(0);
    if (cMotivo !== undefined) hoja.getRange(filaFisica, cMotivo + 1).setValue('');
    return { ok: true, fila: filaFisica };
  }
  return { ok: false, motivo: 'NO_ENCONTRADA' };
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
/**
 * GAS: índices marca FORM|... → {idInterno, idEvento} leyendo SOLO las
 * columnas necesarias de EVENTOS (FUENTE, ID_INTERNO, ID_EVENTO) en lugar de
 * la hoja completa. Se invoca 2 veces por envío; con miles de eventos, leer
 * las 16 columnas era un costo evitable del envío.
 */
function Form_leerMarcas() {
  var salida = {};
  if (typeof SpreadsheetApp === 'undefined') return salida;
  var _tLeer = Date.now();
  try {
    var hoja = Modelo_hoja(HOJAS.EVENTOS);
    if (!hoja) return salida;
    var hr = Modelo_headerRow(HOJAS.EVENTOS);
    var ultima = hoja.getLastRow();
    if (ultima < hr) return salida;
    var ancho = Math.max(hoja.getLastColumn() || 0, 1);
    var enc = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
    var pos = {};
    enc.forEach(function (h, i) { pos[Utl_texto(h).trim().toUpperCase()] = i; });
    var desde = Modelo_dataStartRow(HOJAS.EVENTOS);
    var n = ultima - desde + 1;
    if (n < 1) return salida;
    function leerCol(nombre) {
      var p = pos[nombre];
      if (p === undefined || p === null) return [];
      return hoja.getRange(desde, p + 1, n, 1).getValues();
    }
    var fuentes = leerCol('FUENTE');
    if (!fuentes.length) return salida;
    var internos = leerCol('ID_INTERNO');
    var evs = leerCol('ID_EVENTO');
    for (var i = 0; i < fuentes.length; i++) {
      var f = Utl_texto(fuentes[i] && fuentes[i][0]);
      if (f.indexOf(FORM_CONFIG.MARCAS.PREFIJO) === 0) {
        salida[f] = {
          idInterno: Utl_texto((internos[i] && internos[i][0]) || ''),
          idEvento: Utl_texto((evs[i] && evs[i][0]) || '')
        };
      }
    }
    console.log('[PIPE] leerMarcas t=' + (Date.now() - _tLeer) + 'ms filas=' + n + ' marcas=' + Object.keys(salida).length);
  } catch (e) { /* sin eventos disponibles */ }
  return salida;
}

/**
 * PURA/GAS: estado de una fila desde un bloque ya leído (encabezados, ...datos).
 * El bloque debe ir alineado a los encabezados reales (Modelo_leerBloqueCabecera).
 * Si el bloque está desalineado devuelve estado '' para que el llamador pueda
 * resolver por MARCA como respaldo.
 */
function Form_leerFilaIngresoDesdeBloque(nombreHoja, filaFisica, valores) {
  if (!valores || valores.length < 2) return { estado: 'ERROR', nota: 'SIN_DATOS' };
  var hr = Modelo_headerRow(nombreHoja);
  if (valores[0].join('|').toUpperCase().indexOf('NOMBRE') === -1) {
    return { estado: '', nota: 'BLOQUE_DESALINEADO' };
  }
  var idxDato = Number(filaFisica) - hr;
  if (isNaN(idxDato) || idxDato < 1 || idxDato >= valores.length) return { estado: 'ERROR', nota: 'FILA_INGRESO_FUERA_DE_RANGO' };
  var fila = valores[idxDato];
  var mapa = Ingresos_mapearEncabezadosHoja(valores[0]);
  return {
    estado: mapa.estadoIdx >= 0 ? Utl_texto(fila[mapa.estadoIdx]).toUpperCase() : '',
    nota: mapa.notaIdx >= 0 ? Utl_texto(fila[mapa.notaIdx]) : ''
  };
}

/** GAS: re-lee el estado de una fila de ingreso anexada (tras el pipeline). */
function Form_leerFilaIngreso(nombreHoja, filaFisica) {
  var hojaEst = Modelo_hoja(nombreHoja);
  if (!hojaEst) return { estado: 'ERROR', nota: 'HOJA_INGRESO_AUSENTE' };
  var valores = Modelo_leerBloqueCabecera(nombreHoja, hojaEst);
  if (!valores.length) return { estado: 'ERROR', nota: 'SIN_DATOS' };
  var hr = Modelo_headerRow(nombreHoja);
  // Fallback legacy fila 1
  if (valores[0].join('|').toUpperCase().indexOf('NOMBRE') === -1 && hojaEst.getLastRow() >= 1) {
    var alt = hojaEst.getRange(1, 1, hojaEst.getLastRow(), Math.max(hojaEst.getLastColumn(),1)).getValues();
    if (alt.length && alt[0].join('|').toUpperCase().indexOf('NOMBRE') !== -1) {
      valores = alt; hr = 1;
    }
  }
  var idxDato = Number(filaFisica) - hr;
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

/**
 * PURA: resuelve HOJA/FILA desde la que leer el resultado de un ANEXAR/YA_ANEXADO.
 * Si el barrido por MARCA encontró la fila real (hallado), esa gana siempre:
 * robusto frente a desplazamientos de filas por HVis_normalizarLayout (inserta
 * filas al inicio cuando la hoja estaba en layout legacy). Si no, cae a la
 * coordenada registrada en el momento del anexo.
 * @param {Object|null} hallado resultado de Form_buscarFilaIngresoPorMarca
 * @param {Object} ingreso d.ingreso ({hoja,fila})
 * @param {string} ingresoHoja d.ingresoHoja (fallback histórico)
 * @param {string} ingresoFila d.ingresoFila (fallback histórico)
 */
function Form_resolverFilaIngreso(hallado, ingreso, ingresoHoja, ingresoFila) {
  ingreso = ingreso || {};
  if (hallado && hallado.fila) return { hoja: hallado.hoja, fila: String(hallado.fila) };
  var fila = (ingreso.fila !== undefined && ingreso.fila !== '') ? ingreso.fila : ingresoFila;
  var hoja = (ingreso.hoja !== undefined && ingreso.hoja !== '') ? ingreso.hoja : ingresoHoja;
  if (fila === undefined || fila === '' || fila === null) return null;
  return { hoja: hoja || '', fila: String(fila) };
}

/**
 * GAS: diagnóstico en vivo de un envío fallido (SIN_FILA_INGRESO). Lee el
 * estado real en la hoja de cálculo para localizar dónde se rompió la
 * resolución: fila en FORM_RESPUESTAS, coordenadas registradas, layout de
 * cada INGRESO_* y qué dice ESTADO_INGRESO en la fila marcada.
 * @param {string} responseId
 * @returns {Object} diagnóstico estructurado (cero efectos colaterales)
 */
function Form_diagnosticoEnvio(responseId) {
  var d = { responseId: responseId, respuesta: null, marcaBuscada: '', hojas: {} };
  if (typeof SpreadsheetApp === 'undefined') return d;
  try {
    d.marcaBuscada = Form_marcadorFuente(responseId, 'INGRESO');
    // 1) fila en FORM_RESPUESTAS
    var hf = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (hf && hf.getLastRow() >= Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
      var vf = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hf);
      var mf = Form_mapeoEncabezados(vf[0]);
      var ix = mf.idx || {};
      for (var i = 1; i < vf.length; i++) {
        if (Utl_texto(vf[i][ix.RESPONSEID]) === responseId) {
          d.respuesta = {
            estado: Utl_texto(vf[i][ix.ESTADO] || ''),
            motivo: Utl_texto(vf[i][ix.MOTIVO] || ''),
            reintentos: Utl_texto(vf[i][ix.REINTENTOS] || ''),
            accion: Utl_texto(vf[i][ix.ACCION] || ''),
            ingresoHoja: Utl_texto(vf[i][ix.INGRESOHOJA] || ''),
            ingresoFila: Utl_texto(vf[i][ix.INGRESOFILA] || ''),
            filaFisica: String(Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS) + i - 1)
          };
          break;
        }
      }
    }
    // 2) rastrear la marca en todas las INGRESO_* (compacTO: respuestas y
    //    coordenadas primero; el listado staging se resume a conteo + primeros 3)
    var ss = Modelo_ss();
    Object.keys(HOJAS_INGRESO).forEach(function (nk) {
      var _tDiagHoja = Date.now();
      var hs = ss.getSheetByName(nk);
      var info = { existe: !!hs };
      var hr = -1;
      if (hs && hs.getLastRow() >= 1) {
        hr = Modelo_headerRow(nk);
        var ancho = Math.max(hs.getLastColumn() || 0, 1);
        info.hr = hr;
        info.dataStart = Modelo_dataStartRow(nk);
        info.ultima = hs.getLastRow();
        info.ancho = ancho;
        var enc = hs.getRange(hr, 1, 1, ancho).getValues()[0];
        info.encabezados = enc.join('|').substring(0, 60);
        var mapa = Ingresos_mapearEncabezadosHoja(enc);
        info.estadoIdx = mapa.estadoIdx;
        info.notaIdx = mapa.notaIdx;
        // coordena registrada (si apunta a esta hoja) — compara con la marca
        var filaCoord = (d.respuesta && d.respuesta.ingresoHoja === nk) ? Number(d.respuesta.ingresoFila) : NaN;
        if (!isNaN(filaCoord) && filaCoord >= hr) {
          var filaC = hs.getRange(filaCoord, 1, 1, ancho).getValues()[0];
          info.coordRegistrada = {
            fila: filaCoord,
            estado: mapa.estadoIdx >= 0 ? Utl_texto(filaC[mapa.estadoIdx]).substring(0, 40) : 'SIN_ESTADO_COL',
            nota: (mapa.notaIdx >= 0 ? Utl_texto(filaC[mapa.notaIdx]).substring(0, 120) : '')
          };
        }
        // Una SOLA lectura del bloque por hoja y una SOLA pasada en memoria
        // (marca + conteo pendientes + muestras ≤3). ANTES leíamos el bloque 3
        // veces y normalizábamos CADA fila pendiente con Fuentes_normalizar
        // — con INGRESO_AMARILLO (>1000 filas) ese costo se pagaba DENTRO del
        // request del envío que terminó en ERROR (`Form_diagnosticoEnvio` es
        // inline) → contribuía al timeout >60s. El conteo de pendientes se hace
        // solo por la columna ESTADO (sin normalizar cada fila).
        var bloque = Modelo_leerBloqueCabecera(nk, hs);
        if (bloque.length >= 2) {
          var filaHallada = -1, estadoHallado = '', pendientes = 0, primeraFila = null;
          var idxNom2 = (mapa.campos && mapa.campos.NOMBRE !== undefined) ? mapa.campos.NOMBRE : -1;
          var idxRut2 = (mapa.campos && mapa.campos.RUT !== undefined) ? mapa.campos.RUT : -1;
          var muestras = [];
          for (var b = 1; b < bloque.length; b++) {
            var filaB = bloque[b] || [];
            if (filaB.join('|').indexOf(d.marcaBuscada) !== -1) {
              filaHallada = hr + b;
              estadoHallado = mapa.estadoIdx >= 0 ? Utl_texto(filaB[mapa.estadoIdx]) : '';
            }
            var nomB = idxNom2 >= 0 ? filaB[idxNom2] : '';
            var rutB = idxRut2 >= 0 ? filaB[idxRut2] : '';
            if (Utl_vacio(nomB) && Utl_vacio(rutB)) continue;
            var estB = mapa.estadoIdx >= 0 ? Utl_texto(filaB[mapa.estadoIdx]).toUpperCase() : '';
            if (estB === 'INGRESADO') continue;
            pendientes += 1;
            if (primeraFila === null) primeraFila = hr + b;
            if (muestras.length < 3) muestras.push({ indexBloque: b, filaFis: hr + b });
          }
          info.marcaHallada = filaHallada > 0 ? { fila: filaHallada, estado: estadoHallado.substring(0, 40) } : null;
          if (info.coordRegistrada && filaHallada > 0 && filaHallada !== filaCoord) {
            info.desplazamiento = 'coord=' + filaCoord + ' vs marca=' + filaHallada;
          }
          // Muestras ≤3 normalizadas (misma semántica que el staging del
          // pipeline), para que el diagnóstico conserve validacion/rut sin pagar
          // 1000+ normalizaciones.
          var stMuestras = [];
          muestras.forEach(function (m) {
            try {
              var filaM = bloque[m.indexBloque];
              var v = {};
              CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
                if (mapa.campos && mapa.campos[c] !== undefined) v[c] = filaM[mapa.campos[c]];
              });
              var norm = Fuentes_normalizar(Fuentes_crearFila(
                { archivo: 'HOJA_INGRESO', hoja: nk, fila: m.filaFis, sector: Ingresos_hojaASector(nk) }, v));
              stMuestras.push({ fila: String(m.filaFis), validacion: Utl_texto(norm.ESTADO_VALIDACION), rut: (norm.NORMALIZADO && norm.NORMALIZADO.RUT) ? Utl_texto(norm.NORMALIZADO.RUT) : '' });
            } catch (eM) {
              stMuestras.push({ fila: String(m.filaFis), validacion: 'ERR', rut: '' });
            }
          });
          info.pendientes = pendientes;
          info.primeraFila = primeraFila;
          info.staging = stMuestras;
          console.log('[PIPE] diag t=' + (Date.now() - _tDiagHoja) + 'ms hoja=' + nk + ' filas=' + (bloque.length - 1) + ' pendientes=' + pendientes + ' marca=' + info.marcaHallada);
        }
      }
      d.hojas[nk] = info;
    });
  } catch (e) {
    d.errorDiagnostico = e && e.message ? e.message : String(e);
  }
  return d;
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
  var _tForm = Date.now();
  try {
    if (!FORM_CONFIG.ACTIVO) return { ok: true, resumen: { leidos: 0, notas: 'FORM_CONFIG.ACTIVO = false' } };
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) { Form_instalar(); hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS); }
    var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
    if (valores.length < 2) return { ok: true, resumen: { leidos: 0 } };
    var mapa = Form_mapeoEncabezados(valores[0]);
     var pendientes = Form_filasPendientes(valores, mapa, FORM_CONFIG.MAX_REINTENTOS, opciones.max);
    if (!pendientes.length) return { ok: true, resumen: { leidos: 0 } };
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (lectura+pendientes FORM)');
    console.log('[PIPE] pendientes='+pendientes.length+' ids='+pendientes.map(function(p){return p.responseId;}).join(','));

    // contexto: pacientes e índice por RUT + marcas de eventos (una lectura)
    var pacientes = Modelo_leerPacientes() || [];
    var indiceRut = {};
    pacientes.forEach(function (p) { indiceRut[Utl_texto(p.RUT).toUpperCase()] = p; });
    var marcas = Form_leerMarcas();
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (contexto: pacientes+marcas)');

    var lote = Form_procesarLote(pendientes, { indiceRut: indiceRut, marcas: marcas }, {});
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (lote decisiones)');
    console.log('[PIPE] lote decisiones='+lote.decisiones.map(function(d){return d.responseId+':'+d.decision;}).join(' | '));

    // (0) Idempotencia real por MARCA de FUENTE (independiente del trailer):
    //     si la fila de ingreso con 'FORM|<responseId>|INGRESO' ya existe en
    //     alguna INGRESO_*, NO anexar de nuevo (evita duplicados por re-proceso
    //     o trailer perdido).
    lote.decisiones.forEach(function (d) {
      if (d.decision !== 'ANEXAR') return;
      var marcaD = Form_marcadorFuente(d.responseId, 'INGRESO');
      var hallado = Form_buscarFilaIngresoPorMarca(marcaD);
      if (hallado) {
        d.decision = 'YA_ANEXADO';
        d.motivo = 'Fila de ingreso ya existe por marca en ' + hallado.hoja + ' fila ' + hallado.fila;
        d.ingreso = { sector: d.ingreso.sector, hoja: hallado.hoja, fila: String(hallado.fila) };
        d.ingresoHoja = hallado.hoja;
        d.ingresoFila = String(hallado.fila);
        console.log('[PIPE] ANEXAR->YA_ANEXADO por marca '+d.responseId+' en '+hallado.hoja+'/'+hallado.fila);
      }
    });

    // ---- efectos por tipo ----

    // (0.5) estabilizar el layout de las INGRESO_* ANTES de anexar: si una hoja
    //       está en layout legacy, HVis_normalizarLayout inserta filas arriba
    //       (MIGRABLE_ABRIR). Ejecutarlo aquí (ritual pre-anexo) garantiza que
    //       las coordenadas registradas al anexar (ingreso.fila) no se desplacen
    //       luego, y el paso (4) puede leer por coordenada directa; el barrido
    //       por MARCA queda solo como respaldo. El pipeline lo vuelve a llamar
    //       al inicio, pero con fast-path (HVis_yaFormateada) es casi gratis.
    try {
      if (typeof HVis_formatearIngresos === 'function') {
        HVis_formatearIngresos();
        console.log('[PIPE] layout INGRESO estable pre-anexo (t=' + (Date.now() - _tForm) + 'ms)');
      }
    } catch (eForm) {
      Log_warning('Formulario', 'normalizarLayoutPreAnexo', eForm && eForm.message ? eForm.message : String(eForm));
    }

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
        var hrI = Modelo_headerRow(nombreHoja);
        console.log('[PIPE] anexando '+d.responseId+' -> '+nombreHoja+' fila='+desde+' hr='+hrI+' lastRowAntes='+(desde-1));
        hojaI.getRange(desde, 1, 1, filasNuevas.length).setValues([filasNuevas]);
        d.ingreso.fila = String(desde);
        trailersAnexos.push({ filaFisica: d.filaFisica, ingresoHoja: nombreHoja, ingresoFila: String(desde), reintentos: 0, estado: 'VALIDANDO', motivo: '', idInterno: '', idEvento: '', fechaProceso: '' });
      });
    });
    console.log('[PIPE] trailersAnexos='+JSON.stringify(trailersAnexos).substring(0,400));

    if (trailersAnexos.length) Form_actualizarTrailer(trailersAnexos);
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (anexo filas INGRESO, paso 1)');

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
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (acciones clínicas, paso 2)');

    // (3) pipeline existente si hay ingresos NUEVOS anexados, o si quedan
    //     filas de ingreso en juego (ANEXAR/YA_ANEXADO). El segundo caso es
    //     auto-reparación: un envío interrumpido (timeout) dejó la fila sin
    //     ESTADO_INGRESO; el pipeline la re-procesa aquí y el paso (4) deja de
    //     reportar SIN_FILA_INGRESO eternamente en los reenvíos.
    var hayAnexos = Object.keys(porHoja).length > 0;
    var filasAnexadas = lote.decisiones.filter(function (d) {
      return d.decision === 'ANEXAR' || d.decision === 'YA_ANEXADO';
    });
    // El pipeline de la Web App se acota a las hojas INGRESO_* involucradas en
    // ESTA captura. Hojas con saldos pendientes históricos (miles de filas sin
    // ESTADO_INGRESO == 'INGRESADO') NO deben re-procesarse en cada envío: era
    // la causa del timeout (>60 s) y del SIN_FILA_INGRESO. El resto del
    // backlog se sigue procesando por lote desde el panel (llamada completa).
    var acotacion = Form_derivarAcotacionPaso3(filasAnexadas, Form_buscarFilaIngresoPorMarca);
    var soloHojas = acotacion.soloHojas;
    var soloFilas = acotacion.soloFilas;
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (acotación paso 3 + búsqueda marcas) acotacion=' + JSON.stringify(acotacion));
    var resumenPipeline = null;
    if (hayAnexos || filasAnexadas.length) {
      console.log('[PIPE] antes Ingresos_procesarTodasLasHojas anexos='+hayAnexos+' filasAnexadas='+filasAnexadas.length+' soloHojas='+JSON.stringify(soloHojas)+' soloFilas='+JSON.stringify(soloFilas)+' confirmarNuevos='+(opciones.confirmarNuevos===true));
      resumenPipeline = Ingresos_procesarTodasLasHojas({ confirmarNuevos: opciones.confirmarNuevos === true, soloHojas: soloHojas.length ? soloHojas : null, soloFilas: soloFilas });
      console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (pipeline paso 3, anexos=' + hayAnexos + ')');
      console.log('[PIPE] despues pipeline resumen='+JSON.stringify(resumenPipeline).substring(0,500));
    } else {
      console.log('[PIPE] sin anexos ni filas de ingreso pendientes, no se llama pipeline');
    }

    // (4) resultados finales (re-leer) e ids de evento para clínicas
    var marcasFinales = Form_leerMarcas();

    // (4b) leer UNA vez el bloque completo de cada hoja INGRESO_* involucrada:
    //      con el layout estabilizado (0.5), las coordenadas registradas al
    //      anexar son válidas y basta una lectura por hoja (no una por fila).
    var hojasAnexadas = {};
    lote.decisiones.forEach(function (d) {
      if (d.decision !== 'ANEXAR' && d.decision !== 'YA_ANEXADO') return;
      var hoja = (d.ingreso && d.ingreso.hoja) || d.ingresoHoja || '';
      if (hoja && !hojasAnexadas[hoja]) hojasAnexadas[hoja] = Modelo_leerBloqueCabecera(hoja);
    });
    console.log('[PIPE] t=' + (Date.now() - _tForm) + 'ms (paso 4b lectura bloques hojas anexadas) hojas=' + JSON.stringify(Object.keys(hojasAnexadas)));

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
        // Resolver por COORDENADA registrada al anexar (layout ya estable por el
        // ritual pre-anexo 0.5). Solo si la lectura directa es inconcluyente se
        // resuelve por MARCA (barrido FUENTE) como respaldo robusto.
        var hojaA = (d.ingreso && d.ingreso.hoja) || d.ingresoHoja || '';
        var filaA = (d.ingreso && d.ingreso.fila !== undefined && d.ingreso.fila !== '') ? d.ingreso.fila : d.ingresoFila;
        var lf = null;
        if (hojaA && filaA && hojasAnexadas[hojaA]) {
          lf = Form_leerFilaIngresoDesdeBloque(hojaA, filaA, hojasAnexadas[hojaA]);
        }
        if (!lf || !lf.estado || lf.nota === 'FILA_INGRESO_FUERA_DE_RANGO' || lf.nota === 'BLOQUE_DESALINEADO') {
          var hallado = Form_buscarFilaIngresoPorMarca(Form_marcadorFuente(d.responseId, 'INGRESO'));
          var ub = Form_resolverFilaIngreso(hallado, d.ingreso, d.ingresoHoja, d.ingresoFila);
          if (ub && ub.hoja && ub.fila) {
            lf = Form_leerFilaIngreso(ub.hoja, ub.fila);
            if (hallado) console.log('[PIPE] fila resuelta por marca '+d.responseId+' -> '+hallado.hoja+'/'+hallado.fila);
          } else if (!hallado) {
            console.log('[PIPE] SIN_FILA_INGRESO '+d.responseId);
          }
        }
        if (lf && lf.estado) {
          var map = Form_mapearResultadoFila(lf.estado, lf.nota);
          est = map.estado; mot = map.motivo;
          if (est === 'ERROR') {
            console.log('[PIPE] RESOLVER '+d.responseId+' hoja='+hojaA+' fila='+filaA+' lf='+JSON.stringify(lf)+' -> '+mot);
          }
        } else {
          est = 'ERROR';
          if (!mot) mot = 'SIN_FILA_INGRESO';
          console.log('[PIPE] RESOLVER '+d.responseId+' hoja='+hojaA+' fila='+filaA+' SIN_ESTADO lf='+JSON.stringify(lf));
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
    // Dupla: almacena profesional 1 y 2 como códigos separados por punto y coma
    var duplaPartes = [];
    if (normalizado.PROFESIONAL) duplaPartes.push(normalizado.PROFESIONAL);
    if (normalizado.PROFESIONAL2) duplaPartes.push(normalizado.PROFESIONAL2);
    if (duplaPartes.length > 0) {
      paciente.DUPLA_INGRESO = duplaPartes.join('; ');
      cambios += 1;
    }
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

function api_formularioControl() { return Form_refrescarControl(); }

function api_formularioReprocesar(param) {
  return Form_reprocesar(param && param.respuestaId ? { respuestaId: param.respuestaId } : {});
}

/** GAS: catálogo de profesionales para el dropdown de la Web App. */
function api_profesionalesCatalogo() {
  try {
    return Profesionales_catalogo()
      .filter(function (c) { return c.ACTIVO; })
      .map(function (c) { return c.NOMBRE; });
  } catch (e) {
    return ['Médico/a','Enfermera/o','TENS','Matrona/o','Psicólogo/a','Asistente Social','Nutricionista','Kinesiólogo/a','Terapeuta Ocupacional'];
  }
}