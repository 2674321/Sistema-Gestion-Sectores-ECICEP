# HISTORIAL — Evolución por versión

> Archivo de **historial** del proyecto ECICEP. Recopila la evolución completa
> por versión y fase, desde `v0.5.0` hasta el estado actual. Ninguna sección de
> este archivo tiene carácter normativo de arquitectura: la especificación
> vigente vive en `AGENTS.md`, `ARQUITECTURA.md` y `docs/CONTRATO_CAPTURA_V2.md`
> (**NORMATIVO**). Una referencia histórica solo se convierte en instrucción
> vigente cuando aparece en la documentación vigente.

## Fase RPC / higiene de memo (deploys @121–@130)

Campaña de optimización de llamadas RPC de Sheets en el path rutinario,
publicada en el deployment operativo (`/exec`, verificado HTTP 200 + marcadores
cliente en cada deploy). Detalle completo en `docs/INFORME_OPTIMIZACION.md §8`.

- **Captura/INGRESO**: confirmación de entrega sin releer la hoja completa por
  envío (`bloqueReusar`), marcas de EVENTOS en 1 bloque, verificación de estados
  acotada a filas afectadas.
- **Hoja de cálculo**: celdas sueltas escritas como fila en 1 `setValues`;
  `Modelo_restaurarFuente`/`Form_reiniciarRespuesta`/CONFLICTOS; `api_revisionResolver`
  en 1 lectura de bloque con escritura 1×2 de hermanas.
- **CONFIG**: `_UI_controlConfig()` — 1 lectura por endpoint de controles
  (`{freq, aviso}`), sin caché módulo. `Control_leerFrecuencia()` queda solo para
  fallback puro y jobs por lote.
- **Memo**: reutilización del encabezado memoizado en la verificación de esquema,
  guard `getLastRow()` redundante eliminado, e invalidación tras migración de
  esquema (`insertColumns`) y tras append de PACIENTES.
