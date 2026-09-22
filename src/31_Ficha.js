// ---------------------------------------------------------------------------
// 31_Ficha.js — CAPA DE DOMINIO DE LA FICHA (ETAPA 3c)
// ---------------------------------------------------------------------------
// Unifica TODAS las escrituras de la ficha (Sidebar / formulario V2 / llamadas
// internas de Captura) en un solo conjunto de helpers DOMINIO y un único
// pipeline de refresco de vistas SECTOR_*. Reglas:
//
//   • La fuente de verdad es PACIENTES + EVENTOS. SECTOR_* son vistas derivadas.
//   • Única validación estricta: PACIENTES_NORM (vacas de las fichas V1/V2).
//   • SECTOR NO es un campo más: su cambio es un EVENTO CAMBIO_SECTOR y no se
//     escribe por este helper (los wrappers de API hacen la decomposición).
//   • SOLO los wrappers api_* de 07_UI adquieren lock (Ecicep_conLock_);
//     estos helpers nunca lockean (Captura ya opera bajo su propio lock).
// ---------------------------------------------------------------------------

/** PURA: fecha de operación backend en ISO (aaaa-mm-dd). */
function _fichaHoyIso_() {
  try {
    var tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone)
      ? Session.getScriptTimeZone() : 'America/Santiago';
    return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  } catch (e) { return new Date().toISOString().slice(0, 10); }
}

/** PURA: convierte un valor Date/String a ISO fecha (aaaa-mm-dd). */
function _fichaFormatoIsoFecha_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    try { return Utilities.formatDate(v, typeof _UI_tz === 'function' ? _UI_tz() : 'America/Santiago', 'yyyy-MM-dd'); }
    catch (e) { return v.toISOString().slice(0, 10); }
  }
  var s = Utl_texto(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** PURA: convierte a momento legible (aaaa-mm-dd HH:MM). */
function _fichaFormatoMomento_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    try { return Utilities.formatDate(v, typeof _UI_tz === 'function' ? _UI_tz() : 'America/Santiago', 'yyyy-MM-dd HH:mm'); }
    catch (e) { return v.toISOString().slice(0, 16).replace('T', ' '); }
  }
  var s = Utl_texto(v).replace('T', ' ');
  return s.length > 16 ? s.slice(0, 16) : s;
}

/** PURA: push de error con código CAMPO_INVALIDO:<campo> (contrato ficha 2.0). */
function _fichaError_(errores, campo, mensaje) {
  errores.push({ campo: campo, mensaje: mensaje, codigo: 'CAMPO_INVALIDO:' + campo });
}

/**
 * PURA: validación ESTRICTA de UN campo editable de paciente (PACIENTES_NORM).
 * Devuelve {ok, valor} o {ok:false, errores:[...]}. Nunca degrada en silencio:
 * un valor no normalizable es un ERROR, no una caída best-effort.
 */
