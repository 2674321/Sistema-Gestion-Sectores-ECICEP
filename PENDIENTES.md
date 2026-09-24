# PENDIENTES — Trabajo pendiente real ECICEP

> **Actualización 2026-09-24 (v0.12.1):** hotfix de timeout de la fase
> `Presentación del libro`. La presentación ahora corre por **8 subtareas
> reanudables** (presupuesto 20 s/RPC + cursor por clave de EJECUCION en
> CacheService, `Instalar_pDiseno` → `Presentacion_ejecutarPaso_('diseno')`), y todos
> los formatos usan **fast-paths cero escrituras** acotados a filas gestionadas
> (encabezados, banding, anchos, formatos, validaciones, notas, semántica y
> color de RUT). Se eliminó la fuerza global `{forzar:true}` de
> `Instalar_pVisual`. La primera reparación real confirmó el fin del timeout y
> expuso un segundo fallo ya corregido: `Preparando la portada` fallaba por
> **freeze residual** heredado en `INICIO` (`No se pueden combinar filas
> inmovilizadas con filas no inmovilizadas`); ahora la portada se construye
> siempre sin freeze y se congela al final (`ver.freeze` audita el resultado).
> Esquema 2 y captura V4 sin cambios. Validación local: **38 suites, 0 fallos**
> (suites nuevas `instalador_presentacion_timeout_v0121` 19/19 y
> `inicio_portada_freezerows_v0121` 7/7).
> Pendiente de validación operativa: ejecutar **Instalar / reparar** en el
> Spreadsheet para confirmar que las etapas `Presentación del libro` ya no
> reportan timeout y `Preparando la portada` termina sin error de filas
> inmovilizadas (requiere la Web App de instalación; este host no dispone de
> sesión Google autorizada para `clasp run`). Ver
> `docs/INFORME_2026-09-24_TIMEOUT_PRESENTACION_HOTFIX_V0121.md`.

> **Actualización 2026-09-23 (v0.12.0):** corregido el fallo genérico de
> `Reconciliando derivados`; la evidencia histórica de solo reporte queda como
> advertencia. Se implementaron INICIO por snapshots, presentación declarativa,
> reparación selectiva, trigger estructural ligero y preservación de protecciones
> ajenas. Esquema 2 y captura V4 se conservan. Tras publicar, queda como validación
> operativa ejecutar nuevamente **Instalar / reparar** en el Spreadsheet y revisar
> el diagnóstico final de presentación/automatizaciones.

> **Actualización 2026-09-23 (v0.11.1):** código y pruebas de estabilización
> operativa completados. El error real
> `MIG-001:SECTOR_NARANJO:ENCABEZADOS_INCOMPATIBLES` quedó corregido: las vistas
> derivadas con cabecera desplazada se reconocen y las irrecuperables se
> regeneran desde `PACIENTES + EVENTOS`, sin modificar datos canónicos.
> Incluye salud rápida/profunda, backup observable, reparación selectiva y
> búsquedas puntuales. La validación local suma **32 suites, 0 fallos**.
> Publicado en el deployment operativo **@230** con build `3fdeca6`; smoke
> anónimo HTTP 200 correcto. Continúan como validación operativa pendiente la ejecución autorizada en el Spreadsheet de la auditoría
> profunda, la creación/verificación real del trigger y del backup; este host no
> dispone de una sesión Google autorizada para `clasp run`. Ver
> `docs/VALIDACION_OPERATIVA_V0111.md`.

> **Actualización 2026-09-23 (v0.11.0, @228):** mejora integral publicada sobre
> el mismo deployment. Cerrados en código y pruebas: `INGRESADO` manual con
> incorporación real, detección/reconciliación de falsos ingresados, hot paths
> puntuales de captura, retorno directo de `ID_EVENTO`, escritura por bloque,
> índices efímeros, estado de salud, métricas sin PII y post-check del instalador.
> `node tools/verificar.mjs`: **29 suites, 0 fallos**. `/exec` respondió 200 sin
> cuenta y sirvió `0.11.0` / build `ca94c64`. La instalación real del nuevo
> trigger y la validación del backup siguen incluidas en los pendientes
> operativos **#29/#30**: `clasp run` no dispone de permiso de ejecución en este
> host, por lo que deben validarse al ejecutar **Instalar / reparar** en el libro.


> **Actualización 2026-09-23 (v0.10.7-fix2):** reporte de operador: desde el
> **código QR en celular no se podía escribir el RUT terminado en K** (dígito
> verificador). Causa: `inputmode="numeric"` en el campo RUT del formulario
> (teclado numérico sin letras). Corregido a `inputmode="text"` +
> `autocapitalize="characters"` y K documentada en el tooltip. Sin cambio de
> contrato ni de versión (0.10.7); publish @227. Batería: **25 suites · 0 fallos**.

> **Actualización 2026-09-23 (v0.10.7-fix):** corrección post-publicación de la
> incorporación de ingresos (reporte del operador: "1 error paciente vacío",
> batch sin feedback, buscador incompleto). **Lector de hojas INGRESO_* más
> robusto**: una fila solo es pendiente si el RUT tiene un dígito o el NOMBRE
> una letra (elimina el fantasma de filas "vacías" con caracteres invisibles
> como U+200B o guiones sueltos); **localizador determinista de encabezados**
> (fila real entre las primeras 10, compartido por listado, detalle acotado y
> escritura de ESTADO_INGRESO — sin cambio de comportamiento en layout visual
> ni en la ruta acotada de 1 fila de alto); **buscador normaliza el RUT
> almacenado** (puntos/espacios y SIN_DV); **feedback explícito** del batch
> cuando no hay nada procesable (nunca banda vacía). **25 suites · 0 fallos**
> (`incorporacion_ingresos` **17/17**). Deployment operativo reutilizado. Ver
> `docs/HISTORIAL.md` (v0.10.7-fix).

