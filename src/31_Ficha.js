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
    try { return Utilities.formatDate(v, typeof _UI_tz_ === 'function' ? _UI_tz_() : 'America/Santiago', 'yyyy-MM-dd'); }
    catch (e) { return v.toISOString().slice(0, 10); }
  }
  var s = Utl_texto_(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** PURA: convierte a momento legible (aaaa-mm-dd HH:MM). */
function _fichaFormatoMomento_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    try { return Utilities.formatDate(v, typeof _UI_tz_ === 'function' ? _UI_tz_() : 'America/Santiago', 'yyyy-MM-dd HH:mm'); }
    catch (e) { return v.toISOString().slice(0, 16).replace('T', ' '); }
  }
  var s = Utl_texto_(v).replace('T', ' ');
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
  var valor = Utl_texto_(valorRaw).trim();
  var errores = [];
  switch (campo) {
    case 'RUT': {
      if (!valor) { _fichaError_(errores, 'RUT', 'No puede vaciar el RUT'); break; }
      var nr = Norm_normalizarRut_(valor);
      if (nr.estado !== 'OK') { _fichaError_(errores, 'RUT', 'RUT inválido'); break; }
      valor = nr.rut;
      break;
    }
    case 'NOMBRE': {
      if (!valor) { _fichaError_(errores, 'NOMBRE', 'No puede vaciar el nombre'); break; }
      var nn = Norm_normalizarNombre_(valor);
      if (!nn.ok) { _fichaError_(errores, 'NOMBRE', 'Nombre inválido'); break; }
      valor = nn.nombre;
      break;
    }
    case 'SEXO': {
      if (!valor) break; // '' es "sin información" válido
      var sex = Norm_normalizarSexo_(valor);
      if (!sex) { _fichaError_(errores, 'SEXO', 'Sexo inválido (use M, F u OTRO)'); break; }
      valor = sex;
      break;
    }
    case 'FECHA_NACIMIENTO': {
      if (!valor) break;
      var dN = Captura_v2_validarIsoFecha_(valor, { min: 1900, max: 2040 });
      if (!dN.ok) { _fichaError_(errores, 'FECHA_NACIMIENTO', 'Fecha de nacimiento inválida'); break; }
      var hoyN = Captura_v2_fechaOperacion_({});
      if (dN.iso > hoyN) { _fichaError_(errores, 'FECHA_NACIMIENTO', 'Nacimiento no puede estar en el futuro'); break; }
      valor = dN.iso;
      break;
    }
    case 'FECHA_INGRESO': {
      if (!valor) break;
      var dI = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!dI.ok) { _fichaError_(errores, 'FECHA_INGRESO', 'Fecha de ingreso inválida'); break; }
      var hoyI = Captura_v2_fechaOperacion_({});
      if (dI.iso > hoyI) { _fichaError_(errores, 'FECHA_INGRESO', 'Ingreso no puede estar en el futuro'); break; }
      valor = dI.iso;
      break;
    }
    case 'PROXIMO_CONTROL': {
      if (!valor) break;
      var dP = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!dP.ok) { _fichaError_(errores, 'PROXIMO_CONTROL', 'Próximo control: fecha inválida'); break; }
      valor = dP.iso;
      break;
    }
    case 'PREINGRESO': {
      if (!valor) break;
      var pre = valor.toUpperCase().replace(/\s+/g, '_');
      if (pre === 'NO_APLICA' || pre === 'PENDIENTE') { valor = pre; break; }
      var dPre = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!dPre.ok) { _fichaError_(errores, 'PREINGRESO', 'Preingreso: use fecha ISO, NO_APLICA o PENDIENTE'); break; }
      valor = dPre.iso;
      break;
    }
    case 'TELEFONOS': {
      if (!valor) break;
      var tel = Norm_normalizarTelefono_(valor);
      if (!tel.telefonos.length) { _fichaError_(errores, 'TELEFONOS', 'Texto sin teléfonos válidos (use TELEFONO_OBS para notas)'); break; }
      valor = tel.telefonos.join('/');
      break;
    }
    case 'TELEFONO_OBS': {
      valor = Utl_colapsarEspacios_(valor);
      break;
    }
    case 'ESTRATIFICACION': {
      var g = Norm_normalizarEstratificacion_(valor);
      if (valor && !g) { _fichaError_(errores, 'ESTRATIFICACION', 'Estratificación: use G1, G2 o G3'); break; }
      valor = g;
      break;
    }
    case 'ESTADO': {
      if (!valor) { valor = 'PENDIENTE'; break; }
      var e = Norm_normalizarEstado_(valor);
      if (ESTADOS.VALIDOS.indexOf(e) === -1) { _fichaError_(errores, 'ESTADO', 'Estado inválido'); break; }
      valor = e;
      break;
    }
    case 'DUPLA_INGRESO':
    case 'PROFESIONAL_SEGUIMIENTO': {
      valor = Utl_colapsarEspacios_(valor).toUpperCase();
      break;
    }
    case 'SALUD_MENTAL': {
      if (valor && ['SI', 'NO'].indexOf(valor.toUpperCase()) === -1) { _fichaError_(errores, 'SALUD_MENTAL', 'Solo SI, NO o vacío (sin información)'); break; }
      valor = valor ? valor.toUpperCase() : '';
      break;
    }
    case 'OBSERVACIONES': {
      valor = Utl_colapsarEspacios_(valor);
      break;
    }
    case 'CONDICIONES': {
      var cond = Norm_normalizarCondiciones_(valor, CATALOGO_CONDICIONES_ECICEP);
      if (cond.noReconocidas.length) { _fichaError_(errores, 'CONDICIONES', 'Patología fuera de catálogo: ' + cond.noReconocidas.join(', ')); break; }
      valor = cond.detectadas.map(function (x) { return typeof x === 'string' ? x : (x.CODIGO || x.codigo); }).filter(Boolean).sort().join(';');
      break;
    }
    case 'OTRAS_PATOLOGIAS': {
      valor = Utl_colapsarEspacios_(valor);
      break;
    }
    case 'COMPOSICION_CONTROL': {
      valor = Utl_colapsarEspacios_(valor);
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

/** GAS: guard fail-closed de unicidad; separado del validador puro. */
function Paciente_comprobarUnicidadRut_(rut, idActual) {
  try {
    var objetivo = Norm_normalizarRut_(rut);
    if (objetivo.estado !== 'OK') return { estado: 'RUT_UNICIDAD_NO_VERIFICABLE', motivo: 'RUT_INVALIDO' };
    var pacientes = Modelo_leerPacientesCampos_(['ID_INTERNO', 'RUT']);
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto_(pacientes[i].ID_INTERNO) === Utl_texto_(idActual)) continue;
      if (Norm_normalizarRut_(pacientes[i].RUT).rut === objetivo.rut)
        return { estado: 'RUT_DUPLICADO', idInterno: Utl_texto_(pacientes[i].ID_INTERNO) };
    }
    return { estado: 'RUT_LIBRE' };
  } catch (e) {
    return { estado: 'RUT_UNICIDAD_NO_VERIFICABLE', motivo: e && e.message ? e.message : String(e) };
  }
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
  var encontrado = Modelo_buscarPaciente_(idInterno);
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
  if ('RUT' in validados && Utl_texto_(validados.RUT) !== Utl_texto_(paciente.RUT)) {
    var unicidad = Paciente_comprobarUnicidadRut_(validados.RUT, paciente.ID_INTERNO);
    if (unicidad.estado !== 'RUT_LIBRE') return {
      ok: false, codigo: unicidad.estado,
      motivo: unicidad.estado === 'RUT_DUPLICADO' ? 'RUT duplicado: requiere revisión' : 'No fue posible verificar unicidad del RUT',
      reintentable: unicidad.estado === 'RUT_UNICIDAD_NO_VERIFICABLE'
    };
  }
  var sectorPaciente = Utl_texto_(paciente.SECTOR).toUpperCase();
  var escrito = null;
  try {
    Object.keys(validados).forEach(function (k) { paciente[k] = validados[k]; });
    // Derivados que mantienen índices y vistas clínicas coherentes con el valor.
    if ('RUT' in validados) { paciente.RUT_DV_VALIDO = true; paciente.RUT_SIN_DV = false; }
    if ('NOMBRE' in validados) { paciente.NOMBRE_NORMALIZADO = Norm_claveNombre_(validados.NOMBRE); }
    _modelo_estamparActualizacion_(paciente, new Date());
    var idx = encontrado.idx;
    Modelo_hoja_(HOJAS.PACIENTES).getRange(Modelo_filaFisica_(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos_().length)
      .setValues([Modelo_filaDesdeObjeto_(paciente)]);
    Modelo_invalidarLecturas_();
    escrito = true;
  } catch (eW) {
    return { ok: false, motivo: 'ACTUALIZACION_NO_ESCRITA', error: eW && eW.message ? eW.message : String(eW) };
  }
  // La vista del sector refleja estos campos: refresco acotado (una hoja).
  var advertencias = [];
  if (escrito) {
    try { Modelo_refrescarVistasSectores_([sectorPaciente || paciente.SECTOR]); }
    catch (eR) { advertencias.push('VISTA_SECTOR_PENDIENTE'); }
  }
  return {
    ok: true,
    paciente: { ID_INTERNO: paciente.ID_INTERNO, NOMBRE: paciente.NOMBRE, RUT: paciente.RUT, SECTOR: paciente.SECTOR },
    campos: Object.keys(validados), advertencias: advertencias
  };
}