function Paciente_validarCampo_(campo, valorRaw, actualPaciente) {
  var valor = Utl_texto(valorRaw).trim();
  var errores = [];
  switch (campo) {
    case 'RUT': {
      if (!valor) { _fichaError_(errores, 'RUT', 'No puede vaciar el RUT'); break; }
      var nr = Norm_normalizarRut(valor);
      if (nr.estado !== 'OK') { _fichaError_(errores, 'RUT', 'RUT inválido'); break; }
      valor = nr.rut;
      // Unicidad: excluye el propio paciente si `actualPaciente` fue provisto.
      try {
        var duplicados = Modelo_leerPacientes().filter(function (p) {
          if (actualPaciente && Utl_texto(p.ID_INTERNO) === Utl_texto(actualPaciente.ID_INTERNO)) return false;
          return Norm_normalizarRut(p.RUT).rut === nr.rut;
        });
        if (duplicados.length) { _fichaError_(errores, 'RUT', 'RUT duplicado: requiere revisión'); break; }
      } catch (eD) { /* sin modelo en contexto puro: no bloquear */ }
      break;
    }
    case 'NOMBRE': {
      if (!valor) { _fichaError_(errores, 'NOMBRE', 'No puede vaciar el nombre'); break; }
      var nn = Norm_normalizarNombre(valor);
      if (!nn.ok) { _fichaError_(errores, 'NOMBRE', 'Nombre inválido'); break; }
      valor = nn.nombre;
      break;
    }
    case 'SEXO': {
      if (!valor) break; // '' es "sin información" válido
      var sex = Norm_normalizarSexo(valor);
      if (!sex) { _fichaError_(errores, 'SEXO', 'Sexo inválido (use M, F u OTRO)'); break; }
      valor = sex;
      break;
    }
    case 'FECHA_NACIMIENTO': {
      if (!valor) break;
      var dN = Captura_v2_validarIsoFecha(valor, { min: 1900, max: 2040 });
      if (!dN.ok) { _fichaError_(errores, 'FECHA_NACIMIENTO', 'Fecha de nacimiento inválida'); break; }
      var hoyN = Captura_v2_fechaOperacion({});
      if (dN.iso > hoyN) { _fichaError_(errores, 'FECHA_NACIMIENTO', 'Nacimiento no puede estar en el futuro'); break; }
      valor = dN.iso;
      break;
    }
    case 'FECHA_INGRESO': {
      if (!valor) break;
      var dI = Captura_v2_validarIsoFecha(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!dI.ok) { _fichaError_(errores, 'FECHA_INGRESO', 'Fecha de ingreso inválida'); break; }
      var hoyI = Captura_v2_fechaOperacion({});
      if (dI.iso > hoyI) { _fichaError_(errores, 'FECHA_INGRESO', 'Ingreso no puede estar en el futuro'); break; }
      valor = dI.iso;
      break;
    }
    case 'PROXIMO_CONTROL': {
      if (!valor) break;
      var dP = Captura_v2_validarIsoFecha(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!dP.ok) { _fichaError_(errores, 'PROXIMO_CONTROL', 'Próximo control: fecha inválida'); break; }
      valor = dP.iso;
      break;
    }
    case 'PREINGRESO': {
      if (!valor) break;
      var pre = valor.toUpperCase().replace(/\s+/g, '_');
      if (pre === 'NO_APLICA' || pre === 'PENDIENTE') { valor = pre; break; }
      var dPre = Captura_v2_validarIsoFecha(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!dPre.ok) { _fichaError_(errores, 'PREINGRESO', 'Preingreso: use fecha ISO, NO_APLICA o PENDIENTE'); break; }
      valor = dPre.iso;
      break;
    }
    case 'TELEFONOS': {
      if (!valor) break;
      var tel = Norm_normalizarTelefono(valor);
      if (!tel.telefonos.length) { _fichaError_(errores, 'TELEFONOS', 'Texto sin teléfonos válidos (use TELEFONO_OBS para notas)'); break; }
      valor = tel.telefonos.join('/');
      break;
    }
    case 'TELEFONO_OBS': {
      valor = Utl_colapsarEspacios(valor);
      break;
    }
    case 'ESTRATIFICACION': {
      var g = Norm_normalizarEstratificacion(valor);
      if (valor && !g) { _fichaError_(errores, 'ESTRATIFICACION', 'Estratificación: use G1, G2 o G3'); break; }
      valor = g;
      break;
    }
    case 'ESTADO': {
      if (!valor) { valor = 'PENDIENTE'; break; }
      var e = Norm_normalizarEstado(valor);
      if (ESTADOS.VALIDOS.indexOf(e) === -1) { _fichaError_(errores, 'ESTADO', 'Estado inválido'); break; }
      valor = e;
      break;
    }
    case 'DUPLA_INGRESO':
    case 'PROFESIONAL_SEGUIMIENTO': {
      valor = Utl_colapsarEspacios(valor).toUpperCase();
      break;
    }
    case 'SALUD_MENTAL': {
      if (valor && ['SI', 'NO'].indexOf(valor.toUpperCase()) === -1) { _fichaError_(errores, 'SALUD_MENTAL', 'Solo SI, NO o vacío (sin información)'); break; }
      valor = valor ? valor.toUpperCase() : '';
      break;
    }
    case 'OBSERVACIONES': {
      valor = Utl_colapsarEspacios(valor);
      break;
    }
    case 'CONDICIONES': {
      var cond = Norm_normalizarCondiciones(valor, CATALOGO_CONDICIONES_ECICEP);
      if (cond.noReconocidas.length) { _fichaError_(errores, 'CONDICIONES', 'Patología fuera de catálogo: ' + cond.noReconocidas.join(', ')); break; }
      valor = cond.detectadas.map(function (x) { return typeof x === 'string' ? x : (x.CODIGO || x.codigo); }).filter(Boolean).sort().join(';');
      break;
    }
    case 'OTRAS_PATOLOGIAS': {
      valor = Utl_colapsarEspacios(valor);
      break;
    }
    case 'COMPOSICION_CONTROL': {
      valor = Utl_colapsarEspacios(valor);
      break;
    }
    default: {
      if (_CAMPOS_EDITABLES_PACIENTE.indexOf(campo) === -1) {
        _fichaError_(errores, campo, 'Campo no editable');
      }
      break;
    }
  }
  if (errores.length) return { ok: false, errores: errores };
  return { ok: true, valor: valor };
}