> **Actualización 2026-09-23 (v0.10.7):** la incorporación de ingresos
> pendientes aclara la operación para el operador sin tocar el pipeline único.
> Deja de prometer "copia" a sectores: el panel pasa a "Incorporación de
> ingresos" con tarjeta "¿Qué significa incorporar?", filtros por Sector y
> Estado con conteos sin RPC extra, detalle con "Sector destino" real y botón
> de incorporar deshabilitado en ERROR; incorporación masiva de válidos en UNA
> RPC (`api_ingresosIncorporarValidos`) reutilizando
> `Ingresos_procesarTodasLasHojas_` (`soloHojas` + alias INGRESO_NARANJA). El
> flujo individual conserva idempotencia (doble clic no duplica; ficha abre y
> volver regresa a la lista recargada). El menú **ECICEP** de Sheets incluye la
> entrada **"Incorporar ingresos"** (`UI_abrirIngresos` → sidebar modo
> `ingresos`). Schema **2**, accesos intactos,
> deployment operativo reutilizado. Batería **25 suites · 0 fallos**. Detalle:
> `docs/INFORME_2026-09-23_INCORPORACION_INGRESOS_V0107.md`.

> **Actualización 2026-09-22 (v0.10.6):** "Controles por persona" → **Controles
> y seguimientos por persona**: selector `[Control] [Seguimiento]` que alterna
> la presentación 100 % en cliente (0 RPC; conserva sector/estados/búsqueda/
> paginación/selección; Próxima atención compartida; sin `PROXIMO_SEGUIMIENTO`).
> REM vista de trabajo abre en estado neutro sin loader falso; el loader real
> aparece solo en Consultar (antes de `api_remVista`); sin auto-consulta.
> Backend sin cambios para ambas mejoras. Acceso/seguridad/roles/schema **2**
> intactos; deployment operativo reutilizado (misma URL/QR). Batería **24
> suites · 0 fallos**. Detalle:
> `docs/INFORME_2026-09-22_CONTROLES_SEGUIMIENTOS_REM_V0106.md`.

> **Actualización 2026-09-22 (v0.10.5):** pasada de **fiabilidad operativa +
> lecturas acotadas** (DEC-069): estado de envío por las 4 acciones con una
> sola RPC, preflight de `NUEVO_INGRESO`, timeout de entrega que desbloquea,
> guard de secuencia, modal de duplicados con intención explícita
> (`confirmarNuevoPaciente`), recuperación de acceso con anti-bucle y
> captureId conservado, bootstrap bloqueante ante catálogo vacío
> (`CATALOGO_PROFESIONALES_NO_DISPONIBLE`, invariante `ok:true` ⇒ profesionales
> cargados) y contrato RPC uniforme (dataset vacío ≠ fallo; `api_ficha` nunca
> nula; accesos rechazados `ok:false`). Idempotencia del operador
> (`CONFLICTO_IDEMPOTENCIA`), lock `SERVICIO_OCUPADO`, ficha todo-o-nada
> (`VISTA_SECTOR_PENDIENTE`) y lecturas acotadas de `INGRESO_*` (nunca
> `getDataRange`; umbral 50 filas en el lector). Se mantienen superficie RPC
> mínima, guards por RPC y mutaciones atómicas/idempotentes. Esquema sigue en
> **2**; **schema no cambia**; deployment operativo reutilizado @221 (misma
> URL/QR). Batería **23 suites · 0 fallos**. Detalle:
> `docs/INFORME_2026-09-22_FIABILIDAD_OPERATIVA_V0105.md`.

> **Actualización 2026-09-22 (v0.10.4):** hotfix **ACCESO UNIVERSAL ECICEP**
> (DEC-068, supera DEC-067): una sola credencial (`CAPTURA_ACCESS_TOKEN`,
> valor conservado) habilita todas las funciones operativas (captura, ficha,
> paneles, admin). Se retira la separación CAPTURA ≠ OPERADOR (la página
> operativa podía abrir la ficha pero sus RPC fallaban `ACCESO_DENEGADO`; se
> añade además el fix de token `''` por contención de lock y la
> auto-recuperación del cliente `ACCESO_DESACTUALIZADO`). `OPERADOR_ACCESS_TOKEN`
> queda como legacy de transición. Se mantienen superficie RPC mínima, guards
> por RPC, mutaciones atómicas/idempotentes y `CONFIG_SECRETOS`. Esquema sigue
> en **2**; **schema no cambia**. Detalle:
> `docs/INFORME_2026-09-22_ACCESO_UNIVERSAL_V0104.md`.

> **Actualización 2026-09-22 (v0.10.3):** pasada de **hardening** completa:
> separación de capacidades **CAPTURA ≠ OPERADOR** (tokens disjuntos; la URL
> pública nunca entrega el token de operador ni expone ficha/PII), superficie
> RPC mínima (helpers críticos privados detrás de wrappers `api_*` con OPERADOR;
> CentroPruebas dejó de invocar mutadores internos), CONFIG sin secretos y
> estratificación trazable (`CAMBIO_ESTRATIFICACION` en todo cambio del valor
> vigente). Esquema sigue en **2**; **schema no cambia**. Detalle:
> §19 y `docs/INFORME_2026-09-22_HARDENING_V0103.md`.

