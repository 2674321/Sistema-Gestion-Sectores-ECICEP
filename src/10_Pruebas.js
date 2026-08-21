/**
 * Sistema ECICEP Unificado — 10_Pruebas
 * Pruebas deterministas del núcleo (DEC-016). Usan EXCLUSIVAMENTE datos
 * ficticios (11_DatosPrueba) y no dependen de hojas, red ni hora actual.
 * Corren igual en Apps Script (menú ECICEP → 🧪) y en node local
 * (tests/ejecutar_local.mjs).
 */

/**
 * Ejecuta todas las suites. @returns {total, pasados, fallidos, detalles:[{nombre,ok,error}]}
 */
function Pruebas_ejecutarTodo() {
  var detalles = [];
  var t = function (nombre, fn) {
    try { fn(); detalles.push({ nombre: nombre, ok: true }); }
    catch (e) { detalles.push({ nombre: nombre, ok: false, error: e && e.message ? e.message : String(e) }); }
  };
  var A = {
    cierto: function (cond, msg) { if (!cond) throw new Error(msg || 'condición falsa'); },
    igual: function (obtenido, esperado, msg) {
      if (obtenido !== esperado) throw new Error((msg || '') + ' · esperado=' + JSON.stringify(esperado) + ' obtenido=' + JSON.stringify(obtenido));
    },
    arreglos: function (obtenido, esperado, msg) {
      var a = JSON.stringify(obtenido), b = JSON.stringify(esperado);
      if (a !== b) throw new Error((msg || '') + ' · esperado=' + b + ' obtenido=' + a);
    }
  };

  _pruebas_rut(t, A);
  _pruebas_telefonos(t, A);
  _pruebas_fechas(t, A);
  _pruebas_nombres(t, A);
  _pruebas_encabezados(t, A);
  _pruebas_estados(t, A);
  _pruebas_estratificacion(t, A);
  _pruebas_sectores(t, A);
  _pruebas_sexos(t, A);
  _pruebas_tipos_evento(t, A);
  _pruebas_utilidades(t, A);

  var pasados = detalles.filter(function (d) { return d.ok; }).length;
  return { total: detalles.length, pasados: pasados, fallidos: detalles.length - pasados, detalles: detalles };
}