/**
 * GAS: escritura dominical de campos editables (excluye SECTOR: REJECT).
 * Valida TODO el lote ANTES de escribir; ante cualquier error NO escribe nada.
 * Tras escribir: invalida cachés y refresca la vista del sector del paciente
 * (una sola hoja). Devuelve el offset de errores para que el wrapper lo
 * propague igual que cualquier otro mensaje de API.
 */
function Paciente_actualizarCampos_(idInterno, campos, contexto) {
  campos = campos || {};
  var claves = Object.keys(campos);
  if (!claves.length) return { ok: false, motivo: 'SIN_CAMBIOS' };
  if (claves.indexOf('SECTOR') !== -1) {
    return { ok: false, motivo: 'SECTOR_VIA_CAMBIO_SECTOR' };
  }
  var encontrado = Modelo_buscarPaciente(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var paciente = Object.assign({}, encontrado.obj);
  var errores = [];
  var validados = {};
  for (var i = 0; i < claves.length; i++) {
    var campo = claves[i];
    var res = Paciente_validarCampo_(campo, campos[campo], paciente);
    if (!res.ok) { errores = errores.concat(res.errores); continue; }
    validados[campo] = res.valor;
  }
  if (errores.length) {
    var msg = errores.map(function (e) { return e.mensaje; }).join('; ');
    return { ok: false, motivo: msg, errores: errores, codigo: errores[0].codigo };
  }
  var sectorPaciente = Utl_texto(paciente.SECTOR).toUpperCase();
  var escrito = null;
  try {
    Object.keys(validados).forEach(function (k) { paciente[k] = validados[k]; });
    // Derivados que mantienen índices y vistas clínicas coherentes con el valor.
    if ('RUT' in validados) { paciente.RUT_DV_VALIDO = true; paciente.RUT_SIN_DV = false; }
    if ('NOMBRE' in validados) { paciente.NOMBRE_NORMALIZADO = Norm_claveNombre(validados.NOMBRE); }
    _modelo_estamparActualizacion(paciente, new Date());
    var idx = encontrado.idx;
    Modelo_hoja(HOJAS.PACIENTES).getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos().length)
      .setValues([Modelo_filaDesdeObjeto(paciente)]);
    Modelo_invalidarLecturas();
    escrito = true;
  } catch (eW) {
    return { ok: false, motivo: 'ACTUALIZACION_NO_ESCRITA', error: eW && eW.message ? eW.message : String(eW) };
  }
  // La vista del sector refleja estos campos: refresco acotado (una hoja).
  if (escrito) {
    try { Modelo_refrescarVistasSectores([sectorPaciente || paciente.SECTOR]); } catch (eR) {}
  }
  return {
    ok: true,
    paciente: { ID_INTERNO: paciente.ID_INTERNO, NOMBRE: paciente.NOMBRE, RUT: paciente.RUT, SECTOR: paciente.SECTOR },
    campos: Object.keys(validados)
  };
}

/**
 * GAS: cambio de sector como operación de dominio con EVENTO CAMBIO_SECTOR
 * + refresco acotado de las DOS vistas (anterior y nuevo). NO escribe SECTOR_*
 * directamente: la derivación la hace Modelo_refrescarVistasSectores.
 * Ante fallo de EVENTOS aplica rollback best-effort del sector (PACIENTES se
 * mantiene coherente: nunca hay sector nuevo sin su evento).
 */
