/**
 * Sistema ECICEP Unificado — 00_Config
 * Configuración centralizada. Única fuente de verdad de constantes.
 * Sin lógica de negocio ni operaciones I/O (testeable en node y GAS).
 *
 * Convención de nombres globales:
 *   ECICEP / HOJAS / MODELO_PACIENTE / ESTADOS / SINONIMOS_* / CFG_*  (datos)
 *   Utl_ / Norm_ / Log_ / Modelo_ / Pruebas_                          (funciones)
 *
 * v2.0 (ETAPA 2.5): modelo entidad/evento, demografía REM, motor de
 * estratificación configurable, sectores geográficos ≠ estratificación.
 */

// ---------------------------------------------------------------------------
// Identificación del proyecto
// ---------------------------------------------------------------------------
const ECICEP = {
  NOMBRE: 'Sistema ECICEP Unificado',
  VERSION: '0.3.0',
  AMBIENTE: 'DESARROLLO', // DESARROLLO | PRODUCCION
  SPREADSHEET_ID: '1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE',
  TZ: 'America/Santiago'
};

// ---------------------------------------------------------------------------
// Hojas del sistema (DEC-013; inventario completo en MODELO-EVENTOS.md §7)
//   ETAPA 2 creó: CONFIG, PACIENTES, LOG, CONFLICTOS, FUENTES.
//   Las demás se crean en su etapa; NO todas automáticamente.
// ---------------------------------------------------------------------------
const HOJAS = {
  CONFIG: 'CONFIG',
  PACIENTES: 'PACIENTES',       // base consolidada (entidad, estado vigente)
  EVENTOS: 'EVENTOS',           // historial de actividad (ETAPA 3)
  STAGING_IMPORT: 'STAGING_IMPORT', // zona de importación controlada (ETAPA 3)
  LOG: 'LOG',
  CONFLICTOS: 'CONFLICTOS',
  FUENTES: 'FUENTES',
  HOJA_PREDETERMINADA: 'Hoja 1' // la elimina el instalador solo si está vacía
};

// ---------------------------------------------------------------------------
// Hojas de ingreso por sector (ETAPA 3b) — puertas de entrada del usuario.
// Nombres según rotulación de la cliente ("NARANJA"); el sector canónico
// interno es NARANJO (DEC-018). El sector NUNCA se digita: lo define la hoja.
// ---------------------------------------------------------------------------
const HOJAS_INGRESO = {
  'INGRESO_NARANJA': 'NARANJO',
  'INGRESO_AMARILLO': 'AMARILLO',
  'INGRESO_VERDE': 'VERDE'
};

// Campos operativos que el usuario completa en una hoja de ingreso.
// ESTADO_INGRESO / NOTA_SISTEMA son columnas del SISTEMA (no se importan).
const CAMPOS_INGRESO_OPERATIVOS = [
  'NOMBRE', 'RUT', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS',
  'ESTRATIFICACION', 'FECHA_INGRESO', 'DUPLA_INGRESO', 'OBSERVACIONES'
];

// Columnas de la hoja EVENTOS (orden compartido por instalador y escritor)
const COLUMNAS_EVENTOS = [
  'ID_EVENTO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'FECHA_EVENTO', 'TIPO_EVENTO',
  'SECTOR', 'RIESGO_G', 'PROFESIONAL', 'PROFESIONAL_TIPO', 'DESCRIPCION',
  'CANTIDAD', 'OBSERVACIONES', 'FUENTE', 'REGISTRADO_POR', 'FECHA_REGISTRO'
];