> **Actualización 2026-09-22 (v0.10.2):** la ficha de paciente pasó a **ficha
> 2.0** (pestañas, edición dirigida al dominio en `31_Ficha.js` y write-back
> corregido de `ESTADO_INGRESO`/`NOTA_SISTEMA` que era código muerto) y se
> incorpora el flujo **ingresos pendientes → detalle pre-ficha → incorporar**
> (idempotente). Además todas las RPC de interfaz ahora pasan su token
> compartido (los paneles Controles/Dashboard/Configuracion/RemVista/
> CentroPruebas siguen operativos frente a los guards de `ACCESO_DENEGADO`).
> Detalle: §17 y `docs/INFORME_2026-09-22_FICHA_V2.md`.

> **Actualización 2026-09-22 (v0.10.1):** el instalador crea un **respaldo
> real del libro en Drive** (`PRE_INSTALAR`) en la primera etapa mutante de cada
> ejecución (token/ejecución), refuerza la idempotencia por FUENTE (clave
> canónica, sin duplicar eventos ante drift de literal), bloquea la carga si una
> hoja autorizada ausente (preflight `HOJA_FUENTE_FALTANTE`) y endurece MIG-002
> por nombre (nunca escribe sobre una columna ocupada). Detalle:
> `docs/INFORME_2026-09-22_AUDITORIA_V0101.md`.

> **Actualización 2026-09-21 (v0.10.0):** se implementó `SALUD_MENTAL`
> (`SI`/`NO`/vacío, sin inferencia) extremo a extremo (modelo + MIG-002 esquema
> 1→2 + captura V4 + ficha + Web App + vistas 16→17) y se **reactivó
> `Instalar / Reparar Sistema`** con etapas mutantes (fuentes/amarillo/
> enriquecimiento). El instalador vuelve a ser el
> ciclo real de captura; la verificación E2E en vivo (incluida la etapa
> «Ajustando el libro» de v0.9.22 y las cifras de INICIO) sigue pendiente de
> ejecutar contra el libro real. Ver DEC-065 y `docs/INFORME_...v0.10.0`.

> **Actualización 2026-09-17 (v0.9.13):** se cerraron la regresión de
> cachés de atención que retrocedían al registrar eventos antiguos, la pérdida
> de fecha corregida tras el merge de fuentes y la edición incompleta de
> `PREINGRESO`. Sin cambio en la agenda manual ni en el historial físico.

> **Actualización 2026-09-17:** Captura V4 habilita edición de ficha, agenda y
> atenciones; continuar observando correcciones reales y compatibilidad de
> fuentes históricas por RUT tras un cambio de identidad.

> **Actualización 2026-09-16 (v0.9.11):** próxima atención exclusivamente manual en
> `PROXIMO_CONTROL`, editable desde Captura (V3, compatible con V2) y ficha.
> Registrar atenciones, actualizar o importar no recalcula la agenda. Captura
> reúne botón de apertura, QR y copia de URL. Estratificación se gestiona en Patologías.
> Esta regla sustituye cualquier descripción histórica de agenda automática.

Este documento contiene únicamente asuntos que siguen siendo accionables. Los trabajos históricos ya resueltos se mantienen fuera de la cola activa para evitar que un agente los reabra por error.

## 1. Decisiones funcionales abiertas

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 3 | Confirmar exclusión de la hoja `NO LLENAR` (duplicado histórico del sector Verde) | Decisión cliente | Migración | MEDIA |
| 4 | Precisar semántica de columnas ambiguas: ESTADO vs SEGUIMIENTO vs CONTROL vs PROFESIONAL y otros encabezados heredados | Consulta cliente | Modelo final / normalización | ALTA |
| 5 | Estratificación `G` sin nivel: decidir derivación o `null` en los casos restantes | Consulta cliente | Normalización | MEDIA |
| 6 | Confirmar lista cerrada de estados canónicos | Consulta cliente | Consolidación + UI | ALTA |
| 7 | Confirmar indicadores definitivos del dashboard | Consulta cliente | Dashboard | MEDIA |
| 11 | Definir destino de flujos auxiliares: GESTOR DE CASO, CONTROLES PENDIENTES, INASISTENTES A INGRESOS | Consulta cliente | Modelo final | MEDIA |
| 12 | Confirmar etiqueta visible definitiva de NARANJO/NARANJA en UI/REM | Consulta cliente | Etiquetas REM | BAJA |
| 13 | Definir correos de responsables por sector para protecciones operativas | Consulta cliente | Protecciones | MEDIA |
| 14 | Definir catálogo de condiciones/patologías; disponibilidad de FECHA_NACIMIENTO/SEXO resuelta vía S5 (enriquecimiento desde hojas INGRESO_*, `src/27_Actualizacion.js` — DEC-057) | Consulta cliente | Estratificación / REM | ALTA |
| 15 | Confirmar umbrales oficiales G1/G2/G3 y definición operativa de PLAN_CUIDADO / GESTION_CASO | Consulta cliente | Motor G / REM | ALTA |
| 16 | Definir formato de entrega del REM y período de cierre | Consulta cliente | Exportación REM | MEDIA |
| 17 | Confirmar origen del bloque “atenciones” del REM | Consulta cliente | Generador REM | ALTA |
| 18 | Definir mecánica de corrección de eventos ya registrados | Decisión de diseño | Integridad de historial | MEDIA |

## 2. Desarrollo / operación

