# PENDIENTES — Trabajo pendiente real ECICEP

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

**Bloqueo activo 2026-09-17:** `v0.9.18` (commit `1398873`) pasó las 15 suites
y `clasp push --force` actualizó `@HEAD`, pero `clasp deploy` rechazó crear
una nueva versión: el proyecto alcanzó 200/200 versiones. El deployment
operativo sigue en `@200` (`v0.9.17`). Los únicos deployments son `@HEAD` y
`@200`; ninguna versión anterior está vinculada a un deployment activo. Google
solo permite borrar versiones desde **Project History** del editor (no existe
`projects.versions.delete` en la API pública). Con la cuenta propietaria,
eliminar una versión antigua sin deployment —por ejemplo `176`, sin descripción—
y volver a ejecutar `clasp deploy --deploymentId` sobre el ID operativo; después
verificar `/exec`, CI y actualizar el estado de README/PENDIENTES. No crear
otro proyecto, Spreadsheet ni deployment para evadir este límite.

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