// ---------------------------------------------------------------------------
function _pruebas_rut(t, A) {
  DATASET_NORMALIZACION.ruts.forEach(function (caso) {
    t('RUT: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarRut(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.igual(r.rut, caso[2], 'rut');
    });
  });
  t('RUT: DV calculado para cuerpo sin DV', function () {
    var r = Norm_normalizarRut('72910265');
    A.igual(r.dvCalculado, Norm_dvModulo11('72910265'), 'dvCalculado coherente con módulo 11');
    A.cierto(r.rut.indexOf('-') === -1, 'no se inventa DV');
  });
  t('RUT: validarRut true/false', function () {
    A.cierto(Norm_validarRut('12.345.678-5'), 'válido');
    A.cierto(!Norm_validarRut('12345678-4'), 'inválido');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_telefonos(t, A) {
  DATASET_NORMALIZACION.telefonos.forEach(function (caso) {
    t('TEL: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarTelefono(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.arreglos(r.telefonos, caso[2], 'telefonos');
      A.arreglos(r.observaciones, caso[3], 'observaciones');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_fechas(t, A) {
  DATASET_NORMALIZACION.fechas.forEach(function (caso) {
    t('FECHA: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarFecha(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.igual(r.iso, caso[2], 'iso');
    });
  });
  t('FECHA: objeto Date válido', function () {
    var r = Norm_normalizarFecha(new Date(2025, 4, 13));
    A.igual(r.estado, 'VALIDA', 'estado');
    A.igual(r.iso, '2025-05-13', 'iso');
  });
  t('FECHA: Date con serial corrupto (año imposible)', function () {
    var r = Norm_normalizarFecha(new Date(2793723, 0, 1)); // serial corrupto visto en fuentes
    A.igual(r.estado, 'INVALIDA', 'estado');
    A.cierto(r.fecha === null, 'sin fecha inventada');
  });
  t('FECHA: MES_ANO no inventa día', function () {
    var r = Norm_normalizarFecha('05/2026');
    A.cierto(r.fecha === null, 'fecha null');
    A.igual(r.iso, '2026-05', 'iso mes/año');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_nombres(t, A) {
  DATASET_NORMALIZACION.nombres.forEach(function (caso) {
    t('NOMBRE: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarNombre(caso[0]);
      A.igual(r.nombre, caso[1], 'nombre');
    });
  });
  t('NOMBRE: clave de matching sin tildes', function () {
    A.igual(Norm_claveNombre('María Ñancú'), 'MARIA NANCU', 'clave sin tildes');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_encabezados(t, A) {
  DATASET_NORMALIZACION.encabezados.forEach(function (caso) {
    t('ENC: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_mapearEncabezado(caso[0]);
      A.igual(r.canonico, caso[1], 'canonico');
      A.igual(r.conocido, caso[2], 'conocido');
      A.igual(r.ambiguo, caso[3], 'ambiguo');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_estados(t, A) {
  DATASET_NORMALIZACION.estados.forEach(function (caso) {
    t('ESTADO: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarEstado(caso[0]), caso[1], 'estado normalizado');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_estratificacion(t, A) {
  DATASET_NORMALIZACION.estratificaciones.forEach(function (caso) {
    t('ESTRAT: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarEstratificacion(caso[0]), caso[1], 'estratificación');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_sectores(t, A) {
  DATASET_NORMALIZACION.sectores.forEach(function (caso) {
    t('SECTOR: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarSector(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.igual(r.sector, caso[2], 'sector');
    });
  });
  t('SECTOR: dimensiones independientes sector≠G', function () {
    // Un paciente del Sector Amarillo puede ser G3: no existe lógica que cruce ambas.
    A.igual(Norm_normalizarSector('Amarillo').sector, 'AMARILLO', 'sector');
    A.igual(Norm_normalizarEstratificacion('G3'), 'G3', 'estratificación independiente');
    A.igual(Norm_normalizarSector('G3').estado, 'INVALIDO', 'G no es un sector');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_sexos(t, A) {
  DATASET_NORMALIZACION.sexos.forEach(function (caso) {
    t('SEXO: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarSexo(caso[0]), caso[1], 'sexo normalizado');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_tipos_evento(t, A) {
  DATASET_NORMALIZACION.tiposEvento.forEach(function (caso) {
    t('TIPO EV: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarTipoEvento(caso[0]), caso[1], 'tipo de evento');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_utilidades(t, A) {
  t('UTL: claveAlnum de encabezados reales', function () {
    A.igual(Utl_claveAlnum('FECHA PROX. CONTROL'), 'FECHAPROXCONTROL');
    A.igual(Utl_claveAlnum('MEDICO /DUPLA'), 'MEDICODUPLA');
    A.igual(Utl_claveAlnum('TELÉFONO'), 'TELEFONO');
  });
  t('UTL: partir() divide bloques exactos', function () {
    var b = Utl_partir([1, 2, 3, 4, 5], 2);
    A.igual(b.length, 3, 'cantidad de bloques');
    A.igual(b[2].length, 1, 'tamaño último bloque');
  });
  t('UTL: agruparPor agrupa por clave', function () {
    var g = Utl_agruparPor([{ s: 'A' }, { s: 'B' }, { s: 'A' }], function (x) { return x.s; });
    A.igual(g.get('A').length, 2, 'grupo A');
    A.igual(g.get('B').length, 1, 'grupo B');
  });
  t('UTL: vacío seguro', function () {
    A.cierto(Utl_vacio(null) && Utl_vacio('   ') && Utl_vacio(''), 'vacíos detectados');
    A.igual(Utl_texto(null), '', 'texto nulo');
  });
}
