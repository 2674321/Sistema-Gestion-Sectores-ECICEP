/**
 * Sistema ECICEP Unificado — 11_DatosPrueba
 * Dataset FICTICIO para pruebas deterministas del núcleo (DEC-016).
 * Nombres, RUTs, teléfonos y fechas inventados. Los formatos replican los
 * patrones reales detectados en el levantamiento (FUENTES-DATOS.md), pero
 * ningún dato pertenece a una persona real.
 *
 * Este archivo vive en src/ para sincronizarse con Apps Script vía clasp;
 * es la única fuente de casos para las pruebas (node y GAS usan lo mismo).
 */

const DATASET_NORMALIZACION = {

  ruts: [
    // [entrada, estadoEsperado, rutEsperado]
    ['12.345.678-5', 'OK', '12345678-5'],
    ['12345678-5', 'OK', '12345678-5'],
    ['9876543-3', 'OK', '9876543-3'],
    ['11111111-1', 'OK', '11111111-1'],
    ['8888888-k', 'OK', '8888888-K'],        // DV K en minúscula
    ['', 'VACIO', ''],
    [null, 'VACIO', ''],
    ['12345678-4', 'INVALIDO', '12345678-4'], // DV erróneo (esperado 5)
    ['ABCDE-1', 'INVALIDO', ''],              // caracteres imposibles
    ['72910265', 'SIN_DV', '72910265'],       // numérico sin DV (patrón LISTADO Naranjo)
    [72910265, 'SIN_DV', '72910265']          // float de Excel sin DV
  ],

  telefonos: [
    // [entrada, estadoEsperado, telefonosEsperados, observacionesEsperadas]
    [993617702, 'OK', ['993617702'], []],
    ['+56912345678', 'OK', ['912345678'], []],
    ['56912345678', 'OK', ['912345678'], []],
    ['86273266/94561465', 'PARCIAL', ['86273266', '94561465'], []],   // dos cortos
    ['76766559-76766559', 'PARCIAL', ['76766559'], []],               // duplicado
    ['981998384/64400270 sandra', 'PARCIAL', ['64400270', '981998384'], ['SANDRA']],
    ['921728970 ESPOSO', 'OK', ['921728970'], ['ESPOSO']],
    ['9/59355587', 'PARCIAL', ['59355587'], ['NUMERO DESCARTADO: 9']],
    ['', 'VACIO', [], []],
    [null, 'VACIO', [], []],
    ['NO TIENE', 'VACIO', [], ['NO TIENE']]
  ],

  fechas: [
    // [entrada, estadoEsperado, isoEsperado]
    ['13/05/2025', 'VALIDA', '2025-05-13'],
    ['2026-03-01', 'VALIDA', '2026-03-01'],
    ['24/03/2026/', 'VALIDA', '2026-03-24'],   // separador final suelto (patrón real)
    ['05/2026', 'MES_ANO', '2026-05'],
    ['11/26', 'MES_ANO', '2026-11'],           // mm/aa visto en PRÓXIMO CONTROL
    ['', 'VACIA', ''],
    [null, 'VACIA', ''],
    ['-', 'VACIA', ''],
    ['15/24/2026', 'INVALIDA', ''],            // mes 24
    ['32/01/2026', 'INVALIDA', ''],            // día 32
    ['10-02-0205', 'INVALIDA', ''],            // año 205 (typo real detectado)
    ['#VALUE!', 'INVALIDA', ''],
    ['NO SE PRESENTO', 'NO_RECONOCIDA', ''],
    ['PENDIENTE', 'NO_RECONOCIDA', '']
  ],

  nombres: [
    // [entrada, nombreEsperado]
    ['lucia romero ', 'LUCIA ROMERO'],
    ['ELENA  DE LO RODRIGUEZ CALLEJAS', 'ELENA DE LO RODRIGUEZ CALLEJAS'],
    ['Andrés Ñancúpil Pérez', 'ANDRÉS ÑANCÚPIL PÉREZ'],   // conserva tildes y Ñ
    ['MARÍA, JOSÉ', 'MARÍA JOSÉ'],                        // puntuación → espacio
    ['', '']
  ],

  encabezados: [
    // [entrada, canonicoEsperado(null = sin mapeo), conocidoEsperado, ambiguoEsperado]
    ['TELÉFONO', 'TELEFONO', true, false],
    ['telefono', 'TELEFONO', true, false],
    ['FONO', 'TELEFONO', true, false],
    ['CELULAR ', 'TELEFONO', true, false],
    ['USUARIO', 'NOMBRE', true, false],
    ['NOMBRE PACIENTE', 'NOMBRE', true, false],
    ['G', 'ESTRATIFICACION', true, false],
    ['ESTRATIFICACIÓN', 'ESTRATIFICACION', true, false],
    ['J', 'FECHA_INGRESO', true, false],
    ['INGRESO', 'FECHA_INGRESO', true, false],
    ['FECHA PROX. CONTROL', 'PROXIMO_CONTROL', true, false],
    ['PRÓXIMO CONTROL', 'PROXIMO_CONTROL', true, false],
    ['PROXIMA FECHA CONTROL ', 'PROXIMO_CONTROL', true, false],
    ['MEDICO /DUPLA ', 'DUPLA_INGRESO', true, false],
    ['PREFESIONAL', 'PROFESIONAL_SEGUIMIENTO', true, false],
    ['SEGUIMIENTO TELEFONICO', 'ULTIMO_SEGUIMIENTO', true, false],
    ['DUPLA', null, false, true],            // ambiguo: disciplina en LISTADO Naranjo
    ['COLUMN 12', null, false, true],        // sin destino definido
    ['COLUMNA DESCONOCIDA XYZ', null, false, false]
  ],

  estados: [
    // [entrada, esperado]
    ['Pendiente', 'PENDIENTE'],
    ['INGRESADA ', 'INGRESADO'],
    ['INGRESADAO', 'INGRESADO'],
    ['FALLECIDA', 'FALLECIDO'],
    ['No Contesta', 'NO_CONTESTA'],
    ['AGENDADO', 'AGENDADO'],
    ['NSP', 'NSP'],
    ['', '']
  ],

  estratificaciones: [
    // [entrada, esperado]
    ['G1', 'G1'], ['g2', 'G2'], [' G3 ', 'G3'],
    ['G', ''],     // ambigua hasta confirmación (PENDIENTES #5)
    ['Z', ''],     // valor basura detectado en Naranjo
    ['NSP', ''],
    ['', '']
  ],

  sectores: [
    // [entrada, estadoEsperado, sectorEsperado]
    ['Sector Amarillo', 'OK', 'AMARILLO'],
    ['SECTOR VERDE', 'OK', 'VERDE'],
    ['naranjo', 'OK', 'NARANJO'],
    ['NARANJA', 'OK', 'NARANJO'],   // alias aceptado (discrepancia rotulación #12)
    ['', 'VACIO', ''],
    ['ROSARIO', 'INVALIDO', '']
  ],

  sexos: [
    // [entrada, esperado]
    ['F', 'F'], ['MASCULINO', 'M'], ['mujer', 'F'], ['HOMBRE ', 'M'],
    ['OTRO', 'OTRO'], ['X', ''], ['','']
  ],

  tiposEvento: [
    // [entrada, esperado]
    ['INGRESO', 'INGRESO'],
    ['Control', 'CONTROL'],
    ['SEGUIMIENTO A DISTANCIA', 'SEGUIMIENTO'],
    ['Plan de cuidado', 'PLAN_CUIDADO'],
    ['GESTION DE CASO INGRESO', 'GESTION_CASO_INGRESO'],
    ['CAMBIO DE SECTOR', 'CAMBIO_SECTOR'],
    ['EGRESO', 'EGRESO'],
    ['', '']
  ]
};