/**
 * GAS: cambio de sector como operación de dominio con EVENTO CAMBIO_SECTOR
 * + refresco acotado de las DOS vistas (anterior y nuevo). NO escribe SECTOR_*
 * directamente: la derivación la hace Modelo_refrescarVistasSectores_.
 * Ante fallo de EVENTOS aplica rollback best-effort del sector (PACIENTES se
 * mantiene coherente: nunca hay sector nuevo sin su evento).
 */
/**
 * Aplica campos editables vía capa de dominio (sin auth ni lock: el llamador
 * ya autorizó y lockeó — patrón §40-§42). SECTOR se descompone en EVENTO
 * CAMBIO_SECTOR (no es un campo más). Devuelve resumen compatible.
 */
function Paciente_aplicarCampos_(idInterno, campos, contexto) {
  contexto = contexto || {};
  campos = campos || {};
  var esSector = ('SECTOR' in campos);
  var directos = {};
  var sectorValor = null;
  Object.keys(campos).forEach(function (k) {
    if (k === 'SECTOR') sectorValor = campos[k];
    else directos[k] = campos[k];
  });

  var sectorCambio = false, advertencias = [];
  if (esSector) {
    var cs = Paciente_cambiarSector_(idInterno, sectorValor, {
      fuente: contexto.fuente || 'UI_FICHA',
      registradoPor: contexto.registradoPor !== undefined ? contexto.registradoPor
        : (typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : '')
    });
    if (!cs.ok) return cs.sinCambios ? { ok: true, sinCambios: true, sector: cs.sector } : cs;
    sectorCambio = !cs.sinCambios;
    advertencias = advertencias.concat(cs.advertencias || []);
  }

  if (Object.keys(directos).length) {
    var upd = Paciente_actualizarCampos_(idInterno, directos, { fuente: contexto.fuente || 'UI_FICHA' });
    if (!upd.ok) return upd;
    advertencias = advertencias.concat(upd.advertencias || []);
    return {
      ok: true,
      paciente: { ID_INTERNO: upd.paciente.ID_INTERNO, NOMBRE: upd.paciente.NOMBRE, SECTOR: upd.paciente.SECTOR },
      sectorCambio: sectorCambio, campos: upd.campos, advertencias: advertencias
    };
  }

  if (!esSector) return { ok: false, motivo: 'SIN_CAMBIOS' };
  var resSec = Modelo_buscarPaciente_(idInterno);
  return {
    ok: true,
    paciente: resSec ? { ID_INTERNO: resSec.obj.ID_INTERNO, NOMBRE: resSec.obj.NOMBRE, SECTOR: resSec.obj.SECTOR } : { ID_INTERNO: idInterno },
    sectorCambio: sectorCambio, campos: ['SECTOR'], advertencias: advertencias
  };
}

