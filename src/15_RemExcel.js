/**
 * Sistema ECICEP Unificado — 15_RemExcel (ETAPA 9)
 * Generador del REM ECICEP como archivo .xlsx con DOS hojas, siguiendo el
 * contrato del archivo original "REM ECICEP.xlsx":
 *
 *   HOJA "REM"          → 1 fila por PACIENTE con actividad en el período
 *                         (24 columnas: conteos tipo × G por SNAPSHOT +
 *                          Total + Tiene Ingreso/Control/Seguimiento/Plan).
 *   HOJA "REM_DETALLE"  → 1 fila por ATENCIÓN/EVENTO del período
 *                         (28 columnas contractuales del formato original).
 *
 * REGLAS INNEGOCIABLES implementadas:
 *   - Solo lectura de PACIENTES/EVENTOS; producto derivado (#37/#38).
 *   - Idempotente: misma entrada → mismo resultado lógico (#14/#36).
 *   - G/vacío/null NO es nivel: sale del conteo G y queda marcado (#10).
 *   - Gestión de casos ya diferenciada en TIPO_EVENTO (#11/#12).
 *   - Campos sin captura quedan VACÍOS y se reportan; jamás inventados (#6/#32).
 *   - Edad a la atención calculada con FECHA_NACIMIENTO + FECHA_EVENTO (#16).
 */

// ---------------------------------------------------------------------------
// Contrato de columnas (nombres ES del archivo original)
// ---------------------------------------------------------------------------

var REM9_RES_COLS = [
  'Paciente', 'Edad', 'Sexo',
  'Ingreso integral G1', 'Ingreso integral G2', 'Ingreso integral G3',
  'Control integral G1', 'Control integral G2', 'Control integral G3',
  'Seguimiento a distancia G1', 'Seguimiento a distancia G2', 'Seguimiento a distancia G3',
  'Plan de cuidado elaborado G1', 'Plan de cuidado elaborado G2', 'Plan de cuidado elaborado G3',
  'Gestión de casos ingreso G3', 'Gestión de casos ingreso G2',
  'Gestión de casos egreso G3', 'Gestión de casos egreso G2',
  'Total', 'Tiene Ingreso', 'Tiene Control', 'Tiene seguimiento', 'Tiene Plan de cuidado'
];

var REM9_DET_COLS = [
  'Profesional', 'Tipo de Profesional', 'Ficha Paciente', 'Doc.', 'Tipo doc.',
  'Nombre Paciente', 'Edad a la Atención', 'Año', 'Mes', 'Día', 'Sexo',
  'Género Social', 'Centro Paciente', 'País Origen', 'Sector',
  'Fecha/Hora Atención', 'Hora Cierre Atención', 'Embarazada', 'Tipo',
  'Descripción', 'Cantidad', 'Condicionante 1', 'Condicionante 2',
  'Condicionante 3', 'Condicionante 4', 'Condicionante 5', 'Comentario', 'Programa'
];

/* Mapa TIPO_EVENTO → bloque del resumen (clave base de las 3 columnas G) */
var REM9_TIPO_BLOQUE = {
  'INGRESO':              'Ingreso integral',
  'CONTROL':              'Control integral',
  'SEGUIMIENTO':          'Seguimiento a distancia',
  'PLAN_CUIDADO':         'Plan de cuidado elaborado'
};
/* Gestión de casos: columnas propias G3-ingreso / G2-ingreso / G3-egreso / G2-egreso */
var REM9_GC_COLS = {
  'GESTION_CASO_INGRESO': { G3: 'Gestión de casos ingreso G3', G2: 'Gestión de casos ingreso G2' },
  'GESTION_CASO_EGRESO':  { G3: 'Gestión de casos egreso G3',  G2: 'Gestión de casos egreso G2' }
};

// ---------------------------------------------------------------------------
// Helpers PURA
// ---------------------------------------------------------------------------

