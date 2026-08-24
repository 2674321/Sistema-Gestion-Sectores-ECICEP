/**
 * Sistema ECICEP Unificado — 16_Amarillo (cierre Sector Amarillo)
 *
 * FUENTE: 'SEGUIMIENTO ECICEP Sector Amarillo' (FUENTES_DRIVE) · hoja
 * 'INGRESOS ECICEP' · columnas: NOMBRE, G, RUT, TELÉFONO, PREINGRESO,
 * INGRESO, SEGUIMIENTO, CONTROL, PRÓXIMO CONTROL, OBSERVACIONES.
 *
 * Estrategia fiel al modelo (sin duplicar pipelines):
 *   1) PUERTA: mapea cada fila al contrato INGRESO_AMARILLO y la agrega a la
 *      hoja (idempotente por RUT). El procesamiento de identidad/dedup/gates
 *      lo hace el flujo existente 'Procesar ingresos'.
 *   2) HISTÓRICO: para cada fila con paciente ya importado, crea los eventos
 *      CONTROL / SEGUIMIENTO históricos (append-only, con snapshot G de la
 *      fuente) y actualiza PREINGRESO / PRÓXIMO_CONTROL del paciente.
 *      Idempotente: salta combinaciones RUT+tipo+fecha ya existentes.
 * Campos sin fuente (SEXO, FECHA_NACIMIENTO, DUPLA) quedan vacíos (#no-inventar).
 */

var AMARILLO_FUENTE_TAG = 'AMARILLO|INGRESOS ECICEP';

// ---------------------------------------------------------------------------
// Núcleo PURA (testeable en node)
// ---------------------------------------------------------------------------

