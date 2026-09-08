/**
 * Sistema ECICEP — 18_Calidad
 * Depuración y centro de calidad de datos (ETAPA cierre).
 *
 * Clasificación de problemas (sin inventar nada):
 *   AUTOMÁTICO   → normalización de formato de RUT (puntos/espacios/mayúsc.)
 *   REVISIÓN     → RUT inválido, duplicado, sin sector, sin nombre,
 *                  evento huérfano, sin fecha, tipo inválido
 * Cola de Revisión = 1 fila por entidad con TODOS los motivos (JSON).
 * Resolución automática: entidad sin problemas → RESUELTO_AUTO.
 * Jamás elimina pacientes/eventos.
 */

// ---------------------------------------------------------------------------
// PURA: clasificación
// ---------------------------------------------------------------------------

/** PURA: problemas de un paciente. dupRuts: Set/objeto de RUTs duplicados. */
function Calidad_problemasPaciente(p, dupRuts) {
  var problemas = [];
  var rut = Utl_texto(p.RUT).trim().toUpperCase();
  if (!rut) problemas.push({ tipo: 'RUT_AUSENTE', gravedad: 'ERROR', detalle: 'sin RUT' });
  else {
    if (!Norm_validarRut(rut)) {
      var sinGuion = rut.indexOf('-') === -1;
      problemas.push({ tipo: sinGuion ? 'RUT_INCOMPLETO' : 'RUT_INVALIDO',
        gravedad: 'ERROR',
        detalle: sinGuion ? 'RUT sin dígito verificador' : 'dígito verificador incorrecto' });
    }
    if (dupRuts && dupRuts[rut]) problemas.push({ tipo: 'RUT_DUPLICADO',
      gravedad: 'WARNING', detalle: 'RUT presente en más de un paciente' });
  }
  if (Utl_vacio(Utl_texto(p.NOMBRE))) problemas.push({ tipo: 'SIN_NOMBRE',
    gravedad: 'ERROR', detalle: 'sin nombre' });
  if (Utl_vacio(Utl_texto(p.SECTOR))) problemas.push({ tipo: 'SIN_SECTOR',
    gravedad: 'WARNING', detalle: 'sin sector asignado' });
  return problemas;
}

/** PURA: problemas de un evento. existePac: boolean. */
function Calidad_problemasEvento(ev, existePac) {
  var problemas = [];
  if (!existePac) problemas.push({ tipo: 'EVENTO_HUERFANO', gravedad: 'ERROR',
    detalle: 'paciente inexistente' });
  var f = Rem9_normFecha(ev.FECHA_EVENTO);
  if (!f) problemas.push({ tipo: 'FECHA_INVALIDA', gravedad: 'ERROR',
    detalle: 'sin fecha válida' });
  var tipo = Utl_texto(ev.TIPO_EVENTO).trim().toUpperCase();
  if (!tipo) problemas.push({ tipo: 'SIN_TIPO', gravedad: 'ERROR', detalle: 'sin tipo de evento' });
  var rut = Utl_texto(ev.RUT).trim().toUpperCase();
  if (rut && !Norm_validarRut(rut)) problemas.push({ tipo: 'RUT_INVALIDO',
    gravedad: 'WARNING', detalle: 'RUT del evento inválido' });
  return problemas;
}

/** PURA: peor gravedad de una lista de problemas. */
function Calidad_peorGravedad(problemas) {
  var peor = 'OK';
  (problemas || []).forEach(function (p) {
    if (p.gravedad === 'ERROR') peor = 'ERROR';
    else if (p.gravedad === 'WARNING' && peor !== 'ERROR') peor = 'WARNING';
  });
  return peor;
}

/** PURA: fila de Cola de Revisión por entidad (motivos agregados en JSON). */
function Calidad_filaCola(tipoEntidad, idEntidad, pac, problemas) {
  return {
    tipo: tipoEntidad,
    idInterno: Utl_texto(pac ? pac.ID_INTERNO : ''),
    rut: Utl_texto(pac ? pac.RUT : ''),
    nombre: Utl_texto(pac ? pac.NOMBRE : ''),
    motivos: problemas,
    estado: Calidad_peorGravedad(problemas) === 'OK' ? 'RESUELTO_AUTO' : 'PENDIENTE'
  };
}

