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

## DEC-040
**Título:** Auditoría integral v0.8.8 — FASE 1 dry-run read-only + correcciones de integridad clínica y rendimiento
**Estado:** Aprobada
**Motivo:** El sistema requiere una auditoría completa antes de seguir evolucionando: (1) inventario real de hojas/datos, (2) única fuente de verdad por dato, (3) edad global consistente, (4) controles clínicos con clasificación VIGENTE/PRÓXIMO/VENCIDO/SIN_ÚLTIMO/SIN_ESTRAT/SIN_CONFIG/FECHA_INV/DESALINEADO, (5) Amarillo histórico auditado, (6) responsables/profesionales/CONFIG clasificados, (7) duplicados, (8) consistencia entre interfaces, (9) UX/flujos, (10) rendimiento N+1/cache/O(n²). FASE 1 **prohíbe modificar datos reales** (dry-run solo lectura). Correcciones justificadas: C1 (HIGH) `api_controlActualizarUltimo` ahora crea EVENTO (fuente de verdad única: EVENTOS + caché PACIENTES); C2 (MEDIO) aviso desde CONFIG en Panel/diagnóstico/ficha; C3 (BAJO) `api_centroResumen` top-4 single-pass O(E); C4 (CLEANUP) `console.log` removido. Tests: 360 → 393 (+33 auditoría + escala 100..10k). Informe A–I obligatorio. Versionado 0.8.8.0 (semver 4 partes). **Fecha:** 2026-08-27