// ---------------------------------------------------------------------------
// Sectores geográficos (permanentes) — DEC-018
//   Son división territorial del CESFAM, NO niveles de riesgo.
//   La estratificación G1/G2/G3 es otra dimensión completamente independiente.
//   Canonical interno = NARANJO (así lo escriben las fuentes); "NARANJA"
//   aceptado como alias de entrada hasta confirmar rotulación oficial (#12).
// ---------------------------------------------------------------------------
const SECTORES = {
  OPERATIVOS: ['NARANJO', 'AMARILLO', 'VERDE'],
  VALIDOS: ['NARANJO', 'AMARILLO', 'VERDE', 'MULTIPLE'], // MULTIPLE solo transitorio del sistema
  ALIAS: {
    'NARANJA': 'NARANJO'
  },
  POR_ARCHIVO: {
    'SEGUIMIENTO ECICEP SECTOR AMARILLO': 'AMARILLO',
    'ECICEP NARANJO': 'NARANJO',
    'PCTS. ECICEP DESDE 2023': 'VERDE'
  }
};

// ---------------------------------------------------------------------------
// Tipos de evento (hoja EVENTOS) y estados de solicitud de ingreso
// ---------------------------------------------------------------------------
const TIPOS_EVENTO = {
  VALIDOS: [
    'INGRESO', 'CONTROL', 'SEGUIMIENTO', 'PLAN_CUIDADO',
    'GESTION_CASO_INGRESO', 'GESTION_CASO_EGRESO', 'EGRESO',
    'CAMBIO_SECTOR', 'CAMBIO_ESTRATIFICACION', 'LLAMADO', 'OTRO'
  ],
  SINONIMOS: {
    'PLAN DE CUIDADO': 'PLAN_CUIDADO',
    'PLAN': 'PLAN_CUIDADO',
    'GESTION DE CASO INGRESO': 'GESTION_CASO_INGRESO',
    'GESTION CASOS INGRESO': 'GESTION_CASO_INGRESO',
    'INGRESO GESTION DE CASO': 'GESTION_CASO_INGRESO',
    'GESTION DE CASO EGRESO': 'GESTION_CASO_EGRESO',
    'GESTION CASOS EGRESO': 'GESTION_CASO_EGRESO',
    'EGRESO GESTION DE CASO': 'GESTION_CASO_EGRESO',
    'SEGUIMIENTO A DISTANCIA': 'SEGUIMIENTO',
    'CAMBIO DE SECTOR': 'CAMBIO_SECTOR',
    'CAMBIO DE ESTRATIFICACION': 'CAMBIO_ESTRATIFICACION'
  }
};

const ESTADOS_INGRESO = {
  VALIDOS: ['PENDIENTE', 'VALIDANDO', 'LISTO', 'INGRESADO', 'DUPLICADO', 'REQUIERE_REVISION', 'ERROR']
};

// ---------------------------------------------------------------------------
// Sexo (REM lo requiere; fuentes actuales no lo traen)
// ---------------------------------------------------------------------------
const SEXOS = {
  VALIDOS: ['M', 'F', 'OTRO'],
  SINONIMOS: {
    'MASCULINO': 'M', 'HOMBRE': 'M', 'VARON': 'M',
    'FEMENINO': 'F', 'MUJER': 'F'
  }
};