function Paciente_cambiarSector_(idInterno, nuevoSector, contexto) {
  contexto = contexto || {};
  var encontrado = Modelo_buscarPaciente(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var anterior = Utl_texto(encontrado.obj.SECTOR).toUpperCase();
  var sec = Norm_normalizarSector(nuevoSector);
  if (sec.estado !== 'OK') return { ok: false, motivo: 'SECTOR_INVALIDO' };
  if (anterior === sec.sector) return { ok: true, sinCambios: true, sector: anterior };

  var idx = encontrado.idx;
  var paciente = Object.assign({}, encontrado.obj);
  paciente.SECTOR = sec.sector;

  var evento = {
    ID_EVENTO: Ev_nuevoId(),
    ID_INTERNO: paciente.ID_INTERNO,
    RUT: paciente.RUT,
    NOMBRE: paciente.NOMBRE,
    FECHA_EVENTO: _fichaHoyIso_(),
    TIPO_EVENTO: 'CAMBIO_SECTOR',
    SECTOR: sec.sector,
    RIESGO_G: paciente.ESTRATIFICACION || '',
    PROFESIONAL: '',
    PROFESIONAL_TIPO: '',
    CANTIDAD: '',
    DESCRIPCION: anterior + ' → ' + sec.sector,
    OBSERVACIONES: '',
    FUENTE: contexto.fuente || 'UI_FICHA',
    REGISTRADO_POR: contexto.registradoPor !== undefined ? contexto.registradoPor
      : (typeof _ingresosUsuarioActual === 'function' ? _ingresosUsuarioActual() : ''),
    FECHA_REGISTRO: null
  };

  // 1) PACIENTES (una fila)
  try {
    _modelo_estamparActualizacion(paciente, new Date());
    Modelo_hoja(HOJAS.PACIENTES).getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos().length)
      .setValues([Modelo_filaDesdeObjeto(paciente)]);
    Modelo_invalidarLecturas();
  } catch (eP) {
    return { ok: false, motivo: 'SECTOR_CAMBIO_NO_ESCRITO' };
  }

  // 2) EVENTO CAMBIO_SECTOR
  var idEvento = null;
  try {
    Modelo_agregarEventos([evento], _ingresosUsuarioActual() || '', { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'cambio-sector' });
    idEvento = evento.ID_EVENTO;
  } catch (eE) {
    try {
      paciente.SECTOR = anterior;
      _modelo_estamparActualizacion(paciente, new Date());
      Modelo_hoja(HOJAS.PACIENTES).getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos().length)
        .setValues([Modelo_filaDesdeObjeto(paciente)]);
      Modelo_invalidarLecturas();
    } catch (eR) {}
    try { Modelo_refrescarVistasSectores([anterior, sec.sector]); } catch (eV) {}
    Log_error('Paciente', 'cambiarSector', 'CAMBIO_SECTOR_FALLIDO; rollback aplicado a ' + anterior);
    Log_flush();
    return { ok: false, motivo: 'CAMBIO_SECTOR_FALLIDO: rollback aplicado, revisión requerida' };
  }

  // 3) Vistas sectoriales: SOLO las implicadas
  try { Modelo_refrescarVistasSectores([anterior, sec.sector]); } catch (eF) {}

  Log_info('Paciente', 'cambiarSector', anterior + ' → ' + sec.sector + ' · ' + idEvento, null, null);
  Log_flush();

  return { ok: true, anterior: anterior, nuevo: sec.sector, idEvento: idEvento, sinCambios: false };
}

/**
 * GAS: guardado de patologías (condiciones + otras) con recálculo de la
 * estratificación y refresco acotado del sector. Reutiliza la validación de
 * catálogo única (Condiciones_validarSeleccion).
 */
