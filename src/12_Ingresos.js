/**
 * Sistema ECICEP — 12_Ingresos
 * Orquestador ETAPA 3b: INGRESO_* → STAGING → VALIDACIÓN → IDENTIFICACIÓN →
 * DECISIÓN → PACIENTES + EVENTOS.
 *
 * Núcleo PURO (Ingresos_procesarFilas): opera sobre un store en memoria
 * {pacientes:[], eventos:[]} con idGen inyectable → determinista y testeable
 * en node. El store es APPEND-ONLY: nunca modifica registros previos.
 *
 * Wrapper GAS (Ingresos_procesarTodasLasHojas_): adapta Sheets↔store,
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
  var captura = CAMPOS_INGRESO_OPERATIVOS.concat(CAMPOS_INGRESO_ADICIONALES);
  (encabezados || []).forEach(function (h, i) {
    var clave = Utl_claveAlnum(h);
    if (estadoIdx < 0 && (clave === 'ESTADOINGRESO' || clave === 'INGRESOESTADO' || clave === 'ESTADO')) { estadoIdx = i; return; }
    if (notaIdx < 0 && (clave === 'NOTASISTEMA' || clave === 'NOTA')) { notaIdx = i; return; }
    if (clave === '') return;
    var m = Norm_mapearEncabezado(h);
    // traducción encabezado→modelo: TELEFONO (canonico de FONO/CELULAR/TELEFONOS)
    var campo = (m.canonico === 'TELEFONO') ? 'TELEFONOS' : m.canonico;
    // Captura aditiva: operativos + adicionales con sinónimo confirmado
    // (ULTIMO_CONTROL / ULTIMO_SEGUIMIENTO / PROXIMO_CONTROL /
    //  PROFESIONAL_SEGUIMIENTO / PREINGRESO). El resto → desconocidos.
    if (m.conocido && captura.indexOf(campo) !== -1) {
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
 * Construye el objeto PACIENTE completo (31 campos del modelo v3) desde la
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
    ULTIMO_SEGUIMIENTO: n.ULTIMO_SEGUIMIENTO || '',
    ULTIMO_CONTROL: n.ULTIMO_CONTROL || '',
    PROXIMO_CONTROL: n.PROXIMO_CONTROL || '',
    COMPOSICION_CONTROL: '',
    OBSERVACIONES: n.OBSERVACIONES || '',
    CONDICIONES: '',
    OTRAS_PATOLOGIAS: '',
    SALUD_MENTAL: n.SALUD_MENTAL || '',
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
  var _tPF = Date.now();
  var confirmarNuevos = !!opciones.confirmarNuevos;
  var _useSeqEv = ('evSecuenciaInicial' in opciones);
  var seqPac = 0, seqEv = _useSeqEv ? (opciones.evSecuenciaInicial || 1) - 1 : 0;
  var indices = Iden_construirIndices((store && store.pacientes) || []);

  var resultados = [], pacientesNuevos = [], eventos = [];
  var resumen = {
    leidos: filasStaging.length,
    validacionOk: 0, validacionWarning: 0, validacionError: 0,
    validos: 0, conError: 0, bloqueados: 0,
    nuevos: 0, existentes: 0, revision: 0, duplicados: 0, eventosCreados: 0
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
      if (iden.resultado === 'POSIBLE_DUPLICADO') resumen.duplicados += 1;
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
    var ev = Ev_desdeStaging(fila, _useSeqEv ? { secuencia: seqEv } : {});
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
      indices = Iden_indicesAgregar(indices, paciente); // índice al día O(1) por paciente
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

  console.log('[PIPE] procesarFilas t=' + (Date.now() - _tPF) + 'ms filas=' + filasStaging.length + ' pacientesIdx=' + (store.pacientes || []).length);
  return { resultados: resultados, resumen: resumen, pacientesNuevos: pacientesNuevos, eventos: eventos };
}

// ---------------------------------------------------------------------------
// Wrapper GAS — lectura de hojas, persistencia por lotes y trazabilidad
// ---------------------------------------------------------------------------

/**
 * PURA: resumen breve para el usuario (Parte 3.7 y 5.3). Un único mensaje
 * final con las cuentas relevantes; cero detalle técnico.
 * Formato: "✓ Ingresados: X · Eventos: X · Revisión: N · Errores: M"
 * (los bloques con 0 se omiten; "Duplicados" aparece solo si los hay).
 */
function Ingresos_resumenTexto(r) {
  var resumen = r || {};
  if (!resumen.leidos) return 'Sin ingresos pendientes';
  var partes = [
    'Ingresados: ' + ((resumen.nuevos || 0) + (resumen.existentes || 0)),
    'Eventos: ' + (resumen.eventosCreados || 0)
  ];
  if ((resumen.duplicados || 0) > 0) partes.push('Duplicados: ' + resumen.duplicados);
  if ((resumen.revision || 0) > 0) partes.push('Revisión: ' + resumen.revision);
  if ((resumen.conError || 0) > 0) partes.push('Errores: ' + resumen.conError);
  return '✓ ' + partes.join(' · ');
}

function _ingresosUsuarioActual() {
  try {
    if (typeof Session !== 'undefined') return Session.getActiveUser().getEmail();
  } catch (e) { /* sin sesión (node) */ }
  return '';
}

/**
 * GAS: lectura ACOTADA de una hoja INGRESO_* (fiabilidad operativa v0.10.5).
 * Cuando la captura en curso acota a filas concretas (filasPermitidas), leer
 * solo la fila de encabezados (con detección de header visual real) y esas
 * filas físicas específicas — nunca el bloque completo con getDataRange.
 * Devuelve el MISMO shape que Modelo_leerBloqueCabecera: [encabezados, ...filas].
 * No reordena ni renumera: las filas salen en el orden de filasPermitidas.
 * Si ninguna fila es válida, devuelve solo [encabezados] (resta querer que el
 * caller decida con valores.length < 2, igual que el bloque completo vacío).
 */