/**
 * PURA: prepara la transición territorial canónica compartida por Ficha e
 * Incorporación. No escribe nada. La persistencia decide si difiere vistas o
 * agrupa varias transiciones, pero nunca inventa otra semántica de
 * CAMBIO_SECTOR.
 */
function Paciente_prepararCambioSector_(pacienteOrigen, nuevoSector, contexto) {
  contexto = contexto || {};
  if (!pacienteOrigen || !pacienteOrigen.ID_INTERNO)
    return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var anterior = Utl_texto_(pacienteOrigen.SECTOR).toUpperCase();
  var sec = Norm_normalizarSector_(nuevoSector);
  if (sec.estado !== 'OK') return { ok: false, motivo: 'SECTOR_INVALIDO' };
  if (anterior === sec.sector) return { ok: true, sinCambios: true, sector: anterior };
  var paciente = Object.assign({}, pacienteOrigen);
  paciente.SECTOR = sec.sector;
  var evento = {
    ID_EVENTO: Ev_nuevoId_(),
    ID_INTERNO: paciente.ID_INTERNO,
    RUT: paciente.RUT,
    NOMBRE: paciente.NOMBRE,
    FECHA_EVENTO: contexto.fechaEvento || _fichaHoyIso_(),
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
      : (typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : ''),
    FECHA_REGISTRO: null
  };
  return { ok: true, sinCambios: false, anterior: anterior, nuevo: sec.sector,
    pacienteAnterior: Object.assign({}, pacienteOrigen), paciente: paciente,
    evento: evento };
}