/** PURA: ISO 'YYYY-MM-DD[...]' → {anio,mes,dia,iso} o null. */
function Rem9_normFecha(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(Utl_texto(v));
  return m ? { anio: +m[1], mes: +m[2], dia: +m[3], iso: m[1] + '-' + m[2] + '-' + m[3] } : null;
}

/** PURA: bucket de estratificación por SNAPSHOT del evento. ''/G → '' (pendiente). */
function Rem9_bucketG(g) {
  var t = Utl_texto(g).trim().toUpperCase();
  return (t === 'G1' || t === 'G2' || t === 'G3') ? t : '';
}

/** PURA: edad cumplida a una fecha de referencia. '' si faltan datos. */
function Rem9_edadEn(fechaNacIso, fechaRefIso) {
  var n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(Utl_texto(fechaNacIso));
  var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(Utl_texto(fechaRefIso));
  if (!n || !r) return '';
  var edad = +r[1] - +n[1];
  if (+r[2] < +n[2] || (+r[2] === +n[2] && +r[3] < +n[3])) edad--;
  return edad >= 0 && edad < 130 ? edad : '';
}

/** PURA: sexo canónico → representación REM del archivo original. */
function Rem9_sexoRem(sexo) {
  var t = Utl_sinTildes(Utl_texto(sexo)).trim().toUpperCase();
  if (t === 'M' || t === 'MASCULINO' || t === 'HOMBRE') return 'Hombre';
  if (t === 'F' || t === 'FEMENINO' || t === 'MUJER') return 'Mujer';
  if (t === 'OTRO') return 'Otro';
  return '';
}

/** PURA: RUT '12345678-9' → '12345678' (Ficha Paciente del original). */
function Rem9_rutSinDv(rut) {
  return Utl_texto(rut).split('-')[0].replace(/\./g, '').trim();
}

/** PURA: fila RESUMEN (24 cols) para un paciente y sus eventos del período. */
function Rem9_filaResumen(pac, eventosPac) {
  var fila = {};
  REM9_RES_COLS.forEach(function (c) { fila[c] = 0; });
  fila['Paciente'] = Utl_texto(pac.rut);
  var tiene = { 'Tiene Ingreso': false, 'Tiene Control': false,
                'Tiene seguimiento': false, 'Tiene Plan de cuidado': false };
  var ultimaFecha = '';
  (eventosPac || []).forEach(function (e) {
    var tipo = Utl_texto(e.tipo).trim().toUpperCase();
    var g = Rem9_bucketG(e.g);
    var bloque = REM9_TIPO_BLOQUE[tipo];
    if (bloque && g) { fila[bloque + ' ' + g]++; fila['Total']++; }
    if (REM9_TIPO_BLOQUE[tipo]) tiene[bloque === 'Ingreso integral' ? 'Tiene Ingreso'
      : bloque === 'Control integral' ? 'Tiene Control'
      : bloque === 'Seguimiento a distancia' ? 'Tiene seguimiento'
      : 'Tiene Plan de cuidado'] = true;
    var gc = REM9_GC_COLS[tipo];
    if (gc && gc[g]) { fila[gc[g]]++; fila['Total']++; }
    if (e.f > ultimaFecha) ultimaFecha = e.f;
  });
  Object.keys(tiene).forEach(function (k) { fila[k] = tiene[k] ? 'SI' : 'NO'; });
  fila['Edad'] = Rem9_edadEn(pac.fechaNacimiento || '', ultimaFecha || pac.corteIso);
  fila['Sexo'] = Rem9_sexoRem(pac.sexo);
  return REM9_RES_COLS.map(function (c) { return fila[c]; });
}

/** PURA: fila DETALLE (28 cols) + validación de completitud por campo.
 *  Campos sin captura en el modelo actual quedan '' y se listan como
 *  PENDIENTE_CAPTURA (nunca inventados). */