function Ingresos_leerFilasAcotadas_(hoja, nombreHoja, filasPermitidas) {
  var hr = Modelo_headerRow(nombreHoja);
  var ultima = hoja.getLastRow();
  var ancho = Math.max(hoja.getLastColumn(), 1);
  var encabezados = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
  var hdrOk = encabezados.join('|').toUpperCase().indexOf('NOMBRE') !== -1;
  if (!hdrOk) {
    var alt = hoja.getRange(1, 1, 1, ancho).getValues()[0];
    if (alt.join('|').toUpperCase().indexOf('NOMBRE') !== -1) { hr = 1; encabezados = alt; }
  }
  var filas = [];
  (filasPermitidas || []).forEach(function (nf) {
    var fi = Number(nf);
    if (!fi || fi < 1 || fi > ultima || fi <= hr) return;
    filas.push(hoja.getRange(fi, 1, 1, ancho).getValues()[0]);
  });
  return [encabezados].concat(filas);
}

/**
 * Lee una hoja INGRESO_* y produce filas de staging normalizadas.
 * Ignora filas vacías y las ya procesadas (ESTADO_INGRESO = INGRESADO).
 * Con `filasPermitidas` acotada y pequeña (y en la Web App siempre lo es)
 * NO escanea la hoja entera: lee solo encabezados + filas listadas.
 * @returns {staging:[], hoja:Object|null}
 */
function Ingresos_leerHoja(nombreHoja, filasPermitidas) {
  var _tHoja = Date.now();
  var hoja = Modelo_ss().getSheetByName(nombreHoja);
  if (!hoja) return { staging: [], hoja: null };
  var acotado = filasPermitidas && filasPermitidas.length && filasPermitidas.length <= 50;
  var valores = acotado
    ? Ingresos_leerFilasAcotadas_(hoja, nombreHoja, filasPermitidas)
    : Modelo_leerBloqueCabecera(nombreHoja, hoja);
  var hrDetect = Modelo_headerRow(nombreHoja);
  var hrOrig = hrDetect;
  // Fallback para hojas aún no reconciliadas al layout visual (header en fila 1)
  if (valores.length) {
    var hdrOk = valores[0].join('|').toUpperCase().indexOf('NOMBRE') !== -1;
    if (!hdrOk && hoja.getLastRow() >= 1) {
      var alt = hoja.getRange(1, 1, hoja.getLastRow(), Math.max(hoja.getLastColumn(),1)).getValues();
      if (alt.length && alt[0].join('|').toUpperCase().indexOf('NOMBRE') !== -1) {
        console.log('[PIPE] Ingresos_leerHoja '+nombreHoja+' fallback hr '+hrOrig+'->1 valores visual sin NOMBRE, usando alt fila1');
        valores = alt;
        hrDetect = 1;
      } else {
        console.log('[PIPE] Ingresos_leerHoja '+nombreHoja+' hrDet='+hrDetect+' hdrOk='+hdrOk+' sin alt valido');
      }
    } else {
      console.log('[PIPE] Ingresos_leerHoja '+nombreHoja+' hrDet='+hrDetect+' hdrOk='+hdrOk+' valoresLen='+valores.length);
    }
  }
  if (valores.length < 2) return { staging: [], hoja: hoja };
  var mapa = Ingresos_mapearEncabezadosHoja(valores[0]);
  var idxCampos = mapa.campos;
  var idxEstado = mapa.estadoIdx, idxNota = mapa.notaIdx;
  var sector = Ingresos_hojaASector(nombreHoja);
  var staging = [];
  // En modo acotado, la fila física real es la filaPermitida correspondiente
  // (valores[f] == filasPermitidas[f-1]): NO vale hrDetect+f, porque las filas
  // leídas no son contiguas y un número inventado reencuadraría filas ajenas.
  var filasFis = (acotado && filasPermitidas) ? filasPermitidas.slice(0, valores.length - 1) : null;
  for (var f = 1; f < valores.length; f++) {
    var filaVal = valores[f];
    // Acotado: si hay lista de filas permitidas para esta hoja, saltar TODO lo
    // demás ANTES de normalizar (el costo real está en Fuentes_normalizar, no
    // en el filtro posterior de Ingresos_acotarStaging).
    var filaFis = filasFis ? Number(filasFis[f - 1]) : (hrDetect + f);
    if (filasPermitidas && filasPermitidas.length && filasPermitidas.indexOf(String(filaFis)) === -1) continue;
    var nombreRaw = idxCampos.NOMBRE !== undefined ? filaVal[idxCampos.NOMBRE] : '';
    var rutRaw = idxCampos.RUT !== undefined ? filaVal[idxCampos.RUT] : '';
    if (Utl_vacio(nombreRaw) && Utl_vacio(rutRaw)) continue;
    var estadoPrevio = idxEstado >= 0 ? Utl_texto(filaVal[idxEstado]).toUpperCase() : '';
    if (estadoPrevio === 'INGRESADO') continue; // idempotencia del procesamiento
    var v = {};
    CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
      if (idxCampos[c] !== undefined) v[c] = filaVal[idxCampos[c]];
    });
    // Copia ADITIVA: campos adicionales con sinónimo confirmado (SEGUIMIENTO,
    // CONTROL, PRÓXIMO CONTROL, PROFESIONAL, PRE INGRESO) presentes en la hoja
    // nunca se descartan por no estar en la lista corta operativa.
    for (var ck in idxCampos) {
      if (v[ck] === undefined && idxCampos[ck] !== undefined) v[ck] = filaVal[idxCampos[ck]];
    }
    // La fila sale del lector YA NORMALIZADA y validada (corrección ETAPA 3b:
    // el defecto histórico era entregar filas crudas al orquestador)
    staging.push(Fuentes_normalizar(Fuentes_crearFila(
      { archivo: 'HOJA_INGRESO', hoja: nombreHoja,
        fila: filaFis, sector: sector }, v)));
  }
  console.log('[PIPE] leerHoja ' + nombreHoja + ' t=' + (Date.now() - _tHoja) + 'ms valores=' + valores.length + ' staging=' + staging.length);
  return { staging: staging, hoja: hoja };
}

/**
 * Escribe de vuelta los estados de procesamiento en las hojas INGRESO_*.
 * Lectura y escritura por bloques (nunca setValue por celda).
 */