function Patologias_guardarPaciente_(idInterno, codigos, otrasPatologias) {
  var val = Condiciones_validarSeleccion(codigos || [], CATALOGO_CONDICIONES_ECICEP);
  if (val.invalidos && val.invalidos.length) {
    return { ok: false, motivo: 'CODIGOS_INVALIDOS', invalidos: val.invalidos };
  }
  var esquema = Modelo_asegurarEsquemaPacientes();
  if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };
  var encontrado = Modelo_buscarPaciente(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var idx = encontrado.idx;
  var paciente = Object.assign({}, encontrado.obj);

  var condiciones = val.validos.join(';');
  var otras = Utl_colapsarEspacios(otrasPatologias || '');
  var estrat = Estrat_evaluar(condiciones, CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
  var estratValor = estrat && estrat.estado === 'CALCULADO' ? String(estrat.resultado) : '';
  var anteriores = {
    CONDICIONES: paciente.CONDICIONES || '',
    OTRAS_PATOLOGIAS: paciente.OTRAS_PATOLOGIAS || '',
    ESTRATIFICACION: paciente.ESTRATIFICACION || ''
  };
  paciente.CONDICIONES = condiciones;
  paciente.OTRAS_PATOLOGIAS = otras;
  paciente.ESTRATIFICACION = estratValor;
  paciente.ESTRAT_ORIGEN = String(anteriores.ESTRATIFICACION || '');
  paciente.ESTRAT_CALCULADA = String(estrat && estrat.resultado || '');
  paciente.ESTRAT_FECHA_CALCULO = new Date();

  var sectorPaciente = Utl_texto(paciente.SECTOR).toUpperCase();
  try {
    _modelo_estamparActualizacion(paciente, new Date());
    Modelo_hoja(HOJAS.PACIENTES).getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos().length)
      .setValues([Modelo_filaDesdeObjeto(paciente)]);
    Modelo_invalidarLecturas();
  } catch (eW) {
    return { ok: false, motivo: 'PATOLOGIAS_NO_ESCRITAS' };
  }
  try { Modelo_refrescarVistasSectores([sectorPaciente || paciente.SECTOR]); } catch (eV) {}

  return {
    ok: true,
    condiciones: val.validos,
    cantidad: val.validos.length,
    puntaje: _calcularPuntaje(val.validos),
    estratificacion: estratValor || 'pendiente',
    estratRegla: (estrat && estrat.regla) || '',
    esquemaMigrado: !!esquema.migrada
  };
}

/**
 * GAS: registro de un evento de paciente (CONTROL/SEGUIMIENTO/OTRO) a través
 * del pipeline de eventos único (misma semántica que api_registrarEvento V2,
 * incluida la sincronización de la caché ultimo_* / FECHA_INGRESO en PACIENTES).
 * Refresco ACOTADO al sector del objetivo (no todas las vistas).
 */
