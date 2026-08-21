/**
 * Sistema ECICEP Unificado — 00_Config
 * Configuración centralizada. Única fuente de verdad de constantes.
 * Sin lógica de negocio ni operaciones I/O (testeable en node y GAS).
 *
 * Convención de nombres globales:
 *   ECICEP / HOJAS / MODELO_PACIENTE / ESTADOS / SINONIMOS_* / CFG_*  (datos)
 *   Utl_ / Norm_ / Log_ / Modelo_ / Pruebas_                          (funciones)
 */

// ---------------------------------------------------------------------------
// Identificación del proyecto
// ---------------------------------------------------------------------------
const ECICEP = {
  NOMBRE: 'Sistema ECICEP Unificado',
  VERSION: '0.2.0',
  AMBIENTE: 'DESARROLLO', // DESARROLLO | PRODUCCION
  SPREADSHEET_ID: '1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE',
  TZ: 'America/Santiago'
};

// ---------------------------------------------------------------------------
// Hojas del sistema (DEC-013)
//   ETAPA 2 crea: CONFIG, PACIENTES, LOG, CONFLICTOS, FUENTES.
//   INICIO / DASHBOARD / FICHA / SEGUIMIENTO se construyen en etapas de UI.
// ---------------------------------------------------------------------------
const HOJAS = {
  CONFIG: 'CONFIG',
  PACIENTES: 'PACIENTES',       // base consolidada y normalizada
  LOG: 'LOG',
  CONFLICTOS: 'CONFLICTOS',
  FUENTES: 'FUENTES',
  HOJA_PREDETERMINADA: 'Hoja 1' // la elimina el instalador solo si está vacía
};