function Ingresos_escribirEstados_(resultados) {
  try {
    if (typeof SpreadsheetApp === 'undefined' || !resultados || !resultados.length) return;
    var ss = Modelo_ss();
    var porHoja = Utl_agruparPor(resultados, function (r) { return r.hoja; });
    // Utl_agruparPor devuelve un Map (no un objeto): Object.keys no lo puede
    // recorrer. FIX: reescritura del estado en las hojas INGRESO_* era código
    // muerto (ETAPA 3b) — ESTADO_INGRESO/NOTA_SISTEMA nunca se marcaban.
    var gruposHoja = Array.from(porHoja.entries());
    gruposHoja.forEach(function (grupo) {
      var nombreHoja = grupo[0], resHoja = grupo[1];
      var hoja = ss.getSheetByName(nombreHoja);
      if (!hoja) return;
      var ini = Modelo_dataStartRow(nombreHoja);
      var hr = Modelo_headerRow(nombreHoja);
      var ultima = hoja.getLastRow();
      // Detectar header real (visual hr vs legacy fila1)
      var encabezados = hoja.getRange(hr, 1, 1, hoja.getLastColumn()).getValues()[0];
      var hdrOk = encabezados.join('|').toUpperCase().indexOf('NOMBRE') !== -1;
      if (!hdrOk && hoja.getLastRow() >= 1) {
        var altHdr = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
        if (altHdr.join('|').toUpperCase().indexOf('NOMBRE') !== -1) {
          hr = 1; ini = 2;
          encabezados = altHdr;
        }
      }
      if (ultima < ini) return;
      var colEstado = -1, colNota = -1;
      encabezados.forEach(function (h, i) {
        var clave = Utl_claveAlnum(h);
        if (clave === 'ESTADOINGRESO' || clave === 'INGRESOESTADO' || clave === 'ESTADO') colEstado = i + 1;
        else if (clave === 'NOTASISTEMA' || clave === 'NOTASISTEMAS' || clave === 'NOTA') colNota = i + 1;
      });
      if (colEstado < 0 || colNota < 0) {
        console.log('[PIPE] escribirEstados '+nombreHoja+' hr='+hr+' colEstado='+colEstado+' colNota='+colNota+' enc='+JSON.stringify(encabezados));
        return;
      }
      var desde = Math.min(colEstado, colNota), ancho = Math.abs(colEstado - colNota) + 1;
      var bloque = hoja.getRange(ini, desde, ultima - ini + 1, ancho).getValues();
      var offsetEstado = colEstado - desde, offsetNota = colNota - desde;
      console.log('[PIPE] escribirEstados ' + nombreHoja + ' n=' + resHoja.length +
        ' ini=' + ini + ' hr=' + hr + ' ultima=' + ultima + ' desde=' + desde + ' ancho=' + ancho +
        ' colEstado=' + colEstado + ' colNota=' + colNota +
        ' filas=' + JSON.stringify(resHoja.map(function (r) { return r.filaOrigen; })) +
        ' estados=' + JSON.stringify(resHoja.map(function (r) { return r.estado; })));
      resHoja.forEach(function (r) {
        var filaHoja = Number(r.filaOrigen) - ini; // índice 0-based dentro del bloque (fila ini = 0)
        if (isNaN(filaHoja) || filaHoja < 0 || filaHoja >= bloque.length) return;
        bloque[filaHoja][offsetEstado] = r.estado;
        // Preservar la marca de trazabilidad 'FORM|<responseId>|INGRESO' que el
        // anexo dejó en NOTA_SISTEMA: la resolución de la Web App y la
        // idempotencia del re-proceso dependen de que la marca siga presente
        // tras escribir el estado. Se conserva ANTEPUESTA a la nota humana.
        var notaAnt = Utl_texto(bloque[filaHoja][offsetNota] || '');
        var notaNueva = Utl_texto(r.nota || '');
        bloque[filaHoja][offsetNota] = notaAnt.indexOf(FORM_CONFIG.MARCAS.PREFIJO) === 0
          ? (notaNueva ? notaAnt + ' · ' + notaNueva : notaAnt)
          : notaNueva;
      });
      hoja.getRange(ini, desde, ultima - ini + 1, ancho).setValues(bloque);
      // Verificación post-escritura: re-lectura acotada a las filas afectadas
      // (no al bloque completo) para comprobar que el estado quedó donde los
      // lectores (Form_leerFilaIngreso) lo buscan.
      var filasHoja = resHoja.map(function (r) { return Number(r.filaOrigen); }).filter(function (nf) { return !isNaN(nf); });
      if (!filasHoja.length) return;
      var iniVerif = Math.max(ini, Math.min.apply(null, filasHoja));
      var finVerif = Math.min(ultima, Math.max.apply(null, filasHoja));
      var verif = hoja.getRange(iniVerif, desde, finVerif - iniVerif + 1, ancho).getValues();
      resHoja.forEach(function (r) {
        var fi = Number(r.filaOrigen) - iniVerif;
        if (isNaN(fi) || fi < 0 || fi >= verif.length) return;
        console.log('[PIPE] escribirEstados verif ' + nombreHoja + ' fila=' + r.filaOrigen +
          ' estado=' + Utl_texto(verif[fi][offsetEstado]).toUpperCase() +
          ' nota=' + Utl_texto(verif[fi][offsetNota]).substring(0, 90));
      });
    });
  } catch (e) {
    console.log('[PIPE] escribirEstados EXCEPCION: ' + (e && e.message ? e.message : String(e)) + (e && e.stack ? ' | ' + e.stack : ''));
    Log_error('Ingresos', 'escribirEstados', e && e.message ? e.message : String(e));
  }
}

/**
 * PURA: acota el staging de una hoja INGRESO_* a la captura en curso
 * (DEC-054/055). Semántica explícita:
 *   - `soloHojas` set Y sin coincidencia de hoja → []
 *   - `soloFilas[hoja]` set → solo las filas listadas (comparación de
 *     FILA_ORIGEN normalizada a texto: robusta a string/number)
 *   - sin acotación (batch/panel) o `soloFilas[hoja]` indefinido/vacío →
 *     staging completo (comportamiento histórico: el backlog se procesa por
 *     lote; en la Web App esto solo ocurre si la acotación no pudo resolverse)
 */
