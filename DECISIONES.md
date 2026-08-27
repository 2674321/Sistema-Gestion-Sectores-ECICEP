# DECISIONES — Registro

Formato: DEC-XXX · Título · Estado (Propuesta/Aprobada/Rechazada/Obsoleta) ·
Motivo · Fecha. Una decisión rechazada u obsoleta NO se borra.

---

## DEC-001
**Título:** Stack Google Sheets + Google Apps Script
**Estado:** Aprobada (definida por cliente antes del inicio)
**Motivo:** Costo cero, entorno ya conocido por la usuaria, acceso multi-sector,
sin infraestructura propia que mantener.
**Fecha:** 2026-08-21 (registrada)

## DEC-002
**Título:** No migrar datos reales hasta validar arquitectura
**Estado:** Aprobada (regla del proyecto)
**Motivo:** Los Excel son referencia estructural; el procesamiento masivo consume
cuota y riesgo. Primero núcleo → muestras → simulación → migración controlada.
**Fecha:** 2026-08-21 (registrada)

## DEC-003
**Título:** Identificación primaria por RUT normalizado (DV módulo 11)
**Estado:** Propuesta
**Motivo:** RUT presente en todas las fuentes y es el identificador natural en
salud chilena. Fallbacks: RUT sin DV + nombre → nombre+teléfono → candidato a
revisión manual. Nunca consolidar por similitud de nombre sola.
**Fecha:** 2026-08-21