function Rem9_filaDetalle(ev, pac, opciones) {
  opciones = opciones || {};
  var f = Rem9_normFecha(ev.f);
  var val = [];
  function chk(campo, valor, minimo) {
    if (!minimo) return;
    val.push({ campo: campo, estado: (valor === '' || valor == null) ? 'WARNING' : 'OK',
               detalle: valor === '' ? 'sin dato en el modelo' : '' });
  }
  var edad = pac.fechaNacimiento ? Rem9_edadEn(pac.fechaNacimiento, ev.f) : '';
  if (!f) val.push({ campo: 'Fecha/Hora Atención', estado: 'ERROR', detalle: 'evento sin fecha válida' });

  var fila = {};
  REM9_DET_COLS.forEach(function (c) { fila[c] = ''; });
  fila['Profesional'] = Utl_texto(ev.profesional);
  fila['Tipo de Profesional'] = Utl_texto(ev.tipoProfesional); // PENDIENTE_CAPTURA
  fila['Ficha Paciente'] = Rem9_rutSinDv(pac.rut);
  fila['Doc.'] = Utl_texto(pac.rut);
  fila['Tipo doc.'] = pac.rut ? 'R.U.N.' : '';
  fila['Nombre Paciente'] = Utl_texto(pac.nombre);
  fila['Edad a la Atención'] = edad;
  fila['Año'] = f ? f.anio : '';
  fila['Mes'] = f ? f.mes : '';
  fila['Día'] = f ? f.dia : '';
  fila['Sexo'] = Rem9_sexoRem(pac.sexo);
  fila['Género Social'] = Utl_texto(ev.generoSocial);            // PENDIENTE_CAPTURA
  fila['Centro Paciente'] = opciones.centro || '';               // CONFIG-derivado opcional
  fila['País Origen'] = Utl_texto(ev.paisOrigen);                // PENDIENTE_CAPTURA
  fila['Sector'] = Utl_texto(ev.sector) ? 'SECTOR ' + Utl_texto(ev.sector).toUpperCase() : '';
  fila['Fecha/Hora Atención'] = f ? f.iso : '';
  fila['Hora Cierre Atención'] = Utl_texto(ev.horaCierre);       // PENDIENTE_CAPTURA
  fila['Embarazada'] = Utl_texto(ev.embarazada);                 // PENDIENTE_CAPTURA
  fila['Tipo'] = Utl_texto(ev.tipo);
  fila['Descripción'] = Utl_texto(ev.descripcion);
  fila['Cantidad'] = (ev.cantidad === '' || ev.cantidad == null) ? '' : Number(ev.cantidad) || '';
  for (var i = 1; i <= 5; i++) {
    fila['Condicionante ' + i] = Utl_texto(ev['condicionante' + i]); // PENDIENTE_CAPTURA
  }
  fila['Comentario'] = Utl_texto(ev.comentario);
  fila['Programa'] = Utl_texto(opciones.programa);

  chk('Profesional', fila['Profesional'], false);
  chk('Sexo', fila['Sexo'], true);
  chk('Edad a la Atención', fila['Edad a la Atención'], true);
  chk('Sector', fila['Sector'], true);
  chk('Estratificación (snapshot)', Rem9_bucketG(ev.g) ||
      (val.push({ campo: 'Estratificación', estado: 'WARNING',
                  detalle: 'G vacío → fuera de conteos G1/G2/G3' }), ''), false);

  var estado = 'OK';
  val.forEach(function (v) {
    if (v.estado === 'WARNING' && estado === 'OK') estado = 'WARNING';
    if (v.estado === 'ERROR') estado = 'ERROR';
  });
  return { fila: REM9_DET_COLS.map(function (c) { return fila[c]; }), validacion: val, estado: estado };
}

/** PURA — NÚCLEO: construye resumen + detalle + validación a partir de datos
 *  ya normalizados (inyectados; sin acceso a GAS). Idempotente. */