// ---------------------------------------------------------------------------
// Modelo canónico del paciente (orden = orden de columnas en PACIENTES)
//   tecnico:true  → columna técnica (se agrupa y oculta al usuario)
//   Los valores originales de las fuentes viven en FUENTE/staging, nunca
//   se pierden: la capa de integración conserva trazabilidad fila a fila.
// ---------------------------------------------------------------------------
const MODELO_PACIENTE = [
  { campo: 'ID_INTERNO',             tipo: 'id',     obligatorio: true,  tecnico: true,  descripcion: 'Identificador interno estable generado por el sistema', regla: 'EC-<base36 tiempo>-<aleatorio>' },
  { campo: 'RUT',                    tipo: 'texto',  obligatorio: true,  tecnico: false, descripcion: 'RUT normalizado cuerpo-DV', regla: 'Norm_normalizarRut: sin puntos, DV mayúscula; si la fuente no tenía DV queda solo el cuerpo con bandera RUT_SIN_DV' },
  { campo: 'NOMBRE',                 tipo: 'texto',  obligatorio: true,  tecnico: false, descripcion: 'Nombre del paciente', regla: 'Mayúsculas, espacios colapsados, conserva tildes' },
  { campo: 'TELEFONOS',              tipo: 'lista',  obligatorio: false, tecnico: false, descripcion: 'Teléfonos normalizados', regla: 'Separados por "/" sin espacios; prefijo país 56 removido' },
  { campo: 'TELEFONO_OBS',           tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Anotaciones del teléfono original (ej: familiar que contesta)', regla: 'Texto libre tal cual la fuente' },
  { campo: 'SECTOR',                 tipo: 'enum',   obligatorio: true,  tecnico: false, descripcion: 'Sector de origen del registro', regla: 'AMARILLO | VERDE | NARANJO | MULTIPLE' },
  { campo: 'ESTRATIFICACION',        tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Estratificación de riesgo', regla: 'G1 | G2 | G3 | vacío ("G" sin nivel o NSP quedan vacíos hasta confirmación)' },
  { campo: 'DUPLA_INGRESO',          tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Dupla médico+profesional del ingreso', regla: 'Texto normalizado libre' },
  { campo: 'PROFESIONAL_SEGUIMIENTO',tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Profesional asignado al seguimiento', regla: 'Texto normalizado libre' },
  { campo: 'ESTADO',                 tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Estado canónico del paciente en el flujo ECICEP', regla: 'Ver ESTADOS.VALIDOS' },
  { campo: 'PREINGRESO',             tipo: 'fecha|texto', obligatorio: false, tecnico: false, descripcion: 'Fecha de preingreso o su estado (NO_APLICA, PENDIENTE)', regla: 'Fecha ISO si es parseable; si no, texto de estado en mayúsculas' },
  { campo: 'FECHA_INGRESO',          tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha de ingreso a ECICEP', regla: 'ISO yyyy-MM-dd; inválida → vacío + REQUIERE_REVISION' },
  { campo: 'FECHA_LLAMADO',          tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha del último llamado (flujo LISTADO Naranjo)', regla: 'ISO yyyy-MM-dd' },
  { campo: 'ULTIMO_SEGUIMIENTO',     tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha del último seguimiento telefónico registrado', regla: 'ISO yyyy-MM-dd' },
  { campo: 'ULTIMO_CONTROL',         tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha del último control realizado', regla: 'ISO yyyy-MM-dd' },
  { campo: 'PROXIMO_CONTROL',        tipo: 'fecha|texto', obligatorio: false, tecnico: false, descripcion: 'Próximo control agendado', regla: 'ISO si es parseable; si no, texto tal cual + REQUIERE_REVISION' },
  { campo: 'COMPOSICION_CONTROL',    tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Composición del próximo control (M+E, M+N, M/PS...)', regla: 'Texto normalizado libre' },
  { campo: 'OBSERVACIONES',          tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Observaciones libres', regla: 'Texto conservado' },
  { campo: 'NOMBRE_NORMALIZADO',     tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Nombre sin tildes para búsqueda y matching', regla: 'Utl_sinTildes(NOMBRE)' },
  { campo: 'RUT_DV_VALIDO',          tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'false → DV incorrecto según módulo 11', regla: 'Norm_validarRut' },
  { campo: 'RUT_SIN_DV',             tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'true → la fuente no traía DV (ej: LISTADO Naranjo)', regla: 'Norm_normalizarRut' },
  { campo: 'FUENTE',                 tipo: 'texto',  obligatorio: true,  tecnico: true,  descripcion: 'Origen exacto de cada dato consolidado', regla: '"archivo|hoja|fila" separados por ";" si hay múltiples' },
  { campo: 'FECHA_ACTUALIZACION',    tipo: 'fecha',  obligatorio: true,  tecnico: true,  descripcion: 'Última modificación hecha por el sistema', regla: 'ISO con hora' },
  { campo: 'REQUIERE_REVISION',      tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'Marca de calidad: conflictos, fechas inválidas, DV erróneo', regla: 'La asigna la capa de integración/consolidación' }
];

// Columnas de fecha en formato hoja (para dar formato dd/MM/yyyy al instalar)
const MODELO_COLUMNAS_FECHA = ['PREINGRESO', 'FECHA_INGRESO', 'FECHA_LLAMADO', 'ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL', 'PROXIMO_CONTROL', 'FECHA_ACTUALIZACION'];

// ---------------------------------------------------------------------------
// Estados canónicos (PENDIENTES #6: lista cerrada por confirmar con cliente;
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

// Sectores válidos
const SECTORES = {
  VALIDOS: ['AMARILLO', 'VERDE', 'NARANJO', 'MULTIPLE'],
  POR_ARCHIVO: {
    'SEGUIMIENTO ECICEP SECTOR AMARILLO': 'AMARILLO',
    'ECICEP NARANJO': 'NARANJO',
    'PCTS. ECICEP DESDE 2023': 'VERDE'
  }
};

// ---------------------------------------------------------------------------
// Sinónimos de encabezados (solo equivalencias CONFIRMADAS en levantamiento,
// ver FUENTES-DATOS.md §4). La clave se compara contra el encabezado
// normalizado (mayúsculas, sin tildes, sin puntos, espacios colapsados).
// Equivalencias ambiguas NO van aquí: DUPLA (LISTADO Naranjo = disciplina),
// PROFESIONAL (Naranjo consolidada mezcla próximo control), COLUMN 12,
// COLUMNA 1, EVALUACIÓN DE PIE, ASISTENCIA, PATOLOGIAS, QUIEN DERIVA, MOTIVO.
// ---------------------------------------------------------------------------
const SINONIMOS_ENCABEZADOS = {
  'NOMBRE': 'NOMBRE',
  'NOMBRES': 'NOMBRE',
  'USUARIO': 'NOMBRE',
  'NOMBRE PACIENTE': 'NOMBRE',
  'RUT': 'RUT',
  'TELEFONO': 'TELEFONO',
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
  'DUPLA INGRESO': 'DUPLA_INGRESO',
  'MEDICO DUPLA': 'DUPLA_INGRESO',   // "MEDICO /DUPLA" tras quitar puntuación
  'SEGUIMIENTO': 'ULTIMO_SEGUIMIENTO',
  'SEGUIMIENTO TELEFONICO': 'ULTIMO_SEGUIMIENTO',
  'CONTROL': 'ULTIMO_CONTROL',
  'PROXIMO CONTROL': 'PROXIMO_CONTROL',
  'FECHA PROX CONTROL': 'PROXIMO_CONTROL',
  'PROXIMA FECHA CONTROL': 'PROXIMO_CONTROL',
  'FECHA DE LLAMADO': 'FECHA_LLAMADO',
  'PROFESIONAL': 'PROFESIONAL_SEGUIMIENTO',
  'PREFESIONAL': 'PROFESIONAL_SEGUIMIENTO', // typo confirmado en Verde (preingresos)
  'OBSERVACIONES': 'OBSERVACIONES',
  'OTROS': 'OBSERVACIONES',
  'OBSERVACION': 'OBSERVACIONES'
};

// Encabezados presentes en las fuentes pero aún sin destino definido
// (PENDIENTES #4/#11): se registran como conocidos-pero-sin-mapeo.
const ENCABEZADOS_SIN_DESTINO = [
  'DUPLA', 'COLUMN 12', 'COLUMNA 1', 'EVALUACION DE PIE', 'ASISTENCIA',
  'PATOGIAS', 'PATOLOGIAS', 'QUIEN DERIVA', 'MOTIVO', 'FECHA',
  'OBSERVACION EXAMENES SOLICITADOS', 'OBSERVACION PENDIENTE',
  'MEDICO DUPLA INGRESO', 'ESTATIFICACION'
];

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
const CFG_FECHAS = {
  ANO_MIN: 2015,           // fuera de rango → fecha inválida (no se corrige en silencio)
  ANO_MAX: 2040,
  FORMATO_HOJA: 'dd/MM/yyyy',
  ZONA: ECICEP.TZ
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