// ---------------------------------------------------------------------------
// GAS: auditoría completa + sincronización de Cola de Revisión
// ---------------------------------------------------------------------------

/** GAS: auditoría READ ONLY de PACIENTES + EVENTOS. */
function Calidad_auditarTodo() {
  var pacientes = Modelo_leerPacientes();
  /* eventos normalizados: FECHA_EVENTO como string ISO (el clasificador es
     puro y espera strings; los Date crudos de la hoja fallan al 100%) */
  var eventos = _rem_normalizarEventos(Modelo_leerEventos());

  /* duplicados de RUT en PACIENTES */
  var conteo = {};
  pacientes.forEach(function (p) {
    var r = Utl_texto(p.RUT).trim().toUpperCase();
    if (r) conteo[r] = (conteo[r] || 0) + 1;
  });
  var dupRuts = {};
  Object.keys(conteo).forEach(function (r) { if (conteo[r] > 1) dupRuts[r] = true; });

  var existePac = {};
  pacientes.forEach(function (p) { existePac[Utl_texto(p.ID_INTERNO)] = true; });

  var entidades = {}; // id → {pac, problemas[], eventosProblemas[]}
  pacientes.forEach(function (p) {
    var id = Utl_texto(p.ID_INTERNO);
    var probs = Calidad_problemasPaciente(p, dupRuts);
    entidades[id] = { pac: p, problemas: probs };
  });
  eventos.forEach(function (e) {
    var id = Utl_texto(e.ID_INTERNO);
    var probs = Calidad_problemasEvento(e, !!existePac[id]);
    if (!probs.length) return;
    if (!entidades[id]) {
      entidades[id] = { pac: { ID_INTERNO: e.ID_INTERNO, RUT: e.RUT, NOMBRE: e.NOMBRE },
                        problemas: [] };
    }
    probs.forEach(function (p) {
      p.detalle = 'evento ' + Utl_texto(e.ID_EVENTO) + ' (' + Utl_texto(e.TIPO_EVENTO) +
        ' ' + Utl_texto(e.FECHA_EVENTO) + '): ' + p.detalle;
      entidades[id].problemas.push(p);
    });
  });

  var filasCola = [], ok = 0;
  Object.keys(entidades).forEach(function (id) {
    var ent = entidades[id];
    if (!ent.problemas.length) { ok++; return; }
    filasCola.push(Calidad_filaCola('CALIDAD', id, ent.pac, ent.problemas));
  });

  return { ok: true, totalPacientes: pacientes.length, totalEventos: eventos.length,
           entidadesOk: ok, conProblemas: filasCola.length, filasCola: filasCola,
           resumenTipos: (function () {
             var t = {};
             filasCola.forEach(function (f) {
               f.motivos.forEach(function (m) { t[m.tipo] = (t[m.tipo] || 0) + 1; });
             });
             return t;
           })() };
}

/**
 * GAS: sincroniza la Cola de Revisión con el estado de calidad actual.
 * - Crea/actualiza UNA fila por entidad problemática (motivos en JSON).
 * - Entidad sin problemas con fila PENDIENTE previa → RESUELTO_AUTO.
 * - Jamás elimina filas (trazabilidad) ni toca PACIENTES/EVENTOS.
 */