function Rem9_construir(datos, opciones) {
  opciones = opciones || {};
  var anio = Number(datos.anio), mes = Number(datos.mes);
  var prefijo = anio + '-' + (mes < 10 ? '0' : '') + mes;

  var pacientesIdx = {};
  (datos.pacientes || []).forEach(function (p) {
    pacientesIdx[Utl_texto(p.id)] = p;
  });

  var enPeriodo = (datos.eventos || []).filter(function (e) {
    var f = Rem9_normFecha(e.f);
    if (!f) return false;
    if (f.anio !== anio || f.mes !== mes) return false;
    if (opciones.sector && opciones.sector !== 'TODOS' &&
        Utl_texto(e.sector).toUpperCase() !== String(opciones.sector).toUpperCase()) return false;
    return true;
  }).sort(function (a, b) { return Utl_texto(a.f) < Utl_texto(b.f) ? -1 : 1; });

  /* DETALLE */
  var detalle = [], validaciones = [], err = 0, warn = 0;
  var porPaciente = {};
  enPeriodo.forEach(function (ev) {
    var pac = pacientesIdx[Utl_texto(ev.id)] ||
              { rut: Utl_texto(ev.rut), nombre: Utl_texto(ev.nombre), sexo: '', fechaNacimiento: '' };
    var rd = Rem9_filaDetalle(ev, pac, { centro: opciones.centro, programa: opciones.programa });
    detalle.push(rd.fila); validaciones.push({ id: ev.id, nombre: pac.nombre,
      estado: rd.estado, campos: rd.validacion });
    if (rd.estado === 'ERROR') err++;
    else if (rd.estado === 'WARNING') warn++;
    var k = Utl_texto(ev.id);
    (porPaciente[k] = porPaciente[k] || { pac: pac, evs: [] }).evs.push({
      tipo: ev.tipo, g: ev.g, f: ev.f });
  });

  /* RESUMEN derivado del detalle (#13) */
  var resumen = Object.keys(porPaciente).map(function (k) {
    return Rem9_filaResumen(porPaciente[k].pac, porPaciente[k].evs);
  }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });

  return { resumen: resumen, detalle: detalle, validacion: {
             ok: validaciones.length - err - warn, warning: warn, error: err,
             filas: validaciones },
           pacientes: resumen.length, atenciones: enPeriodo.length };
}

// ---------------------------------------------------------------------------
// Envoltorio GAS — lectura batch + Excel real (.xlsx) SOLO LECTURA de datos
// ---------------------------------------------------------------------------

/** Normaliza eventos/pacientes a contratos serializables planos. */
function _rem9_datos(anio, mes, sectorFiltro) {
  var tz = Session.getScriptTimeZone();
  var eventos = _rem_normalizarEventos(Modelo_leerEventos());
  var pacientes = Modelo_leerPacientes().map(function (p) {
    return { id: Utl_texto(p.ID_INTERNO), rut: Utl_texto(p.RUT),
             nombre: Utl_texto(p.NOMBRE), sexo: Utl_texto(p.SEXO),
             fechaNacimiento: p.FECHA_NACIMIENTO instanceof Date
               ? Utilities.formatDate(p.FECHA_NACIMIENTO, tz, 'yyyy-MM-dd')
               : Utl_texto(p.FECHA_NACIMIENTO).slice(0, 10) };
  });
  return { pacientes: pacientes, eventos: eventos,
           anio: anio, mes: mes, sector: sectorFiltro };
}

/** Lee un valor puntual de CONFIG (para Programa/Centro derivados). */
function _rem9_configValor(clave) {
  try {
    var h = Modelo_hoja(HOJAS.CONFIG);
    if (!h || h.getLastRow() < 2) return '';
    var vals = Utl_leerBloque(h);
    for (var i = 1; i < vals.length; i++) {
      if (Utl_texto(vals[i][0]) === clave) return Utl_texto(vals[i][1]);
    }
  } catch (e) {}
  return '';
}

/**
 * 📄 Genera REM_ECICEP_YYYY_MM.xlsx con hojas REM + REM_DETALLE.
 * READ ONLY sobre PACIENTES/EVENTOS; crea un spreadsheet TEMPORAL que se
 * envía a papelera tras exportar. Idempotente.
 * @returns {ok, url?, nombre?, resumen?, validacion?, motivo?}
 */