**Aplicación visual v0.9.21/22:** el código y la Web App están publicados en `@204`
(`v0.9.21`) y `@205` (`v0.9.22`). El bloqueo operativo se resolvió en **v0.10.0
(DEC-065)**: `Instalar / Reparar Sistema` vuelve a declarar las etapas mutantes de
fuentes/amarillo/enriquecimiento (mismo `INST-1`) y crea un respaldo real
`PRE_INSTALAR` (copia Drive del libro, una por ejecución) antes de mutar, por lo que **volver a ejecutar Instalar ya es
seguro y posible**. Queda pendiente **ejecutar Instalar** contra el libro real y
comprobar la etapa «Ajustando el libro» (inmovilización de columnas con celdas
título combinadas) y las cifras de INICIO. La CLI `clasp run` respondió
`Unable to run script function` por permisos en este host; no se ejecutó una
reparación directa sobre el libro clínico durante esa publicación. La Web App
ya utiliza los conteos corregidos al abrirse o pulsar Actualizar.

| # | Pendiente | Tipo | Prioridad |
|---|---|---|---|
| 25 | Completar captura de campos REM actualmente ausentes sin inventar datos | Captura nueva | ALTA |
| 26 | Completar importación/cierre del histórico del sector Amarillo según fuente y procedimiento vigente | Acción operativa | ALTA |
| 27 | Completar definición de usuarios/accesos y responsables por sector | Decisión cliente | MEDIA |
| 28 | Completar revisión de fuentes restantes y su inclusión/exclusión definitiva | Decisión cliente | MEDIA |
| 29 | Activar y validar estrategia de backups operativos | Operativo | ALTA |
| 30 | Realizar validación visual manual integral del libro real tras los cambios correspondientes | Humano | ALTA |
| 32 | Normalizar formato heredado mediante el reconciliador visual, sin limpieza destructiva manual | Dev | BAJA |
| 33 | ~~Migrar colores duplicados en HTML a tokens CSS~~ — **cerrado**: auditoría por contexto (style/`:root`/script) en los 15 HTML. Ningún hex de regla iguala un token de `00_Tokens` sin tokenizar; los literales restantes son valores sin equivalente (`#A0A5AE`, `#096B50`, `#fff`) o paletas propias de la Web App (`--c-*`, self-contained, usadas por JS que no puede leer CSS vars). `QRFormulario.html` (única página sin include) espejaba la paleta `--c-*` como literales: migrado a `var(--c-*)` con `:root` local de la misma convención y sin include (evita colisiones con la tarjeta de impresión). Reversible y sin cambio visual | Dev / cosmético | BAJA |

## 3. Publicación / deployment

**Estado 2026-09-17:** el límite de 200 versiones bloqueó inicialmente
`v0.9.18`. Tras eliminar manualmente 24 versiones sin deployment, se publicaron
`v0.9.18` (`@201`, commit de código `1398873`) y `v0.9.19` (`@202`, commit de
código `4911d3c`) en el mismo deployment operativo. El usuario solicitó
eliminar las versiones 1–40: en la última inspección solo faltaba la 40;
**1–39 seguían presentes**.
Los únicos deployments eran `@HEAD` y el operativo. Google solo ofrece el
borrado de versiones desde **Project History** del editor, no desde la API
pública ni `clasp`. La limpieza 1–39 requiere una sesión del editor con acceso
al proyecto; no crear otro proyecto, Spreadsheet ni deployment para evadir el
límite.

Las tareas de publicación deben:

1. inspeccionar deployments reales;
2. identificar la URL operativa;
3. reutilizar el deployment operativo existente cuando sea posible;
4. actualizarlo después de `clasp push`;
5. comprobar `/exec` mediante E2E;
6. eliminar deployments obsoletos únicamente después de verificar dependencias.

El deployment histórico `@63` fue eliminado después de verificar que no tenía dependencias operativas activas.

Limpieza de deployments aplicada: `@89` (legacy) y `@86` (test) fueron eliminados después de verificar que ninguna URL, configuración, QR, automatización o herramienta dependía de ellos. Quedaron solo el deployment operativo (`@108`, `/exec`, el que sirve `ECICEP.WEB_APP_URL`) y `/dev` (`@HEAD`, usado por `tools/push_y_abrir.sh` para revisión rápida tras cada push).

## 4. Limitaciones conocidas

Las limitaciones antiguas de acceso/API o URLs obsoletas deben volver a verificarse antes de considerarse vigentes. Un diagnóstico histórico no debe tratarse como estado actual sin evidencia.

En particular, antes de actuar sobre un webhook, deployment, token o URL, comprobar el estado real en el proyecto.

## 5. Pendientes eliminados por obsolescencia

Las siguientes categorías **ya no son pendientes**:

- crear o vincular un Google Form;
- completar `FORM_ID`;
- instalar un trigger `onFormSubmit` para captura;
- operar mediante Google Forms;
- crear DEV/DEMO como ambientes;
- promover una versión hacia una supuesta “producción @63”;
- crear un segundo Spreadsheet para pruebas o demostración;
- crear un segundo pipeline de captura.

Estas tareas pertenecen a etapas históricas que fueron supersedidas por la arquitectura actual de entorno único y Web App única.

## 6. Problemas cerrados

Los problemas que ya fueron implementados y validados permanecen cerrados y no forman parte de la cola activa. Una reaparición debe demostrarse mediante una nueva evidencia o una regresión reproducible.

