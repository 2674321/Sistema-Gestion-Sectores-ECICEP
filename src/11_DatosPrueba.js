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

/**
 * Dataset ETAPA 3 — staging / identificación / eventos.
 * 100% FICTICIO: nombres inventados, RUTs válidos construidos con módulo 11,
 * teléfonos y fechas artificiales que replican patrones reales de formato.
 */
const DATASET_STAGING = {

  // Pacientes ficticios "ya existentes" en PACIENTES para probar identificación
  base: [
    { ID_INTERNO: 'EC-TEST-0001', RUT: '12345678-5', NOMBRE: 'MARÍA PAZ SOTO VEGA', TELEFONOS: '987654321', SECTOR: 'VERDE' },
    { ID_INTERNO: 'EC-TEST-0002', RUT: '9876543-3', NOMBRE: 'JUAN PEREZ LOBOS', TELEFONOS: '964835691/912345678', SECTOR: 'AMARILLO' },
    // Paciente proveniente de fuente SIN DV (patrón LISTADO Naranjo): solo cuerpo
    { ID_INTERNO: 'EC-TEST-0003', RUT: '5555555', NOMBRE: 'ROSA FLOR INDIGO', TELEFONOS: '', SECTOR: 'NARANJO' },
    // Registro sucio: DV almacenado incorrecto (cuerpo 22222222, DV correcto es 2)
    { ID_INTERNO: 'EC-TEST-0004', RUT: '22222222-9', NOMBRE: 'BRUNO BASE CUERPO', TELEFONOS: '', SECTOR: 'VERDE' }
  ],

  casos: {
    // 1. paciente nuevo limpio
    nuevoOk: {
      origen: { archivo: 'PRUEBA_INGRESO_VERDE', hoja: 'INGRESO_VERDE', fila: 2, sector: 'VERDE' },
      valores: {
        NOMBRE: 'Carla Beatriz Muñoz Rojas', RUT: '15234987-4', SEXO: 'F',
        FECHA_NACIMIENTO: '1990-04-12', TELEFONOS: '968112233',
        ESTRATIFICACION: 'G2', ESTADO: 'Pendiente', FECHA_INGRESO: '05/03/2026',
        DUPLA_INGRESO: 'DR ROJAS + NTA TAPIA'
      }
    },
    // 2. paciente existente por RUT exacto
    existenteRut: {
      origen: { archivo: 'PRUEBA_INGRESO_AMARILLO', hoja: 'INGRESO_AMARILLO', fila: 3, sector: 'AMARILLO' },
      valores: {
        NOMBRE: 'Maria Paz Soto Vega', RUT: '12.345.678-5', TELEFONOS: '+56987654321',
        SECTOR: 'AMARILLO', FECHA_INGRESO: '10/01/2026'
      }
    },
    // 3. duplicado exacto dentro del lote (mismo RUT)
    dupLoteA: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 10, sector: 'VERDE' },
      valores: { NOMBRE: 'Ana Uno Dos', RUT: '11111111-1', SECTOR: 'VERDE', FECHA_INGRESO: '01/02/2026' }
    },
    dupLoteB: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 11, sector: 'VERDE' },
      valores: { NOMBRE: 'Ana Uno Dos', RUT: '11.111.111-1', SECTOR: 'VERDE', FECHA_INGRESO: '02/02/2026' }
    },
    // 4. posible duplicado débil (solo nombre) contra la base
    posibleDuplicadoNombre: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 20, sector: 'VERDE' },
      valores: { NOMBRE: 'Juan Perez Lobos', RUT: '11111111-1', SECTOR: 'VERDE', FECHA_INGRESO: '03/02/2026' }
    },
    // 5. RUT inválido
    rutInvalido: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 30, sector: 'VERDE' },
      valores: { NOMBRE: 'Bruno Diaz Claro', RUT: '12345678-4', SECTOR: 'VERDE', FECHA_INGRESO: '04/02/2026' }
    },
    // 6. RUT ausente
    rutAusente: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 31, sector: 'VERDE' },
      valores: { NOMBRE: 'Clara Bello Soto', SECTOR: 'VERDE', FECHA_INGRESO: '05/02/2026' }
    },
    // 7. teléfono deformado
    telefonoDeformado: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 40, sector: 'NARANJO' },
      valores: {
        NOMBRE: 'Daniela Elena Requena', RUT: '8888888-k', SECTOR: 'NARANJO',
        TELEFONOS: '86273266/94561465', FECHA_INGRESO: '06/02/2026'
      }
    },
    // 8. fecha inválida (no debe crashear)
    fechaInvalida: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 50, sector: 'VERDE' },
      valores: { NOMBRE: 'Elsa Capuntas Delo', RUT: '9876543-3', SECTOR: 'VERDE', FECHA_INGRESO: '15/24/2026' }
    },
    // 9+10. sector válido e inválido
    sectorValido: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 60, sector: 'AMARILLO' },
      valores: { NOMBRE: 'Fabio Fabuloso Fabre', RUT: '22222222-2', SECTOR: 'SECTOR AMARILLO', FECHA_INGRESO: '07/02/2026' }
    },
    sectorInvalido: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 61, sector: 'VERDE' },
      valores: { NOMBRE: 'Gilda Gonzalez Garcia', RUT: '33333333-3', SECTOR: 'ROSARIO', FECHA_INGRESO: '08/02/2026' }
    },
    // 11. alias NARANJA aceptado → NARANJO
    aliasNaranja: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 70, sector: 'NARANJA' },
      valores: { NOMBRE: 'Hilda Hurtado Henares', RUT: '44444444-4', SECTOR: 'SECTOR NARANJA', TELEFONOS: '955554444', FECHA_INGRESO: '09/02/2026' }
    },
    // 12. intento de pasar G3 como sector
    g3ComoSector: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 80, sector: 'VERDE' },
      valores: { NOMBRE: 'Ivan Ibarra Iriarte', RUT: '66666666-6', SECTOR: 'G3', ESTRATIFICACION: 'G3', FECHA_INGRESO: '11/02/2026' }
    },
    // 14. paciente fuente sin DV que coincide por cuerpo+nombre (MATCH_PARCIAL)
    sinDvCoincide: {
      origen: { archivo: 'LISTADO PRUEBA NARANJO', hoja: 'LISTADO', fila: 90, sector: 'NARANJO' },
      valores: { NOMBRE: 'Rosa Flor Indigo', RUT: '5555555', SECTOR: 'NARANJO', FECHA_INGRESO: '12/02/2026' }
    },
    // nombre+teléfono contra la base (RUT ausente)
    nombreTelefono: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 95, sector: 'AMARILLO' },
      valores: { NOMBRE: 'Juan Perez Lobos', TELEFONOS: '912345678', SECTOR: 'AMARILLO', FECHA_INGRESO: '13/02/2026' }
    },
    // conflicto: cuerpo existe con DV distinto en base (registro sucio EC-TEST-0004)
    cuerpoConDvDistinto: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 96, sector: 'VERDE' },
      valores: { NOMBRE: 'Bruno Base Cuerpo', RUT: '22222222-2', SECTOR: 'VERDE', FECHA_INGRESO: '14/02/2026' }
    },
    // estratificación no clasificable ('Z') → WARNING + conservar original
    estratBasura: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 97, sector: 'NARANJO' },
      valores: { NOMBRE: 'Jorge Jara Jara', RUT: '77777777-6', SECTOR: 'NARANJO', ESTRATIFICACION: 'Z', FECHA_INGRESO: '15/02/2026' }
    },
    // preingreso semántico textual se conserva
    preingresoTexto: {
      origen: { archivo: 'MUESTRA', hoja: 'H1', fila: 98, sector: 'VERDE' },
      valores: { NOMBRE: 'Karla Kastillo Konde', RUT: '12121212-9', SECTOR: 'VERDE', PREINGRESO: 'NO APLICA', FECHA_INGRESO: '16/02/2026' }
    }
  },

  // Eventos representativos sobre el caso nuevoOk (tipos del programa)
  eventosTipos: [
    { tipoEvento: 'INGRESO', fechaIso: '2026-03-05' },
    { tipoEvento: 'CONTROL', fechaIso: '2026-06-09' },
    { tipoEvento: 'SEGUIMIENTO', fechaIso: '2026-07-01' },
    { tipoEvento: 'PLAN_CUIDADO', fechaIso: '2026-07-15' }
  ]
};