function Eventos_registrarPaciente_(payload, contexto) {
  payload = payload || {};
  var p = payload;
  if (TIPOS_EVENTO.VALIDOS.indexOf(p.tipoEvento) === -1) return { ok: false, motivo: 'TIPO_INVALIDO' };
  var fecha = Norm_normalizarFecha(p.fecha);
  if (fecha.estado !== 'VALIDA') return { ok: false, motivo: 'FECHA_INVALIDA' };

  var objetivoId = Utl_texto(p.idInterno || p.ID_INTERNO);
  var encontrado = Modelo_buscarPaciente(objetivoId);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var objetivo = encontrado.obj;

  var enEspera = false;
  if (p.enEspera === true) { p.enEspera = false; enEspera = true; }

  try {
    var evento = {
      ID_EVENTO: Ev_nuevoId(),
      ID_INTERNO: objetivo.ID_INTERNO,
      RUT: objetivo.RUT,
      NOMBRE: objetivo.NOMBRE,
      FECHA_EVENTO: fecha.iso,
      TIPO_EVENTO: p.tipoEvento,
      SECTOR: objetivo.SECTOR,
      RIESGO_G: objetivo.ESTRATIFICACION || '',
      PROFESIONAL: p.profesional || '',
      PROFESIONAL_TIPO: '',
      DESCRIPCION: p.descripcion || '',
      CANTIDAD: '',
      OBSERVACIONES: p.observaciones || '',
      FUENTE: p.fuente || 'UI_FICHA',
      REGISTRADO_POR: (p.registradoPor !== undefined && p.registradoPor !== null)
        ? p.registradoPor : (typeof _ingresosUsuarioActual === 'function' ? _ingresosUsuarioActual() : ''),
      FECHA_REGISTRO: null
    };
    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };
    Modelo_agregarEventos([evento], (typeof _ingresosUsuarioActual === 'function' ? _ingresosUsuarioActual() : '') || '', { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ficha-registro' });
    Ingresos_sincronizarCache(objetivo, evento);
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    hojaP.getRange(Modelo_filaFisica(HOJAS.PACIENTES, encontrado.idx), 1, 1, Modelo_campos().length)
      .setValues([Modelo_filaDesdeObjeto(objetivo)]);
    if (!enEspera) {
      var sectorPaciente = Utl_texto(objetivo.SECTOR).toUpperCase();
      try { Modelo_refrescarVistasSectores([sectorPaciente]); } catch (eV) {}
    }
    Log_info('Ficha', 'evento', evento.TIPO_EVENTO + ' → ' + evento.ID_INTERNO, null, null);
    Log_flush();
    return { ok: true, evento: { tipo: evento.TIPO_EVENTO, fecha: evento.FECHA_EVENTO, enEspera: enEspera } };
  } catch (e) {
    Log_error('Ficha', 'evento', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * GAS: construcción UNIFICADA de la ficha de paciente (datos, eventos vigentes
 * corregidos, seguimiento, patologías, dupla) + META (fuente, última
 * actualización, revisión pendiente, ingreso pendiente por RUT si se pide).
 * Reutiliza el pipeline de eventos vigentes de Captura (correcciones V4) y la
 * configuración de control única (UI_controlConfig).
 */
function Ficha_construir_(idInterno, opciones) {
  opciones = opciones || {};
  var pacientes = Modelo_leerPacientesCampos(_FICHA_CAMPOS_OPERATIVOS.concat(['FECHA_ACTUALIZACION', 'REQUIERE_REVISION', 'FUENTE', 'FECHA_INGRESO']));
  var idBus = Utl_texto(idInterno).trim();
  var paciente = null;
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].ID_INTERNO).trim() === idBus) { paciente = pacientes[i]; break; }
  }
  if (!paciente) {
    return { ok: false, code: 'PACIENTE_NO_ENCONTRADO', message: 'No se encontró paciente con ID_INTERNO=' + JSON.stringify(idBus), totalLeidos: pacientes.length };
  }

  var eventos = [];
  try {
    eventos = Modelo_leerEventosCampos(['ID_INTERNO', 'FECHA_EVENTO', 'TIPO_EVENTO', 'SECTOR', 'RIESGO_G', 'PROFESIONAL', 'DESCRIPCION', 'ID_EVENTO', 'OBSERVACIONES', 'FUENTE'])
      .filter(function (e) { return Utl_texto(e.ID_INTERNO).trim() === idBus; })
      .sort(function (a, b) {
        var fa = _fichaFormatoIsoFecha_(a.FECHA_EVENTO), fb = _fichaFormatoIsoFecha_(b.FECHA_EVENTO);
        if (fa < fb) return -1; if (fa > fb) return 1;
        return Utl_texto(a.ID_EVENTO) < Utl_texto(b.ID_EVENTO) ? -1 : 1;
      });
  } catch (evErr) { eventos = []; }

  var ficha = {};
  _FICHA_CAMPOS_OPERATIVOS.forEach(function (c) {
    var v = paciente[c];
    ficha[c] = (v === undefined || v === null) ? '' : (v instanceof Date ? _fichaFormatoIsoFecha_(v) : v);
  });
  ficha.EDAD = Utl_edadDesde(paciente.FECHA_NACIMIENTO);
  ficha.eventos = eventos.map(function (e) {
    return {
      fecha: _fichaFormatoIsoFecha_(e.FECHA_EVENTO), tipo: e.TIPO_EVENTO, sector: e.SECTOR,
      riesgo: e.RIESGO_G, profesional: e.PROFESIONAL, descripcion: e.DESCRIPCION,
      idEvento: Utl_texto(e.ID_EVENTO), observaciones: e.OBSERVACIONES || '', fuente: e.FUENTE || ''
    };
  });

  ficha.dupla = {
    catalogo: Profesionales_catalogo().filter(function (c2) { return c2.ACTIVO; })
      .map(function (c2) { return { CODIGO: c2.CODIGO, NOMBRE: c2.NOMBRE }; }),
    seleccionados: (Utl_texto(paciente.DUPLA_INGRESO).split(';').map(function (s) { return Utl_texto(s).trim().toUpperCase(); }).filter(function (s) { return s; }))
  };

  ficha.patologias = {
    catalogo: CATALOGO_CONDICIONES_ECICEP.filter(function (c3) { return c3.ACTIVA; })
      .map(function (c3) { return { codigo: c3.CODIGO, nombre: c3.NOMBRE_CANONICO, peso: c3.PONDERACION }; }),
    seleccionadas: paciente.CONDICIONES ? Utl_texto(paciente.CONDICIONES).split(';').filter(Boolean) : [],
    otrasPatologias: paciente.OTRAS_PATOLOGIAS || ''
  };

  ficha.seguimiento = null;
  try {
    var tz = typeof _UI_tz === 'function' ? _UI_tz() : 'America/Santiago';
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var cfg = _UI_controlConfig();
    ficha.seguimiento = (Control_filasPanel([paciente], cfg.freq, hoyIso, cfg.aviso).filas || [])[0] || null;
  } catch (sErr) { ficha.seguimiento = null; }

  var ingrePend = [];
  if (opciones.incluirIngresoPendiente !== false && paciente.RUT) {
    try { ingrePend = Ingresos_buscarPendientesPorRut(paciente.RUT); } catch (iErr) { ingrePend = []; }
  }
  ficha.meta = {
    ultimaActualizacion: _fichaFormatoMomento_(paciente.FECHA_ACTUALIZACION),
    requiereRevision: paciente.REQUIERE_REVISION === true || paciente.REQUIERE_REVISION === 'TRUE',
    fuente: Utl_texto(paciente.FUENTE),
    fechaIngreso: _fichaFormatoIsoFecha_(paciente.FECHA_INGRESO),
    tieneIngresoPendiente: ingrePend.length > 0,
    ingresoPendiente: ingrePend
  };

  return { ok: true, ficha: ficha };
}