function REM_exportarExcel(anio, mes, sectorFiltro) {
  var nombre = '';
  var tempId = null;
  try {
    anio = Number(anio); mes = Number(mes);
    if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
    var filtro = Rem_bucketSector(Utl_texto(sectorFiltro).trim() === '' ? 'todos' : sectorFiltro);
    nombre = 'REM_ECICEP_' + anio + '_' + (mes < 10 ? '0' : '') + mes;

    var datos = _rem9_datos(anio, mes, filtro);
    var c = Rem9_construir(datos, { sector: filtro,
      programa: _rem9_configValor('GENERAL_NOMBRE_SISTEMA') || 'ECICEP',
      centro: '' });

    if (!c.atenciones) {
      return { ok: false, motivo: 'SIN_EVENTOS_PERIODO',
               validacion: c.validacion,
               detalle: 'No hay atenciones para ' + nombre };
    }

    // Spreadsheet temporal → 2 hojas contractuales
    var temp = SpreadsheetApp.create(nombre);
    tempId = temp.getId();
    var shR = temp.getSheets()[0].setName('REM');
    var shD = temp.insertSheet('REM_DETALLE');

    var rect = function (cols, filas) {
      var w = cols.length;
      var out = [cols.slice()];
      (filas || []).forEach(function (f) {
        var r = f.slice(0, w);
        while (r.length < w) r.push('');
        out.push(r);
      });
      return out;
    };

    Utl_escribirBloque(shR, 1, 1, rect(REM9_RES_COLS, c.resumen));
    Utl_escribirBloque(shD, 1, 1, rect(REM9_DET_COLS, c.detalle));

    // Formatos mínimos: encabezado marca + fechas reales en detalle
    [shR, shD].forEach(function (sh) {
      sh.getRange(1, 1, 1, sh.getLastColumn())
        .setFontWeight('bold').setBackground('#0E5C68').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    });
    var colFec = REM9_DET_COLS.indexOf('Fecha/Hora Atención') + 1;
    if (c.detalle.length) {
      shD.getRange(2, colFec, c.detalle.length, 1).setNumberFormat('dd/mm/yyyy');
    }

    SpreadsheetApp.flush();

    // Export xlsx nativo del spreadsheet temporal
    var urlXlsx = 'https://docs.google.com/spreadsheets/d/' + tempId + '/export?format=xlsx';
    var blob = null;
    for (var intento = 1; intento <= 3 && !blob; intento++) {
      try {
        Utilities.sleep(intento === 1 ? 0 : 2000);
        var b = UrlFetchApp.fetch(urlXlsx, {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
        if (b.getResponseCode() === 200 && b.getBytes().length > 1000) {
          blob = b.getBlob().setName(nombre + '.xlsx');
        }
      } catch (eF) { if (intento === 3) throw eF; }
    }
    if (!blob) throw new Error('Exportación no disponible, reintenta en unos segundos');
    var archivo = DriveApp.createFile(blob);

    Log_info('REM', 'exportarExcel', nombre + ' · resumen=' + c.resumen.length +
      ' detalle=' + c.detalle.length + ' err=' + c.validacion.error +
      ' warn=' + c.validacion.warning);
    Log_flush();

    return { ok: true, url: archivo.getUrl(), nombre: nombre + '.xlsx',
             resumen: { pacientes: c.pacientes, atenciones: c.atenciones },
             validacion: { ok: c.validacion.ok, warning: c.validacion.warning,
                           error: c.validacion.error } };
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    if (/permission|autoriz|Scope/i.test(msg)) {
      msg += ' — autoriza los nuevos permisos (abre Apps Script y acepta el aviso).';
    }
    Log_error('REM', 'exportarExcel', (nombre || '') + ' → ' + msg);
    Log_flush();
    return { ok: false, motivo: msg };
  } finally {
    if (tempId) {
      try { DriveApp.getFileById(tempId).setTrashed(true); } catch (eT) {}
    }
  }
}
