/**
 * Sistema ECICEP Unificado — 13_Eventos
 * Transformación controlada: fila de staging validada e identificada → EVENTO.
 *
 * Capa PURA (ETAPA 3): la escritura física a la hoja EVENTOS ocurre en la
 * etapa de integración/migración controlada. Nunca sobrescribe historial:
 * cada gestión es un evento independiente (MODELO-EVENTOS.md).
 *
 * Gates conservadores: no se produce un evento si
 *   - la fila tiene ERROR de validación,
 *   - falta el resultado de identificación,
 *   - la identificación es ambigua (REQUIERE_REVISION / POSIBLE_DUPLICADO),
 *   - el tipo de evento resultante no es válido,
 *   - no hay fecha del evento.
 */

function Ev_nuevoId(secuencia) {
  if (typeof secuencia === 'number') return 'EV-' + ('0000' + secuencia).slice(-4);
  return 'EV-' + Date.now().toString(36).toUpperCase() + '-' +
    Math.floor(Math.random() * 1679616).toString(36).toUpperCase();
}

/**
 * Construye el evento a partir de una fila de staging normalizada e identificada.
 * @param {Object} fila  fila de staging (Fuentes_crearFila + Fuentes_normalizar + Iden_identificar)
 * @param {Object} [opciones] {tipoEvento, fechaIso, profesional, descripcion, cantidad, registradoPor, secuencia, confirmarNuevo}
 * @returns {ok:boolean, motivo:'', evento:null|{...}}
 */
function Ev_desdeStaging(fila, opciones) {
  opciones = opciones || {};
  var res = { ok: false, motivo: '', evento: null };

  if (!fila || !fila.NORMALIZADO || !fila.NORMALIZADO.RUT_ESTADO) {
    res.motivo = 'FILA_INVALIDA';
    return res;
  }
  if (fila.ESTADO_VALIDACION === 'ERROR') {
    res.motivo = 'VALIDACION_ERROR';
    return res;
  }
  var iden = fila.RESULTADO_IDENTIFICACION;
  if (!iden || !iden.resultado) {
    res.motivo = 'IDENTIFICACION_PENDIENTE';
    return res;
  }
  if (iden.resultado === 'REQUIERE_REVISION') {
    res.motivo = 'IDENTIFICACION_REQUIERE_REVISION';
    return res;
  }
  if (iden.resultado === 'POSIBLE_DUPLICADO' && !opciones.confirmarNuevo) {
    // Caso dudoso: nunca se resuelve automáticamente (#6 regla del proyecto)
    res.motivo = 'IDENTIFICACION_POSIBLE_DUPLICADO';
    return res;
  }

  var n = fila.NORMALIZADO;
  var tipo = opciones.tipoEvento || n.TIPO_EVENTO || 'INGRESO';
  if (TIPOS_EVENTO.VALIDOS.indexOf(tipo) === -1) {
    res.motivo = 'TIPO_EVENTO_INVALIDO';
    return res;
  }

  var fechaIso = opciones.fechaIso || n.FECHA_INGRESO || '';
  if (!fechaIso) {
    res.motivo = 'FECHA_EVENTO_AUSENTE';
    return res;
  }

  var esNuevo = !iden.idPaciente || (iden.resultado === 'POSIBLE_DUPLICADO' && !!opciones.confirmarNuevo);
  // confirmarNuevo: el humano resolvió que el parecido era otra persona →
  // el evento NUNCA se enlaza al candidato existente; la consolidación creará entidad nueva.
  res.ok = true;
  res.evento = {
    ID_EVENTO: Ev_nuevoId(opciones.secuencia),
    ID_INTERNO: esNuevo ? '' : iden.idPaciente,
    ES_NUEVO_PACIENTE: esNuevo,
    RUT: n.RUT,
    NOMBRE: n.NOMBRE,
    FECHA_EVENTO: fechaIso,
    TIPO_EVENTO: tipo,
    SECTOR: n.SECTOR,
    RIESGO_G: n.ESTRATIFICACION || '',        // snapshot; jamás inferido del sector
    PROFESIONAL: opciones.profesional || '',
    DESCRIPCION: opciones.descripcion || '',
    CANTIDAD: (opciones.cantidad !== undefined && opciones.cantidad !== null) ? opciones.cantidad : '',
    OBSERVACIONES: n.OBSERVACIONES || '',
    FUENTE: Fuentes_fuenteOrigen(fila),
    REGISTRADO_POR: opciones.registradoPor || '',
    FECHA_REGISTRO: null                      // la fija el sistema al momento de escribir
  };
  return res;
}

/**
 * Construye varios eventos independientes para un mismo paciente
 * (ingreso → control → seguimiento → plan permanecen como registros separados).
 */
function Ev_variosDesdeStaging(fila, listaOpciones) {
  var salida = { ok: true, eventos: [], bloqueados: [] };
  for (var i = 0; i < listaOpciones.length; i++) {
    var r = Ev_desdeStaging(fila, listaOpciones[i]);
    if (r.ok) salida.eventos.push(r.evento);
    else { salida.ok = false; salida.bloqueados.push({ indice: i, motivo: r.motivo }); }
  }
  return salida;
}