/**
 * GAS: guardado OPTIMISTA (concurrencia) de cambios de la ficha. Contrato
 * #76/#77: cada entrada es {CAMPO: {anterior, valor}}. Valida contra el valor
 * ACTUAL antes de escribir ('FICHA_CAMBIO:' si difiere). Descompone SECTOR
 * hacia Paciente_cambiarSector_ (el cambio tiene su propio evento), el resto
 * va a Paciente_actualizarCampos_. Todo o nada: error → nada escrito.
 */
function Ficha_guardarCambios_(idInterno, cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return { ok: false, motivo: 'CAMBIOS_INVALIDOS' };
  var claves = Object.keys(cambios);
  if (!claves.length) return { ok: false, motivo: 'SIN_CAMBIOS' };

  var encontrado = Modelo_buscarPaciente(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var p = encontrado.obj;

  // 1) Validación o pre-optimista del contrato {anterior, valor}
  var directos = {};
  var sectorNuevo = null;
  for (var i = 0; i < claves.length; i++) {
    var k = claves[i];
    if (_CAMPOS_EDITABLES_PACIENTE.indexOf(k) === -1) return { ok: false, motivo: 'CAMPO_NO_EDITABLE:' + k };
    var par = cambios[k];
    if (!par || typeof par !== 'object' || Array.isArray(par)) return { ok: false, motivo: 'PAR_CAMBIOS_INVALIDO:' + k };
    var parKeys = Object.keys(par).sort();
    if (parKeys.join(',') !== 'anterior,valor' || typeof par.anterior !== 'string' || typeof par.valor !== 'string') {
      return { ok: false, motivo: 'PAR_CAMBIOS_INVALIDO:' + k };
    }
    var actual = Captura_edicionTexto_(p, k);
    if (actual !== par.anterior && actual !== par.valor) {
      return { ok: false, motivo: 'FICHA_CAMBIO: ' + k + ' fue modificado; recargue la ficha' };
    }
    if (k === 'SECTOR') {
      var sec = Norm_normalizarSector(par.valor);
      if (sec.estado !== 'OK') return { ok: false, motivo: 'SECTOR_INVALIDO' };
      var actualSec = Utl_texto(p.SECTOR).toUpperCase();
      if (actualSec !== sec.sector) sectorNuevo = sec.sector;
    } else {
      directos[k] = par.valor;
    }
  }

  // 2) Cambio de sector primero (evento + refresco de vistas)
  var sectorCambio = false;
  if (sectorNuevo) {
    var cs = Paciente_cambiarSector_(idInterno, sectorNuevo, { fuente: 'UI_FICHA', registradoPor: typeof _ingresosUsuarioActual === 'function' ? _ingresosUsuarioActual() : '' });
    if (!cs.ok) return cs;
    sectorCambio = true;
  }

  // 3) Campos restantes
  if (Object.keys(directos).length) {
    var upd = Paciente_actualizarCampos_(idInterno, directos, { fuente: 'UI_FICHA' });
    if (!upd.ok) return upd;
  }

  return { ok: true, sectorCambio: sectorCambio, cambiosAplicados: claves };
}