// ---------------------------------------------------------------------------
// Modelo canónico del paciente v2 (orden = columnas en PACIENTES)
//   tecnico:true → columna técnica (agrupada/oculta al usuario)
//   Estado VIGENTE = caché derivada de EVENTOS (ver MODELO-EVENTOS.md §3)
// ---------------------------------------------------------------------------
const MODELO_PACIENTE = [
  { campo: 'ID_INTERNO',             tipo: 'id',     obligatorio: true,  tecnico: true,  descripcion: 'Identificador interno estable generado por el sistema', regla: 'EC-<base36 tiempo>-<aleatorio>' },
  { campo: 'RUT',                    tipo: 'texto',  obligatorio: true,  tecnico: false, descripcion: 'RUT normalizado cuerpo-DV', regla: 'Norm_normalizarRut: sin puntos, DV mayúscula; sin DV en fuente → solo cuerpo con bandera RUT_SIN_DV' },
  { campo: 'NOMBRE',                 tipo: 'texto',  obligatorio: true,  tecnico: false, descripcion: 'Nombre del paciente', regla: 'Mayúsculas, espacios colapsados, conserva tildes' },
  { campo: 'SEXO',                   tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Sexo registrado (REM)', regla: 'M | F | OTRO | vacío' },
  { campo: 'FECHA_NACIMIENTO',       tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha de nacimiento (base de EDAD/tramos derivados para REM)', regla: 'ISO yyyy-MM-dd' },
  { campo: 'TELEFONOS',              tipo: 'lista',  obligatorio: false, tecnico: false, descripcion: 'Teléfonos normalizados', regla: 'Separados por "/" sin espacios; prefijo país 56 removido' },
  { campo: 'TELEFONO_OBS',           tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Anotaciones del teléfono original (ej: familiar que contesta)', regla: 'Texto libre tal cual la fuente' },
  { campo: 'SECTOR',                 tipo: 'enum',   obligatorio: true,  tecnico: false, descripcion: 'Sector territorial VIGENTE (dimensión independiente de G)', regla: 'NARANJO | AMARILLO | VERDE | MULTIPLE (transitorio)' },
  { campo: 'ESTRATIFICACION',        tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Estratificación VIGENTE: prioridad según cantidad de patologías', regla: 'G1 | G2 | G3 | vacío ("G" sola/NSP quedan vacíos hasta confirmación)' },
  { campo: 'ESTADO',                 tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Estado canónico del paciente en el flujo ECICEP', regla: 'Ver ESTADOS.VALIDOS' },
  { campo: 'DUPLA_INGRESO',          tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Dupla médico+profesional del ingreso', regla: 'Texto normalizado libre' },
  { campo: 'PROFESIONAL_SEGUIMIENTO',tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Profesional asignado al seguimiento', regla: 'Texto normalizado libre' },
  { campo: 'PREINGRESO',             tipo: 'fecha|texto', obligatorio: false, tecnico: false, descripcion: 'Fecha de preingreso o su estado (NO_APLICA, PENDIENTE)', regla: 'Fecha ISO si es parseable; si no, texto de estado en mayúsculas' },
  { campo: 'FECHA_INGRESO',          tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha de ingreso a ECICEP', regla: 'ISO yyyy-MM-dd; inválida → vacío + REQUIERE_REVISION' },
  { campo: 'ULTIMO_SEGUIMIENTO',     tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Caché del último EVENTO SEGUIMIENTO', regla: 'ISO yyyy-MM-dd' },
  { campo: 'ULTIMO_CONTROL',         tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Caché del último EVENTO CONTROL', regla: 'ISO yyyy-MM-dd' },
  { campo: 'PROXIMO_CONTROL',        tipo: 'fecha|texto', obligatorio: false, tecnico: false, descripcion: 'Próximo control agendado', regla: 'ISO si es parseable; si no, texto tal cual + flag' },
  { campo: 'COMPOSICION_CONTROL',    tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Composición del próximo control (M+E, M+N, M/PS...)', regla: 'Texto normalizado libre' },
  { campo: 'OBSERVACIONES',          tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Observaciones libres', regla: 'Texto conservado' },
  { campo: 'CONDICIONES',            tipo: 'lista',  obligatorio: false, tecnico: true,  descripcion: 'Condiciones/patologías detectadas — entrada del motor de estratificación', regla: 'Códigos canónicos separados por ";" (catálogo pendiente #14)' },
  { campo: 'NOMBRE_NORMALIZADO',     tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Nombre sin tildes para búsqueda y matching', regla: 'Utl_sinTildes(NOMBRE)' },
  { campo: 'RUT_DV_VALIDO',          tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'false → DV incorrecto según módulo 11', regla: 'Norm_validarRut' },
  { campo: 'RUT_SIN_DV',             tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'true → la fuente no traía DV (ej: LISTADO Naranjo)', regla: 'Norm_normalizarRut' },
  { campo: 'ESTRAT_ORIGEN',          tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Valor original de la fuente para comparar vs calculada', regla: 'Conservado tal cual' },
  { campo: 'ESTRAT_CALCULADA',       tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Salida del motor de estratificación', regla: 'G1|G2|G3|"" (motor apagado hasta regla oficial)' },
  { campo: 'ESTRAT_FECHA_CALCULO',   tipo: 'fecha',  obligatorio: false, tecnico: true,  descripcion: 'Fecha del cálculo y versión de regla aplicada', regla: 'ISO con hora' },
  { campo: 'FUENTE',                 tipo: 'texto',  obligatorio: true,  tecnico: true,  descripcion: 'Origen exacto de cada dato consolidado', regla: '"archivo|hoja|fila" separados por ";" si hay múltiples' },
  { campo: 'FECHA_ACTUALIZACION',    tipo: 'fecha',  obligatorio: true,  tecnico: true,  descripcion: 'Última modificación hecha por el sistema', regla: 'ISO con hora' },
  { campo: 'REQUIERE_REVISION',      tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'Marca de calidad: conflictos, fechas inválidas, DV erróneo, discrepancia G', regla: 'La asigna integración/consolidación/motor' }
];

// Columnas de fecha en formato hoja (dd/MM/yyyy al instalar)
const MODELO_COLUMNAS_FECHA = [
  'PREINGRESO', 'FECHA_NACIMIENTO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO',
  'ULTIMO_CONTROL', 'PROXIMO_CONTROL', 'ESTRAT_FECHA_CALCULO', 'FECHA_ACTUALIZACION'
];

// ---------------------------------------------------------------------------
// Estados canónicos del paciente (PENDIENTES #6: lista cerrada por confirmar;
// variantes detectadas en levantamiento ya mapeadas)
// ---------------------------------------------------------------------------
const ESTADOS = {
  VALIDOS: ['PENDIENTE', 'AGENDADO', 'INGRESADO', 'NO_CONTESTA', 'FALLECIDO', 'NSP'],
  SINONIMOS: {
    'INGRESADA': 'INGRESADO',
    'INGRESADAO': 'INGRESADO',
    'INGREASO': 'INGRESADO',
    'FALLECIDA': 'FALLECIDO',
    'NO CONTESTA': 'NO_CONTESTA',
    'N/C': 'NO_CONTESTA',
    'NC': 'NO_CONTESTA'
  }
};

// ---------------------------------------------------------------------------
// Sinónimos de encabezados (solo equivalencias CONFIRMADAS en levantamiento,
// ver FUENTES-DATOS.md §4). Claves comparadas vía Utl_claveAlnum.
// Equivalencias ambiguas NO van aquí: DUPLA (LISTADO Naranjo = disciplina),
// PROFESIONAL mezclada (Naranjo), COLUMN 12, COLUMNA 1, EVALUACIÓN DE PIE,
// ASISTENCIA, PATOLOGIAS, QUIEN DERIVA, MOTIVO, FECHA DE LLAMADO (→ eventos).
// ---------------------------------------------------------------------------
const SINONIMOS_ENCABEZADOS = {
  'NOMBRE': 'NOMBRE',
  'NOMBRES': 'NOMBRE',
  'USUARIO': 'NOMBRE',
  'NOMBRE PACIENTE': 'NOMBRE',
  'RUT': 'RUT',
  'SEXO': 'SEXO',
  'TELEFONO': 'TELEFONO',
  'TELEFONOS': 'TELEFONO',
  'FONO': 'TELEFONO',
  'CELULAR': 'TELEFONO',
  'ESTRATIFICACION': 'ESTRATIFICACION',
  'G': 'ESTRATIFICACION',            // confirmado: encabezado "G" en Sector Amarillo
  'PREINGRESO': 'PREINGRESO',
  'PRE INGRESO': 'PREINGRESO',
  'INGRESO': 'FECHA_INGRESO',        // confirmado: Amarillo usa INGRESO como fecha
  'FECHA DE INGRESO': 'FECHA_INGRESO',
  'FECHA INGRESO': 'FECHA_INGRESO',
  'J': 'FECHA_INGRESO',              // confirmado: encabezado "J" en Naranjo consolidada
  'FECHA NACIMIENTO': 'FECHA_NACIMIENTO',
  'FECHA DE NACIMIENTO': 'FECHA_NACIMIENTO',
  'DUPLA INGRESO': 'DUPLA_INGRESO',
  'MEDICO DUPLA': 'DUPLA_INGRESO',   // "MEDICO /DUPLA" tras quitar puntuación
  'SEGUIMIENTO': 'ULTIMO_SEGUIMIENTO',
  'SEGUIMIENTO TELEFONICO': 'ULTIMO_SEGUIMIENTO',
  'CONTROL': 'ULTIMO_CONTROL',
  'PROXIMO CONTROL': 'PROXIMO_CONTROL',
  'FECHA PROX CONTROL': 'PROXIMO_CONTROL',
  'PROXIMA FECHA CONTROL': 'PROXIMO_CONTROL',
  'PROFESIONAL': 'PROFESIONAL_SEGUIMIENTO',
  'PREFESIONAL': 'PROFESIONAL_SEGUIMIENTO', // typo confirmado en Verde (preingresos)
  'OBSERVACIONES': 'OBSERVACIONES',
  'OTROS': 'OBSERVACIONES',
  'OBSERVACION': 'OBSERVACIONES'
};

// Encabezados presentes en las fuentes pero aún sin destino definido
// (PENDIENTES #4/#11/#15): conocidos-pero-sin-mapeo.
const ENCABEZADOS_SIN_DESTINO = [
  'DUPLA', 'COLUMN 12', 'COLUMNA 1', 'EVALUACION DE PIE', 'ASISTENCIA',
  'PATOGIAS', 'PATOLOGIAS', 'QUIEN DERIVA', 'MOTIVO', 'FECHA',
  'OBSERVACION EXAMENES SOLICITADOS', 'OBSERVACION PENDIENTE',
  'MEDICO DUPLA INGRESO', 'ESTATIFICACION', 'FECHA DE LLAMADO'
];

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
const CFG_FECHAS = {
  ANO_MIN: 2015,           // eventos: fuera de rango → fecha inválida (no se corrige en silencio)
  ANO_MAX: 2040,
  ANO_MIN_NACIMIENTO: 1900, // fechas de nacimiento admiten años mucho más antiguos
  FORMATO_HOJA: 'dd/MM/yyyy',
  ZONA: ECICEP.TZ
};

// ---------------------------------------------------------------------------
// Estratificación automática (ESTRATIFICACION.md)
//   REGLA_DISPONIBLE=false hasta recibir tabla oficial cantidad→G. Motor APAGADO.
// ---------------------------------------------------------------------------
const CFG_ESTRATIFICACION = {
  REGLA_DISPONIBLE: false,
  MOTIVO_SIN_REGLA: 'REGLA_NO_CONFIGURADA'
};

// ---------------------------------------------------------------------------
// Logging (DEC-014): búfer en memoria + escritura por lotes
// ---------------------------------------------------------------------------
const CFG_LOG = {
  HOJA: HOJAS.LOG,
  NIVEL: 'INFO',           // DEBUG < INFO < WARNING < ERROR (DEBUG se descarta)
  MAX_BUFFER: 50,          // auto-flush al alcanzar N entradas
  MAX_FILAS_HOJA: 5000     // recorte del histórico
};

// ---------------------------------------------------------------------------
// Caché (DEC-015): solo índices/parámetros de lectura, TTL corto,
// invalidación explícita al escribir. Nunca datos en curso de modificación.
// ---------------------------------------------------------------------------
const CFG_CACHE = {
  PREFIJO: 'ECICEP:v' + ECICEP.VERSION.replace(/\./g, '') + ':',
  TTL_DEFECTO_SEG: 60
};