/** PURA: serial/Date/texto → 'YYYY-MM-DD' | null. Seriales imposibles → null. */
function Amarillo_aFecha(v) {
  if (v instanceof Date) {
    var y = v.getFullYear();
    if (y < 2000 || y > 2100) return null;
    return y + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  var s = Utl_texto(v).trim();
  if (s === '') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    var yy = +m[1];
    return (yy >= 2000 && yy <= 2100) ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }
  var num = Number(s);
  if (!isNaN(num) && num > 20000 && num < 80000) { // serial Excel plausible
    var d = new Date(Math.round((num - 25569) * 864e5));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  var f2 = new Date(s);
  if (!isNaN(f2.getTime())) {
    var y2 = f2.getFullYear();
    return (y2 >= 2000 && y2 <= 2100)
      ? y2 + '-' + String(f2.getMonth() + 1).padStart(2, '0') + '-' + String(f2.getDate()).padStart(2, '0')
      : null;
  }
  return null;
}

/** PURA: fila fuente (objeto con claves de la fuente) → fila contrato
 *  INGRESO_AMARILLO. G se normaliza a mayúsculas; sin fuente para SEXO/
 *  FECHA_NACIMIENTO/DUPLA → vacíos (#no-inventar). */
function Amarillo_mapearFila(f) {
  var g = Utl_texto(f.G).trim().toUpperCase();
  return {
    NOMBRE: Utl_colapsarEspacios(Utl_texto(f.NOMBRE).toUpperCase()),
    RUT: Utl_texto(f.RUT).trim().toUpperCase(),
    SEXO: '',
    'FECHA DE NACIMIENTO': '',
    'TELEFONO(S)': Utl_texto(f['TELÉFONO']).replace(/\.0+$/, '').trim(),
    'FECHA DE INGRESO': Amarillo_aFecha(f.INGRESO),
    ESTRATIFICACION: (g === '' ? 'PENDIENTE' : g),
    'DUPLA INGRESO': '',
    OBSERVACIONES: Utl_texto(f.OBSERVACIONES),
    ESTADO_INGRESO: 'PENDIENTE',
    NOTA_SISTEMA: AMARILLO_FUENTE_TAG
  };
}

/** PURA: histórico de una fila → eventos a crear + campos de paciente.
 *  Devuelve solo fechas válidas; seriales corruptos → null (se reportan). */
function Amarillo_historicoDe(f) {
  return {
    control: Amarillo_aFecha(f.CONTROL),
    seguimiento: Amarillo_aFecha(f.SEGUIMIENTO),
    proximoControl: Amarillo_aFecha(f['PRÓXIMO CONTROL']),
    preingreso: Amarillo_aFecha(f.PREINGRESO),
    g: Utl_texto(f.G).trim().toUpperCase()
  };
}

/** PURA: eventos históricos a crear para un paciente, excluyendo los que ya
 *  existen (dedup por TIPO+FECHA). eventosExistentes: array de eventos del
 *  paciente con {TIPO_EVENTO, FECHA_EVENTO}. */
function Amarillo_eventosNuevos(paciente, hist, eventosExistentes, filaNum) {
  var prev = {};
  (eventosExistentes || []).forEach(function (e) {
    var fExist = Amarillo_aFecha(e.FECHA_EVENTO) ||
                 Utl_texto(e.FECHA_EVENTO).slice(0, 10);
    prev[Utl_texto(e.TIPO_EVENTO).toUpperCase() + '|' + fExist] = true;
  });
  var out = [];
  [['CONTROL', hist.control], ['SEGUIMIENTO', hist.seguimiento]].forEach(function (par) {
    var tipo = par[0], fecha = par[1];
    if (!fecha) return;
    if (prev[tipo + '|' + fecha]) return; // ya existe → idempotente
    out.push({
      ID_EVENTO: Ev_nuevoId(),
      ID_INTERNO: paciente.ID_INTERNO,
      RUT: paciente.RUT,
      NOMBRE: paciente.NOMBRE,
      FECHA_EVENTO: fecha,
      TIPO_EVENTO: tipo,
      SECTOR: 'AMARILLO',
      RIESGO_G: hist.g,
      PROFESIONAL: '', PROFESIONAL_TIPO: '',
      DESCRIPCION: 'Histórico importado (Sector Amarillo)',
      CANTIDAD: '', OBSERVACIONES: '',
      FUENTE: AMARILLO_FUENTE_TAG + '|fila' + filaNum,
      REGISTRADO_POR: 'IMPORT_AMARILLO',
      FECHA_REGISTRO: null
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Envoltorio GAS
// ---------------------------------------------------------------------------

/** GAS: lee la fuente Amarillo desde Drive (debe estar subida como Sheets). */
function Amarillo_leerFuente() {
  var cfg = FUENTES_DRIVE['SEGUIMIENTO ECICEP Sector Amarillo'];
  if (!cfg) return { ok: false, motivo: 'FUENTE_NO_CONFIGURADA' };
  if (!cfg.id) return { ok: false, motivo:
    'SIN_ID_DRIVE: sube "SEGUIMIENTO ECICEP Sector Amarillo.xlsx" a Drive como Google Sheets, '
    + 'copia el ID y pégalo en FUENTES_DRIVE (00_Config.js) o en CONFIG clave AMARILLO_FILE_ID' };
  var override = _rem9_configValor('AMARILLO_FILE_ID');
  var id = override || cfg.id;
  var ss = SpreadsheetApp.openById(id);
  var hoja = ss.getSheetByName(cfg.hojas[0]) || ss.getSheets()[0];
  var valores = Utl_leerBloque(hoja);
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var v = valores[i];
    if (Utl_vacio(Utl_texto(v[0])) && Utl_vacio(Utl_texto(v[2]))) continue;
    filas.push({ NOMBRE: v[0], G: v[1], RUT: v[2], 'TELÉFONO': v[3],
      PREINGRESO: v[4], INGRESO: v[5], SEGUIMIENTO: v[6], CONTROL: v[7],
      'PRÓXIMO CONTROL': v[8], OBSERVACIONES: v[9], _fila: i + 1 });
  }
  return { ok: true, filas: filas, ssId: id };
}

/** GAS: vuelca filas NUEVAS a la puerta INGRESO_AMARILLO (idempotente por RUT). */
function Amarillo_volcarPuerta(filas) {
  var ss = Modelo_ss();
  var puerta = ss.getSheetByName('INGRESO_AMARILLO');
  if (!puerta) throw new Error('Falta hoja INGRESO_AMARILLO — ejecuta Instalar sistema');
  var existentes = {};
  var actuales = Utl_leerBloque(puerta);
  var iCol = INGRESO_COLUMNAS.indexOf('RUT');
  for (var i = 1; i < actuales.length; i++) {
    existentes[Utl_texto(actuales[i][iCol]).toUpperCase()] = true;
  }
  var nuevas = [], ya = 0;
  filas.forEach(function (f) {
    var m = Amarillo_mapearFila(f);
    if (existentes[m.RUT]) { ya++; return; }
    nuevas.push(INGRESO_COLUMNAS.map(function (c) {
      var v = m[c];
      return (v === undefined || v === null) ? '' : v;
    }));
    existentes[m.RUT] = true;
  });
  if (nuevas.length) {
    Utl_escribirBloque(puerta, puerta.getLastRow() + 1, 1, nuevas);
  }
  return { nuevas: nuevas.length, yaPresentes: ya };
}

/** GAS: aplica histórico (eventos + PREINGRESO/PRÓXIMO_CONTROL) a pacientes
 *  YA importados. Los RUT sin paciente quedan listados como pendientes. */
function Amarillo_aplicarHistorico(filas) {
  var pacientes = Modelo_leerPacientes();
  /* índice NORMALIZADO (trim+mayúsculas) — el RUT de la fuente puede traer
     espacios o variaciones; sin esto el join falla al 100% */
  var idxRut = {};
  pacientes.forEach(function (p) {
    idxRut[Utl_texto(p.RUT).trim().toUpperCase()] = p;
  });
  /* eventos NORMALIZADOS a fechas ISO — el dedup contra Date crudos fallaba
     ('Wed Aug 01' ≠ '2026-04-19') y duplicaba el histórico */
  var eventos = _rem_normalizarEventos(Modelo_leerEventos());
  var porPaciente = {};
  eventos.forEach(function (e) {
    var k = Utl_texto(e.ID_INTERNO);
    (porPaciente[k] = porPaciente[k] || []).push(e);
  });

  var nuevosEv = [], actualizados = {}, pendientes = [], yaHist = 0;
  filas.forEach(function (f, ix) {
    var rut = Utl_texto(f.RUT).trim().toUpperCase();
    var pac = idxRut[rut];
    if (!pac) { pendientes.push({ fila: f._fila, rut: rut, nombre: Utl_texto(f.NOMBRE) }); return; }
    var hist = Amarillo_historicoDe(f);
    var evs = Amarillo_eventosNuevos(pac, hist, porPaciente[Utl_texto(pac.ID_INTERNO)] || [], f._fila || ix + 2);
    if (!evs.length) yaHist++;
    nuevosEv = nuevosEv.concat(evs);
    var obj = pacientes.filter(function (p) {
      return Utl_texto(p.ID_INTERNO) === Utl_texto(pac.ID_INTERNO);
    })[0];
    if (hist.preingreso && Utl_vacio(Utl_texto(obj.PREINGRESO))) { obj.PREINGRESO = hist.preingreso; }
    if (hist.proximoControl) { obj.PROXIMO_CONTROL = hist.proximoControl; }
    evs.forEach(function (e) { Ingresos_sincronizarCache(obj, e); });
    if (evs.length || hist.preingreso || hist.proximoControl) actualizados[Utl_texto(pac.ID_INTERNO)] = obj;
  });

  if (nuevosEv.length) {
    Modelo_agregarEventos(nuevosEv, 'IMPORT_AMARILLO',
      { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'amarillo-historico' });
  }
  var filasEscritas = 0;
  var ids = Object.keys(actualizados);
  if (ids.length) {
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    ids.forEach(function (id, ix) {
      var fila = 2 + pacientes.indexOf(actualizados[id]);
      if (fila > 1) {
        hojaP.getRange(fila, 1, 1, MODELO_PACIENTE.length)
             .setValues([Modelo_filaDesdeObjeto(actualizados[id])]);
        filasEscritas++;
      }
    });
  }
  return { eventosCreados: nuevosEv.length, pacientesActualizados: filasEscritas,
           yaConHistorico: yaHist, pendientesSinPaciente: pendientes };
}

/** Orquestador: puerta + (opcional) histórico. Devuelve resumen para el UI. */
function Amarillo_importarTodo(aplicarHistorico) {
  var fuente = Amarillo_leerFuente();
  if (!fuente.ok) return fuente;
  var puerta = Amarillo_volcarPuerta(fuente.filas);
  var hist = { eventosCreados: 0, pacientesActualizados: 0, yaConHistorico: 0, pendientesSinPaciente: [] };
  if (aplicarHistorico) {
    hist = Amarillo_aplicarHistorico(fuente.filas);
    if (typeof Modelo_refrescarVistasSectores === 'function') Modelo_refrescarVistasSectores();
  }
  Log_info('Amarillo', 'importar', 'puertaNuevas=' + puerta.nuevas +
    ' eventos=' + hist.eventosCreados + ' actualizados=' + hist.pacientesActualizados);
  Log_flush();
  return { ok: true, puerta: puerta, historico: hist,
           pendientesSinPaciente: hist.pendientesSinPaciente };
}

/**
 * GAS: elimina SOLO los duplicados inequívocos creados por el bug Date/ISO
 * del histórico Amarillo: mismo ID_INTERNO + TIPO_EVENTO + FECHA_EVENTO
 * (día) + FUENTE AMARILLO. Conserva la primera ocurrencia. Documenta en LOG.
 * @returns {ok, revisados, eliminados, ejemplos}
 */
function Amarillo_dedupHistorico() {
  var ss = Modelo_ss();
  var hojaE = ss.getSheetByName(HOJAS.EVENTOS);
  if (!hojaE || hojaE.getLastRow() < 2)
    return { ok: true, revisados: 0, eliminados: 0, ejemplos: [] };
  var tz = Session.getScriptTimeZone();
  var vals = hojaE.getRange(2, 1, hojaE.getLastRow() - 1, hojaE.getLastColumn()).getValues();
  var vistos = {}, filasBorrar = [], ejemplos = [];
  for (var i = 0; i < vals.length; i++) {
    var f = vals[i];
    var fuente = Utl_texto(f[13]); // FUENTE
    if (fuente.indexOf(AMARILLO_FUENTE_TAG) === -1) continue;
    var fechaIso = f[4] instanceof Date
      ? Utilities.formatDate(f[4], tz, 'yyyy-MM-dd')
      : Utl_texto(f[4]).slice(0, 10);
    var k = Utl_texto(f[1]) + '|' + Utl_texto(f[5]).toUpperCase() + '|' + fechaIso;
    if (vistos[k]) {
      filasBorrar.push(i + 2); // fila real en hoja
      if (ejemplos.length < 5)
        ejemplos.push('Fila ' + (i + 2) + ': ' + Utl_texto(f[3]) + ' · ' +
          Utl_texto(f[5]) + ' ' + fechaIso);
    } else {
      vistos[k] = true;
    }
  }
  for (var b = filasBorrar.length - 1; b >= 0; b--) {
    hojaE.deleteRow(filasBorrar[b]);
    Log_warning('Amarillo', 'dedup', 'Evento duplicado eliminado (fila ' + filasBorrar[b] + ')');
  }
  Log_warning('Amarillo', 'dedup', 'Eliminados ' + filasBorrar.length +
    ' duplicados del histórico (bug Date/ISO ya corregido)');
  Log_flush();
  return { ok: true, revisados: vals.length, eliminados: filasBorrar.length,
           ejemplos: ejemplos };
}