- **Cosmético (#33)**: `QRFormulario.html` migrado de literales a `var(--c-*)`
  (única página que espejaba la paleta de la Web App; auditoría de los 15 HTML
  confirmó que el resto ya usa tokens).
- **Invariantes consolidados** documentados en `ARQUITECTURA.md → Rendimiento`.

## Qué incluye (v0.5.0 → v0.7.0)

- **Panel de Control**: KPIs reales, tarjetas por sector con cobertura, última actividad, accesos.
- **Estadísticas** (dialog): 5 indicadores + 4 gráficos Chart.js + filtro cruzado por sector y fecha.
- **REM mensual** derivado de EVENTOS: **resumen = censo del sector** (una fila por paciente, indicadores del mes) + detalle por atención, exportable a **Excel .xlsx** (contrato REM original) y PDF profesional. Vista de trabajo **al vuelo** (modo Mes / General), sin hoja REM_SALIDA.
- **Selector de patologías ECICEP** en ficha (49 condiciones) con ponderación y esquema migrado.
- **Cola de revisión**, registro de gestiones, timeline de historial, hard guard de escrituras.
- **Instalar / Reparar Sistema**: hojas, CONFIG centralizado, catálogo de vigencias,
  validaciones desplegables en INGRESO_*, diseño del libro (colores/orden/ocultas/banding).
- **Centro de Pruebas**: diagnóstico seleccionable con informe técnico.
- **Registro del sistema** (visor de LOG) con filtros y export CSV.

## v0.7.0 — Las hojas como interfaz profesional

- **Hoja INICIO**: navegación con enlaces internos + indicadores de calidad con fórmulas vivas (pacientes, eventos, por revisar, estratificación pendiente, RUT inválidos, duplicados, última actualización)
- **Validación de RUT en vivo**: al escribir en INGRESO_* se normaliza el formato y se pinta verde (✓ válido) / rojo (❌ inválido) con módulo 11, marcando duplicados con nota
- **Formato condicional**: RUT inválido, requiere revisión, estratificación pendiente, estados de ingreso con semáforo textual, cola de revisión pendiente/resuelto
- **Protecciones por categoría** (advertencia, nunca bloqueo): EVENTOS append-only, SECTOR_*/REM generadas, LOG/STAGING técnicas, claves de CONFIG
- **Columnas técnicas ocultas** (IDs, fuentes, flags internos) · **Filtros** en todas las hojas de datos · Encabezados centrados
- **Instalar / Reparar Sistema** = un clic: estructura + fuentes (Naranjo/Verde/Amarillo) + CONFIG + catálogos + validaciones + diseño + INICIO + menú + auditoría final

## v0.8.0 — Las hojas como interfaz profesional + cierre operativo

- **Hoja INICIO v5**: escritorio de aplicación sobre lienzo azul institucional panorámico (cubre monitores 21"), ventana clara con barra de app, 8 botones-módulo con icono/nombre/descripción, 6 KPIs tarjeta, alerta dinámica ⚠/✓, distribución por sector con %, estado del sistema (versión/build/datos/fuentes separados)
- **Identidad de versión automática**: BUILD.js (commit+fecha) generado en cada push y mostrado en INICIO/Estadísticas/Instalador
- **⚙ Instalar sistema**: instalación por **9 etapas reales** con ventana de progreso (barra, checklist ✓/●/✕, reintentar etapa), carga automática de TODAS las fuentes conectadas (Naranjo/Verde/Amarillo, idempotente) y verificación final
- **Validación de RUT en vivo** en INGRESO_* (normaliza formato, módulo 11, duplicados con nota)
- **Formato condicional** en PACIENTES/INGRESO/SECTOR/CONFLICTOS (RUT inválido, revisión, estrat. pendiente, estados)
- **Protecciones por categoría** (advertencia, nunca bloquean Apps Script) + columnas técnicas ocultas + filtros
- **Calidad de datos**: auditoría completa de pacientes/eventos + **Cola de Revisión como centro de calidad** (1 fila por entidad, motivos JSON, resolución automática) + normalización segura de RUTs
- **💾 Backups**: manual y automático semanal (domingo 03:00, poda últimos 8) + **Reset de fábrica** con backup y doble confirmación
- **🔑 Autorización consolidada**: un clic otorga todos los scopes del sistema
- **REM Excel v2**: generado en el navegador (SheetJS), opciones de procesado, previsualización e informe PDF profesional

## v0.8.4 — Lote integrado v0.8.4 (dedupe · catálogo profesionales · configuración segura)

- **🟡 Amarillo — deduplicación del histórico**: análisis puro determinista por clave `ID_INTERNO + TIPO_EVENTO + FECHA + FUENTE AMARILLO` (nuevo en **Centro de Pruebas → Auditar duplicados** en *dry-run* con ejemplos, y **Eliminar duplicados** con confirmación). Idempotente: un segundo pase reporta 0. Se conserva siempre el primer registro.
- **👩⚕️ Catálogo central de profesionales**: nueva hoja oculta **PROFESIONALES** (`CODIGO · NOMBRE · TIPO_ROL · ACTIVO`) sembrada con 9 roles. `renderizarDupla` y la ficha resuelven nombres desde el catálogo del servidor (se eliminó la copia duplicada hardcodeada del cliente). Sin cambios de contrato en la gestión de dupla.
- **⚙️ Configuración segura**: ítem de menú (y función) `⚙️ Configuración` abre un **diálogo de administración** (nueva `Configuracion.html`); la hoja CONFIG **nunca se muestra** (se vuelve a ocultar de forma idempotente y se excluye de la navegación por hoja). Se marcan claves técnicas como solo-lectura, permite editar/agregar/eliminar claves no protegidas.
- **🗂️ FUENTES como referencia**: la hoja FUENTES ahora queda **oculta** y se siembra una sola vez (instalación) con el inventario estático de las fuentes de `FUENTES_DRIVE` (archivo · sector · hojas · notas de exclusión). Es referencia visual únicamente; no se rellena dinámicamente.
- **INICIO**: el módulo secundario **ADMINISTRACIÓN** deja de abrir CONFIG y pasa a ser un bloque informativo (configuración vía menú). 316 pruebas locales verdes.

## v0.8.5 — Modelo clínico de control unificado (Estratificación → frecuencia → próximo → estado → color → recordatorio)

- **Frecuencia de control configurable por nivel y unidad (días/meses)**. Nuevas claves
  `FREC_CONTROL_G*_CANT` + `FREC_CONTROL_G*_UNIDAD` (por persona vía estratificación G1/G2/G3/G),
  editables en el diálogo de configuración con **dropdown de unidad y validación de entero**. La
  interfaz CONFIG se reorganizó en **secciones** (ESTRATIFICACIÓN · CORREOS/RESPONSABLES · COMUNES · ADMINISTRADOR).
- **Cálculo centralizado y comprobable** (`Control_*`): `PRÓXIMO_CONTROL = ÚLTIMO_CONTROL +
  frecuencia(estratificación)` reutilizando `Vigencia_vencimiento` (respeta fin de mes en meses);
  estado (**VENCIDO/POR_VENCER/VIGENTE/SIN_FECHA**), **color** (rojo/ámbar/verde/gris) y **recordatorio**
  con una única fuente de verdad en `02_Normalizacion.js`.
- **🟡 Amarillo corregido (causa raíz)**: `Amarillo_aplicarHistorico` ya NO copia el PRÓXIMO CONTROL de
  la fuente (que rompía el modelo); ahora se **deriva** de último control + estratificación + frecuencia.
- **Recálculo automático**: al registrar un CONTROL (`Ingresos_sincronizarCache` / `api_registrarEvento`)
  se actualiza PRÓXIMO_CONTROL y las vistas de sector al instante.
- **Panel de Control ampliado**: nueva sección **«Controles por persona»** (filtro por sector) que lista
  personas con su estratificación, último control/seguimiento, próximo control, estado en color, edad y
  botones **«Actualizar control» / «Seguimiento»** (`api_controlPanel` / `api_controlActualizarUltimo`).
- **Diagnóstico del modelo (dry-run)**: `api_diagnosticoControl` + botón en Centro de Pruebas reporta
  métricas reales por sector, personas sin último control, controles vencidos/próximos/vigentes,
  PRÓXIMO desalineados con la frecuencia configurada y acciones sugeridas. Versión que **aplica** los
  próximos (idempotente) disponible por separado.
- **🐛 Bug de «Eliminar» en Configuración corregido**: el `confirm()` nativo está deshabilitado en el
  sandbox de Apps Script (provocaba el error del botón rojo); se reemplazó por **doble confirmación
  inline**. + `Modelo_invalidarLecturas()` en todas las escrituras de CONFIG y validación cliente/servidor.
- **Edad automática** desde `FECHA_NACIMIENTO` (`Utl_edadDesde`, consciente del cumpleaños) usada por
  panel y diagnóstico. **335 pruebas locales verdes**.

## v0.8.7.2 — Responsables por sector acumulables + dropdowns + mejora visual de Configuración

- **Nuevo modelo ACUMULABLE de responsables** (DEC-039, supera el «pendiente #13»): un sector puede
  tener **N responsables** y un responsable puede estar en **N sectores**. Nueva hoja interna
  `RESPONSABLES` (oculta): `SECTOR | CODIGO_RESPONSABLE | NOMBRE_RESPONSABLE | CORREO | ACTIVO`.
  Identificador estable = `CODIGO_RESPONSABLE` (enlaza al catálogo `PROFESIONALES`; para personas fuera
  del catálogo se usa `R_<clave>`). La unicidad `(SECTOR, CODIGO)` impide duplicados.
- **Pantalla dedicada dentro de 🗂️ Configuración → Correos · Responsables**: selector de sector
  (Amarillo/Naranjo/Verde), **dropdown de responsable alimentado del catálogo** `PROFESIONALES`
  (activos + optgroup de inactivos + responsables ya en uso + opción «Otro»), nombre auto-completado
  y correo opcional. Lista «Responsables actuales» por sector con **estado activo/inactivo** (●/○) y
  quitar asociación (no elimina del catálogo). Los **dropdowns no cargan pacientes/eventos/controles**.
- **Guardado atómico validado**: `api_responsablesGuardarSector` reescribe el sector completo en un
  bloque (sin sobrescribir otros sectores ni el catálogo) tras validar duplicados, nombres, correos y
  sectores del conjunto cerrado; avisa si el cargo proviene del catálogo inactivo.
- **Dry-run / diagnóstico** (`api_responsablesListar` → `Responsables_diagnostico`, puro): muestra
  totales por sector, duplicados, correos inválidos, responsables sin catálogo, inactivos y los correos
  legacy `RESPONSABLE_<SECTOR>` (que ahora se administran desde el panel, no como texto plano) — sin
  modificar datos automáticamente.
- **Correos múltiples listos para uso futuro**: `Responsables_correosDe(lista, sector, legacy, incluirInactivos)`
  devuelve la colección deduplida de un sector (activos + legacy). Las claves legacy se mantienen en
  CONFIG y se integran como correo adicional, sin migración automática.
- **Mejora visual de Configuración con colores semánticos** (no decorativos): encabezados de sección
  diferenciados (Estratificación 🟣, Correos · Responsables 🔵, Comunes ⚪, Administrador 🔴 con banner
  de «solo lectura» para claves sistema), chips de nivel **G1/G2/G3** junto a las frecuencias de
  control, puntos 🟢 activo / ○ inactivo en responsables, chips 🔴 error / 🟡 atención / 🔵 información
  en el diagnóstico.
- **Regresión confirmada**: **360 pruebas locales verdes** (350 previas + 10 nuevas:
  `_pruebas_responsables_v0872`: mapeo, N responsables por sector, duplicados, mismo responsable en
  varios sectores, sector inválido, correos múltiples con legacy, inactivos, diagnóstico/dry-run,
  conjunto cerrado de sectores). `node --check` limpio.

## v0.8.7.1 — UX de rendimiento: Controles bajo demanda, ficha completa y diálogos de configuración

- **Controles por persona pasa a consulta BAJO DEMANDA**: el Panel ya **no lista ~300 pacientes al
  abrirse**. La card muestra un estado vacío con acceso a un **modal independiente** (`Controles.html` →
  `UI_abrirControles`, `showModalDialog(html, 'Controles por persona')`) donde el usuario elige sector
  (el «Todos los sectores» **solo consulta cuando se selecciona**) y/o escribe una búsqueda (ID, RUT con
  puntos/guiones ignorados, nombre sin tildes; mínimo 2 caracteres). Consulta **paginada** (`api_controlPanel(opts)`
  → `Control_consultarControles`, puro y testeable: sector → término → `Control_filasPanel` → slice;
  límite default 25, máximo 100, devuelve total/desde/hasta + «Cargar más»). El Panel ya no ejecuta
  `cargarControles()` al inicializar.
- **Ficha persona completa**: la 5ª pestaña **Dupla** ya no queda cortada. La barra de pestañas es
  **desplazable** (`overflow-x:auto` + `flex-wrap:nowrap`; cada tab `flex:0 0 auto` + `white-space:nowrap`,
  nunca se oculta ninguna) y la activa se trae al viewport (`scrollIntoView`). Contenido con scroll propio
  (`#vista` con `padding-bottom`). Nueva apertura directa `UI_abrirFicha(idInterno)` (sidebar modo `ficha`
  con `ID_INICIAL`) usada desde «Ver ficha» del modal de controles.
- **🐛 showModalDialog corregido**: «Responsables y correos» y «Estratificación» fallaban con
  «Los parámetros (HtmlService.HtmlOutput) no coinciden con la firma de método Ui.showModalDialog».
  La firma real exige **2 argumentos** `showModalDialog(output, título)`; `_ui_configuracion` y
  `UI_abrirLog` llamaban con **1 solo argumento**. Corregidas **ambas** + auditoría: `UI_instalarSistema`,
  `_ui_dialogo` (todas las vistas anchas: Dashboard/REM/CentroPruebas/AcercaDe/Backup/Log) ya usaban 2;
  sidebars usan `showSidebar(output.setTitle(...))` (1 argumento, correcto).
- **Menú consolidado**: `🎯 Estratificación` y `👨‍⚕️ Responsables y correos` dejan de ser entradas
  independientes y pasan **dentro del submenú `⚙️ Configuración`** (abriendo CONFIG pre-filtrado a su
  sección). Se añade el submenú `📅 Seguimiento y controles` → `🩺 Controles por persona`. **Sin
  entradas duplicadas** y todos los endpoints/interfaces funcionales permanecen.
- **Inventario único de diálogos** (`UICFG_DIALOGOS`) y verificaciones: plantilla compila + opener
  global (live `_pruS_menu`/`_pruS_plantillas`), coherencia 5 pestañas↔5 paneles (live `_pruS_ficha`),
  y estructura del inventario (node).
- **Regresión confirmada**: **350 pruebas locales verdes** (337 previas + 13 nuevas: `_pruebas_controles_v087`
  sector/término RUT-tildes/ID, paginación, cap 100, contexto individual + `_pruebas_dialogos_v087`).

## v0.8.7 — Diagnóstico y optimización de rendimiento del Sector Amarillo

- **🐛 Timeout del Sector Amarillo diagnosticado**: «Se ha superado el tiempo máximo de ejecución.»
  en `Amarillo_aplicarHistorico` por tres costes acumulados: (a) **O(F×P)** — un `pacientes.filter(...)`
  por cada fila fuente a pesar de existir `idxRut`; (b) **~2×F lecturas de CONFIG** —
  `Control_calcularProximo` e `Ingresos_sincronizarCache` re-leían la hoja CONFIG **sin `freqConfig`**
  en cada fila; (c) **F escrituras** individuales `getRange().setValues()` fila por fila en PACIENTES.
- **Núcleo puro e indexado**: nuevo `Amarillo_calcularHistorico(pacientes, eventos, filas, freqConfig)`
  (in-memory, testeable) construye `idxRut` y el agrupado de eventos **una sola vez** → **O(F+P+E)**
  en vez de O(F×P) (benchmark local: **~217× más rápido** en 5.000 pacientes × 5.000 filas).
- **CONFIG leída una sola vez por operación** y reutilizada (frecuencia + perfilado) — antes se
  re-leía por fila (regla clínica **sin cambios**: PRÓXIMO_CONTROL sigue derivándose de
  ÚLTIMO_CONTROL + estratificación + frecuencia, jamás se copia el de la fuente).
- **Escrituras por bloques contiguos**: `_amarillo_escribirPacientes` agrupa índices consecutivos y
  hace **una `setValues()` por bloque**, no una por fila. Eventos ya se escribían en batch.
- **Perfilado activable/desactivable por CONFIG**: con `AMARILLO_PROFILE = TRUE` registra en el LOG
  tiempos por fase (config/cálculo/escritura), filas fuente, pacientes y eventos.
- **`api_registrarEvento`** reutiliza una única lectura de frecuencia (`Ingresos_sincronizarCache`
  recibe `freqConfig` explícito; antes releía CONFIG por cada evento).
- **Regresión confirmada**: **337 pruebas locales verdes** (335 previas + 2 nuevas de núcleo/escala
  Amarillo: corrección de índices/regla/preingreso/pendientes y escala idempotente 100/1.000/3.000).

## v0.8.6 — Rediseño de navegación centrado en tareas (Parte 0 · auditoría UX)

- **Menú reorganizado por tareas** (se eliminaron los nombres técnicos/por módulo interno):
  `👥 Personas` (Buscar/Ficha · Cola de revisión · Procesar ingresos),
  `🎯 Estratificación`, `👨‍⚕️ Responsables y correos`, `📊 Reportes` (Estadísticas · REM),
  `⚙️ Configuración` y `🛠️ Herramientas` (Instalar · Centro de Pruebas · Backups · Registro · Acerca de).
  `Estratificación` y `Responsables y correos` abren el diálogo de Configuración **pre-filtrado** a su
  sección (`UI_configuracionEstratificacion`/`UI_configuracionResponsables` · `SECCION` inicial en `Configuracion.html`).
- **PERSONAS como entidad central — ficha integrada**: nueva pestaña **«Seguimiento»** en la ficha
  (`Sidebar.html`) que consolida **Último seguimiento · Último control · Próximo control · Estado (color) ·
  Estratificación · Recordatorio** y botones **«Seguimiento hoy» / «Control hoy»**, con recalculo
  automático del próximo/estado. Reutiliza `api_ficha` (campo `seguimiento` vía `Control_filasPanel`) y
  `api_controlActualizarUltimo` — una única fuente de verdad, sin duplicar lógica (Parte 0.6/0.7/0.8).
- **INICIO como centro operativo**: los módulos pasan a **lenguaje de tarea** (PERSONAS · INGRESOS ·
  REVISIÓN · REPORTES · CONFIGURACIÓN) conservando sus enlaces a las hojas donde vive la tarea y con
  pista «menú → …» para las interfaces de diálogo. En ESTADO DEL SISTEMA se desglosan **Controles
  VENCIDOS / por vencer (≤30 días) / últimos 30 días** calculados sobre `PRÓXIMO_CONTROL` (Parte 0.5).
- **🐛 Botón huérfano corregido**: «Sembrar prueba» en Centro de Pruebas llamaba a `UI_sembrarFicticios`
  (inexistente); ahora se define la función y funciona.
- **Consolidación sin romper**: no se eliminó ningún endpoint ni interfaz funcional; sólo cambió la
  navegación y el etiquetado, manteniendo compatibilidad total del backend.
- **335 pruebas locales verdes**.

## v0.8.8 — Auditoría integral del sistema (FASE 1 dry-run, FASE 2 rendimiento, FASE 3 arquitectura clínica, FASE 4 consistencia, FASE 5 UX, FASE 6 dry-run real, FASE 7-15 correcciones, tests, versión, git/clasp)

- **Módulo de auditoría completo** (`src/21_Auditoria.js`): dry-run de **solo lectura** (FASE 1: 1.1–1.17 inventario, fuente de verdad, edad, controles VIGENTE/PRÓXIMO/VENCIDO/SIN_ÚLTIMO/SIN_ESTRAT/SIN_CONFIG/FECHA_INV/DESALINEADO, Amarillo, responsables, profesionales, CONFIG ESTRAT/RESP/COMUNES/ADMIN/LEGACY/DESCONOCIDA, duplicados, INICIO, Panel, Controles, Ficha, Config, diálogos, menú; FASE 2 perfilado N+1/cache/O(n²); FASE 3 arquitectura clínica única PERSONA→ESTRAT→FREC→ÚLTIMO→PRÓXIMO→ESTADO→COLOR→RECORDATORIO; FASE 4 consistencia entre interfaces; FASE 5 UX pasos por tarea; FASE 6 informe ╔═╗ con datos reales anonimizados). Botón **⚖️ Auditoría v0.8.8** en Centro de Pruebas.
- **Correcciones de integridad clínica (C1)**: `api_controlActualizarUltimo` ahora **crea EVENTO CONTROL/SEGUIMIENTO** (fuente de verdad EVENTOS + caché derivada en PACIENTES) — antes solo actualizaba caché sin evento. Unifica el flujo con `api_registrarEvento`. Dashboard "controles del mes" y REM ahora cuentan correctamente.
- **Fuente de verdad AVISO_CONTROL_DIAS (C2)**: Panel (`Control_filasPanel`), diagnóstico (`Control_analizar`), ficha leen aviso desde CONFIG (una vez por operación) en vez de hardcodear 7 días. Elimina variante muerta.
- **Rendimiento (C3)**: `api_centroResumen` top-4 eventos en **single-pass O(E)** (sin sort completo O(E log E)). Limpieza `console.log` en `Modelo_fichaPaciente` (C4).
- **Tests de auditoría y escala (FASE 10–11)**: `_pruebas_auditoria_v088` (clasificación, anonimización, Amarillo, responsables, profesionales, CONFIG, render ╔═╗) + `_pruebas_escala_v088` (**100 / 500 / 1k / 3k / 5k / 10k** pacientes y eventos: `Control_filasPanel`, `Aud_clasificarPoblacion`, `Amarillo_analizarDuplicados`, `Responsables_diagnostico`, búsqueda RUT O(n)).
- **Clasificación hallazgos (FASE 7)**: CRÍTICO/ALTO/MEDIO/BAJO. Solo CRÍTICO/ALTO/seguros corregidos (cambio mínimo, FASE 9).
- **Informe final obligatorio A–I** (FASE 6): A=Auditoría, B=Datos reales, C=Rendimiento, D=UX, E=Correcciones, F=No corregido, G=Tests (antes 360 → ahora 393), H=Git/Clasp, I=Acciones manuales.
- **Versionado 0.8.8.0** (semver 4 partes) + `README.md` + `DECISIONES.md` (DEC-040). `node --check` limpio, **393/393 tests verdes**.

## v0.8.8.1 — Navegación y organización visual de hojas (secciones, buscador, "Ver sección")

- **Secciones visuales declarativas** (`src/22_HojasVisual.js` + `SECCIONES_HOJAS` en `00_Config.js`): agrupan columnas reales por función (IDENTIDAD, SECTORIZACIÓN, CONTROLES, CLÍNICO, TÉCNICO, EVENTO, AUDITORÍA) con colores semánticos (azul/verde/naranja/morado/gris). No inventa columnas; usa solo las reales de cada hoja.
- **Hoja priorizadas**: INGRESO_NARANJO/AMARILLO/VERDE, PACIENTES, SECTOR_NARANJO/AMARILLO/VERDE, EVENTOS. Excluidas: LOG, CONFIG, CONFLICTOS, FUENTES, PROFESIONALES, RESPONSABLES.
- **Idempotente**: `HVis_aplicarTodasLasSecciones()` inserta filas de sección ANTES de encabezados (no mueve fila 1), combina celdas solo para título, estiliza encabezados, congela filas+columna ID. Ejecutar 2× = mismo resultado.
- **Buscador rápido en celda A1** (`HVis_instalarBuscador`): nota explicativa + formato visual + validación nativa + filtro nativo de Sheets. Busca por RUT/ID/NOMBRE según claves disponibles por hoja. NO carga población completa; usa filtro nativo instantáneo.
- **"Ver sección" individual** (`HVis_menuVerSeccion` → diálogo `HVerSeccion.html`): usa fila activa para obtener persona, selector de secciones reales de la hoja, muestra solo campos de esa sección. NO oculta columnas globalmente (multi-usuario seguro). Botón "Abrir ficha" reutiliza `UI_abrirFicha`.
- **Diagnóstico dry-run** (`HVis_diagnosticarTodas`): valida columnas existentes/faltantes por sección antes de aplicar.
- **Tests**: `_pruebas_hojasvisual_v0881` (10 tests: config, normalización, mapa columnas, validación, claves búsqueda, colores). **403/403 tests verdes**.
- **Versionado 0.8.8.1** + `README.md` + `DECISIONES.md` (DEC-041). `node --check` limpio.

## v0.8.8.2 — Reparación de instalación + eliminación de "Ver sección" + CONFLICTOS oculta

- **Eliminada funcionalidad "Ver sección"**: borrado `HVerSeccion.html`, funciones `HVis_abrirVerSeccion`, `HVis_obtenerDatosSeccion`, `HVis_abrirFichaDesdeHoja`, `HVis_menuVerSeccion`, entrada de menú `👁 Ver sección` y referencias residuales. Código limpio sin código muerto.
- **Secciones visuales y buscador integrados en instalador**: nueva fase `visual` en `Instalar_pVisual` que ejecuta `HVis_aplicarTodasLasSecciones()` + `HVis_instalarTodosLosBuscadores()`. Ahora se aplican realmente al instalar/reparar.
- **Hoja CONFLICTOS oculta**: añadida a `Hojas_ocultarTecnicas()` para que no aparezca en navegación normal (se accede vía Cola de revisión).
- **Diagnóstico dry-run de instalación**: nueva función `Instalar_diagnosticar()` + menú `🔍 Diagnóstico instalación` en `🛠️ Herramientas`. Informa qué cambiaría la instalación sin aplicarlo (estructura, secciones, buscadores, CONFLICTOS, validaciones, formato, ocultas).
- **Instalador más idempotente**: evita reaplicar formatos/validaciones innecesariamente; cada fase verifica estado antes de escribir.
- **Tests**: 403/403 verdes. `node --check` limpio. Versionado **0.8.8.2**.

## v0.8.8.3 — Rediseño visual real de hojas + buscador prominente + instalador reconciliador

- **Secciones visuales reales**: `HVis_aplicarSecciones` reescrita para crear filas de sección con **merged cells** que abarcan exactamente las columnas de cada sección, título visible centrado, colores semánticos, bordes separadores. Buscador prominente en **fila 1 merged (A1:D1)** con etiqueta "🔎 Buscar persona (RUT / ID / Nombre)", nota explicativa, formato azul distintivo. Encabezados reales estilizados (gris, negrita, centrados, borde inferior grueso) y congelados junto con buscador + secciones. Filtro nativo activado en encabezados reales.
- **Instalador como reconciliador real**: nueva fase `diagnostico` (primera) ejecuta `Instalar_diagnosticar()` que compara estado actual vs deseado por fase (estructura, visual, validaciones, formato, CONFLICTOS, ocultas, menú) y reporta qué cambiaría. Cada fase posterior verifica si hay cambios pendientes antes de escribir (idempotencia real). Fase `visual` usa `HVis_aplicarTodasLasSecciones` que detecta estado actual vs plan deseado y aplica solo diferencias (no duplica filas, no destruye filtros).
- **CONFLICTOS oculta garantizada**: verificada en diagnóstico y aplicada en `Hojas_ocultarTecnicas`.
- **Validaciones centralizadas**: diagnóstico verifica SEXO, ESTADO_INGRESO, FECHA DE NACIMIENTO en todas las puertas INGRESO antes de aplicar.
- **Tests**: `_pruebas_hojasvisual_v0883` (10 tests: mapa columnas, validación, plan cálculo, diagnóstico, idempotencia). **408/408 tests verdes**.
- **Versionado 0.8.8.3** + `README.md` + `DECISIONES.md` (DEC-043). `node --check` limpio.

## v0.8.9.0 — Normalización integral del sistema

- **PACIENTES con encabezados correctos**: `Modelo_crearEstructura` ahora escribe encabezados de `MODELO_PACIENTE` al crear la hoja (antes `_MODELO_HOJAS_DEF[PACIENTES] = null` causaba `SIN_ENCABEZADOS` y fallaba `Fuentes_cargaReal` con `ESQUEMA_PACIENTES_INCOMPATIBLE`). Reparación de esquema funciona aunque la hoja exista sin encabezados.
- **Fórmulas INICIO dinámicas**: `Hojas_formulaIndicador` ahora usa `Hojas_columnaPaciente(campo)` → `Hojas_indiceAColumna(idx)` para resolver letras de columna reales desde `MODELO_PACIENTE` (ID_INTERNO→A, RUT→B, ESTRATIFICACION→I, RUT_DV_VALIDO→W, REQUIERE_REVISION→AD, FECHA_ACTUALIZACION→AC). Eliminadas referencias hardcoded `AD2:AD`, `I2:I`, `W2:W`, `B2:B`, `AC2:AC`.
- **Instalador idempotente real**: fase `diagnostico` (primera) ejecuta `Instalar_diagnosticar()` que compara estado actual vs deseado por fase (estructura, validaciones, formato, CONFLICTOS, ocultas, menú). Cada fase posterior verifica cambios pendientes antes de escribir. Fase `validaciones` centraliza SEXO, ESTADO_INGRESO, FECHA DE NACIMIENTO en todas las puertas INGRESO. Fase `visual` detecta estado actual vs plan y aplica solo diferencias (no duplica filas, no destruye filtros).
- **CONFLICTOS oculta garantizada**: verificada en diagnóstico y aplicada en `Hojas_ocultarTecnicas`.
- **Visual system 3-row layout**: Fila 1=Barra sector, Fila 2=Buscador, Fila 3=Encabezados reales, Datos desde fila 4. Congeladas filas 1-3 + columna 1 (ID). Quitada validación de columna 1 (ID) en datos.
- **Tests**: `_pruebas_hojasvisual_v0883` + `_pruebas_auditoria_v088` + `_pruebas_escala_v088` + tests INICIO dinámicos. **408/408 tests verdes**.
- **Versionado 0.8.9.0** + `README.md` + `DECISIONES.md` (DEC-044). `node --check` limpio.

## v0.8.9.5 — Pulido visual y automatización de ingresos

- **Encabezados de INGRESO siempre formateados**: `Modelo_crearEstructura` estiliza los
  encabezados al crear una hoja nueva, al verificar coincidencia total del esquema y al
  corregir etiquetas; el pipeline `Ingresos_procesarTodasLasHojas` (paso 6b) y
  `UI_actualizarTodo` invocan `HVis_formatearIngresos()` — fin de los encabezados en
  blanco en hojas creadas fuera del instalador.
- **Terminología UX**: PACIENTE/SEGUIMIENTO/ESTRATIFICACIÓN y etiquetas unificadas
  (Buscar paciente, Ficha del paciente, Cola de revisión, Procesar ingresos).
- **Resumen de procesamiento breve** (`Ingresos_resumenTexto`) para el toast.
- **Tests**: `_pruebas_pulido_v0895`. **427/427 tests verdes**.
- Despliegue registrado históricamente en `@63` (eliminado); esa referencia no define el deployment operativo actual.

## v0.8.9.6 — DESIGN SYSTEM único (normalización visual global)

- **DESIGN_SYSTEM** en `00_Config.js`: única especificación visual del sistema.
  Rampas por identidad (GENERAL/AMARILLO/NARANJO/VERDE) con jerarquía única
  *barra → sección → encabezado*; `TIPOGRAFIA`, `ALTURAS` (28/26/42/30/21),
  `ANCHOS`+FALLBACK (default 130), `ENCABEZADOS`, `BORDES`, `SUPERFICIE`, `MARCA`
  y `ESTADOS` clínicos separados del color de organización (Parte 5).
- **Una sola tinta** (`TINTA_SECCION #0B3C49`) con contraste ≥4.5:1 sobre todas las
  superficies; encabezados **uniformes** (#0E5C68/blanco) en todas las hojas.
- **`HVis_identidad(nombre)`**: EVENTOS hereda la identidad NARANJO; el resto de
  hojas técnicas son GENERAL. Hojas de sector **monocromáticas por familia**;
  PACIENTES conserva barras semánticas dentro de la familia azul.
- **Refactorizado a tokens**: `22_HojasVisual`, `06_Modelo` (pestañas/banding/anchos
  de catálogo), `17_Hojas` (INICIO + formatos condicionales clínicos →
  `DESIGN_SYSTEM.ESTADOS`), `08_Dashboard` y `14_REM` (incl. PDF). Cero colores
  literales fuera de la configuración.
- **Reconciliación y diagnóstico** (Parte 17/20): `HVis_especVisual`
  (estado deseado), `HVis_pendientesVisual` (CAMBIOS PENDIENTES, solo lectura) y
  `HVis_reconciliarHoja` (aplicar → verificar). El diagnóstico del instalador
  reporta los cambios visuales pendientes por hoja.
- **Tests**: `_pruebas_designsystem_v0896` (rampas, contraste, coherencia entre
  hojas, identidad, no-colisión clínico/organización, anchos fallback, especificación
  visual). **436/436 tests verdes**.
- **Despliegue (histórico):** se documentó un límite operativo de deployments durante esa etapa. Ese criterio no define la arquitectura actual.

## v0.9.0 — Etapa histórica: captura basada en Google Forms (DEC-047/048)

> **Estado: HISTÓRICO / SUPERADO.** La captura por Google Forms se abandonó y no
> debe reactivarse. La Web App es el único canal operativo de captura.

- **Nuevo módulo `src/24_Formulario.js`** (menú `📥 Formularios` → panel `FormularioPanel.html`): el
  sistema recibía respuestas de un Google Form y las convertía en **entradas al pipeline existente**,
  nunca en una base clínica paralela (`FORM → validación/normalización → pipeline → PACIENTES/EVENTOS`).
- **Acciones**: `NUEVO_INGRESO` (anexa fila canónica a `INGRESO_<SECTOR>` y corre el pipeline real;
  duplicados los decide el sistema), `REGISTRAR_CONTROL` / `REGISTRAR_SEGUIMIENTO` (evento completo vía
  `api_registrarEvento`) y `ACTUALIZAR_DATOS` (solo campos operativos; identidad nunca se toca). La
  estratificación NO se cambia por formulario (se mantiene en la ficha).
- **Hoja `FORM_RESPUESTAS`** con contrato `FORM_RESPUESTAS_COLUMNAS`; columnas siempre mapeadas
  por encabezado (`Form_mapeoEncabezados`), nunca por índice. Idempotencia por `responseId` + marca
  `FORM|<id>|<ACCIÓN>` en `NOTA_SISTEMA`/`FUENTE`; reintentos máx 3; `LockService`; trailer de resultados.
- **Instalación conservadora (DEC-047)**: `Form_instalar` NUNCA crea/modifica el formulario de Google
  (solo prepara la estructura + trigger idempotente); `Form_diagnosticar` es solo lectura y
  `Form_reparar` nunca borra datos ni recrea un formulario eliminado.
- **Seguridad**: validación estricta por acción (RUT con DV por módulo 11, fechas reales, sector y
  estratificación oficiales), teléfono no bloquea un ingreso válido, panel con métricas agregadas sin
  datos personales, trigger `forSpreadsheet` idempotente y ventana inicial de captura de 2 h.
- **Tests**: `_pruebas_formulario_v090` (contrato de columnas, mapeo por contenido, validación por
  acción, decisiones ANEXAR/CLINICA/ERROR/CUARENTENA/PROCESADO_YA/SALTAR/YA_ANEXADO, traducción de
  estado, pendientes, métricas, duplicados decididos por el pipeline, simulador determinista 10→3000).
  **455/455 tests verdes**; `node --check` limpio; cero colores literales fuera de la configuración.

## v0.9.1 — Etapa histórica: estrategia DEV + DEMO (DEC-049/050)

> **Estado: HISTÓRICO / SUPERADO.** La estrategia DEV/DEMO se abandonó; el sistema
> actual trabaja como **único entorno operativo**.

- **Mismo código, dos entornos aislados** (`src/25_Entorno.js`): la identidad se resolvía por
  `Spreadsheet.getId()` (`Entorno_detectar`), NUNCA por el nombre de la hoja. `ENTORNOS` registraba
  `DEV` (desarrollo, `1OEV…`) y `DEMO` (demostración, `1Iyv…`). Deployment de una versión estable a
  DEMO sin comprometer el desarrollo ni los datos reales.
- **Gate de procesamiento** (`Entorno_validarProcesamiento`): bloqueaba con `ERROR_CONFIG_ENTORNO`
  cuando el libro activo no estaba registrado o cuando el `FORM_ID` configurado pertenecía a otro
  entorno (aislamiento cruzado Form DEV↔DEMO). Aplicado en captura, procesamiento y trigger.
- **Backups aislados por entorno**: `ECICEP_Backups_<ENV>` (o `BACKUP_FOLDER_ID` del entorno);
  DEV y DEMO jamás compartían carpeta de respaldo.
- **Panel y diagnóstico muestran entorno**: `Form_diagnosticar`/`Form_obtenerEstado` exponían
  entorno, spreadsheet y coherencia; el panel `FormularioPanel.html` los muestra.
- **Batería de aceptación end-to-end** (`tests/aceptacion_formulario.mjs`): 21 casos deterministas
  que validan el flujo que GAS ejecutará (validación → decisión → pipeline → eventos → caché) más
  la estrategia DEV/DEMO: NUEVO_INGRESO, duplicados por el pipeline, RUT/fechas/sector inválidos,
  CONTROL que deriva PRÓXIMO→ESTADO→COLOR, CUARENTENA, SEGUIMIENTO/ACTUALIZAR, reintentos,
  concurrencia y recuperación idempotentes por marca, escala 10→3.000, esquema estable y
  observabilidad sin datos personales.
- **Tests**: `_pruebas_entornos_v091` + `_pruebas_formulario_v090`. **463/463 núcleo + 21/21
  aceptación verdes**; `node --check` limpio. El comportamiento de environments/deployments de esta
  etapa es histórico y no define la publicación actual.

## v0.9.2 — Etapa histórica: transición de captura (DEC-051)

- En esta etapa histórica la captura se desplazó hacia una interfaz separada de la hoja. En el estado actual esa interfaz es la **Web App**, no Google Forms.
- **MVP operativo = CONTROL/SEGUIMIENTO**: flujo completo (persona ya existe) cubierto de punta a
  punta; idempotencia por marca `FORM|<id>|<ACCIÓN>` impide duplicados en reintentos.
- **Catálogos desde la fuente oficial**: `PROFESIONAL` se nutre de `CATALOGO_PROFESIONALES`,
  `SECTOR` de `SECTORES_RESPONSABLES`, `ESTRATIFICACIÓN` de `['G1','G2','G3']`. Nada se copia a
  mano.
- **Observabilidad**: `Form_metricasOperativas` (% vía formulario, registros por form, errores,
  rechazos, duplicados evitados, reprocesamientos) y `Form_trazabilidad` (por-envío: RESPONSE_ID ·
  MARCA · FECHA · ACCION · RUT · ID_INTERNO · ESTADO · MOTIVO · REINTENTOS · ID_EVENTO).
- **Hoja de control `FORM_CONTROL`**: tabla administrativa visible y regenerable (`Form_refrescarControl`)
  con la trazabilidad por-envío + el bloque de métricas operativas. Panel `FormularioPanel.html`
  agrega las métricas y los botones "Actualizar hoja de control" y "Reprocesar errores".
- **Recuperación idempotente** (`Form_reprocesar`/`Form_reiniciarRespuesta`): listar/reprocesar
  ERROR y PENDIENTES; reinicia solo estados no-PROCESADO y nunca duplica (marca/INGRESO_FILA).
- **Tests**: `_pruebas_operativo_v092` (+6) + Grupo C de aceptación (+8). **469/469 núcleo +
  29/29 aceptación verdes**; `node --check` limpio.

## v0.9.3 — Estabilización integral Web App (canónica vigente)

> **Versión canónica actual: `0.9.3`** — fuente de verdad `ECICEP.VERSION` en `src/00_Config.js`.
> Build `99f85c2` (2026-09-08) · deploy operativo `@103`.

- **Web App como único canal operativo de captura** (contrato de captura V2 implementado en
  `src/26_Captura.js` → `WebApp_capturarEnviar`/`WebApp_capturarEstado`). Google Forms queda
  abandonado como canal histórico; no se crea `FORM_ID` ni trigger `onFormSubmit` para operación.
- **Catálogo de profesionales como fuente única vía RPC**: la Web App carga `api_profesionalesCatalogo()`
  desde `PROFESIONALES` (`CODIGO/NOMBRE/ACTIVO`); se eliminó la copia hardcodeada en cliente.
  `24_Formulario.js` usa `Profesionales_catalogo()` con filtro `ACTIVO/NOMBRE`.
- **Pipeline sin gate de entorno operativo**: el único entorno es el Spreadsheet configurado por
  `ECICEP.SPREADSHEET_ID`. `src/25_Entorno.js` permanece como referencia histórica.
- **QR estabilizado** (`CapturaWeb.html`): librería estándar del proyecto con API real
  `qrcode→addData→make→getModuleCount→isDark`, render en `<canvas 220x220>` vía
  `google.script.run→api_webappEstado`.
- **Config centralizada**: `ECICEP.WEB_APP_URL` en `00_Config.js` consumida por `ECICEP_webAppUrl()`;
  fallback `ScriptApp.getService().getUrl()`.
- **Tests**: **469/469 núcleo + 29/29 aceptación** verdes. Deployments como mecanismo técnico.

## Fase S9 — Auditoría profunda (rendimiento · automatización · robustez)

> Informe completo: `docs/INFORME_AUDITORIA_S9.md`. Fase de auditoría sin cambio de versión.

- **Código muerto verificado removido** (0 referencias en src + tests + HTML + menú): `Utl_mapaPor`,
  `Utl_cacheGet/Put/Olvidar`, `Fuentes_validar`, `_fuentes_columnasStaging`, `DIAGNOSTICO_BUSCAR_FICHA`,
  `Dash_actualizar` + `_dash_inicializarFiltros` + `_DASH_FILTROS`, `Form_reparar`,
  `api_formularioDiagnostico`, `api_formularioInstalar`, `api_profesionalesCatalogo`,
  `Entorno_gateGAS`, `Act_enriquecerPacientePorRut`, `WebApp_previaDuplicados` (legacy pre-V2),
  `api_webappCapturar`, `salida_contador`.
- **Declarado y auditado SIN cambio**: inicio en 1 RPC (`WebApp_estadoInicial`), búsqueda con
  debounce 220 ms + tope 25 (RUT exacto primero), lecturas por bloque + memoización `_memoLeer`,
  medición existente (`Utl_medir`, `Captura_v2_medida` T0–T6, perfil Auditor RENDIMIENTO), EDAD por
  fórmula (`DATEDIF`) ya automática.
- **Tests**: batería completa **739/739** verde tras las eliminaciones; test-guarda de "código
  muerto no reintroducible".

## Fase S10 — Cierre de bugs E2E y validador de instalación

- **BUG-E2E-003 cerrado** por E2E real completo: 16 columnas canónicas post-`Actualizar`, datos
  alineados, EDAD vacía sin `#ERROR!`, segunda ejecución idempotente, `/exec` OK.
- **BUG-E2E-004** quedó como mejora opcional no bloqueante (migración por nombre sobre datos ya
  alineados vs código no activo).
- Documentado en `docs/INFORME_BUGS_E2E.md`.

## Fase INST-1 — Instalador versionado y motor de migraciones (DEC-059)

> Informe: `docs/INFORME_INST1.md` · Esquema: `docs/MIGRACIONES.md` · `docs/VERSIONADO.md`.

- **Motor de migraciones** (`Mig_*`): migraciones declaradas (`id · desde · hasta · fn`), orden por
  cadena de aplicabilidad; `Mig_pendientesPura(actual, registro, objetivo)`; clasificación de
  instalación (`Mig_clasificarInstalacion`); ejecución en memoria con persistencia por lotes
  (`Mig_ejecutarPersistente`) y entrypoint `Instalar_pMigraciones`; schemas leídos y
  `SISTEMA_VERSION_SCHEMA_ACTUAL`.
- **Instalador endurecido**: instalación por etapas reales, diagnóstico de solo lectura, fase
  `migraciones` idempotente, sin duplicar estructura, `REPARAR` seguro.
- **Tests**: T1–T15 (decisiones, pendientes por cadena/objetivo, clasificación, aplicación con
  registro real, sin tocado de PACIENTES/EVENTOS, idempotencia, runner sin creación de hojas/filas).
  Núcleo **549/549**. E2E real: esquema **VIGENTE**, deploy `@102`, `/exec` 200.
- **CIERRE**: ESTRATIFICACIÓN G1/G2/G3 = 0 en Dashboard es estado de datos esperado (2603 personas
  pendientes de confirmar), no regresión.

## Fase MEJORA-INST1.1 — Revisión autónoma y pulido (deploy `@103`)

- **Sello BUILD siempre fresco**: `tools/push_y_abrir.sh` regenera `src/BUILD.js` (commit + fecha)
  antes de `clasp push` y `--publish` apunta al **deployment operativo** (antes al viejo `@86` de
  pruebas).
- **"Última sincronización de fuentes" legible**: la tarjeta INICIO usa
  `TEXT(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0);"dd/mm/yyyy hh:mm")` en vez del serial crudo
  `46262,55972` (tests de regresión INI-1/INI-2).
- **Duplicado #34 consolidado**: `Rem9_edadEn` delega su algoritmo en `Utl_edadDesde` (un único
  cálculo de edad; contrato REM Número/`''` preservado; tests de paridad).
- **Tests**: núcleo **552/552** + aceptación 50/50 + backend V2 65/65 + UI V2 19/19 + cola 33/33 +
  contrato V2 36/36 + contrato datos 20/20 + formulario web 25/25 · deploy operativo `@103`.

## Resumen del estado actual frente al historial

- Google Forms está **abandonado** y no debe reactivarse como canal operativo.
- DEV/DEMO/PROD **no son entornos** de la aplicación; existe un único entorno operativo.
- La **Web App es el único canal operativo de captura**.
- Los deployments son **mecanismos técnicos de publicación**, no entornos.
- No existe segunda base de datos ni segundo pipeline; una sola fuente de verdad.
- El contrato de captura se define únicamente en `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**).