function Ingresos_acotarStaging(staging, hojaNombre, soloHojas, soloFilas) {
  if (soloHojas && soloHojas.length && soloHojas.indexOf(hojaNombre) === -1) return [];
  if (!soloFilas || !soloFilas[hojaNombre] || !soloFilas[hojaNombre].length) return staging;
  var set = {};
  soloFilas[hojaNombre].forEach(function (nf) { set[String(nf)] = true; });
  return staging.filter(function (f) { return set[Utl_texto(f.FILA_ORIGEN)]; });
}

// ---------------------------------------------------------------------------
// Ingresos pendientes — módulo de la ficha 2.0 (ETAPA 3c)
// Reutiliza ÍNTEGRAMENTE el pipeline existente: nunca una segunda
// normalización ni una segunda lógica. Solo lectura de staging + filtros.
// ---------------------------------------------------------------------------

/**
 * PURA: respuesta unificada del procesamiento. Mantiene el contrato histórico
 * (resumen plano) y, SOLO si `opciones.incluirResultados === true`, agrega el
 * detalle por fila (hoja, filaOrigen, estado, nota, idInterno, idEvento).
 * Aplica en todos los retornos (sin pendientes, duplicados, éxito).
 */
function Ingresos_respuesta_(salida, opciones) {
  var base = salida && typeof salida === 'object' && ('resumen' in salida)
    ? salida.resumen : salida;
  var r = Object.assign({}, base || {});
  if (opciones && opciones.incluirResultados) {
    r.resultados = ((salida && salida.resultados) || []).map(function (x) {
      return {
        hoja: x.hoja, filaOrigen: x.filaOrigen, estado: x.estado, nota: x.nota,
        idInterno: x.idInterno || '', idEvento: x.idEvento || ''
      };
    });
  }
  return r;
}

/** PURA: resuelve la clave de HOJAS_INGRESO desde un nombre de hoja. */
function Ingresos_claveHojaNombre_(nombreHoja) {
  var k = Utl_texto(nombreHoja).toUpperCase().replace(/\s+/g, '_');
  if (HOJAS_INGRESO.hasOwnProperty(k)) return k;
  return HOJAS_INGRESO.hasOwnProperty(nombreHoja) ? nombreHoja : k;
}

/** PURA: mapeo mínimo de una fila de staging pendiente para el listado. */
function Ingresos_filaPendientePublica_(fila) {
  var n = fila.NORMALIZADO || {};
  var ev = Utl_texto(fila.ESTADO_VALIDACION);
  var errores = (fila.ERRORES || []).length;
  var warnings = (fila.WARNINGS || []).length;
  var estado = ev === 'ERROR' || errores > 0 ? 'ERROR'
    : (warnings > 0 ? 'WARNING' : 'PENDIENTE');
  return {
    hoja: fila.HOJA_ORIGEN, fila: Number(fila.FILA_ORIGEN),
    sector: n.SECTOR || Ingresos_hojaASector(fila.HOJA_ORIGEN) || '',
    rut: n.RUT || '', nombre: n.NOMBRE || '',
    fechaIngreso: n.FECHA_INGRESO || '',
    estratificacion: n.ESTRATIFICACION || '',
    estado: estado, errores: errores, warnings: warnings
  };
}

/**
 * GAS: lista las filas pendientes (todo lo no procesado: ESTADO_INGRESO !=
 * INGRESADO) de las hojas INGRESO_*, reutilizando Ingresos_leerHoja() (que ya
 * descarta lo INGRESADO). Filtros: sector, término (RUT/nombre), estado
 * (ERROR/WARNING/PENDIENTE). Paginación inicio+limite y orden hoja/fila.
 */
function Ingresos_listarPendientes(opciones) {
  opciones = opciones || {};
  var termino = Utl_texto(opciones.termino).toUpperCase().trim();
  var sector = Utl_texto(opciones.sector).toUpperCase().trim();
  var porEstado = Utl_texto(opciones.estado).toUpperCase().trim();
  var inicio = Math.max(Number(opciones.inicio) || 0, 0);
  var limite = Math.min(Math.max(Number(opciones.limite) || 100, 1), 500);
  var filas = [];
  var conteos = { total: 0, validos: 0, advertencias: 0, errores: 0 };
  Object.keys(HOJAS_INGRESO).forEach(function (nombreHoja) {
    if (sector && Ingresos_hojaASector(nombreHoja) !== sector) return;
    var leida = Ingresos_leerHoja(nombreHoja);
    (leida.staging || []).forEach(function (fila) {
      var publica = Ingresos_filaPendientePublica_(fila);
      if (sector && publica.sector.toUpperCase() !== sector) return;
      if (porEstado === 'ERROR' || porEstado === 'WARNING' || porEstado === 'PENDIENTE') {
        if (publica.estado !== porEstado) return;
      }
      if (termino && (publica.rut + ' ' + publica.nombre).toUpperCase().indexOf(termino) === -1) return;
      filas.push(publica);
      conteos.total += 1;
      if (publica.estado === 'ERROR') conteos.errores += 1;
      else if (publica.estado === 'WARNING') conteos.advertencias += 1;
      else conteos.validos += 1;
    });
  });
  filas.sort(function (a, b) {
    return a.hoja === b.hoja ? (a.fila - b.fila) : (a.hoja < b.hoja ? -1 : 1);
  });
  var total = filas.length;
  return { filas: filas.slice(inicio, inicio + limite), total: total, inicio: inicio, limite: limite, conteos: conteos };
}

