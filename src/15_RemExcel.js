/**
 * Sistema ECICEP Unificado — 15_RemExcel (ETAPA 9)
 * Generador del REM ECICEP como archivo .xlsx con DOS hojas, siguiendo el
 * contrato del archivo original "REM ECICEP.xlsx":
 *
 *   HOJA "REM"          → 1 fila por PACIENTE del SECTOR (CENSO completo,
 *                         incluso sin actividad en el período; 24 columnas:
 *                         conteos tipo × G por SNAPSHOT del mes + Total +
 *                         Tiene Ingreso/Control/Seguimiento/Plan).
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
  fila['Paciente'] = Utl_texto(pac.RUT);
  var tiene = { 'Tiene Ingreso': false, 'Tiene Control': false,
                'Tiene seguimiento': false, 'Tiene Plan de cuidado': false };
  var ultimaFecha = '';
  (eventosPac || []).forEach(function (e) {
    var tipo = Utl_texto(e.TIPO_EVENTO).trim().toUpperCase();
    var g = Rem9_bucketG(e.RIESGO_G);
    var bloque = REM9_TIPO_BLOQUE[tipo];
    if (bloque && g) { fila[bloque + ' ' + g]++; fila['Total']++; }
    if (REM9_TIPO_BLOQUE[tipo]) tiene[bloque === 'Ingreso integral' ? 'Tiene Ingreso'
      : bloque === 'Control integral' ? 'Tiene Control'
      : bloque === 'Seguimiento a distancia' ? 'Tiene seguimiento'
      : 'Tiene Plan de cuidado'] = true;
    var gc = REM9_GC_COLS[tipo];
    if (gc && gc[g]) { fila[gc[g]]++; fila['Total']++; }
    if (Utl_texto(e.FECHA_EVENTO) > ultimaFecha) ultimaFecha = Utl_texto(e.FECHA_EVENTO);
  });
  Object.keys(tiene).forEach(function (k) { fila[k] = tiene[k] ? 'SI' : 'NO'; });
  fila['Edad'] = Rem9_edadEn(pac.FECHA_NACIMIENTO || '', ultimaFecha || pac.CORTE_ISO);
  fila['Sexo'] = Rem9_sexoRem(pac.SEXO);
  return REM9_RES_COLS.map(function (c) { return fila[c]; });
}

/** PURA: índice de eventos por ID_INTERNO. */
function Rem9_evsPorId(eventos) {
  var idx = {};
  (eventos || []).forEach(function (e) {
    var id = Utl_texto(e.ID_INTERNO);
    if (!id) return;
    (idx[id] = idx[id] || []).push(e);
  });
  return idx;
}

/** PURA: fila CENSO del REM (vista de trabajo). Los indicadores derivan de los
 *  eventos ENTREGADOS (ya filtrados por modo: solo el mes en MES; histórico en
 *  GENERAL). Nunca se inventan: sin dato → '', sin bandera → NO. */
function Rem9_filaCenso(pac, evs) {
  var tiene = { ingreso: false, control: false, seguimiento: false,
                plan: false, gcIngreso: false, gcEgreso: false };
  var ult = '';
  (evs || []).forEach(function (e) {
    switch (Utl_texto(e.TIPO_EVENTO).trim().toUpperCase()) {
      case 'INGRESO':              tiene.ingreso = true; break;
      case 'CONTROL':              tiene.control = true; break;
      case 'SEGUIMIENTO':          tiene.seguimiento = true; break;
      case 'PLAN_CUIDADO':         tiene.plan = true; break;
      case 'GESTION_CASO_INGRESO': tiene.gcIngreso = true; break;
      case 'GESTION_CASO_EGRESO':  tiene.gcEgreso = true; break;
    }
    if (Utl_texto(e.FECHA_EVENTO) > ult) ult = Utl_texto(e.FECHA_EVENTO);
  });
  var si = function (b) { return b ? 'SI' : 'NO'; };
  return [
    Utl_texto(pac.RUT), Utl_texto(pac.NOMBRE),
    Utl_texto(pac.SECTOR).trim().toUpperCase(),
    Rem9_edadEn(pac.FECHA_NACIMIENTO || '', ult), Rem9_sexoRem(pac.SEXO),
    (evs || []).length, si(tiene.ingreso), si(tiene.control),
    si(tiene.seguimiento), si(tiene.plan), si(tiene.gcIngreso), si(tiene.gcEgreso)
  ];
}

