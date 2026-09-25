# ECICEP — Sistema de Gestión Sanitaria por Sectores

> Plataforma de captura, seguimiento clínico y reporte construida sobre
> **Google Apps Script + Google Sheets**, con una **Web App** como único canal
> operativo de captura y un backend de reglas de negocio testeable.
>
> **Naturaleza:** proyecto **particular**, desarrollado a medida para una
> profesional de enfermería como cliente. **No es un desarrollo institucional.**

[![CI tests](https://github.com/2674321/Sistema-Gestion-Sectores-ECICEP/actions/workflows/ci.yml/badge.svg)](https://github.com/2674321/Sistema-Gestion-Sectores-ECICEP/actions/workflows/ci.yml)
[![Demo interactiva](https://img.shields.io/badge/DEMO-interactiva-1B7A8A?style=flat-square&logo=html5)](https://2674321.github.io/Sistema-Gestion-Sectores-ECICEP/)
[![Release](https://img.shields.io/badge/release-v0.14.2-0E5C68?style=flat-square)](https://github.com/2674321/Sistema-Gestion-Sectores-ECICEP)
[![Licencia](https://img.shields.io/badge/licencia-MIT-blue.svg?style=flat-square)](LICENSE)

## De un vistazo

| | |
|---|---|
| **Modelo de datos** | `PACIENTES` (estado vigente) + `EVENTOS` (historial inmutable) + vistas derivadas · esquema 2 (MIG-002) |
| **Canal de captura** | Web App (pipeline V4 idempotente, compatible V2/V3; contrato de captura **V4** normativo en `docs/CONTRATO_CAPTURA_V2.md`) |
| **Unidades territoriales** | Sectores (Amarillo · Verde · Naranjo) |
| **Reportes** | REM mensual en Excel y PDF, estadísticas con gráficos, dashboard de indicadores |
| **Calidad** | Normalización, deduplicación trazable, cola de revisión, auditoría |
| **IA asistente** | Gemini API: análisis de calidad, duplicados, integridad, corrección asistida (ver sección [Integración de IA](#integración-de-ia)) |
| **Entornos** | **Uno solo** — un Spreadsheet, un proyecto Apps Script, una fuente de verdad |
| **Estado** | `v0.14.2` — hotfix convergencia de Presentación (FREEZE reparable, errores útiles con causa exacta); reparar sigue sin recargar datos · esquema 2 · batería sin fallos |

## v0.14.2 — hotfix convergencia de Presentación

`HVis_reconciliarHoja` repara `FREEZE_ROWS`/`FREEZE_COLUMNS` contra el contrato
(solo si difieren; respeta `frozenColumns 0`), con firma anti-no-convergencia
(`PRESENTACION_SIN_CONVERGENCIA`) y fallos estructurados con `actual/esperado`.
El motivo real (`r.errores`) llega a la UI con prioridad
motivo→linea→errores→fallidas→fallback. Sin tocar datos, sin snapshot, mismo
deployment/URL/QR. Detalle en
[`docs/HOTFIX_V0142_PRESENTACION_CONVERGENCIA_INGRESO.md`](docs/HOTFIX_V0142_PRESENTACION_CONVERGENCIA_INGRESO.md) (DEC-091).

## v0.14.1 — reparar no recarga datos en producción

`Instalar / reparar` conserva `PACIENTES`/`EVENTOS` por defecto
(`CONSERVAR`, con detección de producción por filas reales). La sincronización
es explícita: `CONSERVADOR` (completa vacíos e incorpora nuevos sin reemplazar
teléfonos, estratificación, sexo, nacimiento, observaciones ni salud mental),
`INICIAL` (libro vacío) y `SNAPSHOT_ACTUAL` avanzado (confirmación explícita +
respaldo obligatorio, dry-run con impacto en conteos sin PII). El merge clasifica
`FILL_ONLY`/`FECHA_MAX`/`REEMPLAZO_SNAPSHOT`/`CONFLICTO` y es idempotente
(segunda pasada = 0 cambios, `FUENTE` estable). Esquema 2, misma URL/QR (DEC-090).

## v0.14.0 — consolidación visual + instalador único

Un solo motor de presentación (`diseno`, 17 subtareas), un solo contrato de formatos
(`FORMATO_CAMPOS` + vertical/wrapStrategy/superficie), un instalador como centro de
diagnóstico y reparación (17 etapas en 7 grupos, forzar INICIO y diagnóstico profundo
integrados), menú Sistema con 2 items y `onOpen` sin escrituras, Actualizar con dirty
flags y fallo visual como advertencia, INICIO sin copy provisional y snapshot G1/G2/G3.
Fingerprint `pp014` (una reparación completa al actualizar). INICIO PRO gran formato y
validación en Sheets real quedan PARTIAL documentado. Detalle en
[`docs/INFORME_V014_CONSOLIDACION_VISUAL_INSTALADOR_INICIO_PRO.md`](docs/INFORME_V014_CONSOLIDACION_VISUAL_INSTALADOR_INICIO_PRO.md) (DEC-089).

## v0.14.0 (layout) — INICIO como panel operativo completo

La portada dejó de ser un esqueleto y ahora es un **panel operativo** sobre el mismo lienzo `A1:AD38`, el mismo freeze `2/0` y los mismos valores agregados del snapshot (sin PII, sin fórmulas vivas): hero con semáforo general (`A3:AD3`), banda de **5 KPIs** —personas, eventos, revisión pendiente, controles vencidos y alertas operativas— (etiquetas fila 8, valores fila 9), cards por sector (filas 10-14), **distribución porcentual por sector** (filas 15-16), estado y pendientes (filas 18-23), **banda de alerta** (`A24:AD25`), metadata (`A27:AD29`) y nota (`A32:AD34`). El espacio blanco sobrante de la hoja se cubre con un **marco relleno**: una celda derecha alta y una banda inferior ancha pintadas con `M.sistemaBorde` (la portada se percibe como una tarjeta sobre color, sin blanco adyacente salvo arriba). La distribución porcentual se redondea con **mayor resto** para sumar 100 exacto. El contrato de layout pasa a `PANEL_OPERATIVO_V014` con fingerprint `v014|fnv1a32`, lo que fuerza una única reconstrucción y conserva el fast path posterior. La portada se construye dentro del presupuesto de un RPC (251 de servidor; DEC-088) y, si alguna columna/fila quedara desviada de su dimensión de contrato tras estilizar, el constructor la corrige y reverifica (autocuración idempotente) antes de declarar fallo. `ECICEP.VERSION` permanecía entonces en `0.13.0` (DEC-087); desde la consolidación visual la versión de producto es `0.14.0` (DEC-089).

## v0.13.0 — cierre visual: paridad, portada INICIO y presentación convergente

La presentación dejó de verificar "sin pendientes y pasó" y ahora exige **convergencia real**: la fase `diseno` termina pero el instalador muestra `INSTALACIÓN FUNCIONAL / PRESENTACIÓN INCOMPLETA` cuando la **paridad visual INGRESO/SECTOR** (comparación de cada hoja contra la plantilla única de su familia) o la **portada INICIO** no convergen, con botón `Reintentar presentación`. El diagnóstico muestra filas por familia (`Paridad INGRESO`, `Paridad SECTOR`).

La portada `INICIO` se realineó al contrato de **30 columnas (`A1:AD38`)**: cinco accesos universales (PERSONAS, CAPTURA, INGRESOS, CONTROLES, REM), tres tarjetas por sector, bloques `ESTADO` y `PENDIENTES`, metadata y nota operativa, con fingerprint por contenido (`v013|fnv1a32`). El subplan de presentación es **una subtarea por hoja** (reanudable dentro del presupuesto) e incorpora `inicio`, `paridad:INGRESO` y `paridad:SECTOR` antes de la verificación final. La fase `INICIO` del instalador solo construye INICIO (`Instalar_pInicio`), sin tocar formato condicional, filtros o protecciones de otras hojas. La paridad visual se compara entre **hojas reales** (sin el alias de captura `INGRESO_NARANJA`) y con **firma acotada al ancho de la plantilla** —columnas residuales o datos fuera del rango gestionado ya no generan divergencias falsas—, con desglose `Principales:` si quedara alguna (DEC-086). El subplan de diseño quedó en **17 subtareas** (una por hoja real + inicio + 2 paridades + verificar).

EDAD se calcula automáticamente desde FECHA_NACIMIENTO en las vistas SECTOR, sin almacenarse (decisión de arquitectura "EDAD nunca se almacena"). El menú **Sistema** ahora incluye **Reparar presentación**, que usa el mismo motor reanudable del instalador (§8): mismo plan, mismo cursor y mismo post-check, con reanudación entre clics. Detalle en [`docs/INFORME_V013_CIERRE_VISUAL.md`](docs/INFORME_V013_CIERRE_VISUAL.md).

## v0.12.2 — instalador visual y formato canónico de celdas

El instalador muestra **estado general, fase y subtarea**, calcula el progreso
desde trabajo real, distingue advertencias de errores y permite reintentar la
subtarea exacta conservando ejecución, cursor y respaldo. También incorpora un
diagnóstico previo legible, una acción explícita para reparar la presentación y
un resumen final con duración.

El formato de datos ahora parte de una sola especificación declarativa por tipo
y campo. RUT, teléfonos e IDs permanecen como texto; fechas y fechas-hora usan
formatos coherentes; los anchos, alineación, wrap y superficies de edición se
aplican sobre rangos gestionados. Una hoja correcta omite anchos, formatos,
validaciones, notas, reglas condicionales y movimientos que ya coinciden. La
fase estructural dejó de reescribir toda la hoja `PACIENTES`.

El error real de `INICIO` al congelar una parte de `A1:X2` combinada quedó
cerrado: el diseño genérico nunca administra su freeze y la portada conserva la
secuencia `unlock 0/0 → construir → freeze 2/0`. Un fingerprint evita reconstruir
la portada cuando su layout sigue vigente. La revisión operativa posterior amplió
la portada a `A:AF` con cuatro accesos universales, prioridades clínicas, estado
`OK/ADVERTENCIA/ERROR` y resumen por sector. El menú de Sheets quedó reducido a
cinco flujos clínicos y dos acciones de sistema. El buscador admite fragmentos
breves de RUT sin devolver personas ajenas y descarta respuestas obsoletas. La
incorporación de ingresos ya cuenta también con una ruta Web App universal.
Se mantienen el esquema 2, captura V4, agenda manual, URL y deployment operativo. Detalle en
[`docs/INFORME_V0122_INSTALADOR_FORMATO_VISUAL.md`](docs/INFORME_V0122_INSTALADOR_FORMATO_VISUAL.md).

## v0.12.1 — presentación del libro sin timeout y portada robusta (hotfix)

La fase **Presentación del libro** del instalador dejó de exceder el límite de
ejecución de Apps Script: ahora corre por **8 subtareas reanudables** (presupuesto
de 20 s por RPC, cursor persistido por clave de EJECUCION en CacheService y
`{continuar:true}` que el instalador re-invoca con el mismo `_EJEC`). Todos los
formatos aplican **fast-paths "cero escrituras"** acotados a filas gestionadas y
se eliminó la fuerza global `forzar` de la reparación visual: reinstalar ya no
reescribe el libro completo. La reparación real detectó además que **Preparando la
portada** fallaba si `INICIO` heredaba filas inmovilizadas; la portada ahora se
construye siempre sin freeze residual (`setFrozenRows(0)` inicial) y congela 2
filas al final, con la verificación `ver.freeze`. También **Reconciliando
derivados** repara ahora los caches `ULTIMO_CONTROL`/`ULTIMO_SEGUIMIENTO` desde
EVENTOS (`Control_recalcularCaches_`) y deja de bloquear la instalación por
pacientes sin sector (aviso `PACIENTES_SIN_SECTOR`, solo reporte). Esquema 2,
contrato V4 y canal de captura intactos. Detalle en
[`docs/INFORME_2026-09-24_TIMEOUT_PRESENTACION_HOTFIX_V0121.md`](docs/INFORME_2026-09-24_TIMEOUT_PRESENTACION_HOTFIX_V0121.md).

## v0.12.0 — rediseño visual y automatización de Sheets

La instalación distingue derivados reparables de evidencia histórica de solo
reporte, por lo que ya no falla con `Reconciliando derivados · Detalle: error`
cuando las vistas quedaron consistentes. La nueva fase **Presentación del libro**
repara formato, validaciones, notas, pestañas, orden e inmovilización de forma
idempotente y preserva protecciones ajenas.

`INICIO` usa snapshots agregados sin PII dentro de `A1:AF60`, sin fórmulas
pesadas. Los cambios estructurales solo marcan flags; el mantenimiento se ejecuta
selectivamente. La agenda `PROXIMO_CONTROL` continúa siendo manual, el esquema
sigue en **2**, el contrato de captura en **V4** y la Web App continúa como único
canal de captura. Detalle en
[`docs/INFORME_2026-09-23_REDISENO_VISUAL_AUTOMATIZACION_V012.md`](docs/INFORME_2026-09-23_REDISENO_VISUAL_AUTOMATIZACION_V012.md).

## v0.11.1 — operación real verificable

El Centro de instalación separa cuatro dimensiones: datos/esquema, integridad
derivada, automatización de ingresos y respaldo. Al abrir realiza un diagnóstico
rápido; la auditoría profunda es explícita, guarda solo conteos técnicos sin PII
y queda marcada como desactualizada tras cualquier mutación. Un trigger de
ingreso ausente, duplicado o asociado a otro Spreadsheet impide declarar el
sistema operativo. Un respaldo no validado se muestra como advertencia separada.

Instalar/Reparar adquiere el bloqueo antes de crear el respaldo y antes de la
primera escritura. La reparación administrativa crea su propio respaldo y actúa
solo sobre derivados con diferencias comprobadas; eventos huérfanos y fuentes o
`captureId` duplicados se reportan, sin borrado automático. La captura usa
`TextFinder.findNext()` en `RESPONSE_ID` y en la columna física
`NOTA_SISTEMA`. Esquema **2**, captura **V4**, URL y QR se mantienen.

## v0.11.0 — mejora integral

La edición manual de `ESTADO_INGRESO = INGRESADO` ahora ejecuta el pipeline
canónico y solo conserva ese estado cuando existen paciente, evento `INGRESO` y
fuente hoja/fila consistentes. El instalador crea de forma idempotente el trigger
`ECICEP_onEditIngreso`, diagnostica falsos ingresados, reconcilia derivados y
realiza un post-check de integridad.

La captura dejó de barrer `FORM_RESPUESTAS` y `EVENTOS` en operaciones
interactivas: usa búsquedas puntuales por `captureId` y `FUENTE`, retorna el ID
del evento recién creado y escribe nuevos ingresos con `setValues`. Se añadieron
índices efímeros, invalidación selectiva, métricas técnicas sin PII y estado de
salud. La agenda `PROXIMO_CONTROL` sigue siendo manual, el esquema continúa en
**2** y el contrato de captura continúa en **V4**. La publicación reutiliza el
mismo deployment operativo en **@228**, por lo que la URL y el QR no cambian.

## Qué resuelve

Equipos de salud territorial suelen trabajar con **planillas Excel independientes
y estructuras distintas**, una por sector o programa. Las consecuencias son
conocidas:

- **Doble trabajo** al buscar a una persona que aparece en más de una planilla.
- **Imposible saber de un vistazo** quiénes existen, su estado, su próximo
  control o quién requiere seguimiento.
- **Formatos inconsistentes** (RUT, teléfonos, fechas, estados) incluso dentro
  de una misma hoja.

ECICEP integra esas fuentes en **una única base operativa**, normaliza y
consolida los datos y provee una interfaz simple para el uso cotidiano.

## Capacidades

**Base unificada y trazable**
- Personas (`PACIENTES`) con identidad canónica y **historial de eventos
  inmutable** (`EVENTOS`, append-only); origen, sector y fecha de cada registro.
- Deduplicación **explicable, reversible y trazable**; dudosos van a la cola de
  revisión, nunca se descartan a ciegas.

**Normalización automática**
- RUT con **módulo 11** (formato, dígito verificador y validación en vivo),
  teléfonos, fechas, nombres sin tildes y estados canónicos.

**Modelo clínico por persona**
- **Estratificación de riesgo** `G1/G2/G3` desde patologías.
- **Indicador de salud mental** (`SALUD_MENTAL`): `SI` / `NO` / vacío = sin
  información, registrado por la dupla desde captura V4 y ficha. **Nunca se
  infiere** de texto libre.
- Agenda manual de próxima atención. **Estado** (VENCIDO / POR VENCER /
  VIGENTE / SIN FECHA) y **recordatorio** derivados de la fecha guardada.

**Edición desde la Web App**
- La acción Actualizar carga una ficha por RUT y permite corregir datos personales,
  contacto, sector, estado, ingreso, patologías y agenda manual. Permite registrar
  una nueva atención o corregir la fecha de la última con trazabilidad.

**Seguimiento y controles**
- Registro de controles y seguimientos, fecha de próximo control manual, editable desde Captura y ficha.
  Panel *Controles por persona* con búsqueda y paginación.

**Reportes**
- **REM mensual** derivado de EVENTOS: resumen por censo + detalle por atención,
  exportable a **Excel (.xlsx)** y **PDF profesional**.
- Estadísticas con 5 indicadores y gráficos, filtro cruzado por sector y fecha.

**Captura Web App (único canal operativo)**
- Formulario responsivo con 4 operaciones (`nuevoIngreso`, `registrarControl`,
  `registrarSeguimiento`, `actualizarDatos`), validación por capas, **idempotencia
  de reenvíos** y trazabilidad por envío — especificado en
  `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**).
- QR para compartir el acceso al canal de captura. El QR apunta a la Web App con
  **acceso universal sin permisos** (restaurado en v0.9.27): quien escanea el QR
  captura sin cuenta Google ni configuración previa. Desde v0.9.28 la captura
  **anti-cache + auto-recarga**: si el navegador conserva una versión antigua de
  la página, el formulario se actualiza solo a la última versión al detectar que
  el sello del código servido (`BUILD`) difiere del backend (o alerta antes de
  recargar si hay datos sin guardar o el almacenamiento está bloqueado).
- **El QR es permanente y abierto**: su contenido es solo la URL fija del deployment
  operativo. La **URL base abre la captura para cualquier persona** (sin cuenta
  Google ni token, desde v0.9.29): un QR impreso no se invalida al publicar
  versiones mientras se reutilice el mismo deployment; los paneles, la ficha,
  Backups y REM siguen exigiendo el enlace compartido vigente. La estabilidad
  está protegida por un test de regresión.
- El botón Captura del menú Sheets abre la misma Web App desde cualquier
  dispositivo, sin cuenta Google. La URL base **abre la captura a cualquier
  persona**; las funciones internas (paneles, ficha, Backups, REM) requieren el
  enlace compartido vigente.
- La ficha y los paneles de registro, configuración y Backups reutilizan la
  misma clave para funcionar desde distintas cuentas con acceso a Sheets.
  El botón **Funciones** de la Web App abre Pacientes, Controles, Estadísticas,
  REM, Configuración, Backups, Registro e Instalación/reparación con ese mismo
  enlace, sin cuenta Google. Al abrir Instalación/reparación se muestra primero
  un diagnóstico; las etapas que modifican el libro solo comienzan al pulsar
  **Instalar / reparar**.
  Cada función se abre en una pestaña nueva por las restricciones de navegación
  de Google Apps Script.
  Google Sheets sigue requiriendo una cuenta para abrir la hoja directamente.

**Operación y confiabilidad**
- Instalador/reparador por **etapas** con diagnóstico de solo lectura,
  **versionado de esquema y motor de migraciones** (idempotente). Bloquea
  versiones incompatibles antes de escribir, informa fallos por hoja y conserva
  todas las hojas adicionales; su revisión no borra datos. Las fases omitidas
  se identifican en el progreso y no toman un bloqueo de escritura.
  **Instalar/reparar muta datos reales con respaldo previo del libro en Drive**
  (`PRE_INSTALAR`, una copia recuperable por ejecución antes de la primera
  mutación y con guard de versión; si el respaldo falla la etapa responde
  `BACKUP_FALLIDO` sin escribir): importa fuentes, actualiza pacientes,
  enriquece y registra; el modo `SNAPSHOT_ACTUAL` no toca la agenda manual
  (`PROXIMO_CONTROL`) ni `SALUD_MENTAL` de personas existentes.
- Backups manuales y automáticos, cola de calidad, auditoría integral,
  protección por categoría de hojas, filtros y buscador por hoja.
- Diseño visual del libro normalizado por un **design system** único (tokens en
  `00_Tokens`), contrastes accesibles y una sola tinta.

## Integración de IA

ECICEP incorpora su **primera integración de IA generativa** como capacidad de
asistencia técnica para **análisis, automatización y calidad de datos**:
Google **Gemini API** desde `Google Apps Script` sobre la base de `Google Sheets`.

Qué hace hoy la capa de IA (detalle en `docs/INFORME_IA_GEMINI.md`):

- **Análisis de calidad de datos** — estructura y estadísticas de las hojas,
  detección de inconsistencias de formato y campos vacíos.
- **Detección de duplicados** — por RUT, ejecutada **100% en memoria** (no envía
  datos a la API).
- **Verificación de integridad** — eventos huérfanos (evento sin paciente),
  también local.
- **Corrección asistida** — RUT, fechas, nombres, teléfonos y sexo reutilizando
  los normalizadores deterministas del sistema, con registro en `LOG_IA`.
- **Asistencia por lenguaje natural** — traducción de instrucciones a acciones
  del sistema.
- **Auditoría y trazabilidad** — cada cambio queda registrado y revisable.

La IA **no realiza diagnóstico médico ni reemplaza el criterio profesional**:
es una herramienta de validación, detección de patrones, consistencia y
automatización de tareas de datos. Diseñada con un **enfoque de minimización de
datos** (estructura, estadísticas y patrones; duplicados e integridad locales) y
con la **API key fuera del código fuente** (Script Properties).

> El panel y el menú de IA fueron retirados. El módulo `src/28_IA.js` se conserva
> como soporte técnico interno; no hay una interfaz de IA operativa para la cliente.

## Demo interactiva

Puedes probar una **réplica estática exacta** del formulario de captura (misma
interfaz, mismas secciones y mismas validaciones, **datos ficticios**, sin
conexión a Apps Script) en línea:

- **🌐 En línea:** <https://2674321.github.io/Sistema-Gestion-Sectores-ECICEP/>
- **Local:** abre `examples/formulario_demo.html` en un navegador (doble clic).

Incluye RUT de ejemplo que ya existen en la base demo (13.187.212-7,
9.866.001-1, 15.798.443-8) para ver el comportamiento de personas registradas.

## Captura de la Web App

![Web App de captura ECICEP](docs/screenshots/webapp-captura.png)

Captura ilustrativa anterior a v0.9.11, con datos ficticios. La Web App operativa
añade el campo manual Próximo control / seguimiento.

## Arquitectura

Un solo sistema operativo (una Web App, un backend, un pipeline, una fuente de
verdad). Google Sheets cumple la función administrativa interna; la captura
operativa vive **solo** en la Web App.

```text
                ECICEP
                   │
         ┌─────────┴─────────┐
         │                   │
      WEB APP            SHEETS / ADMIN
         │                   │
         └─────────┬─────────┘
                   │
                BACKEND
                   │
                PIPELINE
                   │
                  MODELO
        PACIENTES + EVENTOS + DERIVADOS
                  ─ SECTORES · DASHBOARD · REM · LOG ─
```

Contrato de captura vigente (operaciones, payload, estados, errores):
`docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**, única fuente).

## Stack

`Google Apps Script · Google Sheets · HTML/CSS/JS (Web App) · Gemini API ·
Git · Clasp · SheetJS (Excel) · Chart.js (gráficos) · PDF local`

Sin dependencias externas salvo beneficio demostrable. Código en paquetes
planos numerados (`src/00_Config.js … src/28_IA.js`) sincronizados con `clasp`.

## Estado del proyecto

| Componente | Estado |
|---|---|
| Núcleo (normalización, modelo, pipeline) | ✅ Implementado |
| Web App de captura (contrato V4, compatible V2/V3) | ✅ Operativo |
| Instalador + motor de migraciones | ✅ Operativo (schemas 1→2, MIG-002; etapas mutantes activas) |
| `SALUD_MENTAL` (SI/NO/vacío, sin inferencia) | ✅ Implementado (modelo, captura V4, ficha, Web App, vistas) |
| Ficha de paciente 2.0 + incorporación de ingresos | ✅ Implementado (pestañas, ingresos pendientes → detalle → incorporar idempotente) |
| REM Excel / PDF · Estadísticas · Dashboard | ✅ Implementados |
| Calidad, auditoría, backups | ✅ Implementados |
| IA asistente (Gemini API) | ✅ Implementada (asistencia, no núcleo) |
| E2E real de Instalar/reparar sobre el libro operativo | ⏳ Pendiente (requiere sesión Google autorizada) |

**Verificación vigente:** `node tools/verificar.mjs` comprueba sintaxis JS/GS y
las 25 suites disponibles. Batería actual: núcleo **671/671** · aceptación 50/50 ·
contrato 38/38 · captura backend V2 73/73 · regresiones 44/44 ·
auditoría v0.10.1 15/15 · ficha-ingresos v0.10.2 **13/13** · instalador_estabilidad PASS ·
seguridad ACCESO UNIVERSAL **10/10** · rpc surface **4/4** ·
integridad mutaciones v0.10.3 **9/9** · acceso universal v0.10.4 **7/7** ·
acceso webapp **8/8** · operador resiliencia vNEXT **32/32** ·
captura lecturas acotadas vNEXT **9/9** · controles/seguimientos + REM v0.10.6 **9/9** ·
incorporación de ingresos v0.10.7 **12/12** ·
**22 scripts HTML**.
Detalle y límites de
verificación real en [`docs/INFORME_2026-09-23_INCORPORACION_INGRESOS_V0107.md`](docs/INFORME_2026-09-23_INCORPORACION_INGRESOS_V0107.md).

**Regla vigente:** el procesamiento masivo de datos reales requiere instrucción
explícita (migración controlada: análisis → validación → simulación → reporte →
migración). Los datos personales y sanitarios nunca salen del entorno de la
cliente hacia repositorios públicos.

## Autoría

Desarrollado por [Patricio Varela C.](https://github.com/2674321) ·
[ORCID](https://orcid.org/0009-0002-1087-9445).

## Documentación

| Documento | Propósito |
|---|---|
| `AGENTS.md` | Contrato permanente de trabajo para agentes |
| `ARQUITECTURA.md` | Arquitectura técnica y funcional vigente |
| `MODELO-DATOS.md` · `MODELO-EVENTOS.md` | Modelo PACIENTES y EVENTOS |
| `docs/CONTRATO_CAPTURA_V2.md` | Contrato de captura V2 — **NORMATIVO** |
| `docs/INFORME_IA_GEMINI.md` | Integración de IA generativa (Gemini) — vigente |
| `docs/INFORME_V097.md` | Fase v0.97: auditoría rendimiento/IA/frontend y cierres |
| `DECISIONES.md` | Registro de decisiones (DEC-XXX) |
| `docs/MIGRACIONES.md` | Motor de migraciones de esquema |
| `docs/VERSIONADO.md` | Versionado del esquema |
| `docs/HISTORIAL.md` | Evolución completa por versión (historial) |
| `CONTEXTO.md` | Cliente, naturaleza y reglas generales |
| `PENDIENTES.md` | Trabajo pendiente real |

## Estructura

```text
Sistema-Gestion-Sectores-ECICEP/
├── src/                   # Código Apps Script (sincronizado con clasp)
│   ├── 00_Config.js …     # Config, tokens, núcleo, modelo, hojas, UI
│   ├── 10_Pruebas.js      # Suites deterministas (671)
│   ├── 24_Formulario.js   # Backend de captura Web App
│   ├── 26_Captura.js      # Backend contrato de captura V2/V3/V4
│   ├── 28_IA.js           # Módulo IA (Gemini API): análisis, calidad, corrección asistida
│   ├── 29_ActualizacionCaptura.js  # Edición/ficha desde captura V4 (actualizacion.campos)
│   └── CapturaWeb.html    # Formulario Web App (canal de captura)
├── tests/                 # Baterías ejecutables: node tests/*.mjs
│   ├── ejecutar_local.mjs # Núcleo (671 deterministas)
│   ├── formulario_web.mjs # Lógica real de CapturaWeb.html (27)
│   ├── captura_ui_payload_v2.mjs, captura_backend_v2.mjs, contrato_*.mjs…
│   └── validar_html.mjs   # Sintaxis de <script> embebidos en los HTML
├── examples/              # Réplicas/demos (ej. formulario_demo.html)
├── tools/                 # push_y_abrir.sh, sync_remoto.py…
└── docs/                  # Documentación vigente
```

## Reglas críticas

1. Nunca se versionan datos reales en Git (`.gitignore` ya configurado).
2. `clasp push` solo desde esta carpeta (proyecto Apps Script vinculado).
3. Deduplicación explicable, reversible y trazable; dudosos → revisión manual.
4. Lecturas/escrituras por bloques; nunca `getValue/setValue` en loops.
5. Toda decisión arquitectónica se registra en `DECISIONES.md`.

## Evolución

El sistema se construyó y estabilizó en fases incrementales (`v0.5.0` → `v0.9.3`,
más las fases S9/S10/INST-1 y MEJORA-INST1.1). El detalle completo por versión,
incluidos los desenlaces técnicos (rendimiento, auditorías, instalador
versionado, despliegues) está en **`docs/HISTORIAL.md`**.