/** PURA: pre-ficha de un ingreso pendiente (mismo lenguaje visual que la ficha). */
function Ingresos_preFicha_(fila) {
  var n = fila.NORMALIZADO || {};
  return {
    nombre: n.NOMBRE || '', rut: n.RUT || '',
    sector: n.SECTOR || Ingresos_hojaASector(fila.HOJA_ORIGEN) || '',
    fechaIngreso: n.FECHA_INGRESO || '', sexo: n.SEXO || '',
    fechaNacimiento: n.FECHA_NACIMIENTO || '',
    telefono: n.TELEFONOS || '', telefonoObs: n.TELEFONO_OBS || '',
    estratificacion: n.ESTRATIFICACION || '', dupla: n.DUPLA_INGRESO || '',
    profesionalSeguimiento: n.PROFESIONAL_SEGUIMIENTO || '',
    saludMental: n.SALUD_MENTAL || '', observaciones: n.OBSERVACIONES || '',
    estadoValidacion: fila.ESTADO_VALIDACION || '',
    warnings: (fila.WARNINGS || []).map(function (w) { return w.campo + ': ' + w.mensaje; }),
    errores: (fila.ERRORES || []).map(function (e) { return e.campo + ': ' + e.mensaje; })
  };
}

/**
 * GAS: detalle de UNA fila pendiente (pre-ficha). Una sola lectura acotada a
 * esa fila (Ingresos_leerHoja con filasPermitidas): no escanea la hoja entera.
 */
function Ingresos_detallePendiente(nombreHoja, filaFisica) {
  var k = Ingresos_claveHojaNombre_(nombreHoja);
  if (!HOJAS_INGRESO[k]) return { ok: false, motivo: 'HOJA_INGRESO_INVALIDA' };
  var nf = Number(filaFisica);
  if (!nf || nf < 1) return { ok: false, motivo: 'FILA_INVALIDA' };
  var leida = Ingresos_leerHoja(k, [String(nf)]);
  var fila = (leida.staging || []).filter(function (f) {
    return Utl_texto(f.FILA_ORIGEN) === String(nf);
  })[0] || null;
  if (!fila) return { ok: false, motivo: 'FILA_SIN_DATOS_O_YA_INGRESADA' };
  return { ok: true, preFicha: Ingresos_preFicha_(fila), hoja: k, fila: Number(fila.FILA_ORIGEN) };
}

/**
 * GAS (ficha 2.0): busca filas pendientes de un RUT en las hojas INGRESO_*.
 * Se ejecuta SOLO al abrir la ficha (una lectura por hoja INGRESO_*).
 */
function Ingresos_buscarPendientesPorRut(rut) {
  var nr = Norm_normalizarRut(rut);
  if (!nr.rut) return [];
  var resultado = [];
  Object.keys(HOJAS_INGRESO).forEach(function (nombreHoja) {
    var leida = Ingresos_leerHoja(nombreHoja);
    (leida.staging || []).forEach(function (fila) {
      var n = fila.NORMALIZADO || {};
      if (!n.RUT) return;
      var nrFila = Norm_normalizarRut(n.RUT);
      if (nrFila.rut !== nr.rut) return;
      resultado.push({
        hoja: nombreHoja, fila: Number(fila.FILA_ORIGEN),
        sector: n.SECTOR || Ingresos_hojaASector(nombreHoja),
        fechaIngreso: n.FECHA_INGRESO || '', estado: fila.ESTADO_VALIDACION || ''
      });
    });
  });
  return resultado;
}

/**
 * GAS: procesa UNA sola fila de INGRESO_* reutilizando el pipeline existente
 * (nunca copia a SECTOR_*; la vista sectorial se actualiza por derivación).
 * Idempotente: si la fila ya está INGRESADO, el pipeline la ignora → leidos 0.
 */
function Ingresos_procesarFila(nombreHoja, filaFisica, opciones) {
  opciones = opciones || {};
  var k = Ingresos_claveHojaNombre_(nombreHoja);
  if (!HOJAS_INGRESO[k]) return { ok: false, motivo: 'HOJA_INGRESO_INVALIDA' };
  var nf = Number(filaFisica);
  if (!nf || nf < 1) return { ok: false, motivo: 'FILA_INVALIDA' };
  var soloFilas = {};
  soloFilas[k] = [String(nf)];
  var resumen = Ingresos_procesarTodasLasHojas_({
    soloHojas: [k], soloFilas: soloFilas,
    confirmarNuevos: opciones.confirmarNuevo === true,
    incluirResultados: true
  });
  var primer = (resumen.resultados || []).filter(function (r) {
    return Utl_texto(r.filaOrigen) === String(nf);
  })[0] || null;
  return { ok: true, hoja: k, fila: String(nf), resumen: resumen, resultado: primer };
}

/**
 * GAS: incorporación MASIVA de las filas pendientes VÁLIDAS (v0.10.7).
 * Reutiliza ÍNTEGRAMENTE Ingresos_procesarTodasLasHojas_ (un solo pipeline,
 * un solo lock): nunca N RPC desde el cliente. Las exclusiones ya viven en el
 * pipeline existente y NO se duplican filtros aquí:
 *   - ERROR / BLOQUEADO      → gate de escritura (no entra a PACIENTES/EVENTOS);
 *   - INGRESADO              → Ingresos_leerHoja lo descarta de la lectura;
 *   - DUPLICADO (RUT+fecha)  → barrera 2b de procesarTodasLasHojas_;
 *   - REQUIERE_REVISION / POSIBLE_DUPLICADO → gate REVISION (no se escribe).
 * `opciones.sector` acota a las hojas INGRESO_* de ese sector (canónico).
 * @param {Object} opciones {sector?: 'NARANJO'|'AMARILLO'|'VERDE'}
 * @returns {resumen, resultados} misma salida del pipeline (incluirResultados)
 */