## DEC-004
**Título:** El `.clasp.json` de la raíz del workspace NO corresponde a ECICEP
**Estado:** Aprobada (verificado)
**Motivo:** Su scriptId `1pFc-o-…` es idéntico al del proyecto cotizaciones
Servicitecnico. Riesgo de push destructivo cruzado. ECICEP tendrá su propio
`.clasp.json` local cuando se confirme el script destino (PENDIENTES #1).
**Fecha:** 2026-08-21

## DEC-005
**Título:** Datos reales nunca al repositorio Git
**Estado:** Aprobada (regla del proyecto)
**Motivo:** Información personal y sanitaria. `.gitignore` creado ANTES del
primer commit; ignora `*.xlsx/*.xls/*.csv` salvo `datos_prueba/`.
**Fecha:** 2026-08-21

## DEC-006
**Título:** Arquitectura modular plana numerada (00_…09_) estilo CESFAM_SJ v2
**Estado:** Propuesta
**Motivo:** Patrón ya probado en producción por el desarrollador en un sistema
hermano; compatible con clasp (que aplana carpetas); separación de responsabilidades
sin sobrediseño. La normalización queda como capa pura sin I/O (mejora respecto
del proyecto de referencia, donde no existía esa separación).
**Fecha:** 2026-08-21

## DEC-007
**Título:** Script Apps Script oficial de ECICEP
**Estado:** Aprobada (confirmada por desarrollador 2026-08-21)
**Motivo:** El proyecto oficial es **"Back-End Proyecto - Sectores - ECICEP - C.S.J"**
(`1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI`), **ligado al
Spreadsheet base** `1OEV2za6…`. Contiene solo un comentario de reserva (código
de Cotizaciones retirado). El standalone "Proyecto sin título" (`1-b9YTL-…`,
6 stubs) queda **descartado** como escombro de prueba — no usarlo.
**Fecha:** 2026-08-21

## DEC-010
**Título:** `.clasp.json` local del proyecto → script ligado, rootDir `src`
**Estado:** Aprobada
**Motivo:** Confirmado el script destino (DEC-007), se crea configuración local
segura dentro de la carpeta del proyecto (nunca en la raíz del workspace).
El archivo permanece fuera de Git por prudencia; el scriptId está documentado
en ARQUITECTURA.md para reconstruirlo.
**Fecha:** 2026-08-21

## DEC-011
**Título:** Sin servicios avanzados (SpreadsheetApp basta)
**Estado:** Aprobada
**Motivo:** El manifest real del script ligado no declara servicios avanzados.
Para el volumen del proyecto, SpreadsheetApp nativo es suficiente y evita scopes
extra. Se copia ese manifest como base local (`src/appsscript.json`).
Si más adelante se necesita Sheets API avanzado, se decide entonces.
**Fecha:** 2026-08-21

## DEC-012
**Título:** Google Sheets es la interfaz principal del sistema (DECISIÓN OFICIAL)
**Estado:** Aprobada — definida por el desarrollador al iniciar ETAPA 2
**Motivo:** La experiencia del usuario ocurre DENTRO del spreadsheet: menús,
botones, validaciones, formato condicional, vistas y navegación nativa.
Apps Script es motor (normalización, integración, deduplicación, logs, caché).
No se desarrollará SPA ni web app independiente; HTML/sidebar/dialog solo como
complemento cuando una interacción lo justifique. Excel = fuentes externas;
Git = versionamiento. No modificar sin razón técnica importante.
**Fecha:** 2026-08-21

## DEC-013
**Título:** Nombres definitivos de hojas de ETAPA 2
**Estado:** Aprobada
**Motivo:** Se crea la base consolidada como `PACIENTES` (no "ECICEP"): más claro
para la usuaria final; ECICEP es el nombre del sistema completo, no de una tabla.
ETAPA 2 crea solo: CONFIG, PACIENTES, LOG, CONFLICTOS, FUENTES (+ eliminación de
"Hoja 1" únicamente si está vacía). INICIO/DASHBOARD/FICHA/SEGUIMIENTO → ETAPA 4+.
STAGING_IMPORT/MAPA_ORIGEN → ETAPA 3.
**Fecha:** 2026-08-21

## DEC-014
**Título:** Logging con búfer en memoria + escritura por lotes
**Estado:** Aprobada
**Motivo:** Evitar que el propio log sea cuello de botella: las entradas se
acumulan y se vuelcan a la hoja LOG en un solo setValues (auto-flush a las 50).
LockService evita escrituras concurrentes; recorte automático a 5.000 filas;
el log jamás lanza excepciones que rompan el flujo principal.
**Fecha:** 2026-08-21

## DEC-015
**Título:** Caché mínima sobre CacheService con invalidación explícita
**Estado:** Aprobada
**Motivo:** Solo índices/parámetros de lectura con TTL corto (60 s por defecto),
prefijo versionado (`ECICEP:v…:`) e invalidación explícita al escribir.
Nunca datos en curso de modificación. En entornos sin CacheService (node) es no-op.
**Fecha:** 2026-08-21

## DEC-016
**Título:** Pruebas duales deterministas (node local + Apps Script)
**Estado:** Aprobada
**Motivo:** La capa de normalización es pura (sin GAS), así corre idéntica en
`node tests/ejecutar_local.mjs` y en el menú ECICEP → 🧪 dentro de Sheets.
Dataset único ficticio (`src/11_DatosPrueba.js`) replicando los formatos reales
detectados, sin datos de pacientes. Deterministas: sin red, sin hojas, sin hora actual.
**Fecha:** 2026-08-21

## DEC-017
**Título:** Separación ENTIDAD/EVENTO: PACIENTES + EVENTOS
**Estado:** Aprobada
**Motivo:** El REM y el dashboard exigen historial de actividad por fecha de
evento (ingresos, controles, seguimientos, planes, gestiones) con snapshot del
nivel G al momento. Un modelo de fila estática sobrescribiría el historial y
obligaría a doble digitación. PACIENTES = estado vigente (caché sincronizada);
EVENTOS = append-only, verdad operativa. Ver MODELO-EVENTOS.md.
**Fecha:** 2026-08-21

## DEC-018
**Título:** Sectores geográficos permanentes ≠ estratificación G1/G2/G3
**Estado:** Aprobada (confirmado por cliente)
**Motivo:** Los sectores NARANJO/AMARILLO/VERDE son división territorial; la
estratificación es prioridad según cantidad de patologías. Dimensiones 100%
independientes: ninguna lógica cruza ambas (ej: "Amarillo=G2" prohibido).
Canonical interno = **NARANJO** (como escriben las fuentes); "NARANJA" aceptado
como alias de entrada. Rotulación oficial a confirmar (#12).
**Fecha:** 2026-08-21

## DEC-019
**Título:** Hojas sectoriales: SECTOR_* como superficies sincronizadas e INGRESO_* como puertas controladas
**Estado:** Aprobada
**Motivo:** Cada responsable trabaja en su hoja sin convertir las tres en bases
independientes ni duplicar manualmente la base (#47): SECTOR_* = vistas de
trabajo sincronizadas desde PACIENTES/EVENTOS; INGRESO_* = única vía de alta,
con validación→identificación→crear/actualizar→evento INGRESO (sector inmutable
por hoja de origen). El usuario nunca manipula IDs técnicos.
**Fecha:** 2026-08-21

## DEC-020
**Título:** Protecciones de Sheets = control operativo, no seguridad institucional
**Estado:** Aprobada
**Motivo:** Capas: hojas administrativas estrictas; columnas técnicas siempre
protegidas; sector solo editable para su responsable; áreas de resultado solo
escritas por Apps Script. Documentada la limitación de autoridad de ejecución
de scripts sobre rangos protegidos (patrón propietario/triggers instalables).
No depender de ocultar hojas como seguridad.
**Fecha:** 2026-08-21

## DEC-021
**Título:** Dashboard en una sola hoja con cálculo on-demand y trazabilidad
**Estado:** Aprobada
**Motivo:** Filtros editables sin código (período preset+fechas, selector
sector), agregación Apps Script al pulsar Actualizar (lectura por bloques +
escritura de valores compactos), cero fórmulas volátiles masivas, y vista
DETALLE por indicador para auditar qué registros componen cada cifra.
**Fecha:** 2026-08-21

## DEC-022
**Título:** REM como capa de reporting generada desde eventos; regla G configurable y apagada
**Estado:** Aprobada
**Motivo:** El REM se GENERA agregando EVENTOS (tipo+riesgo snapshot+fecha en
período) — nadie copia estadísticas a mano. Campos derivados (TOTAL, "Tiene…",
edades) se calculan, nunca se almacenan. La estratificación automática queda
DISEÑADA pero APAGADA (`REGLA_DISPONIBLE=false`) hasta recibir la tabla oficial
cantidad-de-patologías→G; no se inventa la regla clínica. Bloque "atenciones"
del REM probablemente externo — a confirmar (#17).
**Fecha:** 2026-08-21

## DEC-023
**Título:** Staging en 03_Fuentes con sector heredado del ORIGEN
**Estado:** Aprobada (ETAPA 3)
**Motivo:** La fila de staging ({ID_PROVISIONAL, origen completo,
VALORES_ORIGINALES, NORMALIZADO, ERRORES/WARNINGS, RESULTADO_IDENTIFICACION})
vive en 03_Fuentes según arquitectura documentada. El sector efectivo se toma
de la fuente/hoja de ingreso cuando la fila no lo trae explícito (DEC-019);
si la fila declara uno distinto al origen → ERROR de incompatibilidad.
STAGING_IMPORT añadida al instalador de hojas.
**Fecha:** 2026-08-21

## DEC-024
**Título:** Identificación conservadora separada de deduplicación de lote
**Estado:** Aprobada (ETAPA 3)
**Motivo:** Iden_identificar resuelve "¿existe identidad confiable?" por niveles:
RUT completo exacto (ALTA) → cuerpo+nombre (MEDIA) → nombre+teléfono (MEDIA) →
solo nombre = POSIBLE_DUPLICADO (BAJA, jamás auto-resuelto) → ambiguos
REQUIERE_REVISION. Registro sucio (cuerpo existe con DV distinto) nunca se
auto-decide. Iden_detectarDuplicadosLote solo REPORTA pares explicables
(criterio+confianza); no elimina ni fusiona nada.
**Fecha:** 2026-08-21

## DEC-025
**Título:** Eventos: builder puro con gates; override consciente para dudosos
**Estado:** Aprobada (ETAPA 3)
**Motivo:** Ev_desdeStaging (13_Eventos) bloquea eventos si hay ERROR de
validación, falta identificación, es ambigua (REQUIERE_REVISION /
POSIBLE_DUPLICADO), tipo inválido o sin fecha. POSIBLE_DUPLICADO admite
`confirmarNuevo=true`: decisión humana que fuerza entidad NUEVA y jamás enlaza
al candidato existente. RIESGO_G siempre snapshot de la estratificación
normalizada, nunca inferido del sector. FECHA_REGISTRO=null en capa pura: la fija
el sistema al escribir. Los rangos de años plausibles difieren entre eventos
(CFG_FECHAS.ANO_MIN=2015) y nacimientos (ANO_MIN_NACIMIENTO=1900).
**Fecha:** 2026-08-21

## DEC-026
**Título:** Paciente existente: el ingreso NO sobrescribe campos, solo enlaza evento
**Estado:** Aprobada (ETAPA 3b)
**Motivo:** Sobre MATCH_EXACTO/MATCH_PARCIAL se crea únicamente el EVENTO
enlazado por ID_INTERNO; la ficha permanece intacta (verificado por test con
snapshot JSON). La información nueva vive como eventos; la sincronización de
campos derivados (último control, etc.) será tarea explícita del sistema,
nunca efecto colateral de un ingreso. Evita destrucción silenciosa (#6).
**Fecha:** 2026-08-21

## DEC-027
**Título:** Hojas INGRESO_* con rotulación de cliente; sector derivado de la hoja
**Estado:** Aprobada (ETAPA 3b)
**Motivo:** Las tres puertas se llaman INGRESO_NARANJA / _AMARILLO / _VERDE
(rotulación de la cliente) con mapeo explícito HOJAS_INGRESO → sector canónico
(NARANJO/AMARILLO/VERDE). El usuario jamás digita el sector: lo define la hoja;
una contradicción declarada en la fila es ERROR (no silenciosa). El instalador
crea las tres hojas + EVENTOS. Columnas de sistema (ESTADO_INGRESO,
NOTA_SISTEMA) nunca se importan. Estados centralizados en ESTADOS_INGRESO.
**Fecha:** 2026-08-21

## DEC-028
**Título:** Orquestador 12_Ingresos: núcleo puro sobre store + wrapper GAS batch
**Estado:** Aprobada (ETAPA 3b)
**Motivo:** Ingresos_procesarFilas opera sobre {pacientes:[], eventos:[]} en
memoria con nuevoId inyectable → casos A–H verificados determinísticamente en
node sin Spreadsheet. El wrapper adapta Sheets↔store y persiste en UNA escritura
por tabla (append-only). Identificación re-evaluada contra el store actualizado
tras cada creación (duplicados dentro del mismo lote se enlazan a la ficha recién
creada). Trazabilidad: staging completo a STAGING_IMPORT + resumen al LOG con
ID de ejecución.
**Fecha:** 2026-08-21

## DEC-029
**Título:** Corrección integración: contrato único INGRESO_COLUMNAS + SECTOR_* como vistas + diagnóstico
**Estado:** Aprobada (ETAPA 3b — corrección tras ejecución real con 36/36 errores)
**Motivo:** (a) Contrato único `INGRESO_COLUMNAS` compartido por instalador,
sembrador y adaptador; el mapeo se centraliza en `Ingresos_mapearEncabezadosHoja`
con traducción encabezado 'TELEFONO'→campo modelo 'TELEFONOS' (bug que descartaba
teléfonos). (b) Nombre oficial de hoja = INGRESO_NARANJO (ortografía canónica);
INGRESO_NARANJA queda como alias aceptado. (c) SECTOR_NARANJO/AMARILLO/VERDE son
VISTAS derivadas de PACIENTES (`Modelo_vistaSectorDesdePacientes` +
`Modelo_refrescarVistasSectores`, refresco batch tras cada procesamiento y menú
🔄) — nunca bases independientes. (d) Hoja DIAGNOSTICO + menú 🩺 para ver
encabezados físicos, mapeo y primer error por fila: los fallos de integración se
diagnostican con datos, no con suposiciones.
**Fecha:** 2026-08-21

## DEC-030
**Título:** Métricas separadas por etapa en el resumen de procesamiento
**Estado:** Aprobada (ETAPA 3b — corrección de diagnóstico)
**Motivo:** El resumen mezclaba conceptos bajo un solo contador ("Con error"),
impidiendo distinguir si una fila falló en VALIDACIÓN, en el GATE o nunca llegó a
procesarse. Nuevo desglose inmutable: validacionOk / validacionWarning /
validacionError (= conError) · bloqueados · nuevos / existentes · revision ·
eventosCreados, más versión del sistema visible en cada alerta. Adicionalmente:
`Ingresos_trazarFila` expone el recorrido completo (validación → identificación →
gate → motivo) por fila; tabla de verdad del gate cubierta por pruebas; RUT
mal calculado en el caso ficticio estratBasura corregido EN EL DATASET (no en el
validador), confirmando que el validador era correcto.
**Fecha:** 2026-08-21

## DEC-008
**Título:** Un solo proyecto Apps Script + separación lógica DEV/PROD (no 3 entornos físicos)
**Estado:** Propuesta
**Motivo:** Volumen pequeño-mediano (~3 mil pacientes); tres proyectos sería
sobrediseño. Dataset ficticio en `datos_prueba/` + hoja CONFIG distingue modo.
**Fecha:** 2026-08-21

## DEC-009
**Título:** Hoja 'NO LLENAR' excluida de cualquier migración
**Estado:** Propuesta — requiere confirmación con cliente
**Motivo:** Es duplicado histórico de PLANILLA SECTOR VERDE (mismos pacientes
desde 2023); incluirla duplicaría la base.
**Fecha:** 2026-08-21

## DEC-031
**Título:** Causa raíz del "todo ERROR": filas llegaban sin normalizar al orquestador
**Estado:** Aprobada (ETAPA 3b — corrección con evidencia de ejecución real v0.3.2)
**Motivo:** `Ingresos_procesarTodasLasHojas` entregaba a `Ingresos_procesarFilas`
las filas crudas de `Ingresos_leerHoja` (ESTADO_VALIDACION='PENDIENTE',
NORMALIZADO={}); el gate las bloqueaba por RUT_ESTADO indefinido y se contaban
como ERROR → "36/36" y luego "18/18" pese a que el diagnóstico mostraba filas
OK/WARNING. Corrección en dos niveles: (a) `Ingresos_leerHoja` entrega filas YA
normalizadas; (b) el orquestador auto-normaliza cualquier fila cruda como
defensa (nunca bloquear por un defecto de integración aguas arriba). Lección
registrada: los tests unitarios que normalizan manualmente NO cubren la unión
adaptador↔orquestador; existe prueba de regresión específica del incidente.
**Fecha:** 2026-08-21

## DEC-032
**Título:** ETAPA 4 — Sidebar justificado para búsqueda/ficha/revisión; SECTOR_* ampliadas; limpieza por doble señal
**Estado:** Aprobada (ETAPA 4)
**Motivo:** (a) La búsqueda con historial y la cola de revisión SON interacciones
que justifican sidebar (DEC-012); todo lo demás sigue siendo hoja nativa.
(b) COLUMNAS_SECTOR_VISTA ampliadas (ID_INTERNO para abrir ficha, SEXO, EDAD
derivada, ULTIMO_EVENTO derivado de EVENTOS vía Ev_ultimoPorPaciente); las vistas
siguen regenerándose desde PACIENTES+EVENTOS. (c) La limpieza de datos de prueba
exige DOBLE señal (RUT ∈ set marcado AND FUENTE=HOJA_INGRESO*) más confirmación
humana con conteos; sin doble señal jamás se purga. (d) La cola de revisión vive
en CONFLICTOS (ABIERTO→RESUELTO/…), guarda los datos originales en DETALLE y su
resolución re-ejecuta los gates: errores críticos siguen bloqueando aunque haya
decisión humana. (e) Protección: CONFIG incorpora RESPONSABLE_* vacíos (#13);
no se codifican correos.
**Fecha:** 2026-08-21

## DEC-033
**Título:** v0.8.4 — CONFIG mediante diálogo/menú (hoja siempre oculta) · catálogo central de profesionales · dedupe del histórico Amarillo
**Estado:** Aprobada (v0.8.4)
**Motivo:** (a) **CONFIG deja de ser una hoja de acceso directo.** La hoja CONFIG
permanece OCULTA de forma idempotente (instalador + `UI_configuracion()` re-prende
el ocultamiento); el ítem de menú y la función `⚙️ Configuración` abren un diálogo
(`Configuracion.html`) de administración con lectura/edición, y CONFIG se excluye
de la navegación por hoja (`api_irA`) y de la metadata de navegación. El módulo
INICIO "ADMINISTRACIÓN" pasa de hyperlink a bloque informativo. No se usa el
ocultamiento como seguridad, sino como simplificación: el acceso sigue siendo por
compartición de Google (DEC-009 caracter), pero a la configuración se llega por una
vía controlada (menú) en vez de pasearse por la hoja.
(b) **Profesionales como catálogo central.** Nueva hoja oculta PROFESIONALES
(sembrada con 9 roles idempotente) + funciones puras `Profesionales_mapear`/
`Profesionales_validar` + `Profesionales_catalogo()`. `renderizarDupla` y la ficha
resuelven nombres desde el catálogo del servidor; se elimina la copia duplicada
hardcodeada del cliente (una sola fuente de verdad). (c) **Dedupe Amarillo** con
`Amarillo_analizarDuplicados` puro (clave ID+TIPO+FECHA+AMARILLO) expuesto en
Centro de Pruebas como auditar (dry-run) y eliminar; idempotente y determinista.
**Fecha:** 2026-08-27