function Calidad_sincronizarCola() {
  var audit = Calidad_auditarTodo();
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(HOJAS.CONFLICTOS);
  if (!hoja) return { ok: false, motivo: 'SIN_HOJA_CONFLICTOS' };

  var valores = Utl_leerBloque(hoja);
  var colId = 2; // ID_INTERNO
  var colEstado = 9, colResueltoPor = 10, colDetalle = 6, colNombre = 4;
  var filasCalidad = {}; // idInterno → fila en hoja (solo filas FUENTE_A=CALIDAD)
  for (var i = 1; i < valores.length; i++) {
    if (Utl_texto(valores[i][7]) === 'CALIDAD') {
      filasCalidad[Utl_texto(valores[i][colId])] = i + 1;
    }
  }

  var creadas = 0, actualizadas = 0, resueltas = 0;
  var hoy = new Date();
  var detalleNuevo = {}, estadoNuevo = {}, resueltoNuevo = {};
  audit.filasCola.forEach(function (f) {
    var detalleJson = JSON.stringify(f.motivos);
    var filaHoja = filasCalidad[f.idInterno];
    if (filaHoja) {
      detalleNuevo[filaHoja] = detalleJson;
      estadoNuevo[filaHoja] = 'PENDIENTE';
      actualizadas++;
    } else {
      hoja.appendRow([hoy, 'CALIDAD_DATOS', f.idInterno, f.rut, f.nombre,
        detalleJson, 'CALIDAD', '', 'PENDIENTE', '']);
      creadas++;
    }
  });
  /* resolver automáticamente entidades que ya no tienen problemas */
  Object.keys(filasCalidad).forEach(function (id) {
    var sigue = audit.filasCola.some(function (f) { return f.idInterno === id; });
    if (!sigue) {
      var filaHoja = filasCalidad[id];
      if (Utl_texto(valores[filaHoja - 1][colEstado]) === 'PENDIENTE') {
        estadoNuevo[filaHoja] = 'RESUELTO_AUTO';
        resueltoNuevo[filaHoja] = 'SISTEMA';
        resueltas++;
      }
    }
  });
  /* escritura por bloque (regla: nunca setValue dentro de loops) */
  function _escribirCol(col, porFila) {
    var filas = Object.keys(porFila).map(Number);
    if (!filas.length) return;
    var fMin = Math.min.apply(null, filas), fMax = Math.max.apply(null, filas);
    var rango = hoja.getRange(fMin, col, fMax - fMin + 1, 1);
    var v = rango.getValues();
    filas.forEach(function (f) { v[f - fMin][0] = porFila[f]; });
    rango.setValues(v);
  }
  _escribirCol(colDetalle, detalleNuevo);
  _escribirCol(colEstado, estadoNuevo);
  _escribirCol(colResueltoPor, resueltoNuevo);

  Log_info('Calidad', 'sincronizarCola', 'creadas=' + creadas +
    ' actualizadas=' + actualizadas + ' resueltasAuto=' + resueltas);
  Log_flush();
  return { ok: true, conProblemas: audit.conProblemas,
           entidadesOk: audit.entidadesOk, creadas: creadas,
           actualizadas: actualizadas, resueltasAuto: resueltas,
           resumenTipos: audit.resumenTipos };
}

/**
 * GAS: CORRECCIÓN AUTOMÁTICA segura — normaliza el FORMATO de RUT en
 * PACIENTES (puntos/espacios/minúsculas) sin tocar dígitos ni DV.
 * Solo aplica si el valor normalizado pasa módulo 11 (evidencia total).
 */
function Calidad_normalizarFormatoRuts() {
  var pacientes = Modelo_leerPacientes();
  var hojaP = Modelo_hoja(HOJAS.PACIENTES);
  var colRut = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf('RUT') + 1;
  var corregidos = 0, detalles = [];
  var filas = [], valores = {};
  pacientes.forEach(function (p, ix) {
    var original = Utl_texto(p.RUT);
    var norm = Norm_normalizarRut(original);
    if (!norm.rut || norm.rut === original) return;
    if (!Norm_validarRut(norm.rut)) return; // solo formato, con evidencia
    var fila = 2 + ix;
    filas.push(fila);
    valores[fila] = norm.rut;
    corregidos++;
    detalles.push(original + ' → ' + norm.rut);
  });
  if (filas.length) {
    var fMin = Math.min.apply(null, filas), fMax = Math.max.apply(null, filas);
    var rango = hojaP.getRange(fMin, colRut, fMax - fMin + 1, 1);
    var v = rango.getValues();
    filas.forEach(function (f) { v[f - fMin][0] = valores[f]; });
    rango.setValues(v);
  }
  Log_info('Calidad', 'normalizarRuts', 'corregidos=' + corregidos);
  Log_flush();
  return { ok: true, corregidos: corregidos, detalles: detalles.slice(0, 20) };
}