function Ingresos_incorporarValidos_(opciones) {
  opciones = opciones || {};
  var soloHojas = null;
  if (opciones.sector) {
    soloHojas = Ingresos_hojasParaSector_(opciones.sector);
    if (!soloHojas.length) {
      // Sector sin hojas INGRESO_*: vacío limpio (no procesar todas por error).
      return {
        resumen: {
          leidos: 0, validos: 0, conError: 0, nuevos: 0, existentes: 0,
          revision: 0, duplicados: 0, eventosCreados: 0
        },
        resultados: []
      };
    }
  }
  // El pipeline devuelve el resumen PLANO (Ingresos_respuesta_ aplana los
  // contadores al nivel superior). Aquí se recompone el contrato estructurado
  // {resumen, resultados} que consume el endpoint de la Web App. Los contadores
  // de agrupación (revision, errores, duplicados, ingresados) se derivan de
  // `resultados` para que el resumen coincida exactamente con lo que la UI
  // pinta por fila (el `duplicados` plano del pipeline incluye POSIBLE_DUPLICADO).
  var salida = Ingresos_procesarTodasLasHojas_({
    soloHojas: soloHojas,
    confirmarNuevos: false,
    incluirResultados: true
  });
  var resultados = salida.resultados || [];
  function contar(estado) {
    return resultados.filter(function (x) { return x.estado === estado; }).length;
  }
  return {
    resumen: {
      leidos: salida.leidos || 0,
      validos: salida.validos || 0,
      ingresados: contar('INGRESADO'),
      nuevos: salida.nuevos || 0,
      existentes: salida.existentes || 0,
      revision: contar('REQUIERE_REVISION'),
      errores: contar('ERROR'),
      duplicados: contar('DUPLICADO'),
      eventos: salida.eventosCreados || 0
    },
    resultados: resultados
  };
}

/**
 * Orquestador de alto nivel (menú ECICEP → 📥 Procesar ingresos).
 * Ejecuta el flujo completo sobre TODAS las hojas INGRESO_* presentes,
 * exclusivamente sobre lo que el usuario haya digitado ahí (dataset ficticio
 * en pruebas). Nunca lee los Excel completos.
 */