function Paciente_cambiarSector_(idInterno, nuevoSector, contexto) {
  contexto = contexto || {};
  var encontrado = Modelo_buscarPaciente_(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var plan = Paciente_prepararCambioSector_(encontrado.obj, nuevoSector, contexto);
  if (!plan.ok || plan.sinCambios) return plan;

  var anterior = plan.anterior;
  var idx = encontrado.idx;
  var paciente = plan.paciente;
  var evento = plan.evento;

  // 1) PACIENTES (una fila)
  try {
    _modelo_estamparActualizacion_(paciente, new Date());
    Modelo_hoja_(HOJAS.PACIENTES).getRange(Modelo_filaFisica_(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos_().length)
      .setValues([Modelo_filaDesdeObjeto_(paciente)]);
    Modelo_invalidarLecturas_();
  } catch (eP) {
    return { ok: false, motivo: 'SECTOR_CAMBIO_NO_ESCRITO' };
  }

  // 2) EVENTO CAMBIO_SECTOR
  var idEvento = null;
  try {
    Modelo_agregarEventos_([evento], _ingresosUsuarioActual_() || '', { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'cambio-sector' });
    idEvento = evento.ID_EVENTO;
  } catch (eE) {
    var rollback = Ficha_rollbackPacienteVerificado_(idx, plan.pacienteAnterior, 'CAMBIO_SECTOR',
      ['ID_INTERNO', 'SECTOR', 'FECHA_ACTUALIZACION']);
    try { Modelo_refrescarVistasSectores_([anterior, plan.nuevo]); } catch (eV) {}
    Log_error_('Paciente', 'cambiarSector', 'CAMBIO_SECTOR_FALLIDO; rollback=' + JSON.stringify(rollback));
    Log_flush_();
    return rollback.ok
      ? { ok: false, motivo: 'CAMBIO_SECTOR_FALLIDO: rollback aplicado y verificado', codigo: 'CAMBIO_SECTOR_FALLIDO', rollback: rollback }
      : { ok: false, motivo: 'ROLLBACK_CLINICO_FALLIDO', codigo: 'ROLLBACK_CLINICO_FALLIDO', rollback: rollback };
  }

  // 3) Vistas sectoriales: SOLO las implicadas
  var advertencias = [];
  try { Modelo_refrescarVistasSectores_([anterior, plan.nuevo]); } catch (eF) { advertencias.push('VISTA_SECTOR_PENDIENTE'); }

  Log_info_('Paciente', 'cambiarSector', anterior + ' → ' + plan.nuevo + ' · ' + idEvento, null, null);
  Log_flush_();

  return { ok: true, anterior: anterior, nuevo: plan.nuevo, idEvento: idEvento, sinCambios: false, advertencias: advertencias };
}

/** Reescribe y relee la fila exacta; solo entonces declara rollback aplicado. */
function Ficha_rollbackPacienteVerificado_(idx, snapshot, operacion, camposAVerificar) {
  var resultado = { intentado: true, ok: false, verificado: false };
  try {
    var hoja = Modelo_hoja_(HOJAS.PACIENTES);
    var filaFisica = Modelo_filaFisica_(HOJAS.PACIENTES, idx);
    var esperado = Modelo_filaDesdeObjeto_(snapshot);
    hoja.getRange(filaFisica, 1, 1, esperado.length).setValues([esperado]);
    var real = hoja.getRange(filaFisica, 1, 1, esperado.length).getValues()[0];
    var criticos = (camposAVerificar && camposAVerificar.length)
      ? camposAVerificar.slice() : ['ID_INTERNO', 'RUT', 'SECTOR', 'ESTRATIFICACION', 'ESTADO'];
    if (criticos.indexOf('ID_INTERNO') === -1) criticos.unshift('ID_INTERNO');
    resultado.verificado = criticos.every(function (campo) {
      var pos = Modelo_campos_().indexOf(campo);
      return pos >= 0 && Utl_texto_(real[pos]) === Utl_texto_(esperado[pos]);
    });
    resultado.ok = resultado.verificado;
    if (!resultado.ok) resultado.motivo = 'RELECTURA_DIVERGENTE';
    Modelo_invalidarLecturas_();
  } catch (e) {
    resultado.motivo = e && e.message ? e.message : String(e);
  }
  if (!resultado.ok) Ficha_registrarFalloRollback_(snapshot, operacion, resultado.motivo);
  return resultado;
}

/** Registra el fallo sin PII en la cola CONFLICTOS existente, si está disponible. */
function Ficha_registrarFalloRollback_(paciente, operacion, motivo) {
  try {
    Modelo_agregarConflictos_([[new Date(), 'ROLLBACK_CLINICO_FALLIDO', Utl_texto_(paciente.ID_INTERNO), '', '',
      JSON.stringify({ origen: { archivo: 'SISTEMA', hoja: 'PACIENTES', fila: Utl_texto_(paciente.ID_INTERNO) },
        operacion: operacion, motivo: Utl_texto_(motivo).slice(0, 180) }),
      'SISTEMA|ROLLBACK|' + Utl_texto_(paciente.ID_INTERNO), '', 'ABIERTO', '']]);
  } catch (eC) {
    try { Log_error_('Ficha', 'registrarFalloRollback', eC && eC.message ? eC.message : String(eC)); } catch (eL) {}
  }
}

/**
 * GAS: guardado de patologías (condiciones + otras) con recálculo de la
 * estratificación y refresco acotado del sector. Reutiliza la validación de
 * catálogo única (Condiciones_validarSeleccion_).
 */
function Patologias_guardarPaciente_(idInterno, codigos, otrasPatologias) {
  var val = Condiciones_validarSeleccion_(codigos || [], CATALOGO_CONDICIONES_ECICEP);
  if (val.invalidos && val.invalidos.length) {
    return { ok: false, motivo: 'CODIGOS_INVALIDOS', invalidos: val.invalidos };
  }
  var esquema = Modelo_asegurarEsquemaPacientes_();
  if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };
  var encontrado = Modelo_buscarPaciente_(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var idx = encontrado.idx;
  var paciente = Object.assign({}, encontrado.obj);

  var condiciones = val.validos.join(';');
  var otras = Utl_colapsarEspacios_(otrasPatologias || '');
  var estrat = Estrat_evaluar_(condiciones, CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
  var estratValor = estrat && estrat.estado === 'CALCULADO' ? String(estrat.resultado) : '';
  var anteriores = {
    CONDICIONES: paciente.CONDICIONES || '',
    OTRAS_PATOLOGIAS: paciente.OTRAS_PATOLOGIAS || '',
    ESTRATIFICACION: paciente.ESTRATIFICACION || ''
  };
  var cambioEstrat = Estrat_prepararCambio_(paciente, estratValor, {
    motivo: 'PATOLOGIAS', fuente: 'SISTEMA',
    registradoPor: typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : ''
  });
  paciente.CONDICIONES = condiciones;
  paciente.OTRAS_PATOLOGIAS = otras;
  paciente.ESTRATIFICACION = estratValor;
  paciente.ESTRAT_ORIGEN = String(anteriores.ESTRATIFICACION || '');
  paciente.ESTRAT_CALCULADA = String(estrat && estrat.resultado || '');
  paciente.ESTRAT_FECHA_CALCULO = new Date();

  var sectorPaciente = Utl_texto_(paciente.SECTOR).toUpperCase();
  var advertencias = [];
  // 1) Escritura canónica PACIENTES: crítica (§23). Un fallo aquí ES error.
  try {
    _modelo_estamparActualizacion_(paciente, new Date());
    Modelo_hoja_(HOJAS.PACIENTES).getRange(Modelo_filaFisica_(HOJAS.PACIENTES, idx), 1, 1, Modelo_campos_().length)
      .setValues([Modelo_filaDesdeObjeto_(paciente)]);
    Modelo_invalidarLecturas_();
  } catch (eW) {
    return { ok: false, motivo: 'PATOLOGIAS_NO_TRACEABLES: escritura fallida, revisión requerida' };
  }
  // 2) Evento CAMBIO_ESTRATIFICACION: trazabilidad, best effort (§23) — el
  // guardado ya es correcto; un fallo de trazabilidad no debe volver error.
  if (!cambioEstrat.sinCambios && cambioEstrat.evento) {
    try {
      Modelo_agregarEventos_([cambioEstrat.evento], cambioEstrat.evento.REGISTRADO_POR, { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'cambio-estratificacion' });
    } catch (eEv) {
      advertencias.push('CAMBIO_ESTRATIFICACION_EVENTO_PENDIENTE');
      var revisionPrevia = paciente.REQUIERE_REVISION === true || paciente.REQUIERE_REVISION === 'TRUE';
      paciente.REQUIERE_REVISION = true;
      var marcaRevision = Ficha_escribirPacienteVerificado_(idx, paciente, ['ID_INTERNO', 'ESTRATIFICACION', 'REQUIERE_REVISION']);
      if (!marcaRevision.ok) advertencias.push('REVISION_NO_VERIFICABLE');
      try {
        Modelo_agregarConflictos_([[new Date(), 'CAMBIO_ESTRATIFICACION_PENDIENTE', paciente.ID_INTERNO, '', '',
          JSON.stringify({ origen: { archivo: 'SISTEMA', hoja: 'PACIENTES', fila: cambioEstrat.evento.ID_EVENTO },
            idInterno: paciente.ID_INTERNO, idEvento: cambioEstrat.evento.ID_EVENTO,
            anterior: anteriores.ESTRATIFICACION, nuevo: estratValor,
            fechaEvento: cambioEstrat.evento.FECHA_EVENTO, fuente: cambioEstrat.evento.FUENTE,
            revisionPrevia: revisionPrevia }),
          'SISTEMA|ESTRATIFICACION|' + cambioEstrat.evento.ID_EVENTO, '', 'ABIERTO', '']]);
      } catch (eC) { advertencias.push('CONFLICTO_TECNICO_PENDIENTE'); }
    }
  }
  // 3) Vistas derivadas: best effort (§23).
  try { Modelo_refrescarVistasSectores_([sectorPaciente || paciente.SECTOR]); } catch (eV) { advertencias.push('VISTA_SECTOR_PENDIENTE'); }

  return {
    ok: true,
    condiciones: val.validos,
    cantidad: val.validos.length,
    puntaje: _calcularPuntaje_(val.validos),
    estratificacion: estratValor || 'pendiente',
    estratRegla: (estrat && estrat.regla) || '',
    esquemaMigrado: !!esquema.migrada,
    advertencias: advertencias
  };
}

/** Escritura + relectura exacta de campos críticos de una fila PACIENTES. */
function Ficha_escribirPacienteVerificado_(idx, paciente, camposCriticos) {
  try {
    var hoja = Modelo_hoja_(HOJAS.PACIENTES), fila = Modelo_filaFisica_(HOJAS.PACIENTES, idx);
    var valores = Modelo_filaDesdeObjeto_(paciente);
    hoja.getRange(fila, 1, 1, valores.length).setValues([valores]);
    var real = hoja.getRange(fila, 1, 1, valores.length).getValues()[0];
    var campos = Modelo_campos_();
    var ok = (camposCriticos || []).every(function (c) {
      var pos = campos.indexOf(c); return pos >= 0 && Utl_texto_(real[pos]) === Utl_texto_(valores[pos]);
    });
    Modelo_invalidarLecturas_();
    return { ok: ok, verificado: ok, filaFisica: fila };
  } catch (e) { return { ok: false, verificado: false, motivo: e && e.message ? e.message : String(e) }; }
}

/**
 * Reconcilia eventos CAMBIO_ESTRATIFICACION pendientes desde CONFLICTOS.
 * Idempotente por ID_EVENTO; resuelve la fila solo tras verificar el evento.
 */
function Ficha_reconciliarEstratificacionPendiente_() {
  var hoja = Modelo_hoja_(HOJAS.CONFLICTOS);
  if (!hoja || hoja.getLastRow() < 2) return { ok: true, pendientes: 0, eventosCreados: 0, marcasLimpiadas: 0, resueltos: 0, fallidos: 0 };
  var filas = Utl_leerBloque_(hoja).slice(1);
  var eventos = Modelo_leerEventosCampos_(['ID_EVENTO']);
  var existentes = {};
  eventos.forEach(function (e) { existentes[Utl_texto_(e.ID_EVENTO)] = true; });
  var eventosCreados = 0, marcasLimpiadas = 0, resueltos = 0, pendientes = 0, fallidos = 0;
  filas.forEach(function (f, i) {
    if (Utl_texto_(f[1]) !== 'CAMBIO_ESTRATIFICACION_PENDIENTE' || Utl_texto_(f[8]).toUpperCase() !== 'ABIERTO') return;
    pendientes++;
    var d; try { d = JSON.parse(f[5]); } catch (eJ) { fallidos++; return; }
    var encontrado = Modelo_buscarPaciente_(d.idInterno);
    if (!encontrado) { fallidos++; return; }
    if (!existentes[d.idEvento]) {
      var p = encontrado.obj;
      Modelo_agregarEventos_([{ ID_EVENTO: d.idEvento, ID_INTERNO: d.idInterno, RUT: p.RUT, NOMBRE: p.NOMBRE,
        FECHA_EVENTO: d.fechaEvento, TIPO_EVENTO: 'CAMBIO_ESTRATIFICACION', SECTOR: p.SECTOR,
        RIESGO_G: d.nuevo, PROFESIONAL: '', PROFESIONAL_TIPO: '', DESCRIPCION: Utl_texto_(d.anterior) + ' → ' + Utl_texto_(d.nuevo),
        CANTIDAD: '', OBSERVACIONES: '', FUENTE: d.fuente || 'SISTEMA', REGISTRADO_POR: '', FECHA_REGISTRO: null }], '',
        { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'reconciliar-estratificacion' });
      // No basta que el append no lance: releer identidad histórica antes de
      // resolver el conflicto o limpiar la marca.
      var verificados = Modelo_leerEventosCampos_(['ID_EVENTO']);
      existentes[d.idEvento] = verificados.some(function (e) { return Utl_texto_(e.ID_EVENTO) === Utl_texto_(d.idEvento); });
      if (existentes[d.idEvento]) eventosCreados++;
    }
    if (!existentes[d.idEvento]) { fallidos++; return; }
    if (!d.revisionPrevia) {
      var pac = Object.assign({}, encontrado.obj); pac.REQUIERE_REVISION = false;
      var limpieza = Ficha_escribirPacienteVerificado_(encontrado.idx, pac,
        ['ID_INTERNO', 'ESTRATIFICACION', 'REQUIERE_REVISION']);
      if (!limpieza.ok) { fallidos++; return; }
      marcasLimpiadas++;
    }
    try {
      var celdaEstado = hoja.getRange(i + 2, 9);
      celdaEstado.setValue('RESUELTO');
      var estadoReal = typeof celdaEstado.getValue === 'function' ? celdaEstado.getValue()
        : celdaEstado.getValues()[0][0];
      if (Utl_texto_(estadoReal).toUpperCase() !== 'RESUELTO') { fallidos++; return; }
      resueltos++;
    } catch (eR) { fallidos++; }
  });
  return { ok: fallidos === 0, pendientes: pendientes, eventosCreados: eventosCreados,
    marcasLimpiadas: marcasLimpiadas, resueltos: resueltos, fallidos: fallidos };
}

/**
 * Tipos de evento permitidos desde el registrador genérico de la ficha
 * (CONTROL/SEGUIMIENTO/LLAMADO/OTRO). Los reservados (INGRESO, CAMBIO_SECTOR,
 * CAMBIO_ESTRATIFICACION, EGRESO, GESTION_CASO_*) solo se crean por sus propias
 * operaciones de dominio, que además actualizan el estado vigente de PACIENTES.
 * No basta ocultar el <option>: el backend también rechaza.
 */
var EVENTOS_FICHA_MANUALES = ['CONTROL', 'SEGUIMIENTO', 'LLAMADO', 'OTRO'];

/**
 * GAS: búsqueda PUNTUAL de un evento por FUENTE exacta (v0.10.5 §17/§19).
 * Usa createTextFinder sobre la columna FUENTE (una sola columna, no el bloque
 * completo de EVENTOS) y matchEntireCell — mente la milla, no el mapa.
 * Es la pieza de idempotencia operativa: reintentos con el mismo FUENTE (que
 * lleva operacionId/captureId) no duplican evento. Devuelve null si no existe.
 */
function Eventos_buscarPorFuente_(fuente) {
  if (!fuente) return null;
  var hoja = Modelo_hoja_(HOJAS.EVENTOS);
  if (!hoja) return null;
  var hr = Modelo_headerRow_(HOJAS.EVENTOS);
  var ancho = hoja.getLastColumn();
  var enc = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
  var idxFuente = enc.indexOf('FUENTE');
  if (idxFuente < 0) throw new Error('EVENTOS_SIN_COLUMNA_FUENTE');
  var idxId = enc.indexOf('ID_EVENTO');
  var idxPaciente = enc.indexOf('ID_INTERNO');
  var idxTipo = enc.indexOf('TIPO_EVENTO');
  var ini = Modelo_dataStartRow_(HOJAS.EVENTOS);
  var n = hoja.getLastRow() - ini + 1;
  if (n < 1) return null;
  var celda = hoja.getRange(ini, idxFuente + 1, n, 1)
    .createTextFinder(fuente)
    .matchEntireCell(true)
    .findNext();
  if (!celda) return null;
  var fila = celda.getRow();
  var valores = hoja.getRange(fila, 1, 1, ancho).getValues()[0];
  return {
    idEvento: idxId >= 0 ? Utl_texto_(valores[idxId]) : '',
    idInterno: idxPaciente >= 0 ? Utl_texto_(valores[idxPaciente]) : '',
    tipo: idxTipo >= 0 ? Utl_texto_(valores[idxTipo]).toUpperCase() : ''
  };
}

/**
 * GAS: registro de un evento de paciente (CONTROL/SEGUIMIENTO/OTRO) a través
 * del pipeline de eventos único (misma semántica que api_registrarEvento_ V2,
 * incluida la sincronización de la caché ultimo_* / FECHA_INGRESO en PACIENTES).
 * Refresco ACOTADO al sector del objetivo (no todas las vistas).
 */
function Eventos_registrarPaciente_(payload, contexto) {
  payload = payload || {};
  var p = payload;
  if (TIPOS_EVENTO.VALIDOS.indexOf(p.tipoEvento) === -1) return { ok: false, motivo: 'TIPO_INVALIDO' };
  if (EVENTOS_FICHA_MANUALES.indexOf(p.tipoEvento) === -1) {
    return { ok: false, motivo: 'TIPO_EVENTO_RESERVADO' };
  }
  var fecha = Norm_normalizarFecha_(p.fecha);
  if (fecha.estado !== 'VALIDA') return { ok: false, motivo: 'FECHA_INVALIDA' };

  var objetivoId = Utl_texto_(p.idInterno || p.ID_INTERNO);
  var encontrado = Modelo_buscarPaciente_(objetivoId);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var objetivo = encontrado.obj;

  var enEspera = false;
  if (p.enEspera === true) { p.enEspera = false; enEspera = true; }

  var advertencias = [];
  try {
    var evento = {
      ID_EVENTO: Ev_nuevoId_(),
      ID_INTERNO: objetivo.ID_INTERNO,
      RUT: objetivo.RUT,
      NOMBRE: objetivo.NOMBRE,
      FECHA_EVENTO: fecha.iso,
      TIPO_EVENTO: p.tipoEvento,
      SECTOR: objetivo.SECTOR,
      RIESGO_G: objetivo.ESTRATIFICACION || '',
      PROFESIONAL: p.profesional || '',
      // DEC-104: segundo profesional de la dupla, campo estructural propio.
      // Antes el contrato de captura aceptaba `profesionalSecundario` y esta
      // entrega lo descartaba: dato aceptado → no persistido → PROCESADO.
      PROFESIONAL2: p.profesionalSecundario || '',
      PROFESIONAL_TIPO: '',
      DESCRIPCION: p.descripcion || '',
      CANTIDAD: '',
      OBSERVACIONES: p.observaciones || '',
      FUENTE: p.fuente || 'UI_FICHA',
      REGISTRADO_POR: (p.registradoPor !== undefined && p.registradoPor !== null)
        ? p.registradoPor : (typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : ''),
      FECHA_REGISTRO: null
    };
    var esquema = Modelo_asegurarEsquemaPacientes_();
    if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };
    Modelo_agregarEventos_([evento], (typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : '') || '', { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ficha-registro' });
    Ingresos_sincronizarCache_(objetivo, evento);
    var hojaP = Modelo_hoja_(HOJAS.PACIENTES);
    hojaP.getRange(Modelo_filaFisica_(HOJAS.PACIENTES, encontrado.idx), 1, 1, Modelo_campos_().length)
      .setValues([Modelo_filaDesdeObjeto_(objetivo)]);
    Modelo_invalidarLecturas_();
    if (!enEspera) {
      var sectorPaciente = Utl_texto_(objetivo.SECTOR).toUpperCase();
      try { Modelo_refrescarVistasSectores_([sectorPaciente]); } catch (eV) { advertencias.push('VISTA_SECTOR_PENDIENTE'); }
    }
  } catch (e) {
    Log_error_('Ficha', 'evento', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
  // §23/§31: LOG es best effort — ya guardado, la observabilidad no rompe la operación.
  try { Log_info_('Ficha', 'evento', 'CONTROL_SEGUIMIENTO → ' + objetivo.ID_INTERNO); Log_flush_(); } catch (eL) {}
  return { ok: true, evento: { id: evento.ID_EVENTO, tipo: evento.TIPO_EVENTO,
    fecha: evento.FECHA_EVENTO, enEspera: enEspera }, advertencias: advertencias };
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
  var idBus = Utl_texto_(idInterno).trim();
  var encontrado = Modelo_buscarPaciente_(idBus);
  var paciente = encontrado && encontrado.obj;
  if (!paciente) {
    return { ok: false, code: 'PACIENTE_NO_ENCONTRADO', message: 'No se encontró paciente con ID_INTERNO=' + JSON.stringify(idBus) };
  }

  var eventos = [];
  var integridad = { eventos: 'OK', ingresoPendiente: 'OK', seguimiento: 'OK' };
  try {
    eventos = Modelo_leerEventosCampos_(['ID_INTERNO', 'FECHA_EVENTO', 'TIPO_EVENTO', 'SECTOR', 'RIESGO_G', 'PROFESIONAL', 'DESCRIPCION', 'ID_EVENTO', 'OBSERVACIONES', 'FUENTE'])
      .filter(function (e) { return Utl_texto_(e.ID_INTERNO).trim() === idBus; })
      .sort(function (a, b) {
        var fa = _fichaFormatoIsoFecha_(a.FECHA_EVENTO), fb = _fichaFormatoIsoFecha_(b.FECHA_EVENTO);
        if (fa < fb) return -1; if (fa > fb) return 1;
        return Utl_texto_(a.ID_EVENTO) < Utl_texto_(b.ID_EVENTO) ? -1 : 1;
      });
  } catch (evErr) { eventos = []; integridad.eventos = 'NO_DISPONIBLE'; }

  var ficha = {};
  _FICHA_CAMPOS_OPERATIVOS.forEach(function (c) {
    var v = paciente[c];
    ficha[c] = (v === undefined || v === null) ? '' : (v instanceof Date ? _fichaFormatoIsoFecha_(v) : v);
  });
  ficha.EDAD = Utl_edadDesde_(paciente.FECHA_NACIMIENTO);
  ficha.eventos = eventos.map(function (e) {
    return {
      fecha: _fichaFormatoIsoFecha_(e.FECHA_EVENTO), tipo: e.TIPO_EVENTO, sector: e.SECTOR,
      riesgo: e.RIESGO_G, profesional: e.PROFESIONAL, descripcion: e.DESCRIPCION,
      idEvento: Utl_texto_(e.ID_EVENTO), observaciones: e.OBSERVACIONES || '', fuente: e.FUENTE || ''
    };
  });

  ficha.dupla = {
    catalogo: Profesionales_catalogo_().filter(function (c2) { return c2.ACTIVO; })
      .map(function (c2) { return { CODIGO: c2.CODIGO, NOMBRE: c2.NOMBRE }; }),
    seleccionados: (Utl_texto_(paciente.DUPLA_INGRESO).split(';').map(function (s) { return Utl_texto_(s).trim().toUpperCase(); }).filter(function (s) { return s; }))
  };

  ficha.patologias = {
    catalogo: CATALOGO_CONDICIONES_ECICEP.filter(function (c3) { return c3.ACTIVA; })
      .map(function (c3) { return { codigo: c3.CODIGO, nombre: c3.NOMBRE_CANONICO, peso: c3.PONDERACION }; }),
    seleccionadas: paciente.CONDICIONES ? Utl_texto_(paciente.CONDICIONES).split(';').filter(Boolean) : [],
    otrasPatologias: paciente.OTRAS_PATOLOGIAS || ''
  };

  ficha.seguimiento = null;
  try {
    var tz = typeof _UI_tz_ === 'function' ? _UI_tz_() : 'America/Santiago';
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var cfg = _UI_controlConfig_();
    ficha.seguimiento = (Control_filasPanel_([paciente], cfg.freq, hoyIso, cfg.aviso).filas || [])[0] || null;
  } catch (sErr) { ficha.seguimiento = null; integridad.seguimiento = 'NO_DISPONIBLE'; }

  var ingrePend = [];
  if (opciones.incluirIngresoPendiente !== false && paciente.RUT) {
    try { ingrePend = Ingresos_buscarPendientesPorRut_(paciente.RUT); }
    catch (iErr) { ingrePend = []; integridad.ingresoPendiente = 'NO_DISPONIBLE'; }
  }
  ficha.meta = {
    ultimaActualizacion: _fichaFormatoMomento_(paciente.FECHA_ACTUALIZACION),
    requiereRevision: paciente.REQUIERE_REVISION === true || paciente.REQUIERE_REVISION === 'TRUE',
    fuente: Utl_texto_(paciente.FUENTE),
    fechaIngreso: _fichaFormatoIsoFecha_(paciente.FECHA_INGRESO),
    tieneIngresoPendiente: ingrePend.length > 0,
    ingresoPendiente: ingrePend,
    integridad: integridad
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
/**
 * GAS: PLAN de mutación de la ficha SIN escrituras (v0.10.5 §24).
 * Valida TODO el lote (contrato {anterior,valor}, optimistic concurrency de
 * todos los campos, campos directos vía Paciente_validarCampo_, sector) y
 * prepara el estado final + eventos sin tocar el libro. Un campo inválido
 * produce {ok:false, errores} con CERO escrituras y CERO eventos.
 */
function Ficha_prepararMutacion_(idInterno, cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return { ok: false, motivo: 'CAMBIOS_INVALIDOS', codigo: 'CAMBIOS_INVALIDOS' };
  var claves = Object.keys(cambios);
  if (!claves.length) return { ok: false, motivo: 'SIN_CAMBIOS', codigo: 'SIN_CAMBIOS' };

  var encontrado = Modelo_buscarPaciente_(idInterno);
  if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO', codigo: 'PACIENTE_NO_ENCONTRADO' };

  var original = Object.assign({}, encontrado.obj);
  var final = Object.assign({}, original);
  var errores = [];
  var sectorNuevo = null;
  var sectorAnteriorTexto = Utl_texto_(original.SECTOR).toUpperCase();
  var tocados = [];

  for (var i = 0; i < claves.length; i++) {
    var k = claves[i];
    if (_CAMPOS_EDITABLES_PACIENTE.indexOf(k) === -1) {
      _fichaError_(errores, k, 'Campo no editable: ' + k);
      continue;
    }
    var par = cambios[k];
    if (!par || typeof par !== 'object' || Array.isArray(par) ||
        Object.keys(par).sort().join(',') !== 'anterior,valor' ||
        typeof par.anterior !== 'string' || typeof par.valor !== 'string') {
      _fichaError_(errores, k, 'Contrato de cambio inválido para ' + k);
      continue;
    }
    var actual = Captura_edicionTexto_(original, k);
    if (actual !== par.anterior && actual !== par.valor) {
      errores.push({ campo: k, mensaje: 'FICHA_CAMBIO: ' + k + ' fue modificado; recargue la ficha', codigo: 'FICHA_CAMBIO:' + k });
      continue;
    }
    tocados.push(k);
    if (k === 'SECTOR') {
      var sec = Norm_normalizarSector_(par.valor);
      if (sec.estado !== 'OK') { _fichaError_(errores, k, 'Sector inválido'); continue; }
      if (sectorAnteriorTexto !== sec.sector) sectorNuevo = sec.sector;
    } else {
      var res = Paciente_validarCampo_(k, par.valor, original);
      if (!res.ok) { errores = errores.concat(res.errores); continue; }
      final[k] = res.valor;
    }
  }
  if (sectorNuevo) final.SECTOR = sectorNuevo;

  var eventos = [];
  if (errores.length) {
    return { ok: false, errores: errores, motivo: errores.map(function (e) { return e.mensaje; }).join('; '), codigo: errores[0].codigo };
  }

  if (tocados.indexOf('RUT') !== -1 && Utl_texto_(final.RUT) !== Utl_texto_(original.RUT)) {
    var unicidad = Paciente_comprobarUnicidadRut_(final.RUT, original.ID_INTERNO);
    if (unicidad.estado !== 'RUT_LIBRE') return {
      ok: false, codigo: unicidad.estado,
      motivo: unicidad.estado === 'RUT_DUPLICADO' ? 'RUT duplicado: requiere revisión' : 'No fue posible verificar unicidad del RUT',
      reintentable: unicidad.estado === 'RUT_UNICIDAD_NO_VERIFICABLE'
    };
  }

  if (sectorNuevo) {
    var evento = {
      ID_EVENTO: Ev_nuevoId_(),
      ID_INTERNO: original.ID_INTERNO,
      RUT: original.RUT,
      NOMBRE: original.NOMBRE,
      FECHA_EVENTO: _fichaHoyIso_(),
      TIPO_EVENTO: 'CAMBIO_SECTOR',
      SECTOR: sectorNuevo,
      RIESGO_G: final.ESTRATIFICACION || '',
      PROFESIONAL: '',
      PROFESIONAL_TIPO: '',
      CANTIDAD: '',
      DESCRIPCION: sectorAnteriorTexto + ' → ' + sectorNuevo,
      OBSERVACIONES: '',
      FUENTE: 'UI_FICHA',
      REGISTRADO_POR: typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : '',
      FECHA_REGISTRO: null
    };
    eventos.push(evento);
  }
  if (tocados.indexOf('RUT') !== -1) { final.RUT_DV_VALIDO = true; final.RUT_SIN_DV = false; }
  if ('NOMBRE' in final) { final.NOMBRE_NORMALIZADO = Norm_claveNombre_(final.NOMBRE); }

  return {
    ok: true,
    idx: encontrado.idx,
    original: original,
    final: final,
    eventos: eventos,
    sectorCambio: !!sectorNuevo,
    sectorAnterior: sectorAnteriorTexto,
    tocados: tocados
  };
}

/**
 * GAS: APLICA un plan de mutación de la ficha (v0.10.5 §24).
 * Orden: 1 escritura PACIENTES → append EVENTOS → rollback best effort si
 * EVENTOS falla → refresco derivado best effort (nunca convierte un guardado
 * en error: se reporta en advertencias — §23).
 */
function Ficha_aplicarMutacion_(plan) {
  if (!plan || plan.ok !== true) return plan;
  var advertencias = [];
  // 1) escritura única de PACIENTES (canónica)
  try {
    _modelo_estamparActualizacion_(plan.final, new Date());
    Modelo_hoja_(HOJAS.PACIENTES).getRange(Modelo_filaFisica_(HOJAS.PACIENTES, plan.idx), 1, 1, Modelo_campos_().length)
      .setValues([Modelo_filaDesdeObjeto_(plan.final)]);
    Modelo_invalidarLecturas_();
  } catch (eP) {
    return { ok: false, motivo: 'FICHA_NO_ESCRITA', codigo: 'FICHA_NO_ESCRITA' };
  }

  // 2) eventos del cambio (CAMBIO_SECTOR) tras la escritura
  if (plan.eventos.length) {
    try {
      Modelo_agregarEventos_(plan.eventos, (typeof _ingresosUsuarioActual_ === 'function' ? _ingresosUsuarioActual_() : '') || '', { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ficha-cambio' });
    } catch (eE) {
      var camposRollback = ['ID_INTERNO', 'FECHA_ACTUALIZACION'].concat(plan.tocados || []);
      if ((plan.tocados || []).indexOf('RUT') !== -1) camposRollback = camposRollback.concat(['RUT_DV_VALIDO', 'RUT_SIN_DV']);
      if ((plan.tocados || []).indexOf('NOMBRE') !== -1) camposRollback.push('NOMBRE_NORMALIZADO');
      camposRollback = camposRollback.filter(function (c, i, a) { return a.indexOf(c) === i; });
      var rollback = Ficha_rollbackPacienteVerificado_(plan.idx, plan.original,
        'FICHA_CAMBIO_SECTOR', camposRollback);
      try { Modelo_refrescarVistasSectores_([plan.sectorAnterior, plan.final.SECTOR]); } catch (eV) {}
      try { Log_error_('Ficha', 'aplicarMutacion', 'CAMBIO_SECTOR_FALLIDO; rollback=' + JSON.stringify(rollback)); Log_flush_(); } catch (eL) {}
      return rollback.ok
        ? { ok: false, motivo: 'CAMBIO_SECTOR_FALLIDO: rollback aplicado y verificado', codigo: 'CAMBIO_SECTOR_FALLIDO', rollback: rollback }
        : { ok: false, motivo: 'ROLLBACK_CLINICO_FALLIDO', codigo: 'ROLLBACK_CLINICO_FALLIDO', rollback: rollback };
    }
  }

  // 3) vistas derivadas: best effort (§23 — un fallo derivado NO es error)
  var sectoresAVer = plan.sectorCambio
    ? [plan.sectorAnterior, plan.final.SECTOR]
    : [Utl_texto_(plan.final.SECTOR).toUpperCase()];
  try { Modelo_refrescarVistasSectores_(sectoresAVer); } catch (eV) { advertencias.push('VISTA_SECTOR_PENDIENTE'); }

  return {
    ok: true,
    sectorCambio: plan.sectorCambio,
    cambiosAplicados: plan.tocados.slice(),
    advertencias: advertencias
  };
}

/**
 * GAS: guardado TODO-ONADA de campos de la ficha (sidebars y formulario V2).
 * PREPARA todo sin escrituras (Ficha_prepararMutacion_) y luego APLICA en orden
 * (Ficha_aplicarMutacion_). Un campo inválido → 0 escrituras, 0 eventos.
 */
function Ficha_guardarCambios_(idInterno, cambios) {
  var plan = Ficha_prepararMutacion_(idInterno, cambios);
  if (plan.ok !== true) return plan;
  return Ficha_aplicarMutacion_(plan);
}
