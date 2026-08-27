# Sistema ECICEP Unificado

Sistema de gestión para centralizar la información de pacientes del programa **ECICEP**
(Estrategia de Cuidado Integral Centrado en la Persona) proveniente de los tres sectores del CESFAM San Juan
(Amarillo, Verde, Naranjo), hoy dispersa en planillas Excel independientes con
estructuras distintas.

**v0.8.7 (OPEN CODE)** · Google Sheets + Apps Script (clasp) · **337 pruebas locales verdes** ·
pacientes reales / eventos operando en producción.

> **Nota contractual:** proyecto particular desarrollado para la cliente
> Camila Paz Aguilar (Enfermera). No constituye un proyecto institucional del CESFAM.

## Qué incluye (v0.5.0 → v0.7.0)

- **Panel de Control**: KPIs reales, tarjetas por sector con cobertura, última actividad, accesos.
- **Estadísticas** (dialog): 5 indicadores + 4 gráficos Chart.js + filtro cruzado por sector y fecha.
- **REM mensual** derivado de EVENTOS: resumen 24c + detalle por atención, exportable a **Excel .xlsx** (contrato REM original) y PDF profesional.
- **Selector de patologías ECICEP** en ficha (49 condiciones) con ponderación y esquema migrado.
- **Cola de revisión**, registro de gestiones, timeline de historial, hard guard de escrituras.
- **Instalar / Reparar Sistema**: hojas, CONFIG centralizado, catálogo de vigencias,
  validaciones desplegables en INGRESO_*, diseño del libro (colores/orden/ocultas/banding).
- **Centro de Pruebas**: diagnóstico seleccionable con informe técnico.
- **Registro del sistema** (visor de LOG) con filtros y export CSV.

## Estado del proyecto

| Etapa | Estado |
|-------|--------|
| ETAPA 0 — Descubrimiento / Levantamiento | ✅ Completada (2026-08-21) |
| ETAPA 1 — Arquitectura | ✅ Diseñada y registrada |
| ETAPA 2 — Núcleo | ✅ Implementada, pruebas verdes |
| ETAPA 2.5 — Refinamiento funcional (paciente/evento, sectores, dashboard, REM, estratificación, protecciones) | ✅ Diseñada — docs: MODELO-EVENTOS · DASHBOARD · REM · ESTRATIFICACION |
| ETAPA 3 — Staging + validador + identificación controlada | ✅ Núcleo implementado |
| ETAPA 3b — INGRESO_* → staging → PACIENTES/EVENTOS (gates, append-only, batch) | ✅ Implementada y **verificada end-to-end en el sheet real** (EJ-MT3IJ7RG: 18 leídos, 14 eventos, 11 nuevos + 3 enlazados) |
| ETAPA 4+ — Interfaz → Migración → Optimización → Validación | ⬜ Bloqueadas secuencialmente |

**Interfaz:** Google Sheets es la interfaz principal del sistema (DEC-012).
**Modelo:** PACIENTES (entidad/estado vigente) + EVENTOS (historial append-only) — DEC-017.
**Regla vigente:** NO migrar ni procesar masivamente los datos reales todavía.

## Stack

Google Sheets · Google Apps Script · HTML/CSS/JS · Git · Clasp.
Sin dependencias externas salvo beneficio demostrable.

## Documentación (fuente de verdad)

| Archivo | Contenido |
|---------|-----------|
| `CONTEXTO.md` | Cliente, naturaleza del proyecto, reglas generales |
| `LEVANTAMIENTO.md` | Informe maestro de levantamiento (ETAPA 0) |
| `FUENTES-DATOS.md` | Inventario detallado de archivos y hojas de origen |
| `MODELO-DATOS.md` | Modelo canónico propuesto y mapeo desde las fuentes |
| `ARQUITECTURA.md` | Arquitectura del sistema, módulos, hojas, rendimiento |
| `DECISIONES.md` | Registro de decisiones (DEC-XXX) |
| `PENDIENTES.md` | Decisiones abiertas y tareas bloqueantes |

## Estructura

```text
Sistema-Gestion-Sectores-ECICEP/
├── *.xlsx                  # Fuentes reales (NO versionar)
├── src/                    # Código Apps Script (sincronizado con clasp)
│   ├── appsscript.json
│   ├── 00_Config … 09_Log  # Módulos del núcleo
│   ├── 10_Pruebas.js       # Suites deterministas
│   └── 11_DatosPrueba.js   # Dataset ficticio único
├── tests/
│   └── ejecutar_local.mjs  # node tests/ejecutar_local.mjs
├── datos_prueba/           # Muestras ficticias futuras (único Excel permitido)
└── docs...
```

## Reglas críticas

1. Nunca subir datos reales a Git (`.gitignore` ya configurado).
2. `clasp push` solo desde esta carpeta (`.clasp.json` local → script ligado
   "Back-End Proyecto - Sectores - ECICEP - C.S.J", confirmado DEC-007).
3. Deduplicación explicable, reversible y trazable; dudosos → revisión manual.
4. Lecturas/escrituras por bloques; nunca `getValue/setValue` en loops.
5. Toda decisión arquitectónica se registra en `DECISIONES.md`.

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