function Ingresos_procesarTodasLasHojas_(opciones) {
  opciones = opciones || {};
  var ejecucion = 'EJ-' + Date.now().toString(36).toUpperCase();
  var _tIni = Date.now();
  Log_info('Ingresos', 'procesar', 'inicio ejecución ' + ejecucion);

  // 0) NORMALIZAR el layout visual ANTES de leer/escribir: HVis_normalizarLayout
  //    puede insertar filas al inicio (MIGRABLE_ABRIR) cuando la hoja aún está
  //    en el layout legacy (header fila 1). Correrlo al final invalidaba las
  //    coordenadas (filaOrigen) en las que Ingresos_escribirEstados_ ya había
  //    escrito el ESTADO_INGRESO → SIN_ESTADO en la Web App. Ejecutado aquí,
  //    todo el pipeline trabaja sobre un layout estable.
  var normaLayout = {};
  try {
    if (typeof HVis_formatearIngresos === 'function') {
      normaLayout = HVis_formatearIngresos();
      console.log('[PIPE] layout normalizado pre-pipeline: ' + JSON.stringify(normaLayout).substring(0, 300));
    }
  } catch (eN) {
    Log_warning('Ingresos', 'normalizarLayoutPre', eN && eN.message ? eN.message : String(eN));
  }
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (formato visual, paso 0)');

  // 1) leer todas las puertas de entrada
  //    Con `soloHojas`/`soloFilas` (Web App), el pipeline se acota a las hojas
  //    Y filas de la captura en curso. Las hojas con saldos pendientes
  //    históricos (miles de filas sin ESTADO_INGRESO == 'INGRESADO') NO vuelven
  //    a procesarse en cada envío — era la causa del timeout (>60 s) de la Web
  //    App. El backlog completo se sigue procesando por lote desde el panel.
  var soloHojas = opciones && opciones.soloHojas && opciones.soloHojas.length ? opciones.soloHojas.slice() : null;
  var soloFilas = opciones && opciones.soloFilas ? opciones.soloFilas : null; // {hoja:[filas]}
  var staging = [];
  Object.keys(HOJAS_INGRESO).forEach(function (hojaNombre) {
    if (soloHojas && soloHojas.length && soloHojas.indexOf(hojaNombre) === -1) {
      console.log('[PIPE] leerHoja ' + hojaNombre + ' OMITIDA (fuera de soloHojas)');
      return;
    }
    var filasPermitidas = soloFilas && soloFilas[hojaNombre] ? soloFilas[hojaNombre] : null;
    staging = staging.concat(Ingresos_acotarStaging(Ingresos_leerHoja(hojaNombre, filasPermitidas).staging, hojaNombre, soloHojas, soloFilas));
  });
  if ((soloHojas && soloHojas.length) || soloFilas) {
    console.log('[PIPE] pipeline acotado soloHojas=' + JSON.stringify(soloHojas) + ' soloFilas=' + JSON.stringify(soloFilas));
  }
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (lectura hojas ingreso, paso 1)');

  // Sectores tocados por esta captura (para refrescar SOLO sus vistas).
  var sectoresAfectados = [];
  staging.forEach(function (f) {
    var sec = (f.NORMALIZADO && f.NORMALIZADO.SECTOR) || f.SECTOR || '';
    sec = Utl_texto(sec).toUpperCase().trim();
    if (sec && sectoresAfectados.indexOf(sec) === -1) sectoresAfectados.push(sec);
  });
  console.log('[PIPE] sectoresAfectados=' + JSON.stringify(sectoresAfectados));

  var vacio = {
    ejecucion: ejecucion,
    leidos: 0, validos: 0, conError: 0, nuevos: 0, existentes: 0,
    revision: 0, eventosCreados: 0, mensaje: 'No hay ingresos pendientes'
  };
  if (!staging.length) {
    Log_info('Ingresos', 'procesar', 'sin pendientes', null, null);
    Log_flush();
    return Ingresos_respuesta_(Object.assign({}, vacio, { resultados: [] }), opciones);
  }

  // 2) auditoría completa en STAGING_IMPORT (valores originales incluidos)
  Fuentes_guardarFilas(staging);
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (auditoría staging, paso 2)');

  // 2b) BARRERA idempotencia por (RUT, FECHA_INGRESO): si el paciente ya tiene
  //     un ingreso registrado con la MISMA fecha, la fila pendiente es un
  //     reenvío (reintento, doble clic, fila antes no marcada) → se marca
  //     DUPLICADO y se excluye del pipeline (nunca vuelve a crear paciente ni
  //     evento). Regla operativa: un ingreso por paciente por día.
  var store = { pacientes: Modelo_leerPacientes(), eventos: [] };
  var clavesPacienteIngreso = {};
  store.pacientes.forEach(function (p) {
    var k = Utl_texto(p.RUT).toUpperCase().trim() + '|' + Utl_texto(p.FECHA_INGRESO);
    if (k.length > 1) clavesPacienteIngreso[k] = true;
  });
  var duplicadosDia = [];
  var stagingFiltrado = staging.filter(function (fila) {
    if (!fila.NORMALIZADO || !fila.NORMALIZADO.RUT || !fila.NORMALIZADO.FECHA_INGRESO) return true;
    var k = Utl_texto(fila.NORMALIZADO.RUT).toUpperCase().trim() + '|' + Utl_texto(fila.NORMALIZADO.FECHA_INGRESO);
    if (!clavesPacienteIngreso[k]) return true;
    duplicadosDia.push({
      idProvisional: fila.ID_PROVISIONAL, hoja: fila.HOJA_ORIGEN, filaOrigen: fila.FILA_ORIGEN,
      estado: 'DUPLICADO', nota: 'Paciente ya registrado con ingreso de la misma fecha (RUT ' + Utl_texto(fila.NORMALIZADO.RUT) + ')',
      idInterno: (store.pacientes.filter(function(p){ return Utl_texto(p.RUT).toUpperCase().trim()+ '|' + Utl_texto(p.FECHA_INGRESO) === k; })[0] || {}).ID_INTERNO || '',
      idEvento: ''
    });
    console.log('[PIPE] DUPLICADO por RUT+fecha: '+fila.HOJA_ORIGEN+'/'+fila.FILA_ORIGEN+' ' + Aud_anonRut(Utl_texto(fila.NORMALIZADO.RUT)));
    return false;
  });
  staging = stagingFiltrado;
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (barrera RUT+fecha, paso 2b) staging tras barrera=' + staging.length + ' duplicadosDia=' + duplicadosDia.length);
  if (!staging.length) {
    Ingresos_escribirEstados_(duplicadosDia);
    var salidaDuplicada = { resultados: duplicadosDia, resumen: { leidos: duplicadosDia.length, validos: 0, conError: 0, nuevos: 0, existentes: 0, revision: 0, duplicados: duplicadosDia.length, eventosCreados: 0 }, pacientesNuevos: [], eventos: [] };
    salidaDuplicada.resumen.ejecucion = ejecucion;
    Log_info('Ingresos', 'procesar', JSON.stringify({ leidos: salidaDuplicada.resumen.leidos, duplicados: salidaDuplicada.resumen.duplicados }));
    Log_flush();
    return Ingresos_respuesta_(salidaDuplicada, opciones);
  }

  // 3) pipeline puro sobre el store real
  var salida = Ingresos_procesarFilas(staging, store, {
    nuevoId: Modelo_nuevoIdInterno,
    confirmarNuevos: !!opciones.confirmarNuevos
  });
  salida.resumen.ejecucion = ejecucion;
  salida.resultados = salida.resultados.concat(duplicadosDia);
  if (duplicadosDia.length) salida.resumen.duplicados = (salida.resumen.duplicados || 0) + duplicadosDia.length;
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (pipeline puro, paso 3)');

  // 4) persistencia por lotes
  Modelo_agregarPacientes_(salida.pacientesNuevos, { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ingresos-pacientes' });
  Modelo_agregarEventos_(salida.eventos, _ingresosUsuarioActual(), { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ingresos-eventos' });
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (persistencia pacientes/eventos, paso 4)');

  // 5) estados de vuelta en las hojas de ingreso
  Ingresos_escribirEstados_(salida.resultados);
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (estados en hojas, paso 5)');

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
      conflicto = Modelo_agregarConflictos_(filasConflicto);
    }
  } catch (e) {
    Log_warning('Ingresos', 'colaRevision', e && e.message ? e.message : String(e));
  }
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (cola de revisión, paso 5b)');

  // 6) reflejar el resultado en las vistas sectoriales (derivadas, no bases).
  //    Solo se reescriben las vistas de los sectores tocados por la captura.
  var vistas = null;
  try {
    if (typeof Modelo_refrescarVistasSectores_ === 'function') vistas = Modelo_refrescarVistasSectores_(sectoresAfectados);
  } catch (e) {
    Log_warning('Ingresos', 'refrescarSectores', e && e.message ? e.message : String(e));
  }
  console.log('[PIPE] t=' + (Date.now() - _tIni) + 'ms (vistas sectoriales, paso 6) TOTAL_pipeline_ms');

  salida.resumen.usuario = _ingresosUsuarioActual();
  salida.resumen.vistasSector = vistas;
  salida.resumen.aRevision = conflicto;
  Log_info('Ingresos', 'procesar', JSON.stringify({
    leidos: salida.resumen.leidos, nuevos: salida.resumen.nuevos,
    existentes: salida.resumen.existentes, revision: salida.resumen.revision,
    conError: salida.resumen.conError, eventos: salida.resumen.eventosCreados
  }), { ejecucion: ejecucion });
  Log_flush();

  return Ingresos_respuesta_(salida, opciones);
}

/**
 * PURA (helper del wrapper): sincroniza la caché de estado vigente de UN
 * paciente tras registrar un evento manual (último seguimiento/control).
 * La próxima atención es manual: registrar una actividad nunca cambia su fecha.
 * @param {Object} paciente objeto canónico (se muta)
 * @param {Object} evento evento recién creado
 * @param {Object} [freqConfig] frecuencia {G1..}: si se omite se lee de CONFIG (GAS)
 */
function Ingresos_sincronizarCache(paciente, evento, freqConfig) {
  if (!paciente || !evento) return paciente;
  var fecha = Control_aIso(evento.FECHA_EVENTO);
  if (evento.TIPO_EVENTO === 'CONTROL') {
    if (fecha && fecha > Control_aIso(paciente.ULTIMO_CONTROL)) paciente.ULTIMO_CONTROL = fecha;
  }
  if (evento.TIPO_EVENTO === 'SEGUIMIENTO' && fecha && fecha > Control_aIso(paciente.ULTIMO_SEGUIMIENTO)) paciente.ULTIMO_SEGUIMIENTO = fecha;
  if (evento.TIPO_EVENTO === 'INGRESO' && !Utl_vacio(fecha)) paciente.FECHA_INGRESO = paciente.FECHA_INGRESO || fecha;
  paciente.FECHA_ACTUALIZACION = new Date();
  return paciente;
}

/**
 * Sincroniza ESTRATIFICACION desde hojas INGRESO_* hacia PACIENTES.
 * Solo actualiza pacientes existentes que tengan ESTRATIFICACION vacía.
 * No crea pacientes ni eventos — es una operación ligera para INSTALAR.
 * @returns {{ actualizados: number, hojas: number }}
 */
function Ingresos_sincronizarEstratificacion_() {
  var ss = Modelo_ss();
  var hojaPacientes = Modelo_hoja(HOJAS.PACIENTES);
  if (!hojaPacientes) return { actualizados: 0, hojas: 0 };

  // 1) Leer pacientes actuales
  var pacientes = Modelo_leerPacientes();
  if (!pacientes.length) return { actualizados: 0, hojas: 0 };

  // 2) Indexar por RUT normalizado
  var porRut = {};
  pacientes.forEach(function (p, i) {
    var rut = Utl_texto(p.RUT).toUpperCase().trim();
    if (rut) porRut[rut] = i;
  });

  // 3) Leer ESTRATIFICACION de cada hoja INGRESO_*
  var estratFuente = {};
  var hojasProcesadas = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (nombreHoja) {
    var resultado = Ingresos_leerHoja(nombreHoja);
    hojasProcesadas++;
    resultado.staging.forEach(function (f) {
      var rut = Utl_texto(f.NORMALIZADO && f.NORMALIZADO.RUT).toUpperCase().trim();
      var estrat = Utl_texto(f.NORMALIZADO && f.NORMALIZADO.ESTRATIFICACION);
      if (rut && estrat && !estratFuente[rut]) {
        estratFuente[rut] = estrat;
      }
    });
  });

  // 4) Actualizar pacientes con ESTRATIFICACION vacía
  var actualizados = 0;
  Object.keys(estratFuente).forEach(function (rut) {
    var idx = porRut[rut];
    if (idx === undefined) return;
    var p = pacientes[idx];
    if (Utl_texto(p.ESTRATIFICACION)) return; // ya tiene valor
    p.ESTRATIFICACION = estratFuente[rut];
    p.ESTRAT_ORIGEN = estratFuente[rut];
    p.FECHA_ACTUALIZACION = new Date();
    var fila = Modelo_filaDesdeObjeto(p);
    var rowFisica = Modelo_dataStartRow(HOJAS.PACIENTES) + idx;
    hojaPacientes.getRange(rowFisica, 1, 1, MODELO_PACIENTE.length).setValues([fila]);
    actualizados++;
  });

  if (actualizados) Modelo_invalidarLecturas();
  return { actualizados: actualizados, hojas: hojasProcesadas };
}

/** Semilla ficticia → nombres de hoja destino según sector del origen. */
function Ingresos_hojaParaSector(sectorCanonica) {
  for (var hoja in HOJAS_INGRESO) {
    if (HOJAS_INGRESO.hasOwnProperty(hoja) && HOJAS_INGRESO[hoja] === sectorCanonica) return hoja;
  }
  return '';
}

/**
 * PURA: lista TODAS las hojas INGRESO_* que pertenecen a un sector (canónico
 * incluido su alias, p.ej. INGRESO_NARANJO + INGRESO_NARANJA → NARANJO).
 * Se usa para acotar el procesamiento masivo por sector sin duplicar mapeos.
 * @param {string} sector 'NARANJO' | 'AMARILLO' | 'VERDE'
 * @returns {string[]} nombres de hoja (vacío si el sector no existe o es nulo)
 */
function Ingresos_hojasParaSector_(sector) {
  var s = Utl_texto(sector).toUpperCase().trim();
  if (!s) return [];
  var hojas = [];
  Object.keys(HOJAS_INGRESO).forEach(function (hoja) {
    if (HOJAS_INGRESO[hoja] === s) hojas.push(hoja);
  });
  return hojas;
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
 * PURA: clave de idempotencia real de un conflicto por SU ORIGEN (archivo|hoja|fila),
 * no por ID_PROVISIONAL (que es aleatorio por corrida y producía duplicados al
 * re-importar la misma fuente). Extraída del detalle JSON.
 */
function Rev_claveOrigen(datos) {
  var o = (datos && datos.origen) || {};
  return Utl_texto(o.archivo) + '|' + Utl_texto(o.hoja) + '|' + Utl_texto(o.fila);
}

/** PURA: clave de origen a partir de una fila de CONFLICTOS (col F = DETALLE JSON). */
function Rev_claveOrigenDesdeFila(filaArr) {
  try {
    return Rev_claveOrigen(JSON.parse((filaArr || [])[5]));
  } catch (e) {
    return '';
  }
}

/**
 * PURA: filtra las filas de conflicto NUEVAS contra claves ya existentes.
 * Idempotente por origen y dedupe intra-lote (la misma fila origen nunca se
 * encola dos veces). Sin clave fiable → descartada (no deduplicable).
 */
function Rev_filtrarConflictosNuevos(filas, clavesExistentes, claveFunc) {
  claveFunc = claveFunc || Rev_claveOrigenDesdeFila;
  var usadas = {};
  (clavesExistentes || []).forEach(function (k) { if (k) usadas[k] = true; });
  var nuevos = [];
  filas.forEach(function (f) {
    var k = claveFunc(f);
    if (!k || usadas[k]) return;
    usadas[k] = true;
    nuevos.push(f);
  });
  return nuevos;
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
    var valores = Modelo_leerBloqueCabecera(nombreHoja, hoja);
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
          { archivo: 'DIAG', hoja: nombreHoja,
            fila: Modelo_filaFisica(nombreHoja, f - 1), sector: HOJAS_INGRESO[nombreHoja] }, v));
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