- **#21** UI mínima para `REQUIERE_REVISION` / `POSIBLE_DUPLICADO`: resuelto. Backend (`api_revisionListar`, `api_revisionResolver`) y frontend (Sidebar `mode='revision'` con comparación lado a lado y botones de acción) completamente implementados. Accesible vía `ECICEP > Personas > Cola de revisión` y Panel de Control.
- **#22** Fecha específica para CONTROL/SEGUIMIENTO: resuelto. El comportamiento puntual quedó implementado en el código vigente; la definición contractual de `FECHA_EVENTO` (obligatoriedad, captura, validación y persistencia) fue **invalidada** y redefinida en `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**).
- **#29 (backend)** Captura V2: **cerrado y validado por fase en S1** (2026-09-06). Backend y **UI 100% V2 operativa** según `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**): `src/26_Captura.js` (validación §5.1/§14 en orden §17, idempotencia §13, estados §18, reintentos §23, persistencia §15, TR-1/TR-2 §21, entrypoints `WebApp_capturarEnviar`/`WebApp_capturarEstado`) y `src/CapturaWeb.html` (canal único, `captureId` `Cp2-`+32 hex, SDK `WebApp_previaDuplicadosV2`/`WebApp_capturarEnviar`). Desde S1 incluye **retoma V2 por su propio procesador**: `WebApp_capturarRetomar`/`Captura_v2_retomarRegistro`. Verificación: `tests/captura_backend_v2.mjs` (65), `tests/captura_ui_payload_v2.mjs` (16), `tests/contrato_captura_v2.mjs` (36), `tests/contrato_datos.mjs` (20), regresión completa verde (núcleo 469, aceptación 50). Pendiente **exclusivamente** de E2E en vivo (login Google en el perfil Brave), no de implementación.

## 7. Campos pendientes de captura — clasificación provisional (A/B/C/D)

