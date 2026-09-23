# DECISIONES — Registro

Formato: DEC-XXX · Título · Estado (Propuesta/Aprobada/Rechazada/Obsoleta) ·
Motivo · Fecha. Una decisión rechazada u obsoleta NO se borra.

> ⚠️ **CONTRATOS DE CAPTURA DESCRITOS EN ESTE REGISTRO: HISTÓRICOS / NO NORMATIVOS.**
>
> Este documento es un **registro histórico** de decisiones. Cuando una DEC describe
> el contrato anterior de captura (campos, acciones, estados, `FORM_RESPUESTAS`,
> validación, idempotencia, Google Forms o Web App), esa descripción constituye
> **historial, NO especificación vigente** — **NO UTILIZAR PARA IMPLEMENTACIÓN NUEVA.**
> El contrato de captura vigente está definido en `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO** —
> única fuente del contrato de captura); ninguna DEC pasada es normativa para captura.

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
**Título:** Google Sheets es la interfaz administrativa principal
**Estado:** Aprobada (2026-08-21) — vigente para administración; supersedida para captura por la Web App
**Motivo:** La experiencia del usuario ocurre DENTRO del spreadsheet: menús,
botones, validaciones, formato condicional, vistas y navegación nativa.
Apps Script es motor (normalización, integración, deduplicación, logs, caché).
No se desarrollará SPA ni web app independiente; HTML/sidebar/dialog solo como
complemento cuando una interacción lo justifique. Excel = fuentes externas;
Git = versionamiento. No modificar sin razón técnica importante.
**Observación vigente:** Google Sheets continúa como interfaz administrativa principal.
La captura operativa de usuarios se realiza exclusivamente mediante la Web App.
Ambas superficies pertenecen al mismo sistema y reutilizan el mismo backend/pipeline.
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

## DEC-034
**Título:** FUENTES como referencia visual estática y oculta
**Estado:** Aprobada (v0.8.4)
**Motivo:** La hoja FUENTES estaba definida en el modelo pero **nunca se
rellenaba** (código funcional no la escribe ni la lee), así que era ruido sin
valor. Se decide: (a) sembrarla una sola vez al instalar con el inventario
estático de `FUENTES_DRIVE` (archivo · sector · hojas · notas de exclusión) vía
`_modelo_sembrarFuentes`/`_modelo_fuentesFilas` (pura y testeada) como REFERENCIA
VISUAL únicamente — no se actualiza dinámicamente; (b) marcarla `oculta:true` en
`MODELO_DISENO` para que `Modelo_aplicarDiseno`/`Modelo_inventarioCorregir` la
mantengan fuera de la barra de pestañas (se sigue pudiendo abrir a demanda desde
el módulo INICIO / `api_irA`, que muestra hojas ocultas consultadas). La fuente
de verdad operativa sigue siendo `FUENTES_DRIVE` en código, no la hoja.
**Fecha:** 2026-08-27

## DEC-035
**Título:** v0.8.5 — Modelo clínico de control unificado (estratificación → frecuencia → próximo → estado → color → recordatorio)
**Estado:** Aprobada (v0.8.5)
**Motivo:** Se unifica la cadena de control clínico con **una sola fuente de verdad**
en `02_Normalizacion.js` (`Control_*`), corregiendo dos defectos confirmados en
auditoría: (a) **Amarillo** (`Amarillo_aplicarHistorico`) sobrescribía
`PRÓXIMO_CONTROL` con el valor crudo de la fuente en vez de computarlo — `fila →
Amarillo_aplicarHistorico:207`; (b) tras registrar un CONTROL no se recalculaba
`PRÓXIMO_CONTROL` (gap global; `Ingresos_sincronizarCache` solo actualizaba
`ULTIMO_CONTROL`). Se decide:
(a) **Frecuencia configurable por nivel y unidad**: `FREC_CONTROL_G*_CANT/_UNIDAD`
(días/meses) por persona vía estratificación; reintroduce el modelo conceptual
G1→90/G2→180/G3→365 por defecto pero parametrizable; se respeta fin de mes al
sumar meses (reutiliza `Vigencia_vencimiento`).
(b) **Cálculo y estado centralizados** (`Control_calcularProximo`, `Control_estadoVigencia`,
`Control_colorEstado`, `Control_recordatorio`, `Control_filasPanel`, `Control_analizar`),
todos **puros** (hoyRef/freqConfig inyectables) y testeables en node.
(c) **Recálculo automático** en la cadena de registro de control y a demanda
(`🔄 Actualizar todo`); Amarillo deja de copiar el próximo de la fuente y lo deriva.
(d) **Panel de Control ampliado**: sección «Controles por persona» con
`api_controlPanel` / `api_controlActualizarUltimo` y acciones por persona.
(e) **CONFIG**: interfaz por secciones con dropdown de unidad + validación
cliente/servidor + `Modelo_invalidarLecturas()` en escrituras + **fix del bug de
eliminar** (el `confirm()` nativo está deshabilitado en el sandbox IFRAME de Apps
Script → se reemplaza por doble confirmación inline).
(f) **Diagnóstico dry-run** (`api_diagnosticoControl`) con métricas reales por
sector, alertas de PRÓXIMO desalineado y acciones sugeridas; variante que aplica
los próximos por separado (idempotente). 335 pruebas locales verdes.
**Fecha:** 2026-08-27

## DEC-036
**Título:** v0.8.6 — Rediseño de navegación centrado en tareas (Parte 0 · auditoría UX)
**Estado:** Aprobada (v0.8.6)
**Motivo:** La auditoría UX mostró que menú e INICIO presentaban al usuario
nombres técnicos de módulos/hojas (PACIENTES, INGRESO_NARANJO, CONFLICTOS,
REM_SALIDA, CONFIG) y que el seguimiento clínico estaba disperso entre Panel,
ficha, SECTOR_* e INICIO, obligando a «recordar el ID y salir». Se decide
reorganizar **solo la navegación y el etiquetado** (sin refactor de backend):
(a) **Menú por tareas**: 👥 Personas · 🎯 Estratificación · 👨‍⚕️ Responsables ·
📊 Reportes · ⚙️ Configuración · 🛠️ Herramientas; `Estratificación` y
`Responsables` abren CONFIG pre-filtrada por sección (`SECCION` inicial en
`Configuracion.html` vía `UI_configuracionEstratificacion/Responsables`).
(b) **PERSONAS como entidad central**: nueva pestaña «Seguimiento» en la ficha
(`Sidebar.html`) que consolida último seguimiento/control, próximo, estado en
color, estratificación y recordatorio (reusa `api_ficha` → `seguimiento` vía
`Control_filasPanel`, y `api_controlActualizarUltimo`); una única fuente de
verdad, contexto de persona preservado a través de los tabs.
(c) **INICIO como centro operativo**: módulos renombrados a lenguaje de tarea
conservando sus enlaces a las hojas donde vive la tarea + pista «menú → …» para
diálogos; ESTADO DEL SISTEMA desglosa Controles VENCIDOS / por vencer (≤30d) /
últimos 30 días sobre `PRÓXIMO_CONTROL`.
(d) **🐛 Botón huérfano corregido**: `Sembrar prueba` (CentroPruebas.html:138)
llamaba a `UI_sembrarFicticios` (inexistente); se define la envoltura.
(e) **Consolidación sin romper**: ningún endpoint ni interfaz funcional se
eliminó; cambio de navegación/etiquetas con compatibilidad total. 335 pruebas
locales verdes.
**Fecha:** 2026-08-27

## DEC-037
**Título:** v0.8.7 — Diagnóstico y optimización de rendimiento del Sector Amarillo
**Estado:** Aprobada (v0.8.7)
**Motivo:** El importar el histórico de la hoja fuente Amarillo fallaba por
«Se ha superado el tiempo máximo de ejecución.». Diagnóstico: tres costes
acumulados en `Amarillo_aplicarHistorico` — (a) **O(F×P)**: un
`pacientes.filter(...)` por cada fila fuente pese a existir `idxRut`; (b)
**~2×F lecturas de CONFIG**: `Control_calcularProximo` y `Ingresos_sincronizarCache`
re-leían la hoja CONFIG en cada fila porque no se les pasaba `freqConfig`
(regla clínica vigente sin cambios: PRÓXIMO_CONTROL siempre se **deriva**, jamás
se copia de la fuente); (c) **F escrituras** `getRange().setValues()` fila por
fila. Se decide:
(a) **Núcleo puro e indexado** `Amarillo_calcularHistorico(pacientes, eventos,
filas, freqConfig)` (in-memory, testeable) que construye `idxRut` y agrupa
eventos una sola vez → **O(F+P+E)**: benchmark local ~217× más rápido en
5.000 pacientes × 5.000 filas.
(b) **CONFIG leída una única vez por operación** (frecuencia + perfilado
`AMARILLO_PROFILE`) y reutilizada; sin lecturas de hoja en el bucle.
(c) **Escrituras por bloques contiguos** de pacientes (`_amarillo_escribirPacientes`:
una `setValues()` por rango de índices consecutivos). Eventos ya se escribían
en batch (`Modelo_agregarEventos`).
(d) **Perfilado** activable/desactivable por `AMARILLO_PROFILE = TRUE` en CONFIG,
que registra en el LOG tiempos por fase, filas fuente, pacientes, eventos y
escrituras.
(e) **`api_registrarEvento`** reutiliza una única lectura de frecuencia
(`Ingresos_sincronizarCache(paciente, evento, freqRel)`).
(f) **Sin cambios clínicos ni de contrato**: no se copia PRÓXIMO de la fuente
(regla vigente intacta), dedup idempotente intacto. 337 pruebas locales verdes
(335 previas + 2 nuevas de núcleo/escala Amarillo).
**Fecha:** 2026-08-27

## DEC-038
**Título:** v0.8.7.1 — Controles bajo demanda, ficha completa y diálogos de configuración
**Estado:** Aprobada (v0.8.7.1)
**Motivo:** Corrección de UX/rendimiento (OPEN CODE). Tres problemas + auditoría:
(1) «Controles por persona» **cargaba ~300 pacientes al abrir el Panel** (modelo
anti-patrón «abrir interfaz → cargar todo → filtrar en cliente»); (2) la **5ª
pestaña (Dupla) de la ficha quedaba cortada**; (3) «Estratificación» y
«Responsables y correos» fallaban con «Los parámetros (HtmlService.HtmlOutput)
no coinciden con la firma de método Ui.showModalDialog» por llamar
`showModalDialog(output)` con **un solo argumento**. Se decide:
(a) **Patrón vigente desde ahora**: «abrir interfaz → estado vacío → usuario
elige → consultar solo lo necesario» y «una interfaz agrupa varias acciones
relacionadas». Controles por persona pasa a **modal bajo demanda**
(`Controles.html` vía `UI_abrirControles`, `showModalDialog(html, 'Controles por
persona')`): el Panel abre con estado vacío sin consultar; «Todos los sectores»
solo consulta al seleccionarlo; búsqueda por ID/RUT/nombre (mín 2 caracteres,
RUT normalizado sin puntos/guiones, sin tildes). Backend puro y testeable
`Control_consultarControles(pacientes, freqConfig, hoyIso, opts)` → filtrado →
`Control_filasPanel` → **paginación** (`inicio`, límite default 25 / máx 100,
devuelve `total/desde/hasta`); `api_controlPanel(opts)` **retrocompatible**
(acepta `sector` como string). El Panel ya no ejecuta consulta al inicializar.
(b) **Ficha**: barra de pestañas desplazable (`overflow-x:auto`,
`flex-wrap:nowrap`, cada tab `flex:0 0 auto` + `white-space:nowrap`), la pestaña
activa se trae al viewport y `#vista` gana scroll/padding inferior — las 5
pestañas (incluida Dupla) quedan siempre accesibles. Nuevo `UI_abrirFicha(id)`
(sidebar modo `ficha` con `ID_INICIAL`) accesible desde «Ver ficha» del modal.
(c) **showModalDialog corregido a 2 argumentos** en `_ui_configuracion` y
`UI_abrirLog`; auditoría del resto: `_ui_dialogo` (Dashboard/REM/CentroPruebas/
AcercaDe/Backup/Log) y `UI_instalarSistema` ya usaban 2 argumentos; sidebars
usan `showSidebar(output.setTitle(...))` (1 argumento, correcto).
(d) **Menú consolidado**: Estratificación y Responsables dejan de ser entradas
independientes y viven dentro del submenú `⚙️ Configuración` (pre-filtrado a su
sección); nuevo submenú `📅 Seguimiento y controles` → `Controles por persona`.
Sin entradas duplicadas; ningún endpoint/interfaz funcional se eliminó.
(e) **Inventario único de diálogos** `UICFG_DIALOGOS` (00_Config) fuente de
verdad para `_pruS_menu`, `_pruS_plantillas`, `_pruS_ficha` (5 pestañas↔5
paneles) y `_pruebas_dialogos_v087` (node). 350 pruebas locales verdes
(337 previas + 13 nuevas de consultas/paginación/inventario). `node --check`
limpio. **Fecha:** 2026-08-27

## DEC-039
**Título:** v0.8.7.2 — Responsables por sector acumulables + dropdowns + mejora visual de Configuración
**Estado:** Aprobada (v0.8.7.2)
**Motivo:** Modernizar el modelo de responsables (pendiente #13) manteniendo los
correos por sector sin perder los datos históricos. El modelo anterior
`RESPONSABLE_<SECTOR>` de CONFIG estaba limitado a **un solo correo por sector**,
ninguna función lo consume aún y no existía intervención visual. Se decide:
(a) **Modelo ACUMULABLE** en hoja interna nueva `RESPONSABLES` (oculta, creada por
el instalador): `SECTOR | CODIGO_RESPONSABLE | NOMBRE_RESPONSABLE | CORREO | ACTIVO`.
Un sector admite N responsables y un responsable puede estar en N sectores. La
**unicidad (SECTOR, CODIGO_RESPONSABLE)** es la clave anti-duplicado. Identificador
estable = código del catálogo `PROFESIONALES` (fuente de verdad; el catálogo no
lleva correo, por eso el correo vive en la asociación); personas fuera del
catálogo usan `R_<clave>` normalizada. Eliminar una asociación **no** elimina al
profesional del catálogo.
(b) **UI dedicada** en `Configuracion.html` → sección «Correos · Responsables»:
selector de sector (conjunto cerrado AMARILLO/NARANJO/VERDE), **dropdown de
responsable desde el catálogo** (activos + optgroup de inactivos + responsables en
uso + opción explícita «Otro»), nombre auto-completado y correo opcional. Sin
texto libre para el responsable cuando existe catálogo utilizable; los dropdowns
**no cargan pacientes/eventos/controles**.
(c) **Guardado atómico validado**: `api_responsablesGuardarSector(sector, filas)`
reemplaza el sector completo en **una escritura por bloques** (no por fila),
validando sectores del conjunto cerrado, duplicados, nombres y correos antes de
persistir (PURA `Responsables_validarSector`, testeable en node). Los correos
legacy se administran desde el panel y quedan **ocultos** de la tabla genérica de
CONFIG (se filtran en `api_configListar`) para evitar edición duplicada como texto.
(e) **Dry-run sin modificar**: `api_responsablesListar` → `Responsables_diagnostico`
(PURA) muestra asociaciones por sector, duplicados, correos inválidos, responsables
sin catálogo, profesionales inactivos y los correos legacy — diagnóstico visible en
la UI y reportable. **Sin migración automática** de los legacy; `Responsables_correosDe`
integra la colección múltiple (deduplida, activos + legacy) lista para futuros
avisos/recordatorios.
(f) **Colores SEMÁNTICOS en Configuración** (no decorativos): encabezados por
  sección (Estratificación/CORREOS/Comunes/Administrador con banner de solo lectura),
  chips G1/G2/G3, puntos activo/inactivo, chips de error/atención/info. Versión
  `0.8.7.2`. 360 pruebas locales verdes (350 previas + 10 nuevas `_pruebas_responsables_v0872`).
  `node --check` limpio. **Fecha:** 2026-08-27

---

## DEC-041
**Título:** Navegación y organización visual de hojas v0.8.8.1 — secciones, buscador rápido, "Ver sección" individual
**Estado:** Aprobada
**Motivo:** Mejora transversal de UX en las hojas sin convertirlas en interfaces pesadas ni afectar a otros usuarios. Tres componentes:
1. **Secciones visuales declarativas** (`SECCIONES_HOJAS`): agrupan columnas reales por función (IDENTIDAD, SECTORIZACIÓN, CONTROLES, CLÍNICO, TÉCNICO, EVENTO, AUDITORÍA) con colores semánticos. Aplicación idempotente (`HVis_aplicarTodasLasSecciones`) que inserta filas de sección ANTES de encabezados, no rompe filtros, congela filas+columna ID.
2. **Buscador rápido en celda A1** (`HVis_instalarBuscador`): usa validación de datos + filtro nativo de Sheets; busca por RUT/ID/NOMBRE según claves reales por hoja; NO carga población completa; instantáneo.
3. **"Ver sección" individual** (`HVerSeccion.html`): diálogo que usa fila activa + selector de secciones reales; muestra solo campos de esa sección; NO oculta columnas globalmente (multi-usuario seguro); botón "Abrir ficha" reutiliza ficha existente.
Hojas prioritarias: INGRESO_*, PACIENTES, SECTOR_*, EVENTOS. Excluidas: LOG, CONFIG, CONFLICTOS, FUENTES, PROFESIONALES, RESPONSABLES.
Tests: `_pruebas_hojasvisual_v0881` (10 tests). 393 → 403 tests. Versionado 0.8.8.1. **Fecha:** 2026-08-27

---

## DEC-042
**Título:** v0.8.8.2 — Reparación instalación, eliminación "Ver sección", CONFLICTOS oculta, instalador idempotente
**Estado:** Aprobada
**Motivo:** Correcciones de problemas reales detectados en validación manual:
1. **Eliminación completa "Ver sección"**: borrado `HVerSeccion.html`, funciones `HVis_abrirVerSeccion`, `HVis_obtenerDatosSeccion`, `HVis_abrirFichaDesdeHoja`, `HVis_menuVerSeccion`, entrada menú `👁 Ver sección`. Sin código muerto residual.
2. **Secciones y buscador integrados en instalador**: nueva fase `visual` (`Instalar_pVisual`) ejecuta `HVis_aplicarTodasLasSecciones()` + `HVis_instalarTodosLosBuscadores()` → ahora se aplican realmente.
3. **CONFLICTOS oculta**: añadida a `Hojas_ocultarTecnicas()`; no aparece en navegación, se accede vía Cola de revisión.
4. **Diagnóstico dry-run**: `Instalar_diagnosticar()` + menú `🔍 Diagnóstico instalación` en `🛠️ Herramientas` informa qué cambiaría sin aplicarlo.
5. **Instalador más idempotente**: cada fase verifica estado antes de escribir; evita reaplicar validaciones/formatos innecesarios.
6. **Tests**: 403/403 verdes. Versionado 0.8.8.2. **Fecha:** 2026-08-27

---

## DEC-043
**Título:** v0.8.8.3 — Rediseño visual real de hojas, buscador prominente, instalador reconciliador
**Estado:** Aprobada
**Motivo:** Corrección de problemas visuales reales detectados tras despliegue v0.8.8.2:
1. **Secciones visuales reales**: `HVis_aplicarSecciones` reescrita → filas de sección con **merged cells** sobre columnas exactas, título visible centrado, colores semánticos, bordes separadores. Buscador prominente en **fila 1 merged** con etiqueta clara "🔎 Buscar persona (RUT / ID / Nombre)", nota, formato azul. Encabezados reales estilizados (gris, negrita, centrados, borde inferior) y congelados junto con buscador + secciones. Filtro nativo en encabezados reales.
2. **Instalador reconciliador real**: nueva fase `diagnostico` (primera) ejecuta `Instalar_diagnosticar()` que compara estado actual vs deseado por fase y reporta diferencias. Cada fase verifica cambios pendientes antes de escribir (idempotencia real). Fase `visual` detecta estado actual vs plan y aplica solo diffs (no duplica, no destruye filtros).
3. **CONFLICTOS oculta garantizada**: verificada en diagnóstico y aplicada en `Hojas_ocultarTecnicas`.
4. **Validaciones centralizadas**: diagnóstico verifica SEXO, ESTADO_INGRESO, FECHA DE NACIMIENTO en todas las puertas INGRESO.
5. **Tests**: `_pruebas_hojasvisual_v0883` (10 tests: mapa columnas, validación, plan cálculo, diagnóstico, idempotencia). **408/408 tests verdes**.
6. **Versionado 0.8.8.3**. **Fecha:** 2026-08-27

---

## DEC-044
**Título:** v0.8.9.0 — Normalización integral del sistema ECICEP
**Estado:** Aprobada
**Motivo:** Corrección de problemas estructurales críticos detectados en validación manual:
1. **PACIENTES sin encabezados**: `_MODELO_HOJAS_DEF[PACIENTES] = null` causaba creación de hoja sin headers → `Fuentes_cargaReal` fallaba con `ESQUEMA_PACIENTES_INCOMPATIBLE: SIN_ENCABEZADOS`. Corrección: `Modelo_crearEstructura` escribe headers de `MODELO_PACIENTE` al crear PACIENTES; reparación funciona aunque la hoja exista vacía.
2. **Fórmulas INICIO hardcoded**: `Hojas_formulaIndicador` usaba referencias fijas `AD2:AD`, `I2:I`, `W2:W`, `B2:B`, `AC2:AC` que se rompen si cambia el esquema. Corrección: `Hojas_formulaIndicador` dinámica vía `Hojas_columnaPaciente(campo)` → `Hojas_indiceAColumna(idx)` resolviendo letras reales desde `MODELO_PACIENTE`.
3. **Instalador no idempotente real**: fases ejecutaban sin verificar estado previo, reaplicando validaciones/formato. Corrección: fase `diagnostico` (primera) ejecuta `Instalar_diagnosticar()` comparando actual vs deseado por fase. Cada fase verifica pendientes antes de escribir. Fase `validaciones` centraliza SEXO, ESTADO_INGRESO, FECHA_NACIMIENTO en INGRESO_*. Fase `visual` detecta estado vs plan y aplica solo diffs.
4. **CONFLICTOS oculta garantizada**: verificada en diagnóstico y aplicada en `Hojas_ocultarTecnicas`.
5. **Visual system 3-row layout**: Fila 1=Barra sector, Fila 2=Buscador, Fila 3=Encabezados, Datos desde fila 4. Congeladas 1-3 + col 1 (ID). Quitada validación col 1.
6. **Tests**: `_pruebas_hojasvisual_v0883` + `_pruebas_auditoria_v088` + `_pruebas_escala_v088` + tests INICIO dinámicos. **408/408 tests verdes**.
7. **Versionado 0.8.9.0**. **Fecha:** 2026-08-27

---

## DEC-045
**Título:** v0.8.9.5 — Encabezados de INGRESO siempre formateados (fix visual semanas)
**Estado:** Aprobada
**Motivo:** Los encabezados de INGRESO_* quedaban en blanco cuando la hoja se creaba fuera del
instalador. Corrección en tres frentes: (1) `Modelo_crearEstructura` estiliza los encabezados al
crear hoja, al verificar coincidencia total y al corregir etiquetas; (2) `HVis_formatearIngresos()`
helper compartido invocado por el paso 6b de `Ingresos_procesarTodasLasHojas` y por
`UI_actualizarTodo`; (3) prueba dedicada `PULIDO v0.8.9.5 hojas INGRESO visuales`.
427/427 tests verdes. Desplegado WebApp @63. **Fecha:** 2026-08-28

---

## DEC-046
**Título:** v0.8.9.6 — DESIGN SYSTEM único (una especificación visual, cero colores literales)
**Estado:** Aprobada
**Motivo:** Limpieza del formato heredado: cada módulo definía sus propios colores/tamaños, lo que
producía hojas que no parecían del mismo sistema. Decisión:
1. **`DESIGN_SYSTEM`** en `00_Config.js` es la ÚNICA autoridad visual: rampas por identidad
   (GENERAL/AMARILLO/NARANJO/VERDE) con jerarquía *barra → sección → encabezado*, tipografía,
   alturas (28/26/42/30/21), anchos con fallback por tipo (default 130), encabezados uniformes,
   bordes, superficies, marca y estados clínicos.
2. **Color clínico ≠ color de organización** (Parte 5): los estados VIGENTE/PRÓXIMO/VENCIDO son
   un semáforo independiente (`DESIGN_SYSTEM.ESTADOS`) que jamás coincide con las rampas.
3. **Identidad por hoja**: `HVis_identidad()` mapea SECTOR_*/INGRESO_* a su familia (monocromáticas
   por sector), EVENTOS hereda NARANJO y PACIENTES/técnicas son GENERAL.
4. **Encabezados uniformes** en TODAS las hojas (fondo #0E5C68, tinta blanca, 12/bold/wrap,
   alturas 42/30) — una sola especificación consumida por 22_HojasVisual y 06_Modelo.
5. **Tinta única** `TINTA_SECCION #0B3C49` con contraste ≥4.5:1 sobre todas las superficies.
6. **Reconciliación** (Parte 17): `HVis_especVisual` (deseado) + `HVis_pendientesVisual`
   (CAMBIOS PENDIENTES, solo lectura) + `HVis_reconciliarHoja` (aplicar→verificar). El
   diagnóstico del instalador reporta los pendientes por hoja.
7. **Despliegue (Parte 25)**: en desarrollo NO se crean deployments WebApp (límite 20/20);
   solo `clasp push -f`. El ejecutable de producción permanece donde esté.
8. **Tests**: `_pruebas_designsystem_v0896` (rampas y contraste, coherencia entre familias,
   identidad, no-colisión clínico/org, anchos fallback, especificación) + actualización de
   asserts de paleta/versión. **436/436 tests verdes**. **Fecha:** 2026-08-28

---

## DEC-047
**Título:** v0.9.0 — Instalación conservadora del formulario (dry-run, sin auto-creación)
**Estado:** Aprobada — **OBSOLETA / HISTÓRICA**
**Motivo:** El formulario complementario creó un canal de captura con acceso a datos clínicos; su
instalación debía ser auditada y no destructiva. **Queda supersedida por v0.9.3:**
la Web App es ahora el único canal operativo de captura.
1. **`Form_instalar` NO crea ni modifica el formulario de Google Forms.** Solo garantiza la
   estructura de datos (hoja oculta `FORM_RESPUESTAS` con color `DESIGN_SYSTEM.MARCA.tecnico`,
   encabezados alineados al contrato `FORM_RESPUESTAS_COLUMNAS` si estuvieran desalineados) y
   `Form_instalarTrigger()` (idempotente por handler `Form_onFormSubmit`, `forSpreadsheet`).
   **Ya no es necesario** para la operación normal; el trigger `onFormSubmit` no recibe
   escrituras nuevas en operación con Web App como único canal.
2. **`Form_diagnosticar`** es solo lectura: estructura, FORM_ID, `FormApp.openById`, trigger.
   **Mantenido por referencia histórica**; no es necesario configurar FORM_ID en operación normal.
3. **`Form_reparar`** nunca borra datos y nunca recrea un formulario eliminado: reporta la deuda
   como pendiente humano. **Solo relevante si se decides reactivar Google Forms en el futuro.**
4. **`FORM_ID` vacío** no impide preparar la estructura; el trigger se instala recién con FORM_ID
   configurado. **Ya no es necesario** para operación con Web App como único canal. Captura con
   `getResponses(desde)` desde la última captura (ventana inicial 2 h) para no reprocesar
   historial previo a la instalación, si se mantiene el trigger legacy.
5. **Sin efectos colaterales clínicos**: nada de lo instalado toca PACIENTES/EVENTOS hasta que
   llegue una respuesta real. **Observación:** esto sigue siendo cierto, pero las respuestas
   ya no vienen de Google Forms en operación normal, sino de la Web App.
**Fecha:** 2026-09-01
---

## DEC-048
**Título:** v0.9.0 — Formulario complementario como puerta de entrada controlada (no base paralela)
**Estado:** Aprobada — **OBSOLETA / HISTÓRICA**
**Motivo histórico:** El equipo deseaba capturar ingresos, controles y seguimientos vía Google Form sin crear
una segunda verdad clínica. Decisión: el formulario es SOLO una puerta de entrada:
`FORM → respuesta → VALIDACIÓN/NORMALIZACIÓN → pipeline existente → PACIENTES/EVENTOS/SECTOR/INICIO`.
1. **Sin escritura clínica directa desde el formulario.** `NUEVO_INGRESO` anexa la fila canónica
   (11 celdas, `INGRESO_COLUMNAS`) a `INGRESO_<SECTOR>` con `ESTADO_INGRESO` vacío y
   `NOTA_SISTEMA = 'FORM|<responseId>|INGRESO'`; **el pipeline existente** decide ingreso/duplicado/
   enlace (prueba garantiza que dos respuestas idénticas jamás crean dos pacientes).
2. **Acciones clínicas reusan `api_registrarEvento`** con `fuente` y `registradoPor` opcionales
   (retrocompatibles): `CONTROL`/`SEGUIMIENTO` registran el evento completo y `ACTUALIZAR_DATOS`
   ajusta solo campos operativos (teléfono/observaciones/profesional, identidad intacta).
3. **El cambio de estratificación queda excluido del formulario** (se mantiene en la ficha clínica).
   `ACTUALIZAR_DATOS` nunca toca identidad ni reglas clínicas.
4. **Idempotencia**: clave `responseId`; estados `RECIBIDO|VALIDANDO|VALIDO|PROCESADO|
   REQUIERE_REVISION|ERROR`; reintentos máx `FORM_CONFIG.MAX_REINTENTOS=3`; marca FUENTE previene
   eventos duplicados; `INGRESO_FILA` no vacío → `YA_ANEXADO`; `LockService` en procesamiento.
5. **Columnas nunca por índice fijo**: siempre mapeadas por encabezado
   (`Form_mapeoEncabezados` + `Utl_claveAlnum`), a prueba de reordenamiento.
6. **El pipeline es el único juez de duplicados** (nuevos vs enlazados); el formulario solo
   traduce el resultado a su estado (`INGRESADO→PROCESADO`, `DUPLICADO/REVISION→REQUIERE_REVISION`,
   `ERROR→ERROR`).
7. **Seguridad**: validación estricta por acción (RUT con DV, fechas reales, sector/estrat
   oficiales), teléfono NO bloquear ingreso válido, panel de administración con métricas
   agregadas (sin datos personales). **Tests:** `_pruebas_formulario_v090` (mapeo, validación,
   decisiones ANEXAR/CLINICA/ERROR/CUARENTENA/PROCESADO_YA/SALTAR/YA_ANEXADO, traducción,
   pendientes, métricas, pipeline-duplicados, simulador 10→3000 determinista). **455/455 tests
   verdes.** **Fecha:** 2026-08-29

---

## DEC-049
**Título:** v0.9.1 — Estrategia histórica DEV + DEMO
**Estado:** **OBSOLETA / HISTÓRICA**
**Motivo histórico:** Durante una etapa anterior se evaluó aislar desarrollo y demostración mediante dos Spreadsheets y una resolución de entorno por ID.

Esta estrategia **no forma parte de la arquitectura actual**. El sistema fue normalizado posteriormente a un único entorno operativo.

Elementos históricos de esta decisión:

1. detección de identidad por `Spreadsheet.getId()`;
2. registro de `DEV` y `DEMO`;
3. gate `Entorno_validarProcesamiento`;
4. backups separados por ambiente;
5. aislamiento de formularios por entorno.

No usar estos elementos para reconstruir la arquitectura actual.

**Fecha histórica:** 2026-08-31

---

## DEC-050
**Título:** v0.9.1 — Batería de aceptación histórica del formulario
**Estado:** **OBSOLETA / HISTÓRICA**
**Motivo histórico:** Validar la implementación de captura basada en Google Forms y la estrategia DEV/DEMO de esa etapa.

Los casos de prueba que correspondan al comportamiento actual deben conservarse solo si siguen cubriendo contratos vigentes. Los casos exclusivos de Google Forms, `FORM_ID`, triggers `onFormSubmit` o DEV/DEMO no constituyen requisitos actuales.

**Fecha histórica:** 2026-08-31

---

## DEC-051
**Título:** v0.9.2 / v0.9.3 — Evolución histórica de la captura hacia la Web App
**Estado:** **SUPERSEDIDA para el canal de captura actual; conserva valor histórico**

**Motivo histórico:** El proyecto evolucionó desde una captura inicial basada en formulario hacia la Web App como única interfaz operativa. El backend y el pipeline existente se conservaron para evitar duplicación de reglas.

### Estado actual derivado de esta evolución

> ⚠️ **NO NORMATIVO.** La lista siguiente describe el contrato de captura anterior
> y quedó **INVALIDADA**. No usar como especificación para el nuevo contrato;
> el código que la implementa es deuda transitoria pendiente de redefinición.

1. La Web App es el **único canal operativo de captura**.
2. `CapturaWeb.html` llama a `Form_capturarDesdeUI(datos)` mediante `google.script.run`.
3. El flujo continúa por `Form_validarRespuesta()` → `FORM_RESPUESTAS` → `Form_procesarPendientes()` → pipeline clínico.
4. `FORM_RESPUESTAS` es una estructura interna del pipeline; no requiere Google Forms.
5. No se utiliza `FORM_ID` para la operación actual.
6. No se utiliza `onFormSubmit` como trigger de captura.
7. No existe una segunda ruta de negocio: Web App y administración reutilizan el mismo backend.

Las referencias históricas a métricas, paneles o pruebas construidas alrededor de Google Forms deben entenderse como parte de la evolución del sistema, no como instrucciones para reactivar ese canal.

**Fecha de actualización documental:** 2026-09-01

---

## DEC-052
**Título:** Arquitectura operativa única: Web App como único canal de captura
**Estado:** **Aprobada / vigente**
**Motivo:** Se normaliza la documentación para que todas las instrucciones vigentes describan un solo sistema operativo, una sola fuente de verdad y un solo pipeline. Los deployments de Apps Script se consideran únicamente mecanismos técnicos de publicación y no ambientes de aplicación.

1. Un único proyecto Apps Script y un único Spreadsheet configurado.
2. Una única Web App como canal de captura.
3. Un único pipeline de procesamiento.
4. Google Forms queda fuera de la operación.
5. DEV/DEMO/PROD no son ambientes del sistema.
6. Un deployment histórico puede eliminarse solo después de verificar dependencias activas.
7. La documentación histórica se conserva como historial, pero no tiene precedencia sobre el estado actual.

**Fecha:** 2026-09-01

---

## DEC-053
**Título:** v0.9.3 — Estabilización integral Web App (versión canónica)
**Estado:** Aprobada / vigente
**Motivo:** Cierre de estabilización antes de fase exclusiva de pruebas funcionales del formulario. Se establece `0.9.3` como versión canónica única con `ECICEP.VERSION` (`src/00_Config.js:19`) como single source of truth y `ECICEP_BUILD` (`src/BUILD.js`) sincronizado al commit. Auditoría integral (GitHub↔Apps Script↔Spreadsheet↔Web App↔docs) detectó y corrigió: (a) gate `Entorno_gateGAS` eliminado del pipeline de captura (el único entorno es `ECICEP.SPREADSHEET_ID`); (b) `PROFESIONAL` vía `api_profesionalesCatalogo()` desde catálogo `PROFESIONALES` (ACTIVO/NOMBRE) — fix de `ACTIVA/NOMBRE_CANONICO`; (c) `ECICEP.WEB_APP_URL` centralizada con fallback `ScriptApp.getService().getUrl()`; (d) QR con librería estándar `qrcode→addData→make` render en canvas + `api_webappEstado`; (e) logo re-encode desde `logo_cesfam_san_juan_Coq.png` (289×333) en `CapturaWeb.html:281/300` con `64×74`+`object-fit:contain`. Menús/UI Sheets, `FORM_RESPUESTAS`/`PACIENTES`/`EVENTOS`/`REM`, `FORM_CONTROL`, contratos y deployments (`@HEAD` operativo, `/dev` revisión, `/exec` publicación) alineados. AppSheet auditado: sin config en repo — requiere intervención manual. Tests **469/469 + 29/29** verdes.
**Fecha:** 2026-09-02

---

## DEC-040
**Título:** Auditoría integral v0.8.8 — FASE 1 dry-run read-only + correcciones de integridad clínica y rendimiento
**Estado:** Aprobada
**Motivo:** El sistema requiere una auditoría completa antes de seguir evolucionando: (1) inventario real de hojas/datos, (2) única fuente de verdad por dato, (3) edad global consistente, (4) controles clínicos con clasificación VIGENTE/PRÓXIMO/VENCIDO/SIN_ÚLTIMO/SIN_ESTRAT/SIN_CONFIG/FECHA_INV/DESALINEADO, (5) Amarillo histórico auditado, (6) responsables/profesionales/CONFIG clasificados, (7) duplicados, (8) consistencia entre interfaces, (9) UX/flujos, (10) rendimiento N+1/cache/O(n²). FASE 1 **prohíbe modificar datos reales** (dry-run solo lectura). Correcciones justificadas: C1 (HIGH) `api_controlActualizarUltimo` ahora crea EVENTO (fuente de verdad única: EVENTOS + caché PACIENTES); C2 (MEDIO) aviso desde CONFIG en Panel/diagnóstico/ficha; C3 (BAJO) `api_centroResumen` top-4 single-pass O(E); C4 (CLEANUP) `console.log` removido. Tests: 360 → 393 (+33 auditoría + escala 100..10k). Informe A–I obligatorio. Versionado 0.8.8.0 (semver 4 partes). **Fecha:** 2026-08-27
---

## DEC-054
**Título:** Pipeline de captura Web App acotado a las hojas INGRESO_* de la captura (`soloHojas`)
**Estado:** Aprobada / vigente
**Motivo:** Tras diagnóstico en vivo (commit `7b4c077`/`b7eccf9`) se comprobó que `INGRESO_AMARILLO` y otras hojas arrastran cientos/miles de filas sin `ESTADO_INGRESO == 'INGRESADO'`. El pipeline se ejecutaba COMPLETO en cada envío de la Web App (`Ingresos_procesarTodasLasHojas` sin filtro) → re-lectura, re-auditoría, re-proceso y re-escritura de todo el backlog → envío >60 s → timeout persistente y `SIN_FILA_INGRESO`. Corrección: `Form_procesarPendientes` deriva las hojas de las decisiones ANEXAR/YA_ANEXADO y las pasa como `opciones.soloHojas`; `Ingresos_procesarTodasLasHojas` solo lee/procesa esas hojas. No es lógica paralela: es el mismo pipeline con entrada acotada. El backlog completo se sigue procesando por lote desde el panel (`Form_procesarAhora`/menú → llamada sin `soloHojas`). Web App = único canal de captura; el procesamiento de hojas por lotes es operativo interno. Backlog histórico de AMARILLO que deba tomarse como pendiente reale se decide explícitamente (no se auto-re-procesa en cada envío).
**Fecha:** 2026-09-04

## DEC-055
**Título:** Pipeline de captura Web App acotado a la FILA anexada (`soloFilas`), derivado de la MARCA
**Estado:** Aprobada / vigente
**Motivo:** DEC-054 (acotado por hoja) redujo el envío a las hojas de la captura, pero cuando la hoja objetivo es `INGRESO_AMARILLO` (1070+ pendientes) el proceso completo de ESA hoja sigue superando los 60 s → timeout y anexo sin `ESTADO_INGRESO` escrito. Corrección (commit en curso): el acotado pasa a nivel de FILA —
  1. `Ingresos_procesarTodasLasHojas` acepta `opciones.soloFilas` (`{hoja:[filas]}`) y filtra el `staging` por `FILA_ORIGEN`, de modo que el pipeline procesa únicamente la(s) fila(s) recién anexadas de la captura.
  2. `Form_procesarPendientes` deriva `soloHojas`+`soloFilas` de la MARCA física (`Form_buscarFilaIngresoPorMarca`) con fallback a coordenadas del trailer. La marca es la fuente autoritativa (inmune a pérdida de coordenadas documentada en el diagnóstico `respuesta.ingresoHoja/ingresoFila=''`); esto además hace que la resolución del paso 4 devuelva el estado real escrito (`INGRESADO`) aunque las coordenadas se hayan perdido.
  3. El backlog histórico de las hojas se procesa por lote desde el panel (llamada completa sin `soloHojas`/`soloFilas`).
No es lógica paralela: idéntico pipeline con entrada acotada a la captura en curso.
**Fecha:** 2026-09-04

## DEC-056
**Título:** El acotado `soloHojas`/`soloFilas` debe saltar el COSTO (lectura + normalización), no solo filtrar el resultado
**Estado:** Aprobada / vigente
**Motivo:** DEC-054/055 filtraban el `staging` DESPUÉS de costos completos por envío:
  1. `Ingresos_leerHoja` normalizaba (`Fuentes_normalizar`) TODAS las filas no-`INGRESADO` de cada hoja INGRESO_* antes de que `Ingresos_acotarStaging` filtrara → con `INGRESO_AMARILLO` (1070+ pendientes) 1070 normalizaciones en cada envío, ignorando `soloFilas`.
  2. `Form_derivarAcotacionPaso3` invocaba `buscadorMarca` (barrido de las 4 hojas) ANTES de revisar las coordenadas ya pobladas en memoria (recién escritas en el paso 1 / resueltas por idempotencia del paso 0).
  3. `Form_diagnosticoEnvio` corría inline en el request en error y re-leía + normalizaba todas las hojas.
  Corrección:
  - `Ingresos_procesarTodasLasHojas` omite `Ingresos_leerHoja` en hojas fuera de `soloHojas` (commit `14a095f`).
  - `Ingresos_leerHoja(nombreHoja, filasPermitidas)` salta líneas fuera de alcance ANTES de `Fuentes_normalizar` (parámetro opcional → batch/panel intactos).
  - `Form_derivarAcotacionPaso3` usa PRIMERO coordenadas en memoria y solo invoca `buscadorMarca` si realmente faltan (DEC-055 intacto).
  - `Form_diagnosticoEnvio` lee UNA vez por hoja y cuenta pendientes por la columna ESTADO (muestras ≤3 normalizadas).
  Tests: aceptación 46 → 50 (espía `Fuentes_normalizar`: 1004 filas → staging=1 con 1 sola normalización; espía `buscadorMarca` no invocado con coords pobladas).
**Fecha:** 2026-09-04

## DEC-057
**Título:** S5 — Enriquecimiento seguro de PACIENTES desde hojas INGRESO_* (solo campos vacíos)
**Estado:** Aprobada / vigente
**Motivo:** La captura actual no escribe `SEXO`/`FECHA_NACIMIENTO` en PACIENTES, pero las hojas `INGRESO_*` ya contienen ambos datos en muchos casos. En lugar de reintroducir un formulario o rediseñar captura, se integra el **enriquecimiento** dentro de la operación administrativa existente `UI_actualizarSistema` (Web App = único canal de captura; Sheets/paneles = operativo interno):

1. **Contrato mínimo**: solo se completan **`SEXO`** y **`FECHA_NACIMIENTO` vacíos**; `EDAD` nunca se almacena (campo derivado en vivo vía `Utl_edadDesde`, DECISIONES de edad previas).
2. **Identidad**: `ID_INTERNO` de PACIENTES es la identidad canónica; el match a fuentes se hace por **`RUT` normalizado exacto** (`Norm_normalizarRut`) contra los RUT de las hojas `INGRESO_*` — nunca se falsifica un RUT incompleto.
3. **Regla de escritura**: un campo se completa solo si su valor candidato de fuente es válido (SEXO ∈ {M,F,OTRO} tras `Norm_normalizarSexo`; fecha ISO válida en rango `[1900, 2040]`); si hay fuentes **inconsistentes entre sí se marca `REQUIERE_REVISION` sin escribir**; si no hay fuente aplicable el campo queda vacío (no se infiere).
4. **Idempotencia y trazabilidad**: una segunda ejecución no cambia nada; cada aplicación acumula `FUENTE` con `ENRIQUECIMIENTO|<hoja>|<fila>` (append sin duplicar), estampa `FECHA_ACTUALIZACION` y registra `Log_info`.
5. **Sin lógica paralela**: reutiliza funciones de hoja (`Modelo_leerBloqueCabecera`, `Ingresos_mapearEncabezadosHoja`, `Modelo_leerPacientes`, `Utl_escribirBloque`) y el pipeline real; no toca `FORM_RESPUESTAS`, contrato V2, captureId ni deployments.
6. **Ubicación operativa (corrección tras validación real)**: el enriquecimiento vive como **etapa del instalador** (`INSTALAR_ETAPAS` → `Instalar_pEnriquecimiento` en `src/20_Instalador.js`), ejecutada por "⚙️ Instalar / reparar sistema" antes de la verificación final. **No** se integra en "🔄 Actualizar sistema" (`UI_actualizarSistema` conserva su rol original).
Tests: núcleo 469 → 487 (+18 casos A–H/EDAD) verdes con batería completa (732).

**Fecha:** 2026-09-07

## DEC-058
**Título:** S12 — Separación funcional "Actualizar sistema" (derivados/vistas) vs "Instalar / reparar" (mantenimiento estructural)
**Estado:** Aprobada / vigente
**Motivo:** S11-R audió el call graph real y encontró que ambos menús de "Sistema"
abrían el mismo instalador completo; el recálculo de vistas/campos automáticos vivía
en `UI_actualizarTodo`, sin exponerse. DEC-057 (ítem 6) ya reservaba el enriquecimiento
exclusivamente al instalador, pero la entrada "Actualizar" redundaba en la misma ruta.
Se separa para que cada menú tenga responsabilidad única y verificable.

1. **Actualizar sistema** (`UI_actualizarSistema`) = **datos derivados y vistas**; delega
   en `UI_actualizarTodo()` (sin copiar la lógica): `Estrat_recalcularTodos`,
   `Control_recalcularTodos`, `Modelo_refrescarVistasSectores`,
   `HVis_formatearIngresos`, `Hojas_formatoCondicional`. Mensaje de confirmación
   actualizado para describir esas responsabilidades (sin "instalar/importar/reparar").
2. **Instalar / reparar sistema** (`UI_instalarSistema`) mantiene el pipeline completo
   `INSTALAR_ETAPAS`, incluyendo importación de fuentes y la etapa `enriquecimiento`
   (`Instalar_pEnriquecimiento`, DEC-057 intacta). Es la única entrada para estructura.
3. **Sin efecto sobre captura**: `UI_actualizarSistema` no referencia `captureId`,
   `FORM_RESPUESTAS`, contrato V2 ni funge de importación/enriquecimiento (guardas U1–U6, U9).
4. **EDAD** sigue siendo derivada (fórmula DATEDIF viva en `SECTOR_*`/en memoria; no se
   crea columna); **SEXO** sigue siendo dato fuente (se completa solo en vacíos desde el instalador).
5. **Idempotencia**: el recálculo reescribe filas en sitio (`setValues`, sin `appendRow`);
   no crea pacientes ni eventos; doble "Actualizar" → mismo resultado.
Tests: guarda S11R-2 actualizada a la nueva realidad (antes) + U1–U6/U9 (6 casos);
regresión completa 769 (núcleo 521).

**Fecha:** 2026-09-08

## DEC-059
**Título:** INST-1 — Versionado canónico del esquema y motor de migraciones declarativas en el instalador
**Estado:** Aprobada / vigente
**Motivo:** El instalador ejecutaba su pipeline sin concepto de versión estructural:
una instalación legacy se "reparaba" con `Modelo_crearEstructura` + `HVis` sin conocer
su esquema, y la única protección del layout 15→16 de `SECTOR_*` (BUG-E2E-003) vivía
empotrada en `UI_actualizarTodo`/`Modelo_crearEstructura`. Se endurece el instalador
con versión canónica y migraciones declarativas:

1. **Fuente única de versiones** (`00_Config`): `SISTEMA_VERSION_SCHEMA_ACTUAL = 1`
   y `SISTEMA_VERSION_INSTALADOR = 'INST-1'`. **Regla de semejanza**: `SCHEMA_VERSION`
   ausente/vacía/ilegible ⇒ esquema legacy `'0'` (nunca se presume VIGENTE).
2. **Un único autor del esquema**: **NO** se siembra `SCHEMA_VERSION` en
   `_CONFIG_SEMILLA`; solo `Mig_ejecutarDeclaradas(...persistir:true)` escribe
   `SCHEMA_VERSION`/`LAST_MIGRATION` en CONFIG (vía `_inst_configEscribir`). Sembrar
   el valor canónico enmascararía instalaciones legacy y **saltaría** las migraciones.
3. **Migraciones declarativas**: `REGISTRO_MIGRACIONES` con `{id,desde,hasta,fn,
   descripcion}`; cadena determinista (`desde` asc, luego `id`) con objetivo canónico
   (parametrizable en tests); ejecutor puro `Mig_ejecutarDeclaradas` que **detiene la
   cadena ante el primer fallo sin avanzar la versión**; `Mig_run001` alinea
   `SECTOR_*` 15→16 por nombre (idempotente; `ENCABEZADOS_INCOMPATIBLES` ⇒ falla, no
   adivina) — es el camino por-registro de la protección BUG-E2E-003.
4. **Clasificación de instalación** (`Mig_clasificarInstalacion`, pura):
   NUEVA/VIGENTE/ANTIGUA/DIVERGENTE/INCOMPLETA/DESCONOCIDA. Las vistas `SECTOR_*`
   divergentes reclasifican ANTIGUA aunque `SCHEMA_VERSION` diga estar al día.
5. **Diagnóstico dry-run**: `Instalar_diagnosticar` reemplaza `Modelo_crearEstructura()`
   (golpeado dentro de un reporte) por `Modelo_escanearEstructura` (solo lecturas) y
   reporta el bloque VERSIONADO. Nada de diagnóstico muta.
6. **Etapas nuevas** del instalador: `versionado` (solo lectura) y `migraciones`
   (mutante) después del `diagnostico`; `api_instalarPaso` protege con LockService
   (`tryLock(30000)`, `releaseLock` en `finally`) **solo** las etapas de
   `INSTALAR_ETAPAS_MUTAN`; tolerante en node (sin `LockService`).
7. **Webhook** `instalar` → `Instalar_ejecutarPolitica()` (DIVERGENTE/DESCONOCIDA =
   error sin mutar; INCOMPLETA = reparar estructura; luego migraciones persistidas).
8. **Sin lógica paralela**: `Actualizar sistema` (DEC-058) no referencias `Mig_*`,
   `REGISTRO_MIGRACIONES`, `SCHEMA_VERSION` ni el motor; el refresco de vistas sigue
   en su lugar (T12). Migraciones tocan solo estructura (sin append/insert de filas,
   sin tocar PACIENTES/EVENTOS).
Tests: `_pruebas_inst1_versionado` (T1–T15) añaden +15 casos (núcleo 534 → **549**);
baterías completas verdes (núcleo 549/549, aceptación 50/50, backend V2 65/65, UI V2
19/19, cola 33/33, contrato captura V2 36/36, contrato datos 20/20, formulario web 25/25).

**Fecha:** 2026-09-08

## DEC-060
**Título:** Caché entre requests de bloques PACIENTES/EVENTOS/PROFESIONALES (pasada 14)
**Estado:** Aprobada / vigente (confirmada por el usuario)
**Motivo:** Amplía DEC-015. En las RPCs consecutivas del menú, la re-lectura de
PACIENTES/EVENTOS/PROFESIONALES repetía `getValues` de bloques completos en cada
request. La pasada 14 persiste el bloque leído por `_memoLeer` en CacheService
entre requests (sesiones distintas):

1. **Alcance**: bloques crudos de PACIENTES/EVENTOS/PROFESIONALES (hojas que ya
   usaban `_memoLeer`), serializados con marcador `__ECICEP_DATE__` para preservar
   los Date (UI convierte Date a `toJSON` antes de cualquier replacer).
2. **Límite de tamaño**: bloques con serialización > `CFG_CACHE.MAX_BYTES` (90 KB,
   bajo el límite de ~100 KB de CacheService) no se persisten → solo-sesión
   (EVENTOS con histórico amplio suele caer en este caso).
3. **Claves versionadas**: `ECICEP:v<N>:` + `BLOQUE:<HOJA>`; cualquier cambio de
   esquema en el código cambia `VERSION` y por tanto invalida la caché por clave.
4. **TTL**: desde CONFIG `TTL_CACHE_SEG` (por defecto 60 s, máximo 21600), leído
   una sola vez por invocación (`_CACHE_TTL_SEG`).
5. **Invalidación en toda escritura**: `Modelo_invalidarLecturas()` borra memo +
   claves `BLOQUE:*`. Auditoría interna detectó 6 rutas de escritura de
   PACIENTES/EVENTOS que no llamaban a ese punto (07_UI `api_duplaGuardar`,
   06_Modelo `Modelo_restaurarFuente`, 24_Formulario `Form_actualizarDatosPaciente`,
   16_Amarillo `_amarillo_escribirPacientes`, 18_Calidad
   `Calidad_normalizarFormatoRuts`, 27_Actualizacion `Act_enriquecerPacientes`);
   todas fueron corregidas en la misma pasada.
6. **Riesgo residual documentado**: el TTL (60 s) aplica también a consumidores
   del pipeline que usan `_memoLeer` (barrera RUT+fecha en 12_Ingresos, lecturas
   de 26_Captura y 03_Fuentes): una escritura externa a los mutadores comunes
   puede verse reflejada con hasta `TTL_CACHE_SEG` de retraso en esas lecturas.
   En el flujo feliz de captura la escritura se auto-invalida al cierre y el
   contrato V2 no cambia. Alcance reducido por el TTL mínimo de CacheService (60 s).
7. **Sin arquitectura paralela**: la caché es solo lectura de bloques ya canonizados
   por el pipeline existente; no hay segunda lógica de negocio ni segunda base de datos.

Tests: contrato datos +3 grupos (R12) → 36/36; baterías completas verdes
(núcleo 553, aceptación 50, captura V2 36, payload 19, backend 68, cola 33,
formulario_web 27, validar_html 17).

**Fecha:** 2026-09-10

## DEC-061
**Título:** Búsqueda puntual por ID_INTERNO en endpoints de escritura del menú (pasada 15)
**Estado:** Aprobada / vigente
**Motivo:** Reducir el costo de "conversión por fila" residual en los 3 endpoints
del menú que reescriben la fila completa de UN paciente y, por tanto, necesitan el
objeto canónico completo (`api_controlActualizarUltimo`, `api_registrarEvento`,
`api_patologiasGuardar`). Estos usaban `Modelo_leerPacientes()` que convierte TODAS
las filas (N × campos) para luego usar una sola; con la caché entre requests la
hoja ya no se relee, pero la alocación de N objetos por RPC persistía.

1. **`_filaAObjeto(campos, fila)` (PURA)**: conversión fila cruda → objeto canónico
   (booleanos → TRUE/FALSE) extraída de `Modelo_leerPacientes`, reutilizada sin
   duplicación. El lector completo produce resultados idénticos.
2. **`Modelo_buscarPaciente(idInterno)`**: busca sobre el bloque crudo ya memoizado
   (`_memoLeer`, UNA lectura con caché entre requests) comparando solo la columna
   `ID_INTERNO` y construye el objeto canónico SOLO de la fila encontrada
   (`{idx, obj}` 0-based sobre el bloque; `null` si no existe). Sin accesos extra
   a la hoja: mismo `_memoLeer(PACIENTES)`.
3. **Migración**: los 3 endpoints reemplazan la lectura completa por la búsqueda
   puntual; la escritura (una sola `setValues` de la fila física, invalidación vía
   `Modelo_refrescarVistasSectores`/`Modelo_invalidarLecturas`) no cambia.
4. **Sin arquitectura paralela**: no toca pipeline → 26_Captura/03_Fuentes/
   12_Ingresos siguen con `Modelo_leerPacientes()`/`Modelo_leerEventos()` (ya
   memoizados/cacheados); contrato V2 y `docs/CONTRATO_CAPTURA_V2.md` intactos.

Tests: contrato datos +2 grupos (R13: PURA `_filaAObjeto`; `Modelo_buscarPaciente`
idx/objeto-idéntico/1 lectura/`null`) → 38/38; baterías completas verdes
(núcleo 553, aceptación 50, captura V2 36, payload 19, backend 68, cola 33,
formulario_web 27, validar_html 17).

## DEC-062
**Título:** Primera integración de IA generativa (Google Gemini) como capacidad de asistencia técnica
**Estado:** Aprobada / vigente
**Motivo:** El usuario solicitó integrar IA gratuita para análisis y corrección
asistida de datos dentro del sistema ECICEP (implantación publicada, `v0.9.3` sin
cambio de versión). La IA se incorpora como **capacidad nueva de asistencia
técnica** sobre estructura y calidad de datos, **no** como núcleo del sistema ni
como autoridad clínica.

1. **Proveedor y modelo**: Google Gemini API (`gemini-2.0-flash`) con API key en
   **Script Properties** (`GEMINI_API_KEY`), nunca en código, hojas ni docs.
   `IA_llamarGemini` con retry/backoff exponencial y manejo de `429`.
2. **Alcance**: análisis de estructura/estadísticas, detección local de
   duplicados por RUT e integridad de eventos (sin envío a la API), corrección
   determinista (RUT, fechas, nombres, teléfonos, sexo) reutilizando los
   normalizadores del sistema, chat/instrucciones en lenguaje natural y
   ejecución de tests; todo con registro trazable en hoja `LOG_IA`.
3. **Componentes**: `src/28_IA.js` (backend), `src/IAPanel.html` (sidebar),
   menú `IA` en `onOpen()` (07_UI.js), registro `IAPanel` en `UICFG_DIALOGOS`
   (00_Config.js).
4. **Minimización de datos**: diseño orientado a enviar a la API solo
   estructura, estadísticas y patrones; duplicados e integridad son 100%
   locales. Ejemplos de columnas sensibles (RUT, NOMBRE, TELEFONOS, etc.)
   son **anonimizados** en `IA_leerEstadisticas`: solo se envían métricas
   agregadas (vacíos/únicos), nunca valores crudos de campos personales.
5. **Regla estructural (robustez)**: toda lectura de columna debe resolverse por
   **encabezado real** (`IA_columnaPorNombre`), nunca por índice fijo. Evita
   regresión del falso positivo masivo (18 605/18 605) corregido en integridad.
6. **Sin arquitectura paralela**: pipeline clínico, modelo de datos y contrato
   de captura V2 permanecen intactos; la IA es una capa de asistencia que no
   sustituye la fuente de verdad operativa.

Documentación: `docs/INFORME_IA_GEMINI.md` (**vigente**). Verificación: la
documentación IA no contiene secretos (API key no expuesta). Baterías verdes tras
la integración (núcleo 553, contrato datos 38, aceptación 50, captura V2 36,
payload 19, backend 68, cola 33, formulario_web 27, validar_html 18).

**Fecha:** 2026-09-11

**Fecha:** 2026-09-10

## DEC-031
**Título:** Política de revisión IA sobre consistencia de eventos + eliminación de huérfanos
**Estado:** Aprobada (ejecutada)
**Motivo:** Tres ajustes de política en `IA_revisarConsistencia` ejecutados sobre la
base real:
1. **Eventos huérfanos eliminados (143):** eventos con ID_INTERNO no nulo sin paciente
   asociado en PACIENTES se eliminan en bloque vía `IA_limpiarEventosHuerfanos()`
   (patrón `Recuperar_ejecutar`: leer → filtrar → limpiar → reescribir, nunca
   `deleteRow` en loop). Eventos con ID vacío NO se eliminan (pueden ser capturas
   en curso).
2. **`EVENTO_FECHA_ANTERIOR_INGRESO` ignorado:** la fuente previa al sistema puede
   tener eventos antes y después del ingreso; es heterogeneidad normal.
3. **`SECTOR_EVENTO_DISTINTO` ignorado:** el sector del evento puede diferir del
   consolidado del paciente por la misma razón. `RUT_EVENTO_DISTINTO` SE MANTIENE
   como WARNING.
**Resultado:** 632 → **17** problemas reales (2667 pacientes / 20 471 eventos).
**Fecha:** 2026-09-15

## DEC-032
**Título:** Sectores como zonas geográficas por cercanía + INICIO v3 con gráficos embebidos
**Estado:** Aprobada en su parte normativa (sectores = distancia geográfica) ·
**gráficos y motor de datos REVERTIDOS por DEC-033** (deploys @173–@175)
**Motivo:** Los colores de sector representan **distancia geográfica desde la
institución**, no prioridad clínica: NARANJO = más lejano, AMARILLO = distancia
media, VERDE = más cercano. Las descripciones anteriores ("Prioritario" /
"En seguimiento" / "Estable") eran incorrectas y fueron corregidas. Además, INICIO
se amplió con:
1. **3 gráficos embebidos:** pie de distribución por sector, pie por
   estratificación, y columna de controles vencidos / próximos 30d / últimos 30d.
2. **Motor de datos** en el margen azul (cols 30–31, invisible): 10 rangos con
   COUNTIF derivados de PACIENTES, que alimentan los gráficos.
3. **"Controles para HOY"** añadido a la tabla ESTADO del SISTEMA.
4. Verificación ampliada a 16 checks (motorSector, motorEstrat, graficos, infoHoy).
**Funciones puras nuevas (testables):** `Hojas_formulaCuentaSector`,
`Hojas_formulaCuentaEstrat`, `Hojas_formulaCuentaControl`, `Hojas_motorDatos`.
**Fecha:** 2026-09-15

## DEC-033
**Título:** Reversión de estadísticas y gráficos de INICIO + lienzo compactado
**Estado:** Aprobada (ejecutada)
**Reverte:** DEC-032 (parcial). Tras revisar INICIO en vivo el usuario pidió
eliminar las estadísticas y compactar el ancho; los gráficos embebidos y su
motor de datos eran percibidos como "ruido", no como valor operativo.
**Ejecutado:**
1. **Eliminado** el bloque VISUALIZACIÓN de INICIO (gráficos pie sector /
   pie estrat / columna de controles), el motor de datos del margen (10 filas
   COUNTIF en cols 30–31) y las funciones auxiliares (`Hojas_motorDatos`,
   `Hojas_graficoPie`, `Hojas_graficoColumna`,
   `Hojas_formulaCuentaSector/Estrat/Control`).
2. **Lienzo compactado**: `FILA_FIN` 92→**55**, `COL_FIN` 40→**32**, `FILA_CONT`
   66→**53**, `COL_CONT` 24→**24**; anchos de columna apretados (cierre del
   margen azul derecho panorámico de 400px y del aire azul de cols 25–26;
   columnas decorativas del margen 48px→30px).
3. **"Controles para HOY"** se conserva como fila de ESTADO DEL SISTEMA
   (fórmula inline `COUNTIF(PROXIMO_CONTROL;TODAY())`), sin motor de datos.
4. Verificación de INICIO reducida a **12 checks** operativos.
**Tests:** núcleo 591/591 (sin motor/gráficos) · HTML 18/18 · aceptación
50/50 · contrato 36/36 · **deploys @173–@175**.
**Fecha:** 2026-09-15

## DEC-063
**Título:** Controles por persona en vista 50/50 + captura aditiva de controles/ seguimientos desde fuentes
**Estado:** Aprobada / vigente
**Motivo:** (1) El panel "Controles por persona" era una consulta bajo demanda sin
lista inicial ni orientación al operador; se rediseña como herramienta operativa
50/50: planilla densa de personas con controles **pendientes** (VENCIDO /
POR_VENCER / SIN_FECHA) auto-cargada al abrir la única lectura automática del
modal, chips de estado, búsqueda acotada al filtro activo y detalle + acciones
(registrar control/seguimiento del día, abrir ficha). Sin KPIs ni estadísticas;
la vigencia siempre se deriva en vivo (`Control_calcularProximo`) y el PROXIMO_CONTROL
de fuente se conserva como dato sin gobernar la vigilancia (doctrina FIX v0.8.5).
(2) Se corrige la pérdida real de datos: `Ingresos_mapearEncabezadosHoja` descartaba
SEGUIMIENTO / CONTROL / PRÓXIMO CONTROL / PROFESIONAL / PRE INGRESO de las fuentes
(sinónimos confirmados → ULTIMO_SEGUIMIENTO, ULTIMO_CONTROL, PROXIMO_CONTROL,
PROFESIONAL_SEGUIMIENTO, PREINGRESO) dejándolos en `desconocidos`, y
`Ingresos_pacienteDesdeNormalizado`/los lectores copiaban solo los 9 campos
operativos.

1. **Rediseño 50/50** `Controles.html`: izquierda = sector + chips de estado
   (Pendientes/Vencidos/Próximos/Sin control/Vigentes/Todos) + tabla densa
   paginada ("Cargar más") + búsqueda que re-consulta bajo el filtro activo;
   derecha = detalle de la persona (vigencia, últ. control/seguimiento,
   recordatorio) y acciones: registrar control/seguimiento (hoy vía
   `api_controlActualizarUltimo`) o abrir ficha (`UI_abrirFicha`). Modal 1160×760.
2. **Filtro por estado en el endpoint**: `Control_consultarControles` acepta
   `estados[]`, `estado`, `pendientes` y ordena por urgencia
   VENCIDO→POR_VENCER→SIN_FECHA→VIGENTE (proximo asc, nombre) con cálculo puro
   `Control_estadosCriterio`; `sectores` se recalculan sobre el subconjunto filtrado.
3. **Captura aditiva**: nuevo `CAMPOS_INGRESO_ADICIONALES` (5 campos). El mapeo
   de encabezados y los lectores (`Fuentes_importarMuestra`, `Ingresos_leerHoja`)
   conservan por INDEX/CONTROL cualquier campo adicional con sinónimo confirmado
   (mismo criterio aditivo que `Fuentes_cargaReal`); `Fuentes_normalizar` normaliza
   las fechas de ULTIMO_CONTROL/ULTIMO_SEGUIMIENTO como las de PROXIMO_CONTROL
   (warn, no bloquea). `Ingresos_pacienteDesdeNormalizado` preserva los valores
   reales (`ULTIMO_SEGUIMIENTO`/`ULTIMO_CONTROL` dejan de fijarse en `''`).
   ER de `Ingresos_mapearEncabezadosHoja` sin cierre erróneo y `desconocidos`
   plana (sin nested) — no cambia el ER histórico de INTEGRIDAD.
4. **Ocultamiento completo de IA frontend**: se elimina el menú `IA` de `onOpen()`,
   el registro `IAPanel` de `UICFG_DIALOGOS` y **`src/IAPanel.html`**. Se conserva
   integro `28_IA.js` (backend de asistencia, webhook `IA_revisarTodo()`, tests).
5. **Limpieza de código muerto**: eliminada `api_centroResumen` (nadie la llamaba
   tras simplificar Sidebar); se conserva `_centro_resumen` (su función pura, bajo test).

Tests: núcleo 597/597 (6 nuevos: mapeo aditivo + pipeline de controles + filtro
por estado/orden de `Control_consultarControles`), validar_html 17/17 (IAPanel.html
eliminado). Publicado: **deploy @180** en el deployment operativo (smoke `GET /exec`
→ 200). Docs: `docs/INFORME_JORNADA_AUTONOMA_2.md`.
**Fecha:** 2026-09-15

## DEC-064
**Título:** ACTUALIZAR pasa a ser el mecanismo real de mantenimiento (estructura + datos desde fuentes) — merge conservador e idempotente
**Estado:** Aprobada / vigente
**Motivo:** DEC-058 reservaba "Actualizar sistema" a derivados/vistas y relegaba la
importación de fuentes y la creación de estructura al instalador, dejando inviable
el ciclo operativo FUENTE → detectar registros nuevos → actualizar existentes →
crear columnas faltantes → normalizar → derivados → vista (solo se volvía a cargar
todo re-instalando). La v0.9.6 redefine ACTUALIZAR como mantenimiento completo con
reglas explícitas de no-pérdida, sin que ninguna otra ruta duplique lógica.

**Reglas del merge (idempotente y conservador):**
1. Una fuente vacía o inválida **nunca** destruye un dato vigente.
2. `ULTIMO_CONTROL`/`ULTIMO_SEGUIMIENTO`: se conserva la fecha MÁS RECIENTE válida
   (ISO, comparación lexicográfica); la fuente nunca retrocede el punto de estado.
3. `SEXO`/`FECHA_NACIMIENTO`: fill-only; el `SEXO` de fuente se normaliza de forma
   defensiva (`Norm_normalizarSexo`) antes de comparar para evitar falsos conflictos
   ("MASCULINO" vs "M"). Divergencia sobre valor vigente → `REQUIERE_REVISION` sin
   sobrescribir. El vacío se conserva como **sin información**; no se infiere.
4. Contexto (`PROXIMO_CONTROL`, `PROFESIONAL_SEGUIMIENTO`, `PREINGRESO`,
   `DUPLA_INGRESO`, `TELEFONOS`, `OBSERVACIONES`): fill-only.
5. `NOMBRE`, `RUT`, `SECTOR`, `ESTADO`, `ESTRATIFICACION`, `FECHA_INGRESO`,
   `ID_INTERNO`, `EDAD` y campos técnicos jamás se escriben desde una fuente
   (revisión humana / derivados). `ESTRATIFICACION` y `ESTADO` se excluyen porque
   son derivados que `Estrat_recalcularTodos`/la lectura de EVENTOS ya recomputan;
   `PROXIMO_CONTROL` de fuente se conserva cuando `Control_recalcularTodos` no lo
   derivable (mantiene la doctrina FIX v0.8.5: la vigilancia se recalcula en vivo).
6. Trazabilidad: `FUENTE` anexa el origen sin duplicar segmentos;
   `FECHA_ACTUALIZACION` se estampa cuando se aplicaron campos; cualquier
   conflicto marca `REQUIERE_REVISION`.

**Implementación:**
- `Fuentes_cargaReal({actualizar:true})` divide el staging en Nuevas/Reutilizables
  y delega el merge en `Act_mergearPacientesDesdeStaging` (match por RUT canónico
  exacto, filas `ERROR` jamás alimentan); persiste en UN único bloque homogéneo
  (`Utl_escribirBloque` sobre `store.pacientes.map(Modelo_filaDesdeObjeto)` +
  `Modelo_invalidarLecturas`), igual que el barrido de enriquecimiento. Si el
  esquema es incompatible → `resumen.error='ESQUEMA_PACIENTES_INCOMPATIBLE'`.
- `Act_actualizarSistema(opciones)` orquesta: estructura (`Modelo_asegurarEsquemaPacientes`
  + `Modelo_alinearVistasSectoriales`) → datos (`Fuentes_cargaReal`) → demografía
  (`Act_enriquecerPacientes`) → derivados (`Estrat_recalcularTodos` +
  `Control_recalcularTodos`) → vistas + formato (`Modelo_refrescarVistasSectores`,
  `HVis_formatearIngresos`, `Hojas_formatoCondicional`) → resumen trazable
  (`fuentesRevisadas`, `nuevos`, `actualizados`, `sinCambios`, `conflictos`,
  `camposActualizados`, `enriquecidos`).
- `UI_actualizarSistema`/`UI_actualizarTodo` delegan en `Act_actualizarSistema`
  (única lógica); el instalador **sigue siendo la única puerta** para creación
  completa de estructura e instalación; ACTUALIZAR solo repara de forma
  idempotente columnas faltantes y migra SECTOR_*.

**Broken contract (migrado con test):** los tests S11R-2/S11R-3/S12 U1-U5 y T12/T13
que exigían "Actualizar NO importa fuentes / NO toca estructura" se re-apuntan al
nuevo contrato: ACTUALIZAR integra estructura + fuentes + derivados a través de
`Act_actualizarSistema`, mantiene la separación frente al instalador
(`api_instalarPaso`, creación completa), no crea pacientes/eventos directamente y
no referencia captura (`captureId`/`FORM_RESPUESTAS`).

**SEXO (auditoría de fuentes):** el campo ya existe y está normalizado
(`M|F|OTRO|vacío`); sinónimos vigentes cubren las codificaciones documentadas.
No se agregan sinónimos ni se infiere SEXO por nombre. El merge y el
enriquecimiento preservan el vacío salvo dato válido de fuente (Caso D =
sin información).

Tests: `_pruebas_actualizacion_v096` (9: fila/merge/trazabilidad/contrato + cadena),
migración S11R/S12/T12/T13. Núcleo **606/606** (597 + 9). Docs:
`docs/INFORME_ACTUALIZACION_S6.md`.
**Fecha:** 2026-09-15


## Agenda manual y acceso unificado a Captura — 2026-09-16

**Decisión solicitada por el usuario:** sustituir el cálculo automático de próxima atención
por edición manual desde Web App y ficha, conservando el campo `PROXIMO_CONTROL`.
La extensión de payload requiere contrato V3 conforme a §26; mantiene adaptador V2 en
el mismo procesador. Véase §0 de `docs/CONTRATO_CAPTURA_V2.md` para ausencia, borrado,
reintentos y preservación de fechas. No hay migración masiva ni cambio de permisos.

Captura abre una ventana con enlace por clic, QR, copia y descarga, evitando depender
exclusivamente de un popup disparado tras una RPC. `UI_mostrarQR` permanece como alias.
El selector de eventos de ficha deja de ofrecer CAMBIO_ESTRATIFICACION; su historial
sigue legible y la edición se realiza en la sección Patologías / Estratificación.


## Edición de ficha desde Captura V4 — 2026-09-17

La operación `actualizarDatos` de la Web App carga la ficha por RUT único y
envía solo campos modificados, con valores anteriores para detectar ediciones
concurrentes. Las patologías se guardan por su escritor vigente y la
estratificación continúa derivada. El último control/seguimiento puede recibir
un nuevo evento o una corrección auditada; EVENTOS sigue append-only. Una agenda
futura se guarda manualmente en `PROXIMO_CONTROL`. Véase §0.1 del contrato.


## DEC-065
**Título:** Indicador de salud mental (`SALUD_MENTAL`) extremo a extremo + MIG-002 (esquema 1→2) + reactivación de Instalar/reparar con carga real
**Estado:** Aprobada / vigente (v0.10.0)
**Motivo:** CESFAM requiere registrar, desde la captura y la ficha, si la persona
presenta un indicador de salud mental (`SI`/`NO`/vacío) sin inferirlo de texto
libre. El modelo carecía del campo y las etapas de mantenimiento
(fuentes/amarillo/enriquecimiento) solo corrían en modo diagnóstico tras la
entrega S6, dejando `Instalar / reparar sistema` inutilizable como ciclo real de
captura de datos. La v0.10.0 cubre ambos: campo nuevo con contrato V4 y un
instalador que vuelve a mutar datos reales con snapshot de respaldo.

**SALUD_MENTAL — reglas:**
1. `PACIENTES.SALUD_MENTAL`: string `SI` · `NO` · vacío (sin información). El
   vacío **no** se interpreta como `NO`; **prohibido inferir** de textos libres
   (`PS`, `PSM`, `PSICOLOGA`, `DEPRESION`, `APOYO PSICOLOGICO`…) — se conservan en
   `OBSERVACIONES`, no se copian.
2. Captura V4 añade el campo `saludMental` **OPC solo para `nuevoIngreso`**
   (§0.2/§5.1/§6/§9). Si aparece en envíos `Cp2-`/`Cp3-` → `CAMPO_NO_PERMITIDO`
   ("El indicador de salud mental requiere captura V4"). Valor distinto de
   `SI`/`NO`/vacío → `CAMPO_INVALIDO` ("Solo SI, NO o vacío (sin información)").
3. En la ficha se edita vía `actualizacion.campos.SALUD_MENTAL` (clave permitida,
   enum `['','SI','NO']`); no viaja como plano del payload.
4. Huella canónica: incluye `saludMental` **solo** en `Cp4-`; las huellas
   `Cp2-`/`Cp3-` persistidas no cambian ni se reescriben.
5. TR-1 → `SALUD_MENTAL`; TR-2 `nuevoIngreso` → columna 12 del orden
   `INGRESO_COLUMNAS` (por encabezado, no por índice fijo).

**MIG-002 (esquema 1→2):** reutiliza `Modelo_asegurarEsquemaPacientes`,
`Modelo_alinearVistasSectoriales` y `_mig002_asegurarIngresosSaludMental`.
`SISTEMA_VERSION_SCHEMA_ACTUAL = 2`. Fila de migración única en `docs/MIGRACIONES.md`
(`Mig_run002()`), sin segunda hoja ni pipeline paralelo.

**Instalar reactivado:** `INSTALAR_ETAPAS_MUTAN` vuelve a declarar
fuentes/amarillo/enriquecimiento (mismo `INST-1`); toman `LockService` de forma
explícita, `SNAPSHOT_ACTUAL` se respalda **antes** del lock, y el guard de
versión (`Instalar_versionIncompatible_`) se registra antes de tomar el lock.
`SNAPSHOT_ACTUAL` **nunca** toca `PROXIMO_CONTROL` ni `SALUD_MENTAL` de existentes
(reglas de no-pérdida DEC-064 / doctrina FIX v0.8.5). Caracteres mínimos de
unidad: `>` si hay respaldo, `P`/`B` si hay paciente o bloque — `z` = layouts
substituibles, `r/h/q/R/H` = respaldos selectivos.

**Tests:** núcleo `tests/ejecutar_local.mjs` **671/671** (incl. MIG-002, así
canónica, gates y huella Cp4); baterías externas: aceptación 50/50, contrato
36/36, captura_backend_v2 73/73 (carga `29_ActualizacionCaptura.js`),
regresiones 44/44, instalador_estabilidad PASS, validar_html 21/21. Docs:
`docs/INFORME_2026-09-21_V010_SALUD_MENTAL.md`.
**Fecha:** 2026-09-21


## DEC-066
**Título:** Ficha de paciente 2.0 + incorporación controlada de ingresos pendientes con write-back corregido y guards de token en la interfaz
**Estado:** Aprobada / vigente (v0.10.2)
**Motivo:** el flujo operativo de captura dejaba muerto el write-back de
`ESTADO_INGRESO`/`NOTA_SISTEMA` (bug de `Object.keys(Map)` introducido en
ETAPA 3b) y la ficha seguía siendo un único bloque de edición. Era necesario
darle a la ficha estructura (pestañas) e incorporar el circuito de verificación
de ingresos pendientes sin crear un segundo canal: **el panel de ingresos
pendientes del Sidebar reutiliza el pipeline único** (`api_ingresoIncorporar`
→ promoción con el mismo motor que la captura).

**Ficha 2.0 — reglas:**
1. `src/Sidebar.html` se reorganiza en pestañas: Resumen / Datos / Seguimiento /
   Clínico / Historial / Equipo. `_ECICEP_DEBUG=false` en producción.
2. Edición de ficha delega en el dominio (`src/31_Ficha.js`);
   `api_actualizarPaciente` pasa a delegar en `Paciente_actualizarCampos_` y a
   validar por campo con `Paciente_validarCampo_` (errores
   `CAMPO_INVALIDO:<campo>`, `motivo` humano por mensaje de contrato; ya no hay
   `switch` histórico duplicado). `SALUD_MENTAL` se valida estricto
   (`SI`/`NO`/vacío → error si otro).
3. Ingresos pendientes: `api_ingresosPendientes(opciones,token)` (paginado,
   sólo hojas visuales `INGRESO_*`, estados pendientes), `api_ingresoDetalle`
   (lee `VALOR_*` y `PROFESIONALES` para pintar la pre-ficha) y
   `api_ingresoIncorporar` (promoción única con `Ecicep_conLock_`: vuelve a
   leer la fila bajo lock, arma/actualiza PACIENTES, agrega EVENTOS, apropia
   `ESTADO_INGRESO`/`NOTA_SISTEMA` y activa `MODELO_*` idempotentemente —
   segundo intento → `{ok:true}` sin duplicar evento).
4. Guards por token: todas las RPC `api_*` de ficha rechazan sin token
   compartido (`ACCESO_DENEGADO`). Se propagó el token a los paneles que lo
   omitían (Controles, Dashboard, Configuracion, RemVista, CentroPruebas):
   con los guards activos esas llamadas estaban rotas en producción y se
   repararon en esta misma decisión.

**Write-back corregido:** `Ingresos_escribirEstados` itera
`Array.from(porHoja.entries())` (no `Object.keys`) y usa `resHoja` para
`getRange(...)`. Regresión cubierta en `tests/ficha_ingresos_v0102.mjs` C8
(marcado en la hoja visual) y en las fixtures de Amarillo.

**Tests:** nueva suite `tests/ficha_ingresos_v0102.mjs` **13/13**; batería total
**17 suites · 0 fallos** (núcleo 671/671, contrato 38/38, regresiones 44/44,
validar_html 21/21). `api_*` de panel (cambio en Controles/Dashboard/
Configuracion/RemVista/CentroPruebas) cubiertas por regresiones_revision +
acceso_webapp. Docs: `docs/INFORME_2026-09-22_FICHA_V2.md`.
**Fecha:** 2026-09-22

## DEC-067
**Título:** Separación de capacidades: CAPTURA ≠ OPERADOR (hardening v0.10.3)
**Estado:** SUPERADA por DEC-068 (ACCESO UNIVERSAL ECICEP, hotfix v0.10.4).
Se conserva como historial; sus objetivos de seguridad compatibles se mantienen
(superficie RPC mínima, guards por RPC, mutaciones atómicas/idempotentes,
`CONFIG_SECRETOS`), pero la separación de tokens con capacidades disjuntas se
retira: no representa el requisito real del propietario.
**Motivo:** la auditoría de la pasada v0.10.3 confirmó que una página pública
jamás debe entregar una credencial privilegiada y que una función interna no
debe volverse RPC pública solo por estar declarada `function` en Apps Script.
Se separaron los tokens con capacidades disjuntas y se encogió la superficie
RPC a wrappers `api_*` con capacidad **OPERADOR**.

**Reglas:**
1. **DOS tokens distintos en PropertiesService**: `CAPTURA_ACCESS_TOKEN`
   (página pública: únicamente `WebApp_capturarEnviar` y el preflight de captura)
   y `OPERADOR_ACCESS_TOKEN` (paneles, ficha, revisión, REM, calidad, auditoría,
   configuración, backups, CentroPruebas). La base URL pública **nunca** expone
   ni entrega el token de operador; el preflight público no filtra datos
   identificables de candidatos.
2. **CAPTURA ≠ OPERADOR disjuntas**: un token de CAPTURA no abre vistas ni RPC
   administrativas; un token de OPERADOR no autoriza operaciones de captura
   (`WebApp_capturarEnviar`). Verificado por tests.
3. **Helpers críticos privados**: `Hojas_resetFabrica_`, `Recuperar_ejecutar_`,
   `IA_limpiarEventosHuerfanos_`, `Modelo_agregarPacientes_`,
   `Modelo_agregarEventos_`, `Estrat_recalcularPaciente_`,
   `Ingresos_procesarTodasLasHojas_` solo existen con sufijo `_` (no invocables
   por `google.script.run`); su acceso pasa por wrappers `api_*` con token de
   OPERADOR. CentroPruebas.html dejó de llamar mutadores internos directamente.
4. **Mutaciones atómicas e idempotentes**: ficha valida todo antes de escribir
   (0 cambios si un campo es inválido); revisión→INGRESO cierra el caso y
   reintentar no duplica; eventos reservados no son creables genéricamente
   (`TIPO_EVENTO_RESERVADO`); todo cambio del valor vigente de estratificación
   genera `CAMBIO_ESTRATIFICACION` trazable (no-op no crea evento).
5. **CONFIG sin secretos**: `CONFIG_SECRETOS` enmascara valores secretos en
   `api_configListar` y en auditoría; los guards de `api_configGuardar/Agregar`
   rechazan persistir secretos por API.
6. **No se sacrifican** las correcciones @218 (`TOKEN_ACCESO`) y @219
   (`ID_INICIAL_SAFE`); el schema continúa en **2** (no se creó MIG-003).

**Tests:** nuevas suites `tests/seguridad_capacidades_v0103.mjs` (**10/10**),
`tests/rpc_surface_v0103.mjs` (**4/4**) y `tests/integridad_mutaciones_v0103.mjs`
(**9/9**); `tests/acceso_webapp.mjs` reescrita (**8/8**) y
`tests/regresiones_revision.mjs` actualizada con el contrato del evento de
estratificación (**44/44**). Batería total **20 suites · 0 fallos** (verifier
2026-09-22; núcleo 671/671, validar_html 22/22).
**Fecha:** 2026-09-22

## DEC-068
**Título:** ACCESO UNIVERSAL ECICEP: una sola credencial habilita todas las funciones operativas (hotfix v0.10.4)
**Estado:** Aprobada / vigente (v0.10.4) — SUPERA a DEC-067
**Motivo:** incidente real de producción "El procesamiento del envío falló;
reintentable (ACCESO_DENEGADO)". Requisito del propietario: ECICEP lo usan
trabajadores autorizados con el enlace del sistema; mínima fricción, máxima
disponibilidad. La separación de capacidades de v0.10.3 (DEC-067) contradice
ese requisito: una página operativa abierta con el enlace del sistema podía
mostrar la ficha (MODO_OPERADOR activo) pero sus RPC internas se autorizaban
con el token CAPTURA y fallaban ACCESO_DENEGADO; además
`WebApp_servirCaptura_` podía entregar `TOKEN_ACCESO = ''` (token vacío por
contención de lock), rompiendo las páginas operativas.

**Reglas:**
1. **UNA credencial canónica**: `CAPTURA_ACCESS_TOKEN` habilita TODAS las
   funciones operativas (captura, ficha, Controles, Dashboard, REM, Revisión,
   Configuración, Backups, CentroPruebas). Su valor se conserva: el QR/URL
   vigente NO se invalida con el hotfix.
2. **`OPERADOR_ACCESS_TOKEN` queda OBSOLETO** pero se acepta como legacy de
   transición (no rompe pestañas/enlaces abiertos durante v0.10.3); no crea
   una segunda capacidad.
3. **`WebApp_claveUniversal_` nunca devuelve ''**: devuelve la clave existente
   sin consultar el lock; toma el lock SOLO para crear la clave; ante
   contención relee sin lock; si realmente no existe, falla (nunca inyecta
   credencial vacía en una página).
4. **Toda página se sirve con la credencial universal** (`CAPTURA_ACCESO` /
   `TOKEN_ACCESO` / `TOKEN_INVITACION`) y `MODO_OPERADOR = true`;
   `PORTAL_URL` siempre disponible. `CapturaWeb.html` deja de ocultar
   ACTUALIZAR_DATOS por falta de capacidad y se auto-recupera de
   `ACCESO_DESACTUALIZADO` (recarga 1 vez preservando `captureId`).
5. **Se mantienen los hardening compatibles de DEC-067**: superficie RPC mínima
   (wrappers `api_*`, helpers internos con `_`), guards de autorización en cada
   RPC (token inválido/ausente → `ACCESO_DENEGADO`), mutaciones atómicas e
   idempotentes, `CONFIG_SECRETOS`, schema en **2** (sin MIG-003).
6. **El pipeline de entrega no re-autentica**: la autorización ocurre en el
   entrypoint (`WebApp_autorizarCaptura`) y bajo lock; la capa de dominio se
   usa directamente, sin wrappers `api_*` internos (auditado).

**Tests:** nueva `tests/acceso_universal_v0104.mjs` (**7/7**);
`tests/acceso_webapp.mjs` reescrita al contrato universal (**8/8**);
`tests/seguridad_capacidades_v0103.mjs` y `tests/rpc_surface_v0103.mjs`
ajustadas al contrato de credencial única (**10/10** y **4/4**). Batería total
**21 suites · 0 fallos** (verifier 2026-09-22; `validar_html` 21/21).
**Fecha:** 2026-09-22

## DEC-069
**Título:** FIABILIDAD OPERATIVA + LECTURAS ACOTADAS: el envío no se cuelga, el retry no duplica y la captura no barre hojas de 10.000 filas (v0.10.5)
**Estado:** Aprobada / vigente (v0.10.5) — aditiva sobre DEC-067/DEC-068
**Motivo:** el backend y el pipeline ya eran idempotentes (CONTRATO_CAPTURA_V2
§13), pero el operador podía quedar colgado ante latencia o timeouts (entregaba
el payload sin saber si el backend lo recibió; un reintento manual del usuario
y la repetición AJAX tras timeout podían duplicar la percepción del evento), y
la lectura de `INGRESO_*` (bloque completo vía `getDataRange`) penalizaba cada
request de captura/pre-ficha al crecer la hoja, sin necesidad técnica: la Web
App siempre acota a filas concretas.

**Reglas:**
1. **Estado de envío por acción**: cada acción fija `_enviando=true` con fase
   correcta (`entrega` / `preflight`) y produce exactamente UNA RPC. El botón
   se bloquea durante el envío y se desbloquea siempre: por respuesta, por
   timeout (mensaje compartido "tardando más de lo esperado") o por modal de
   duplicados (que pausa el timeout humano y conserva el envío activo).
2. **Guard de secuencia**: un callback de una solicitud vieja (timeout que
   llegó tarde) jamás toca una solicitud nueva (`secuencia` en sessionStorage).
3. **Intención explícita de duplicado**: continuar desde el modal de duplicados
   conserva el payload sin `confirmarNuevoPaciente`; "Registrar de todos modos"
   lo fija. El backend usa `confirmarNuevoPaciente` como confirmación de la
   intención humana y mantiene la idempotencia por `captureId` (§13B:
   `CONFLICTO_IDEMPOTENCIA` ante el mismo `captureId` con payload distinto;
   reenvío del mismo control con el MODO payload no duplica el evento).
4. **Recuperación de acceso anti-bucle**: ante `ACCESO_DESACTUALIZADO` recarga
   UNA vez (`ecicep_reload_acceso` consumido), conservando `captureId`
   (sessionStorage `ecicep_captureId`) y restaurándolo sin reenviar el envío.
   Si algo no marcó sano el intento, la siguiente incidencia avisa y NO recarga
   otra vez.
5. **Bootstrap bloqueante**: acceso con catálogo de profesionales vacío no
   habilita el envío (`CATALOGO_PROFESIONALES_NO_DISPONIBLE`); ante
   `ok:false`/error de transporte reintenta (máx. configurado) y ofrece botón
   Reintentar. Invariante: el backend NUNCA responde `ok:true` de
   `WebApp_estadoInicial` sin `profesionales` cargados.
6. **Contrato RPC uniforme**: **dataset vacío ≠ RPC fallida**. Conjuntos sin
   datos responden `ok:true` con colecciones vacías (`api_buscar` `filas:[]`,
   `api_revisionListar` `casos:[]` con métricas en cero); fallos reales y
   accesos rechazados responden `ok:false` con `codigo/motivo`; `api_ficha`
   nunca devuelve `null`.
7. **Concurrencia del operador**: las mutaciones críticas usan
   `Ecicep_conLock_`; bajo contención responden `SERVICIO_OCUPADO`
   (reintentable) y NO ejecutan la mutación. La ficha es todo-o-nada: guarda
   PACIENTES + EVENTO; un fallo de vista derivada solo avisa
   `VISTA_SECTOR_PENDIENTE` (no rompe el guardado). Retry del mismo cambio de
   sector converge (un solo evento CAMBIO_SECTOR; dato obsoleto → `FICHA_CAMBIO`).
8. **Lecturas acotadas (§41)**: la captura en la Web App y la pre-ficha leen
   solo la fila de encabezados + filas físicas permitidas
   (`Ingresos_leerFilasAcotadas_`), nunca `getDataRange` ni
   `getRange(1,1,getLastRow(),...)`; el umbral de 50 filas vive en el lector
   (con 51+ delega en `Modelo_leerBloqueCabecera`). Una hoja `INGRESO_*` de
   10.000 filas no se barre en ningún request de captura/pre-ficha.
9. **Versionado**: `ECICEP.VERSION` → `0.10.5`, **schema 2 sin migración**;
   deployment operativo reutilizado @221 (misma URL/QR, sin deployments por
   rutina). Se conservan superficie RPC mínima, guards por RPC, mutaciones
   atómicas/idempotentes y `CONFIG_SECRETOS`.

**Tests:** nuevas `tests/operador_resiliencia_vNEXT.mjs` (**32/32**) y
`tests/captura_rendimiento_acotado_vNEXT.mjs` (**9/9**). Batería total
**23 suites · 0 fallos** (verifier 2026-09-22; `validar_html` 22/22,
núcleo 671/671). Informe
`docs/INFORME_2026-09-22_FIABILIDAD_OPERATIVA_V0105.md`.
**Fecha:** 2026-09-22

## DEC-070
**Título:** CONTROLES Y SEGUIMIENTOS POR PERSONA + REM SIN LOADER FALSO: alternar vista en cliente, sin RPC ni backend nuevos (v0.10.6)
**Estado:** Aprobada / vigente (v0.10.6) — aditiva, UI-only
**Motivo:** el panel ya recibía `ultimoControl` Y `ultimoSeguimiento` en cada
fila, pero la interfaz solo mostraba "control" (columnas/títulos/detalle) y
presentaba toda la agenda como "control". Aparte, la vista de trabajo REM
mostraba una animación "Calculando el informe…" al abrir sin que existiera
ninguna RPC. Ambas mejoras se resuelven 100 % en cliente.

**Reglas:**
1. **Selector CONTROL/SEGUIMIENTO sin RPC**: el cambio de vista es solo
   presentación sobre las filas ya cargadas. `setTipoVista()` re-pinta
   (`pintar(false)`) y NO invoca `consultar`, `api_controlPanel` ni
   `ECICEP_lectura`; conserva sector, estados, búsqueda, paginación y persona
   seleccionada. Default `CONTROL` (comportamiento previo preservado).
2. **Columnas y textos neutros**: vista CONTROL muestra "Últ. control"
   (`ultimoControl`); vista SEGUIMIENTO muestra "Últ. seguimiento"
   (`ultimoSeguimiento`); ambas usan `proximo` como **Próxima atención**
   compartida. NO se crea `PROXIMO_SEGUIMIENTO` ni columnas equivalentes; el
   filtro de vigencia (VENCIDO/POR_VENCER/SIN_FECHA/VIGENTE) sigue calculándose
   sobre la agenda manual `PROXIMO_CONTROL`. Textos de apoyo hablan de
   "atenciones", no de "controles".
3. **Detalle sin pérdida**: el panel derecho conserva AMBOS últimos registros,
   ordenando primero el del tipo activo; "Recordatorio" se muestra sin
   formateo de fecha. Ambos botones de registro subsisten. Tras registrar y
   reconsultar (`consultar(true)`), la vista elegida se conserva
   (última lectura de `CTRL.tipo`; nada lo resetea).
4. **Backend intacto**: `api_controlPanel`, `Control_consultarControles`,
   `Control_filasPanel` sin cambios (una lectura, cero RPC al alternar).
5. **REM — sin loader falso**: `init()` NO auto-consulta; el HTML inicial de
   `#wrap` es neutro (sin `class="prog"` ni "Calculando el informe…"). El
   loader real vive solo en `consultar(btn)`, inmediatamente antes de ejecutar
   `api_remVista`. `REM_ULTIMA` (año/mes/sector/MODO/actividad) se conserva.
   `api_remVista`/`_rem9_datos`/`Rem9_armarVistaDatos`/`REM_exportarPdf_`
   intactos.
6. **No se toca** acceso/seguridad/roles/tokens/migraciones/schema (**2**) ni
   deployment (mismo deployment operativo; URL/QR intactos).

**Tests:** nueva `tests/controles_seguimientos_rem_v0106.mjs` (**9/9**: T1-T6
controles/seguimientos; T7-T9 REM). Batería total **24 suites · 0 fallos**
(verifier 2026-09-22; `validar_html` 22/22). Informe
`docs/INFORME_2026-09-22_CONTROLES_SEGUIMIENTOS_REM_V0106.md`.
**Fecha:** 2026-09-22

## DEC-071

**v0.10.7 — Incorporación de ingresos clara para el operador (Web App única).**

**Motivo:** el panel de ingresos pendientes repetía la leyenda de "copia" a
sectores ("Al incluirlo se copiará al sector…"), prometía copia directa y no
explicaba lo que realmente hace la única operación vigente: incorporar la fila
al sistema a través del pipeline único
`INGRESO_* → PACIENTES → EVENTO INGRESO → INGRESADO → SECTOR_*`. El operador
no sabía qué pasaba al confirmar ni con cada fila (qué es válido, qué puede
incorporarse con advertencias y qué no, y por qué).

**Reglas:**
1. **Incorporar es el único verbo.** Se eliminan textos de "Copiar al sector"
   y la promesa de copia directa. Incorporar = correr el pipeline único con el
   gate ya existente (validación/normalización/identificación). No existe
   "copiar fila a SECTOR_X".
2. **Flujo individual:** el detalle explica "Al incorporar" (crear/actualizar
   paciente, registrar ingreso, actualizar sector) y muestra cuál es el destino
   real ("Sector destino: X"), los errores y advertencias. ERROR renderiza el
   botón de incorporar deshabilitado ("No incorporable"); con advertencias se
   permite incorporar con aviso visible. La confirmación es ligera (sector en
   el botón y en el diálogo), nada de "copiar".
3. **Resultados traducidos (§13):** tras incorporar, un mensaje claro por
   estado: INGRESADO ("Incorporado correctamente"), REQUIERE_REVISION
   ("Requiere revisión antes de incorporar"), DUPLICADO ("Ya existe un ingreso
   equivalente"), ERROR ("No pudo incorporarse") y el aviso de nuevo
   paciente/paciente existente. La ficha se abre y volver regresa a la lista
   recargada.
4. **Incorporación masiva de válidos (UNA RPC):** nuevo
   `api_ingresosIncorporarValidos({sector})` bajo el mismo lock, que reutiliza
   íntegramente `Ingresos_procesarTodasLasHojas_` con `soloHojas` del sector
   (canónico + alias INGRESO_NARANJA) y `confirmarNuevos:false`. NUNCA N RPC
   por fila. El cliente pide confirmación, pinta el resumen estructurado
   (Ingresados / Revisar / Errores / Sin cambios) y refresca la lista.
   `Ingresos_incorporarValidos_` recompone el resumen plano del pipeline en
   `{resumen, resultados}` congruentes (contadores de agrupación derivados de
   `resultados` por `estado` para que coincidan con lo que la UI pinta).
5. **Filtros y KPIs:** listado con filtro por SECTOR y por ESTADO
   (PENDIENTE/WARNING/ERROR) y chips de conteo sin RPC extra (`conteos` en
   `api_ingresosPendientes`). Paginación retrocede si la incorporación dejó la
   página vacía (§38).
6. **No se toca** acceso/seguridad/roles/tokens/migraciones/schema (**2**) ni
   se crea arquitectura paralela: el pipeline es literalmente el mismo
   (`Ingresos_procesarTodasLasHojas_`), solo se añaden entradas claras y KPI
   aguas arriba. Para que la operación grupal quede visible, el menú
   **ECICEP** de Sheets incluye la entrada **"Incorporar ingresos"**
   (`UI_abrirIngresos` → sidebar modo `ingresos` que auto-carga el panel); el
   orquestador legacy "📥 Procesar ingresos" permanece solo como función
   interna. Deployment: mismo deployment operativo (URL/QR intactos).

**Tests:** nueva `tests/incorporacion_ingresos_vNEXT.mjs` (**13/13**: T1-T10
flujo/masivo/vista derivada/idempotencia/exclusiones; T11-T12 textos UI y
guardas de token + KPI; T13 entrada de menú "Incorporar ingresos"). Batería
total **25 suites · 0 fallos** (verifier
2026-09-23; `validar_html` 22/22). Informe
`docs/INFORME_2026-09-23_INCORPORACION_INGRESOS_V0107.md`.
**Fecha:** 2026-09-23

## DEC-072

**v0.11.0 — `INGRESADO` es un resultado canónico y la captura interactiva usa búsquedas puntuales.**

**Motivo:** una edición manual podía dejar `INGRESADO` sin crear paciente ni
evento, y dos rutas críticas de captura barrían tablas completas. Ambas
conductas producían estados falsos y latencia creciente.

**Reglas:**
1. Editar una única celda `ESTADO_INGRESO` a `INGRESADO` en `INGRESO_*` ejecuta
   `ECICEP_onEditIngreso`; el trigger llama al pipeline único bajo lock.
2. `INGRESADO` exige evidencia `PACIENTES + EVENTO INGRESO + FUENTE hoja/fila`.
   Un resultado fallido conserva su estado real. La doble edición es idempotente.
3. Diagnóstico y reparación distinguen evidencia canónica de vistas derivadas;
   solo regeneran derivados o reprocesan una fuente existente.
4. Las operaciones interactivas de una entidad usan lookup puntual. Los lotes,
   REM y dashboard pueden seguir usando lecturas por bloques.
5. Instalar/Reparar asegura un único backup previo, instala exactamente un
   trigger propio, reconcilia derivados y repite el diagnóstico. No elimina
   triggers ajenos ni hojas adicionales.
6. `PROXIMO_CONTROL` continúa siendo agenda manual; no existe
   `PROXIMO_SEGUIMIENTO`. Salud mental, estratificación clínica, contrato V4 y
   esquema 2 conservan su semántica.

**Validación:** `node tools/verificar.mjs` → **29 suites, 0 fallos**; smoke
anónimo `/exec` HTTP 200 con `0.11.0` y build `ca94c64`. Publicado en el mismo
deployment operativo, versión **@228**.

**Fecha:** 2026-09-23