/** PURA: CENSO del sector — una fila por paciente de PACIENTES (filtrado por su
 *  SECTOR canónico) más pacientes presentes SOLO en EVENTOS (nunca se pierde
 *  actividad). Modo 'MES' → indicadores del período; 'GENERAL' → histórico.
 *  `soloActividad` restringe el censo a quienes tienen al menos un evento en el
 *  período (default false = censo completo). Orden estable por NOMBRE y luego RUT. */
function Rem9_censoPacientes(pacientes, eventos, filtro, anio, mes, modo, soloActividad) {
  var evsIdx = Rem9_evsPorId(eventos);
  var pref = (anio && mes) ? Number(anio) + '-' + (Number(mes) < 10 ? '0' : '') + Number(mes) : '';
  var modoMes = modo === 'MES' && pref;
  var solo = soloActividad === true || soloActividad === 1 || soloActividad === '1' || soloActividad === 'true';
  var porModo = function (id) {
    var arr = evsIdx[id] || [];
    if (!modoMes) return arr;
    return arr.filter(function (e) { return Utl_texto(e.FECHA_EVENTO).slice(0, 7) === pref; });
  };
  filtro = Utl_texto(filtro).trim().toUpperCase() || 'TODOS';
  var filtra = function (s) {
    s = Utl_texto(s).trim().toUpperCase();
    return filtro === 'TODOS' ? true : s === filtro;
  };
  var conId = {};
  var filas = [];
  (pacientes || []).forEach(function (p) {
    conId[Utl_texto(p.ID_INTERNO)] = true;
    if (!filtra(p.SECTOR)) return;
    var evs = porModo(Utl_texto(p.ID_INTERNO));
    if (solo && !evs.length) return;
    filas.push(Rem9_filaCenso(p, evs));
  });
  Object.keys(evsIdx).forEach(function (id) {
    if (conId[id]) return;
    var evs = porModo(id);
    if (!evs.length) return;
    var e0 = evs[0];
    if (!filtra(e0.SECTOR)) return;
    filas.push(Rem9_filaCenso({
      RUT: e0.RUT, NOMBRE: e0.NOMBRE, SECTOR: e0.SECTOR,
      FECHA_NACIMIENTO: '', SEXO: ''
    }, evs));
  });
  filas.sort(function (a, b) {
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 :
           a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  return filas;
}

/** PURA: resumen REM mensual como CENSO del sector — una fila por paciente
 *  aunque no haya tenido actividad en el período (indicadores del mes); los
 *  pacientes que aparecen en eventos sin registro PACIENTES no se pierden. */
function Rem9_censoResumen(pacientes, porPaciente, filtro) {
  filtro = Utl_texto(filtro).trim().toUpperCase() || 'TODOS';
  var filtra = function (s) {
    s = Utl_texto(s).trim().toUpperCase();
    return filtro === 'TODOS' ? true : s === filtro;
  };
  var conId = {};
  var filas = [];
  (pacientes || []).forEach(function (p) {
    conId[Utl_texto(p.ID_INTERNO)] = true;
    var pk = porPaciente[Utl_texto(p.ID_INTERNO)];
    if (!filtra(p.SECTOR) && !pk) return;
    filas.push(Rem9_filaResumen(p, pk ? pk.evs : []));
  });
  Object.keys(porPaciente).forEach(function (k) {
    if (conId[k]) return;
    filas.push(Rem9_filaResumen(porPaciente[k].pac, porPaciente[k].evs));
  });
  return filas.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
}

/** PURA: arma la VISTA DE TRABAJO del REM (MES o GENERAL) a partir de datos ya
 *  normalizados, en memoria y sin tocar la hoja REM_SALIDA. Devuelve tablas
 *  estructuradas listas para renderizar en el dialog. */
function Rem9_armarVistaDatos(datos, o) {
  o = o || {};
  var anio = Number(o.anio), mes = Number(o.mes);
  var filtro = Utl_texto(o.sector).trim().toUpperCase() || 'TODOS';
  var modo = o.modo === 'GENERAL' ? 'GENERAL' : 'MES';
  var solo = o.actividad === true || o.actividad === 1 || o.actividad === '1' || o.actividad === 'true';
  var pref = anio + '-' + (mes < 10 ? '0' : '') + mes;

  var lote = (datos.eventos || []).filter(function (e) {
    return filtro === 'TODOS' ? true : Rem_bucketSector(e.SECTOR) === filtro;
  });
  var enPeriodo = lote.filter(function (e) {
    return Utl_texto(e.FECHA_EVENTO).slice(0, 7) === pref;
  });

  var tablas = [], notas = [];
  if (modo === 'MES') {
    var bloqueA = calcularREMBloqueA(lote, { anio: anio, mes: mes });
    var tabla = Rem_tablaDesdeConteos(bloqueA.conteos);
    if (bloqueA.fechasInvalidas > 0) {
      notas.push('Eventos con fecha no interpretable (fuera de todo período): ' + bloqueA.fechasInvalidas);
    }
    var filasT = tabla.filas.map(function (f) {
      return [f.etiqueta].concat(tabla.buckets.map(function (b) { return f.valores[b]; }))
        .concat([f.total]);
    });
    filasT.push(['TOTAL'].concat(tabla.buckets.map(function (b) { return tabla.totalGeneral[b]; }))
      .concat([tabla.totalGeneral.total]));
    tablas.push({ titulo: 'Bloque A — atenciones del mes por nivel G',
                  cols: ['CONCEPTO'].concat(tabla.buckets).concat(['TOTAL']),
                  filas: filasT, clase: 'resumen' });
  }

  var censo = Rem9_censoPacientes(datos.pacientes, datos.eventos, filtro, anio, mes, modo, solo);
  var titulo = modo === 'GENERAL'
    ? 'Censo general del sector — histórico de EVENTOS (' + censo.length + ' pacientes)' +
      (solo ? ' — solo con actividad' : '')
    : (solo
      ? 'Censo del sector — ' + REM_MESES[mes - 1] + ' ' + anio +
        ' (' + censo.length + ' pacientes con actividad en el mes)'
      : 'Censo del sector — ' + REM_MESES[mes - 1] + ' ' + anio + ' (' + censo.length +
        ' pacientes; incluye quienes no tuvieron actividad en el mes)');
  if (solo) {
    notas.push('Filtro «solo con actividad»: la vista excluye pacientes sin eventos en el período consultado.');
  }
  tablas.push({ titulo: titulo,
    cols: ['PACIENTE', 'NOMBRE', 'SECTOR', 'EDAD', 'SEXO', 'EVENTOS',
           'TIENE_INGRESO', 'TIENE_CONTROL', 'TIENE_SEGUIMIENTO', 'TIENE_PLAN',
           'TIENE_GC_INGRESO', 'TIENE_GC_EGRESO'],
    filas: censo, clase: 'censo' });

  return { tablas: tablas, notas: notas,
           meta: { anio: anio, mes: mes, sector: filtro, modo: modo,
                   actividad: solo,
                   pacientes: censo.length, atenciones: enPeriodo.length } };
}

/** PURA: fila DETALLE (28 cols) + validación de completitud por campo.
 *  Campos sin captura en el modelo actual quedan '' y se listan como
 *  PENDIENTE_CAPTURA (nunca inventados). */
function Rem9_filaDetalle(ev, pac, opciones) {
  opciones = opciones || {};
  var f = Rem9_normFecha(ev.FECHA_EVENTO);
  var val = [];
  function chk(campo, valor, minimo) {
    if (!minimo) return;
    val.push({ campo: campo, estado: (valor === '' || valor == null) ? 'WARNING' : 'OK',
               detalle: valor === '' ? 'sin dato en el modelo' : '' });
  }
  var edad = pac.FECHA_NACIMIENTO ? Rem9_edadEn(pac.FECHA_NACIMIENTO, ev.FECHA_EVENTO) : '';
  if (!f) val.push({ campo: 'Fecha/Hora Atención', estado: 'ERROR', detalle: 'evento sin fecha válida' });

  var fila = {};
  REM9_DET_COLS.forEach(function (c) { fila[c] = ''; });
  fila['Profesional'] = Utl_texto(ev.PROFESIONAL);
  fila['Tipo de Profesional'] = Utl_texto(ev.PROFESIONAL_TIPO); // PENDIENTE_CAPTURA
  fila['Ficha Paciente'] = Rem9_rutSinDv(pac.rut);
  fila['Doc.'] = Utl_texto(pac.rut);
  fila['Tipo doc.'] = pac.rut ? 'R.U.N.' : '';
  fila['Nombre Paciente'] = Utl_texto(pac.NOMBRE);
  fila['Edad a la Atención'] = edad;
  fila['Año'] = f ? f.anio : '';
  fila['Mes'] = f ? f.mes : '';
  fila['Día'] = f ? f.dia : '';
  fila['Sexo'] = Rem9_sexoRem(pac.SEXO);
  fila['Género Social'] = '';            // PENDIENTE_CAPTURA (#25)
  fila['Centro Paciente'] = opciones.centro || '';               // CONFIG-derivado opcional
  fila['País Origen'] = '';                // PENDIENTE_CAPTURA (#25)
  fila['Sector'] = Utl_texto(ev.SECTOR) ? 'SECTOR ' + Utl_texto(ev.SECTOR).toUpperCase() : '';
  fila['Fecha/Hora Atención'] = f ? f.iso : '';
  fila['Hora Cierre Atención'] = Utl_texto(ev.horaCierre);       // PENDIENTE_CAPTURA
  fila['Embarazada'] = '';                 // PENDIENTE_CAPTURA (#25)
  fila['Tipo'] = Utl_texto(ev.TIPO_EVENTO);
  fila['Descripción'] = Utl_texto(ev.DESCRIPCION);
  fila['Cantidad'] = (ev.CANTIDAD === '' || ev.CANTIDAD == null) ? '' : Number(ev.CANTIDAD) || '';
  for (var i = 1; i <= 5; i++) {
    fila['Condicionante ' + i] = Utl_texto(ev['condicionante' + i]); // PENDIENTE_CAPTURA
  }
  fila['Comentario'] = Utl_texto(ev.COMENTARIO);
  fila['Programa'] = Utl_texto(opciones.programa);

  chk('Profesional', fila['Profesional'], false);
  chk('Sexo', fila['Sexo'], true);
  chk('Edad a la Atención', fila['Edad a la Atención'], true);
  chk('Sector', fila['Sector'], true);
  chk('Estratificación (snapshot)', Rem9_bucketG(ev.RIESGO_G) ||
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
    pacientesIdx[Utl_texto(p.ID_INTERNO)] = p;
  });

  var enPeriodo = (datos.eventos || []).filter(function (e) {
    var f = Rem9_normFecha(e.FECHA_EVENTO);
    if (!f) return false;
    if (f.anio !== anio || f.mes !== mes) return false;
    if (opciones.sector && opciones.sector !== 'TODOS' &&
        Utl_texto(e.SECTOR).toUpperCase() !== String(opciones.sector).toUpperCase()) return false;
    return true;
  }).sort(function (a, b) { return Utl_texto(a.FECHA_EVENTO) < Utl_texto(b.FECHA_EVENTO) ? -1 : 1; });

  /* DETALLE */
  var detalle = [], validaciones = [], err = 0, warn = 0;
  var porPaciente = {};
  enPeriodo.forEach(function (ev) {
    var pac = pacientesIdx[Utl_texto(ev.ID_INTERNO)] ||
              { RUT: Utl_texto(ev.RUT), NOMBRE: Utl_texto(ev.NOMBRE), SEXO: '',
                FECHA_NACIMIENTO: '' };
    var rd = Rem9_filaDetalle(ev, pac, { centro: opciones.centro, programa: opciones.programa });
    detalle.push(rd.fila); validaciones.push({ id: ev.ID_INTERNO, nombre: pac.NOMBRE,
      estado: rd.estado, campos: rd.validacion });
    if (rd.estado === 'ERROR') err++;
    else if (rd.estado === 'WARNING') warn++;
    var k = Utl_texto(ev.ID_INTERNO);
    (porPaciente[k] = porPaciente[k] || { pac: pac, evs: [] }).evs.push({
      TIPO_EVENTO: ev.TIPO_EVENTO, RIESGO_G: ev.RIESGO_G, FECHA_EVENTO: ev.FECHA_EVENTO });
  });

  /* RESUMEN = CENSO del sector (una fila por paciente, incluso sin actividad
     en el mes; indicadores del período). Reemplazo la derivación histórica
     'del detalle' (#13) para que el REM muestre el universo completo. */
  var resumen = Rem9_censoResumen(datos.pacientes || [], porPaciente, opciones.sector);

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
    return { ID_INTERNO: Utl_texto(p.ID_INTERNO), RUT: Utl_texto(p.RUT),
             NOMBRE: Utl_texto(p.NOMBRE), SEXO: Utl_texto(p.SEXO),
             SECTOR: Utl_texto(p.SECTOR),
             FECHA_NACIMIENTO: p.FECHA_NACIMIENTO instanceof Date
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
 * Endpoint ligero: entrega SOLO los datos del REM ya construidos
 * (resumen + detalle + validación) para que el NAVEGADOR genere el .xlsx
 * localmente con SheetJS. Sin hojas temporales ni export endpoints frágiles.
 * READ ONLY sobre PACIENTES/EVENTOS (#38). Idempotente.
 */
function api_rem9Datos(anio, mes, sectorFiltro, opts) {
  try {
    anio = Number(anio); mes = Number(mes);
    if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
    var filtro = Rem_bucketSector(Utl_texto(sectorFiltro).trim() === '' ? 'todos' : sectorFiltro);
    var datos = _rem9_datos(anio, mes, filtro);
    var c = Rem9_construir(datos, { sector: filtro,
      programa: _rem9_configValor('GENERAL_NOMBRE_SISTEMA') || 'ECICEP',
      centro: '' });
    /* Opciones de procesado (#procesado): excluir filas por estado de validación */
    opts = opts || {};
    if (opts.excluirErrores || opts.excluirAdvertencias) {
      var conservar = [];
      for (var iv = 0; iv < c.validacion.filas.length; iv++) {
        var vst = c.validacion.filas[iv].estado;
        if (vst === 'ERROR' && opts.excluirErrores) continue;
        if (vst === 'WARNING' && opts.excluirAdvertencias) continue;
        conservar.push(c.detalle[iv]);
      }
      c.detalle = conservar;
      c.validacion.excluidas = c.validacion.filas.length - conservar.length;
    }
    if (!c.atenciones) return { ok: false, motivo: 'SIN_EVENTOS_PERIODO',
      nombre: 'REM_ECICEP_' + anio + '_' + (mes < 10 ? '0' : '') + mes + '.xlsx' };
    Log_info('REM', 'datosExcel', 'resumen=' + c.resumen.length + ' detalle=' + c.detalle.length);
    Log_flush();
    return { ok: true, nombre: 'REM_ECICEP_' + anio + '_' + (mes < 10 ? '0' : '') + mes + '.xlsx',
      cabecera: Rem_cabecera(anio, mes, filtro),
      colsResumen: REM9_RES_COLS, colsDetalle: REM9_DET_COLS,
      resumen: c.resumen, detalle: c.detalle, validacion: c.validacion };
  } catch (e) {
    Log_error('REM', 'datosExcel', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}


/** CONFIG set/get puntual (clave=valor en hoja CONFIG). */
function _config_set(clave, valor) {
  var h = Modelo_hoja(HOJAS.CONFIG);
  if (!h) return;
  var vals = Utl_leerBloque(h);
  for (var i = 1; i < vals.length; i++) {
    if (Utl_texto(vals[i][0]) === clave) { h.getRange(i + 1, 2).setValue(valor); return; }
  }
  h.getRange(h.getLastRow() + 1, 1, 1, 3).setValues([[clave, valor, '']]);
}

/** ¿La fuente ya fue importada? → existen pacientes con FUENTE que empieza
 *  por el nombre del archivo. Evita re-importar y duplicar eventos. */
function Fuentes_yaImportada(nombreArchivo) {
  var pacientes = Modelo_leerPacientes();
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].FUENTE).indexOf(nombreArchivo) === 0) return true;
  }
  return false;
}

/** Fuentes pendientes de primera importación (con ID en Drive y sin datos). */
function Fuentes_pendientes() {
  return Object.keys(FUENTES_DRIVE).filter(function (n) {
    var cfg = FUENTES_DRIVE[n];
    if (!cfg.id) return false;
    if (n === 'SEGUIMIENTO ECICEP Sector Amarillo') return false; // flujo propio
    return !Fuentes_yaImportada(n);
  });
}