Clasificación operativa de `ENCABEZADOS_SIN_DESTINO` y campos REM ausentes
(§2/#25). **Provisional**: requiere validación del equipo clínico antes de
convertirse en regla normativa. Ningún campo se asimila en silencio.

| Clase | Significado | Encabezados / campos | Acción propuesta |
|---|---|---|---|
| **A** | Normativo del contrato V2, obligatorio | — | (la captura V2 ya cumple §5.1; no hay pendiente clase A) |
| **B** | Alta prioridad clínica; sin él hay pérdida de información relevante | `PATOLOGIAS`/`PATOGIAS`, `OBSERVACION EXAMENES SOLICITADOS`, `FECHA DE LLAMADO`, `QUIEN DERIVA`, `MOTIVO`, `DUPLA`/`MEDICO DUPLA INGRESO` | Definir campo destino canónico y sumarlo al contrato V2 (decisión de negocio: #4/#25) |
| **C** | Útil pero no bloqueante | `ASISTENCIA`, `EVALUACION DE PIE`, `OBSERVACION PENDIENTE`, `ESTATIFICACION` (typo), `MEDICO DUPLA` | Depurar alias y reconocerlos con destino solo tras acuerdo |
| **D** | Ambiguo / sin semántica resuelta — NO asimilar | `FECHA` (genérico), `COLUMN 12`, `COLUMNA 1` | Mantener en `ENCABEZADOS_SIN_DESTINO`; no inferir destino |
| — | Cerrado | `FECHA_NACIMIENTO` variantes (`NACIMIENTO`, `FECHA NAC`, `F.N.`, `DOB`) | Sinónimos añadidos en `SINONIMOS_ENCABEZADOS`; mapeo automático |

## 8. Registro de cierres recientes

- **Vistas SECTOR_***: agregan la columna `FECHA_NACIMIENTO` (tras `SEXO`), con
  `EDAD` siempre derivada de `FECHA_NACIMIENTO` en el refresco (nunca almacenada).
  La columna aparece en el libro real tras reinstalar (los encabezados de las
  SECTOR_* solo se escriben en instalación).
- **URL de la Web App**: `ECICEP.WEB_APP_URL` apunta al deployment operativo
  (`@93`, `/exec`) en lugar de `/dev` (`@HEAD`); el QR (`QRFormulario.html`) y el
  menú "Abrir formulario de captura" usan `<?= WEB_APP_URL ?>` / contenido.
- **Sello de build (INICIO)**: `tools/push_y_abrir.sh` ahora regenera `src/BUILD.js`
  (commit `git rev-parse --short HEAD` + fecha) antes de `clasp push`, y `--publish`
  apunta al deployment operativo. Así "Versión/Build/Actualización del sistema" nunca
  quedan desactualizados respecto al código enviado.
- **"Última sincronización de fuentes" legible**: la tarjeta de INICIO envuelve el
  `VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0)` en `TEXT(…;"dd/mm/yyyy hh:mm")`
  (antes mostraba el serial crudo tipo `46262,55972`). Efectos sobre el libro real
  tras reconstruir INICIO (Instalar → etapa diseño).
- **Duplicado #34 consolidado**: `Rem9_edadEn` delegó su algoritmo en
  `Utl_edadDesde` (un único cálculo de edad). El contrato REM se preserva
  (devuelve Número o `''`); tests de paridad añadidos en `_pruebas_utilidades`.

## 9. Fase de optimización — cierres

- **EDAD 100% automática**: la vista `SECTOR_*` escribe en la columna `EDAD` la
  fórmula `DATEDIF(…;TODAY();"Y")` (helper `Utl_formulaEdad`), en lugar del valor
  materializado del refresco. Con solo refrescar una vez la vista queda viva y la
  edad se actualiza sola; `FECHA_NACIMIENTO` se muestra con formato `dd/MM/yyyy`.
  La función pura del modelo no cambió (los tests de vista siguen pasando).
- **Carga de la Web App acelerada**: las 3 RPCs iniciales
  (`WebApp_esquemaFormulario`, `api_profesionalesCatalogo`, `api_webappEstado`) se
  fusionaron en una única `WebApp_estadoInicial()` (esquema + catálogo + url). El
  QR sigue consultando la url bajo demanda.
- **Menús minimalistas**: se quitaron los emojis redundantes y las utilidades de
  desarrollo (Diagnóstico, Centro de Pruebas) del menú operativo; se consolidó
  "Actualizar todo" bajo "Actualizar". El código de las funciones retiradas se
  conserva para diagnóstico.
- **Tests**: se añadieron tests de `Utl_columnaLetra`, `Utl_formulaEdad` y de
  existencia de las funciones referenciadas por el menú. Batería completa **738/738**.

## 10. Fase S9 — Auditoría profunda (cierres)

- **Código muerto verificado eliminado** (0 referencias en src + tests + HTML):
  `Utl_cacheGet/Put/Olvidar` (caché CacheService que nunca operó), `Utl_mapaPor`,
  `Fuentes_validar`, `_fuentes_columnasStaging`, `DIAGNOSTICO_BUSCAR_FICHA`,
  `Dash_actualizar`, `_dash_inicializarFiltros`, `_DASH_FILTROS`, `Form_reparar`,
  `api_formularioDiagnostico`, `api_formularioInstalar`, `api_profesionalesCatalogo`,
  `Entorno_gateGAS`, `Act_enriquecerPacientePorRut`, `WebApp_previaDuplicados`
  (legacy), `api_webappCapturar`, `salida_contador`.
- **Dashboard**: hoja `DASHBOARD` legacy obsoleta; se eliminó su orquestador. El
  dashboard vive como funciones puras vía `api_dashboardDatos`.
- **EDAD**: ya automática por fórmula `DATEDIF` (S8), sin cambio.
- **Tests**: batería completa **739/739** (se añadió test-guarda OPT B8 de código
  muerto no reintroducible).
- **E2E real**: no medible en esta ejecución (sin login Google). Pendiente explícito
  de verificación en vivo antes del commit/push/despliegue.
- **Referencias**: `docs/INFORME_AUDITORIA_S9.md`, `ARQUITECTURA.md`, `README.md`.

## 11. Fase v0.97 — Auditoría rendimiento/IA/frontend (cierres)

Informe completo: `docs/INFORME_V097.md`. Batería final **831/831 + HTML 18/18**
(núcleo 560, contrato datos 38, backend V2 68, payload V2 19, cola 33, aceptación 50,
formulario web 27, contrato V2 OK).

- **REM generador**: `RemGenerador.html:208` (`sectorSel` no definido) + failureHandlers
  en `UI_abrirDashboard`/`UI_verRem` — cierre de runtime.
- **IA Gemini (`src/28_IA.js`)**: lecturas/correctores alineados al layout visual de
  PACIENTES (helper `IA_leerBloque` + `Modelo_dataStartRow`/`filaFisica`, escrituras en
  bloque); normalizadores delegados en el pipeline (`IA_parsearFecha` solo VALIDA,
  `IA_normalizarTelefono` canónico con `/`, `IA_corregirSexo` sin inventar OTRO).
- **Frontend**: escapes XSS en `Controles.html` (`estadoMsg`), `Sidebar.html`
  (MODO/ID_INICIAL), `IAPanel.html` (chat/log con `textContent`); `_errSilencioso`
  compartido en `00_Tokens.html`.
- **Captura V2**: gate real de `confirmarNuevoPaciente` en `Captura_v2_entregarIngreso`
  (DEC-024/025) — POSIBLE_DUPLICADO → REVISION salvo confirmación explícita.
- **P2 rendimiento**: borrados `deleteRow`→bloque (`06_Modelo` INGRESO_*/Recuperar,
  `16_Amarillo` dedup), append cola en bloque (`18_Calidad`), trailer/anexos en bloque
  (`24_Formulario`), índices de identificación incrementales `Iden_indicesAgregar`
  (O(n²)→O(1) en lotes de altas; `04_Identificacion` + `12_Ingresos`).
- **No tocados (documentado)**: `Form_buscarFilaIngresoPorMarca` (ya 1 lectura por hoja),
  `Captura_v2_buscarRegistro` (escaneo intencional §13), `Control_estadoVigencia`
  (lectura CONFIG solo sin `avisoDias` inyectado).

## 12. Jornada autónoma 2 — cierres (2026-09-15)

Informe completo: `docs/INFORME_JORNADA_AUTONOMA_2.md`. Decisión vigente: **DEC-063**.
Batería final **868/868** (núcleo 597 · contrato datos 38 · cola 33 · payload V2 19 ·
backend V2 68 · formulario web 27 · V2 contrato 36 · aceptación 50) + `validar_html` **17/17**.

- **Controles por persona 50/50**: rediseño de `Controles.html` (modal 1160×760) con
  planilla de pendientes auto-cargada (VENCIDO/POR_VENCER/SIN_FECHA), chips de estado,
  búsqueda bajo filtro y acciones (control/seguimiento del día, abrir ficha). Reemplaza
  la consulta pura bajo demanda; el `PENDIENTES #11 (CONTROLES PENDIENTES) de negocio`
  sigue abierto en §1 (destino de flujos auxiliares).
- **Captura aditiva de controles/seguimientos**: `CAMPOS_INGRESO_ADICIONALES` (5 campos),
  mapeo/lectores aditivos (`Ingresos_mapearEncabezadosHoja`, `Fuentes_importarMuestra`,
  `Ingresos_leerHoja`), `Fuentes_normalizar` con fecha ULTIMO_*, paciente conserva los
  valores reales. Cierra el foco §2/#28 (revisión de fuentes): los 5 sinónimos ya no se
  descartan. La columna 4 de §1 (**semántica de ESTADO vs SEGUIMIENTO vs CONTROL
  vs PROFESIONAL**) sigue abierta como consulta cliente: se preservan los valores, la
  semántica canónica no se decide por sistema.
- **IA frontend retirada**: sin menú `IA`, sin entrada `IAPanel` en `UICFG_DIALOGOS`,
  sin `src/IAPanel.html`. Backend `28_IA.js` intacto (webhook y tests dependen de él).
  La línea histórica de §11 que menciona `IAPanel.html` queda como historial de la fase
  v0.97 (el archivo ya no existe y no hay que re-crearlo).
- **Código muerto**: eliminada `api_centroResumen`; `_centro_resumen` se conserva bajo
  test (`tests/contrato_datos.mjs`).
- **Publicado**: `clasp push --force` (48 ficheros) + versión **@180** desplegada en el
  deployment operativo (reutilizado). Smoke `GET /exec` → 200. E2E interactivo en vivo
  pendiente de login (mismo límite que jornadas anteriores).

## 13. S6 — Actualización de datos desde fuentes (v0.9.6, 2026-09-15)

Informe completo: `docs/INFORME_ACTUALIZACION_S6.md`. Decisión vigente: **DEC-064**.
Batería **894/894** (núcleo 606 [597 + 9 nuevos] · contrato datos 38 · cola 33 ·
payload V2 19 · backend V2 68 · formulario web 27 · V2 contrato 36 · aceptación 50)
+ `validar_html` **17/17**.

- **ACTUALIZAR = mantenimiento completo**: `Act_actualizarSistema` orquesta estructura
  (reparación idempotente + migración SECTOR_*), importación de fuentes autorizadas,
  actualización de pacientes existentes (merge), enriquecimiento demográfico,
  derivados, vistas y formato. `UI_actualizarSistema`/`UI_actualizarTodo` delegan en
  una única cadena. El instalador sigue siendo la única puerta de creación completa
  de estructura.
- **Merge conservador (DEC-064)**: fill-only para contexto y demografía; fechas de
  estado conservan siempre la MÁS RECIENTE; `NOMBRE`/`RUT`/`SECTOR`/`ESTADO`/
  `ESTRATIFICACION`/`FECHA_INGRESO` jamás se escriben desde la fuente; divergencia
  demográfica → `REQUIERE_REVISION` sin sobrescribir; filas `ERROR` nunca alimentan;
  idempotente (2ª corrida sin cambios); trazabilidad `FUENTE` (sin duplicar) +
  `FECHA_ACTUALIZACION`.
- **SEXO (auditoría)**: campo normalizado `M|F|OTRO|vacío`; sinónimos vigentes
  suficientes; no se agregan sinónimos ni se infiere; el vacío = sin información y
  lo preservan merge y enriquecimiento.
- **Publicado**: `clasp push --force` + nueva versión desplegada en el deployment
  operativo (reutilizado). E2E interactivo en vivo pendiente de login (mismo límite).


## 14. Revisión post-entrega (2026-09-16)

Se corrigieron regresiones reproducidas en captura, simulación y controles;
se agregó verificación integral local/CI y una publicación con tests obligatorios.
Ver `docs/INFORME_REVISION_2026_09_16.md` para evidencias, publicación y límites.
Las decisiones funcionales del §1 y la validación de backups/accesos siguen
pendientes; esta revisión no define reglas clínicas ni ejecuta importaciones reales.


## 15. v0.10.0 — SALUD_MENTAL + MIG-002 + Instalar reactivado (2026-09-21)

Informe completo: `docs/INFORME_2026-09-21_V010_SALUD_MENTAL.md`. Decisión vigente: **DEC-065**.
Batería: núcleo **671/671** + aceptación 50/50 + contrato 36/36 +
captura_backend_v2 73/73 + regresiones 44/44 + instalador_estabilidad PASS +
`validar_html` **21/21**.

- **`SALUD_MENTAL` extremo a extremo**: modelo y vistas (16 → 17 columnas),
  captura V4 (`saludMental` OPC solo `nuevoIngreso`, gate Cp4- con
  `CAMPO_NO_PERMITIDO`, enum `SI`/`NO`/vacío), ficha (`actualizacion.campos.
  SALUD_MENTAL`), fuentes/borrado con normalizador sin inferencia, Web App y
  Sector 16 → 17. Descripción Definición de Completo (DDC) se conserva.
- **MIG-002 (esquema 1 → 2)**: fila única en `docs/MIGRACIONES.md`
  (`Mig_run002()`), reutiliza aseguradores de esquema/vistas +
  `_mig002_asegurarIngresosSaludMental`; `SISTEMA_VERSION_SCHEMA_ACTUAL = 2`.
- **Instalar reactivado**: `INSTALAR_ETAPAS_MUTAN` vuelve a incluir
  fuentes/amarillo/enriquecimiento; toman `LockService`, respaldo
  `SNAPSHOT_ACTUAL` antes del lock y guard de versión antes del lock.
  `SNAPSHOT_ACTUAL` no toca `PROXIMO_CONTROL` ni `SALUD_MENTAL` de existentes
  (no-pérdida DEC-064). Caracteres de unidad: `>`/`P`/`B` contra `z/r/h/q/R/H`.
  Cierra el foco de §2 (Instalar re-ejecutable); **la ejecución viva contra el
  libro real** sigue pendiente (misma causa: sin sesión Google en este host).
- **Pendiente que permanece**: E2E en vivo (login Google) para instalación
  completa, etapa «Ajustando el libro», captura y ficha con `SALUD_MENTAL`.
- **Publicado**: `clasp push --force` + versión **`@215`** desplegada en el
  deployment operativo (reutilizado); smoke `GET /exec` → 200 con la vista de
  captura sirviendo `saludMental`. El siguiente paso de DEFINITION OF DONE
  (E2E interactivo en vivo + commit/push Git) queda explicitado en
  `docs/INFORME_2026-09-21_V010_SALUD_MENTAL.md`.

## 16. Auditoría v0.10.1 — source sync, backup e idempotencia (2026-09-22)

Informe completo: `docs/INFORME_2026-09-22_AUDITORIA_V0101.md`.
Batería: **16 suites · 0 fallos** (núcleo 671/671 + `tests/regresiones_auditoria_v010.mjs` 15/15
+ resto de la batería verde).

- **Respaldo real previo en Drive** (`PRE_INSTALAR`, uno por token de ejecución,
  `BACKUP_FALLIDO` sin escritura), **idempotencia por FUENTE con clave canónica**
  (sin duplicar eventos ante drift de literal), **preflight estructural**
  (`HOJA_FUENTE_FALTANTE` en dry-run y ejecutar), **una sola lectura real de
  fuentes** entre dry-run y ejecución, **guard de snapshot en TELEFONOS** (no
  infla FUENTE en Instalar repetido), **dedupe en STAGING_IMPORT**, y **MIG-002
  por nombre sin pisar columnas ocupadas** (bloqueo `MIG-002:INGRESOS_REVISION`).
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado (URL base/QR intactos). **E2E en vivo sobre el libro real sigue
  pendiente** de la sesión Google (bloqueador 1).

## 17. Ficha 2.0 + incorporación controlada de ingresos v0.10.2 (2026-09-22)

Informe: este documento (§17) + `docs/INFORME_2026-09-22_FICHA_V2.md`.
Batería: **17 suites · 0 fallos** (agrega `tests/ficha_ingresos_v0102.mjs`
**13/13**; núcleo 671/671, contrato 38/38, regresiones 44/44, validar_html 21/21).

- **Corrección pre-existente**: `Ingresos_escribirEstados` iteraba con
  `Object.keys(porHoja)` sobre un `Map` (rotura introducida en ETAPA 3b) → el
  write-back de `ESTADO_INGRESO`/`NOTA_SISTEMA` era **código muerto** en
  producción. Corregido con `Array.from(porHoja.entries())` y la variable de
  grupo `resHoja` (`src/12_Ingresos.js`).
- **Ficha de paciente 2.0** (`src/Sidebar.html`): pestañas Resumen / Datos /
  Seguimiento / Clínico / Historial / Equipo; módulo **ingresos pendientes**
  (lista paginada `api_ingresosPendientes` + detalle pre-ficha
  `api_ingresoDetalle` + incorporación idempotente `api_ingresoIncorporar`);
  edición de ficha redirigida al modelo (`Paciente_actualizarCampos_` +
  `Paciente_validarCampo_` en `src/31_Ficha.js`).
- **Guards por token en la interfaz**: las RPC de ficha regresan
  `ACCESO_DENEGADO` si el cliente no envía el token compartido; se propagó el
  token a paneles que lo omitían (`Controles`, `Dashboard`, `Configuracion`,
  `RemVista`, `CentroPruebas`) para que sigan operativos con los nuevos guards.
  `_ECICEP_DEBUG=false` en producción.
- **Pendiente que permanece**: E2E en vivo (sin sesión Google en el host) para
  recorrer ingresos pendientes → incorporar → ficha sobre el libro real.

## 18. Hardening v0.10.3 — separación de capacidades y trazabilidad de estratificación (2026-09-22)

Informe: `docs/INFORME_2026-09-22_HARDENING_V0103.md`; decisión DEC-067.
Batería: **20 suites · 0 fallos** (agrega `tests/seguridad_capacidades_v0103.mjs`
**10/10**, `tests/rpc_surface_v0103.mjs` **4/4**,
`tests/integridad_mutaciones_v0103.mjs` **9/9**; `tests/acceso_webapp.mjs`
reescrita **8/8**; `regresiones_revision` actualizada **44/44**; núcleo
671/671, contrato 38/38, validar_html 22/22). `ECICEP.VERSION` → `0.10.3`,
**schema 2** (sin MIG-003).

- **CAPTURA ≠ OPERADOR**: tokens disjuntos (`CAPTURA_ACCESS_TOKEN` /
  `OPERADOR_ACCESS_TOKEN`); la URL pública nunca entrega el token de operador y
  el preflight público no filtra PII de candidatos.
- **Superficie RPC mínima**: `Hojas_resetFabrica_`, `Recuperar_ejecutar_`,
  `IA_limpiarEventosHuerfanos_`, `Modelo_agregarPacientes_`,
  `Modelo_agregarEventos_`, `Estrat_recalcularPaciente_`,
  `Ingresos_procesarTodasLasHojas_` son privados; acceso vía wrappers `api_*`
  con OPERADOR. Wrappers administrativos alineados a `ACCESO_DENEGADO`;
  CentroPruebas sin mutadores internos.
- **CONFIG sin secretos** (`CONFIG_SECRETOS`); **estratificación trazable**
  (`CAMBIO_ESTRATIFICACION` en todo cambio del valor vigente, no-op sin evento);
  **ficha atómica**; **revisión→INGRESO idempotente**; **eventos reservados**
  no creables genéricamente; locks en mutaciones compuestas.
- **Pendiente que permanece**: E2E en vivo sobre el libro real (sin sesión
  Google en el host) — ficha 2.0, panels con operador y CAPTURA pública en
  navegador anónimo. Se verificó por tests/página V2 en esta pasada.
