# HISTORIAL — Evolución por versión

> Archivo de **historial** del proyecto ECICEP. Recopila la evolución completa
> por versión y fase, desde `v0.5.0` hasta el estado actual. Ninguna sección de
> este archivo tiene carácter normativo de arquitectura: la especificación
> vigente vive en `AGENTS.md`, `ARQUITECTURA.md` y `docs/CONTRATO_CAPTURA_V2.md`
> (**NORMATIVO**). Una referencia histórica solo se convierte en instrucción
> vigente cuando aparece en la documentación vigente.

## v0.11.1 — ESTABILIZACIÓN DE OPERACIÓN REAL

- Hotfix de instalación: `MIG-001` localiza cabeceras desplazadas y, ante
  encabezados irrecuperables, regenera solo la vista derivada `SECTOR_*` desde
  `PACIENTES + EVENTOS`; corrige `SECTOR_NARANJO:ENCABEZADOS_INCOMPATIBLES` sin
  tocar la fuente canónica. Regresión local 45/45.
- Salud rápida al abrir y auditoría profunda bajo demanda, con estados separados
  de datos, integridad, trigger de ingreso y respaldo. El resumen persistido no
  contiene PII y se invalida al mutar el modelo.
- Diagnóstico del trigger por handler, evento, cantidad y Spreadsheet asociado.
  Ausente, duplicado o con fuente incorrecta impide declarar operación sana.
- Backups con estado observable, retención/horario dinámicos y nombres explícitos
  para copias previas. Instalar/Reparar respeta `lock → backup → mutación`.
- Reparación selectiva: solo recalcula derivados afectados; huérfanos y
  duplicados quedan como evidencia para revisión.
- Lookup interactivo con `findNext()` en `RESPONSE_ID` y `NOTA_SISTEMA`; el
  recuento de duplicados queda en la auditoría administrativa.
- `ECICEP.VERSION = 0.11.1`; esquema **2**; captura **V4**. Validación local:
  **32 suites, 0 fallos**. Publicado en el mismo deployment operativo **@230**
  con build `3fdeca6`; smoke anónimo HTTP 200 con `0.11.1` y build correctos.

## v0.11.0 — FIABILIDAD, RENDIMIENTO Y RECONCILIACIÓN (deployment @228)

- `ESTADO_INGRESO = INGRESADO` manual activa un trigger instalable e idempotente
  que procesa una sola fila por el pipeline canónico. La etiqueta solo queda
  `INGRESADO` con evidencia de paciente, evento `INGRESO` y `FUENTE` hoja/fila.
- Diagnóstico y reconciliación histórica distinguen `OK_REAL`,
  `INGRESADO_FALSO`, `DERIVADO_DESACTUALIZADO` e `INCONSISTENTE`; no inventan
  eventos, fechas, patologías ni sectores.
- La captura busca `captureId` con `TextFinder` sobre `RESPONSE_ID`, busca marcas
  por `FUENTE`, usa el `ID_EVENTO` retornado y reemplaza `appendRow` por
  `setValues`. La ficha usa lookup puntual de paciente.
- Índices efímeros por ID/RUT, invalidación selectiva, `Log_perf` sin PII y
  `Sistema_estadoSalud_`. El log reutiliza el lock ya adquirido y conserva el
  recorte por `deleteRows`.
- Instalar/Reparar verifica un único backup previo, instala el trigger, ejecuta
  reconciliación y repite diagnóstico en el post-check.
- Control/Seguimiento recuerda la vista por pestaña, mantiene 0 RPC al alternar,
  expone `aria-pressed` y prioriza la acción activa.
- `ECICEP.VERSION = 0.11.0`; esquema **2**; captura **V4**; URL y QR intactos.
  Publicado con build `ca94c64` en el deployment operativo **@228**. Smoke
  anónimo: HTTP 200 y sellos `0.11.0`/`ca94c64` presentes.
- Verificación: **29 suites, 0 fallos**, incluyendo arquitectura, ingreso manual,
  integridad/observabilidad, rendimiento estructural y HTML 22/22.

## v0.10.7-fix2 — RUT CON DÍGITO VERIFICADOR K EN CELULARES (QR) (deploy reutilizado, URL y QR intactos)

El formulario de captura abierto desde el **código QR** en un celular no permitía
escribir el dígito verificador de RUT terminado en la letra **K** (ej: `12.345.678-K`):
el campo usaba `inputmode="numeric"`, que abre el teclado numérico del celular, sin
letras. Se cambió a `inputmode="text"` (`autocapitalize="characters"` para sugerir la
mayúscula) y se documentó la K en el tooltip de ayuda. La normalización
(`rutFormatoProgresivo`) ya aceptaba `k`/`K` y el validador del contrato también;
el problema era exclusivamente de entrada en pantalla táctil. Sin cambio de versión
(`ECICEP.VERSION` → 0.10.7, schema 2, sin MIG); nueva versión **@227** en el
deployment operativo reutilizado. Batería completa: **25 suites · 0 fallos**.

## v0.10.7-fix — ROBUSTEZ DE LECTURA DE INGRESOS + BUSCADOR POR RUT (deploy reutilizado, URL y QR intactos)

Corrección de la incorporación de ingresos reportada tras publicar v0.10.7:
el panel marcaba **1 error "paciente vacío"** en filas aparentemente sin datos,
el batch "Incorporar todos los válidos" terminaba **sin feedback** cuando no
había nada procesable, y el **buscador no encontraba todos los RUT** de la hoja.

- **Filtro de filas sin identidad** (`src/12_Ingresos.js`,
  `Ingresos_leerHoja`): una fila solo es candidata a pendiente si la celda RUT
  tiene **al menos un dígito** o la celda NOMBRE tiene **al menos una letra**.
  Cierra el fantasma real: filas con caracteres invisibles (U+200B, que
  sobrevive a `String.trim()`), guiones/puntuación sueltos o un dato ajeno en
  otra columna ya no generan el ERROR "paciente vacío" ni se leen como datos.
- **Localizador determinista de encabezados** (`Ingresos_localizarEncabezados_`
  + `Ingresos_layoutHoja_`, PURA+GAS con cache): fila de encabezados real entre
  las primeras 10 filas (NOMBRE+RUT, máxima coincidencia de columnas; empate →
  menor fila; por defecto la del contrato, sin cambio de comportamiento en el
  layout visual). Compartido por la **lectura completa** (listado/batch), la
  **lectura acotada** (detalle/incorporación individual, mantiene el invariante
  de 1 fila de alto, O pruebas de rendimiento verdes) y la **escritura de
  ESTADO_INGRESO/NOTA_SISTEMA**. Si la hoja real no está en la fila de contrato
  sigue leyéndose, listándose y escribiéndose en las MISMAS coordenadas físicas.
- **Normalización del RUT en el buscador** (`src/04_Identificacion.js`,
  `Bus_buscarPacientes`): ambos lados se normalizan (`Norm_normalizarRut`); un
  RUT almacenado con puntos/espacios (imports previos) se encuentra por el RUT
  canónico, y un RUT sin DV se encuentra por cuerpo (con DV se exige
  coincidencia de DV cuando ambos lo traen). La búsqueda por nombre queda
  intacta.
- **Feedback explícito del batch** (`src/Sidebar.html`,
  `ingIncorporarValidos`): cuando hay pendientes leídos pero **ninguno
  procesable** se muestra "Ninguna fila pendiente procesable: vacías, ya
  ingresadas o fuera del filtro actual" — nunca más una banda de resumen vacía
  que parecía "no pasó nada".
- **Tests**: `tests/incorporacion_ingresos_vNEXT.mjs` → **17/17** (T14 filas
  fantasma U+200B/guiones no generan pendiente ni ERROR; T15 encabezados reales
  fuera de la fila de contrato: listado/detalle/incorporar/estado coherentes;
  T15b fantasma con encabezados fuera de contrato; T16 buscador con RUT con
  puntos y SIN_DV). Batería `node tools/verificar.mjs` → **25 suites · 0 fallos**
  (`validar_html` 22/22). `ECICEP.VERSION` → `0.10.7`, **schema 2** (sin MIG).
- **Publicado**: `clasp push --force` + nueva versión **@226** en el deployment
  operativo reutilizado (misma URL `/exec` y QR).

## v0.10.7 — INCORPORACIÓN DE INGRESOS CLARA PARA EL OPERADOR (deploy reutilizado, URL y QR intactos)

- **Panel de ingresos → "Incorporación de ingresos"**: subtítulo explicativo
  ("Revisa e incorpora al sistema…"), tarjeta "¿Qué significa incorporar?" y
  eliminación de la promesa de "copia" a sectores. El listado gana filtros por
  **Sector** (Todos/Naranjo/Amarillo/Verde) y **Estado**
  (PENDIENTE/WARNING/ERROR) con chips de conteo sin RPC extra (`conteos` en
  `api_ingresosPendientes`). El detalle muestra el **Sector destino** real, el
  checklist "Al incorporar", errores y advertencias; en ERROR el botón queda
  deshabilitado ("No incorporable"), con advertencias se incorpora con aviso.
  Tras incorporar: mensaje traducido por estado (INGRESADO "Incorporado
  correctamente", REQUIERE_REVISION "Requiere revisión antes de incorporar",
  DUPLICADO "Ya existe un ingreso equivalente", ERROR "No pudo incorporarse",
  nota nuevo paciente / paciente existente), la ficha se abre y volver retorna
  a la lista recargada (paginación retrocede si la página quedó vacía).
- **Incorporación masiva de válidos en UNA RPC**: `api_ingresosIncorporarValidos
  ({sector})` bajo el lock existente reutiliza literalmente
  `Ingresos_procesarTodasLasHojas_` (`soloHojas` del sector + alias
  INGRESO_NARANJA, `confirmarNuevos:false`) — nunca N RPC por fila.
  `Ingresos_incorporarValidos_` recompone el resumen plano en `{resumen,
  resultados}` con contadores de agrupación derivados de `resultados`. El
  cliente confirma, pinta el resumen estructurado (Ingresados / Revisar /
  Errores / Sin cambios) y refresca.
- **Menú ECICEP de Sheets**: entrada **"Incorporar ingresos"**
  (`UI_abrirIngresos` → sidebar modo `ingresos` con el panel auto-cargado):
  la operación grupal deja de estar oculta en el menú operativo. Menú ECICEP
  pasa de 4 a **5 items** (límite testado ≤5); el orquestador legacy
  "📥 Procesar ingresos" permanece como función interna.
- **Tests**: nueva `tests/incorporacion_ingresos_vNEXT.mjs` (**13/13**: T1-T10
  flujo individual, vista derivada SECTOR_*, idempotencia de doble clic, ERROR
  sin escritura + botón deshabilitado, WARNING incorporable, POSIBLE_DUPLICADO
  → revisión, paciente existente, masivo 4+1+1+ya-Ingresado, masivo por sector,
  pendientes que desaparecen; T11-T12 textos UI y guardas de token + KPI; T13
  entrada de menú "Incorporar ingresos" abre sidebar modo `ingresos`).
  Batería total `node tools/verificar.mjs` → **25 suites · 0 fallos**
  (`validar_html` 22/22). `ECICEP.VERSION` → `0.10.7`, **schema 2**.
- **Docs**: ARQUITECTURA.md, README.md, DECISIONES.md (DEC-071),
  `docs/INFORME_2026-09-23_INCORPORACION_INGRESOS_V0107.md`.
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado (misma URL `/exec` y QR, sin deployments por rutina).

## v0.10.6 — CONTROLES Y SEGUIMIENTOS POR PERSONA + REM SIN LOADER FALSO (deploy reutilizado, URL y QR intactos)

- **Controles por persona → Controles y seguimientos por persona**: selector
  `[Control] [Seguimiento]` que alterna la presentación **100 % en cliente**
  (0 RPC extra, sin tocar sector/estados/búsqueda/paginación/selección). La
  vista CONTROL muestra "Últ. control"; la vista SEGUIMIENTO muestra
  "Últ. seguimiento"; ambas usan `proximo` como **Próxima atención**
  compartida (no se crea `PROXIMO_SEGUIMIENTO`). Default `CONTROL`. El detalle
  conserva ambos últimos registros y ordena primero el tipo activo
  (Recordatorio sin formateo de fecha). Tras registrar, la vista elegida no se
  resetea. Backend sin cambios (`api_controlPanel`,
  `Control_consultarControles`, `Control_filasPanel` intactos).
- **REM — vista de trabajo**: al abrir queda en estado neutro ("Selecciona los
  filtros y pulsa Consultar") **sin animación ni "Calculando el informe…"**; el
  loader real solo aparece dentro de `consultar(btn)`, antes de ejecutar
  `api_remVista`. No auto-consulta en `init()`; `REM_ULTIMA` se conserva.
  `api_remVista`/`_rem9_datos`/`Rem9_armarVistaDatos`/`REM_exportarPdf_`
  intactos.
- **Tests**: nueva `tests/controles_seguimientos_rem_v0106.mjs` (**9/9**:
  T1 backend entrega ambos últimos registros + `proximo` + `estado`; T2 selector
  y default; T3/T5 cambio de tipo sin RPC y sin tocar filtros; T4 vista según
  tipo con columna Próxima atención compartida; T6 registrar no resetea vista;
  T7-T9 REM sin loader inicial, loader solo en consultar, sin auto-consulta).
  Batería total `node tools/verificar.mjs` → **24 suites · 0 fallos**
  (`validar_html` 22/22). `ECICEP.VERSION` → `0.10.6`, **schema 2**.
- **Docs**: ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md (DEC-070),
  `docs/INFORME_2026-09-22_CONTROLES_SEGUIMIENTOS_REM_V0106.md`.
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado (misma URL `/exec` y QR, sin deployments por rutina).

## v0.10.5 — FIABILIDAD OPERATIVA + LECTURAS ACOTADAS (deploy reutilizado, URL y QR intactos)

- **Batería nueva** `tests/operador_resiliencia_vNEXT.mjs` (**32/32**): estado
  de envío por las 4 acciones (una sola RPC, fase correcta), desbloqueo por
  timeout, guard de secuencia (el callback de una solicitud vieja nunca toca la
  nueva), modal de duplicados (pausa el timeout humano y conserva el envío
  activo), descarte sin RPC, continuar/registrar-como-nuevo (conserva payload;
  `confirmarNuevoPaciente` solo cuando el operador lo confirma), recuperación de
  acceso (una sola recarga, anti-bucle, captureId conservado en sessionStorage y
  restaurado/consumido una vez), bootstrap (catálogo vacío reintenta y bloquea
  sin habilitar jamás el envío; errores temporales reintentan; botón Reintentar
  recupera), contrato RPC de dataset vacío ≠ fallo (`api_buscar`,
  `api_revisionListar`, `api_ficha` nunca nula, dashboard, remVista
  `PERIODO_INVALIDO`, accesos rechazados `ok:false`), idempotencia del operador
  (`CONFLICTO_IDEMPOTENCIA` §13B, retry convergente, seguimiento idempotente),
  lock `SERVICIO_OCUPADO` sin ejecutar la mutación (acceso/ficha), ficha
  todo-o-nada con advertencia `VISTA_SECTOR_PENDIENTE` y retry convergente
  `FICHA_CAMBIO`.
- **Batería nueva** `tests/captura_rendimiento_acotado_vNEXT.mjs` (**9/9**):
  la captura y la pre-ficha del sidebar nunca escanean una hoja `INGRESO_*`
  completa (fixture de 10.000 filas, objetivo fila 9.876): `Ingresos_leerFilasAcotadas_`
  lee solo la fila de encabezados + las filas físicas permitidas (getRange de
  UNA fila cada una), nunca `getDataRange` ni `getRange(1,1,getLastRow(),...)`;
  umbral de 50 filas en el lector (con 51+ delega en `Modelo_leerBloqueCabecera`);
  `api_ingresoDetalle` = una única lectura acotada.
- **Backend/frontend** ya incorporados en esta versión (estado de envío por
  acción, preflight `NUEVO_INGRESO`, timeout de entrega, captura de duplicados
  con intención explícita, guards de secuencia y anti-bucle de recarga, catálogo
  bloqueante `CATALOGO_PROFESIONALES_NO_DISPONIBLE`, esquema de catálogo en
  `100_Entorno.js`, `WebApp_estadoInicial` con contrato v0.10.5, lectura acotada
  de `INGRESO_*`, endpoint uniforme de RPC con dataset vacío ≠ fallo).
- **Se conservan** hardening de DEC-067/DEC-068: superficie RPC mínima, guards
  por RPC, mutaciones atómicas/idempotentes, `CONFIG_SECRETOS`; schema **2** sin
  migración; mismo deployment @221; URL/QR intactos (sin deployments por rutina).
- **Tests**: batería total `node tools/verificar.mjs` → **23 suites · 0 fallos**
  (`validar_html` 22/22). `ECICEP.VERSION` → `0.10.5`, **schema 2**.
- **Docs**: ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md (DEC-069),
  `docs/CONTRATO_CAPTURA_V2.md`, `docs/INFORME_2026-09-22_FIABILIDAD_OPERATIVA_V0105.md`.
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado @221 (misma URL `/exec` y QR).

## v0.10.4 — ACCESO UNIVERSAL ECICEP (hotfix, deploy reutilizado, URL y QR intactos)

- **Incidente resuelto**: «El procesamiento del envío falló; reintentable
  (ACCESO_DENEGADO)». Causa: la capacidad disjunta de v0.10.3 servía páginas
  operativas con token CAPTURA (las RPC de ficha/panel fallaban
  `ACCESO_DENEGADO`) y `WebApp_servirCaptura_` podía inyectar `TOKEN_ACCESO=''`
  por contención de lock.
- **ACCESO UNIVERSAL (DEC-068, supera DEC-067)**: una sola credencial
  (`CAPTURA_ACCESS_TOKEN`, valor conservado) habilita captura, ficha, Controles,
  Dashboard, REM, Revisión, Configuración, Backups y CentroPruebas.
  `OPERADOR_ACCESS_TOKEN` queda obsoleto como legacy de transición.
- **`WebApp_claveUniversal_` nunca devuelve `''`**: devuelve la clave existente
  sin lock, toma lock solo para crear, relee bajo contención y falla si no
  existe. Todas las páginas se sirven con la credencial universal y
  `MODO_OPERADOR=true`; `CapturaWeb.html` deja de ocultar ACTUALIZAR_DATOS y se
  auto-recupera de `ACCESO_DESACTUALIZADO` (recarga 1 vez preservando
  `captureId`).
- **Se conservan** los hardening compatibles de v0.10.3: superficie RPC mínima,
  guards por RPC (token inválido/ausente → `ACCESO_DENEGADO`), mutaciones
  atómicas/idempotentes, `CONFIG_SECRETOS`; schema **2** sin MIG-003.
- **Tests**: nueva `acceso_universal_v0104` (**7/7**); `acceso_webapp`
  reescrita (**8/8**); `seguridad_capacidades_v0103` (**10/10**) y
  `rpc_surface_v0103` (**4/4**) ajustadas al contrato universal.
  Batería `node tools/verificar.mjs` → **21 suites · 0 fallos**.
  `ECICEP.VERSION` → `0.10.4`, **schema 2**.
- **Docs**: ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md (DEC-068),
  `docs/CONTRATO_CAPTURA_V2.md`, `docs/INFORME_2026-09-22_ACCESO_UNIVERSAL_V0104.md`.
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado (misma URL `/exec` y QR, sin deployments por rutina).

## v0.10.3 — Separación de capacidades CAPTURA ≠ OPERADOR y trazabilidad de estratificación (deploy reutilizado, URL intacta)

- **Tokens disjuntos**: se separaron `CAPTURA_ACCESS_TOKEN` y
  `OPERADOR_ACCESS_TOKEN` con capacidades disjuntas — la página pública entrega
  solo capacidad de captura, y la ficha/paneles/admin exigen operador. La URL
  base nunca expone el token de operador; el preflight público no filtra datos
  identificables de candidatos.
- **Superficie RPC mínima**: helpers críticos (`Hojas_resetFabrica_`,
  `Recuperar_ejecutar_`, `IA_limpiarEventosHuerfanos_`, `Modelo_agregarPacientes_`,
  `Modelo_agregarEventos_`, `Estrat_recalcularPaciente_`,
  `Ingresos_procesarTodasLasHojas_`) dejaron de ser invocables por
  `google.script.run`; su acceso pasa solo por wrappers `api_*` de dominio con
  token de OPERADOR. Wrappers administrativos alineados a
  `Api_error_('ACCESO_DENEGADO')` (calidad, amarillo, estrat, rem9, exportar PDF,
  auditoría). CentroPruebas.html ya no llama mutadores internos.
- **CONFIG sin secretos**: `CONFIG_SECRETOS` + `Config_esSecreto_` +
  `Config_valorPublico_`; `api_configListar`/auditoría enmascaran, guards de
  guardado rechazan secretos.
- **Estratificación trazable (NORMATIVO `ESTRATIFICACION.md:46`)**: todo cambio
  del valor vigente genera `CAMBIO_ESTRATIFICACION` con ID/FECHA/RIESGO_G/
  DESCRIPCION/FUENTE/REGISTRADO_POR — desde patologías, recáculo de un paciente
  y recáculo masivo (eventos de lote en una sola escritura; fallo de escritura →
  `CAMBIO_ESTRATIFICACION_FALLIDO`/`PATOLOGIAS_NO_TRACEABLES`, revisión). No-op
  no crea evento.
- **Misiones de integridad**: ficha atómica (0 cambios si un campo es inválido),
  revisión→INGRESO que cierra caso y es idempotente, eventos reservados
  rechazados por el registrador genérico (`TIPO_EVENTO_RESERVADO`), locks en
  mutaciones compuestas, fallo de vista derivada acotado (no silenciado).
- **Tests**: suites nuevas `seguridad_capacidades_v0103` (**10/10**),
  `rpc_surface_v0103` (**4/4**) e `integridad_mutaciones_v0103` (**9/9**);
  `acceso_webapp` reescrita (**8/8**); `regresiones_revision` actualizada
  (**44/44**). Batería `node tools/verificar.mjs` → **20 suites · 0 fallos**
  (núcleo 671/671, contrato 38/38, aceptación 50/50, captura V2 73/73,
  validar_html 22/22). `ECICEP.VERSION` → `0.10.3`, **schema 2** sin MIG-003.
- **Docs**: ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md (DEC-067),
  `docs/INFORME_2026-09-22_HARDENING_V0103.md`.
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado (misma URL `/exec` y QR, sin deployments por rutina).

## v0.10.2 — Ficha de paciente 2.0 + incorporación controlada de ingresos (deploy @217, URL reutilizada)

- **Corrección de código muerto pre-existente**: `Ingresos_escribirEstados`
  recorría un `Map` de `Utl_agruparPor` con `Object.keys(porHoja)` (rotura
  introducida en ETAPA 3b) → el write-back de `ESTADO_INGRESO`/`NOTA_SISTEMA`
  era **código muerto** en producción. Corregido con `Array.from(porHoja.entries())`
  y la variable de grupo `resHoja` (`src/12_Ingresos.js`). Regresión cubierta en
  la nueva suite.
- **Ficha de paciente 2.0** (`src/Sidebar.html` reescrita): pestañas Resumen /
  Datos / Seguimiento / Clínico / Historial / Equipo; módulo **ingresos
  pendientes** (`api_ingresosPendientes` paginado → `api_ingresoDetalle`
  pre-ficha → `api_ingresoIncorporar` idempotente vía `Ecicep_conLock_`);
  edición centralizada en el dominio (`Paciente_actualizarCampos_` +
  `Paciente_validarCampo_` en `src/31_Ficha.js`, validación estricta
  `CAMPO_INVALIDO`). `_ECICEP_DEBUG=false`.
- **Guards por token en la interfaz**: las RPC `api_*` de ficha exigen el token
  compartido (`ACCESO_DENEGADO` sin él). Se propagó el token a los paneles que
  lo omitían (Controles, Dashboard, Configuracion, RemVista, CentroPruebas)
  — esas llamadas estaban rotas en producción con los guards activos y quedaron
  reparadas. Los tests del harness VM reciben la lectura defensiva de `body`.
- **Tests**: nueva suite `tests/ficha_ingresos_v0102.mjs` (**13/13**); batería
  `node tools/verificar.mjs` → **17 suites · 0 fallos** (núcleo 671/671,
  contrato 38/38, regresiones 44/44, captura backend V2 73/73, aceptación
  50/50, auditoría v0.10.1 15/15, validar_html 21/21).
- **Docs vigentes actualizadas**: ARQUITECTURA.md, README.md, PENDIENTES.md,
  DECISIONES.md (DEC-066), `docs/INFORME_2026-09-22_FICHA_V2.md`.
- **Pendiente que permanece**: E2E en vivo (sin sesión Google en el host) para
  recorrer ingresos pendientes → incorporar → ficha sobre el libro real;
  verificación de páginas panel en navegador anónimo.
- **Publicado**: `clasp push --force` + actualización del deployment operativo
  reutilizado @217 (URL base/QR intactos).

## v0.10.1 — Auditoría de source sync, backup e idempotencia (deploy que mantiene la URL)

- **Endurecimientos de la auditoría v0.10.0** (informe
  `docs/INFORME_2026-09-22_AUDITORIA_V0101.md`):
  - **Respaldo previo real en Drive** (`Instalar_asegurarBackup_`): la primera
    etapa mutante de una ejecución crea `Backup_crear('PRE_INSTALAR')` (una copia
    por token de ejecución, reutilizada por las etapas siguientes; clave
    `ECICEP_INST_BK|<token>` en CacheService TTL 1800 + memo; llamadas legacy sin
    token → fallback). Si el respaldo falla → `BACKUP_FALLIDO` y cero escrituras.
    `api_instalarPaso(id, acceso, ejecucion)`; el cliente genera `_EJEC` en
    `iniciarInstalacion()`. El webhook `Instalar_ejecutarPolitica` también
    respalda antes de mutar.
  - **Idempotencia por FUENTE con clave canónica** (`Fuentes_claveDedupe_`):
    la comparación ignora mayúsculas/espacios/tildes y el formato de la fila; la
    cadena FUENTE almacenada se conserva RAW. Un drift de literal en la config
    entre ejecuciones no vuelve a generar eventos.
  - **Preflight estructural** (`Fuentes_preflightFuentes` + `Fuentes_preflightInforme_`):
    hoja autorizada ausente o archivo inaccesible/desconfigurado BLOQUEA la carga
    (`HOJA_FUENTE_FALTANTE`) en dry-run y ejecución, sin leer ni escribir.
  - **Una sola lectura real de fuentes entre dry-run y ejecución**
    (`_Fuentes_analizar_` + `_Fuentes_escribir_` con memo `_FUENTES_ANALISIS_MEMO`
    TTL 1h, poda y descarte al escribir); `Instalar_pFuentes` reutiliza el
    análisis vía `ejecucionId`.
  - **Merge conservador sin inflar trazabilidad**: guard de snapshot en TELEFONOS
    (`if (can === actual) return`) → repetir Instalar no hace crecer `FUENTE` ni
    `FECHA_ACTUALIZACION`; `Fuentes_guardarFilas` dedupe por origen → STAGING_IMPORT
    archiva cada fila física UNA sola vez.
  - **MIG-002 por nombre, sin pisar columnas**: `_mig002_asegurarIngresosSaludMental`
    inserta `SALUD_MENTAL` tras `NOTA_SISTEMA` solo con celda libre y orden
    canónico intacto; columna ocupada/encabezado ausente/desorden → `revision[]`
    y BLOQUEO (`MIG-002:INGRESOS_REVISION:...`). Eliminado el alias `'SM'`.
- **Tests**: nueva suite `tests/regresiones_auditoria_v010.mjs` (**15/15**) +
  stubs de preflight en `tests/regresiones_revision.mjs`; `node tools/verificar.mjs`
  → **16 suites · 0 fallos** (núcleo 671/671, contrato 36/36, regresiones 44/44…).
- **Docs vigentes actualizadas**: ARQUITECTURA.md, README.md, PENDIENTES.md,
  docs/MIGRACIONES.md, docs/INFORME_2026-09-21_V010_SALUD_MENTAL.md.
- **Pendiente que permanece**: E2E en vivo (sin sesión Google en el host) para
  ejecutar Instalar sobre el libro real; README refleja "E2E real ⏳ pendiente".

## v0.10.0 — SALUD_MENTAL extremo a extremo + MIG-002 + Instalar reactivado (deploy `@215`)

- **`SALUD_MENTAL` (SI/NO/vacío)**: nuevo campo clínico registrado por la dupla,
  **sin inferencia desde texto libre**. Modelo `PACIENTES` (índice 21, tras
  `OTRAS_PATOLOGIAS`), vistas `SECTOR_*` (16 → 17 columnas) y `INGRESO_*`
  (columna 12 del orden `INGRESO_COLUMNAS`). Contrato de captura **V4**:
  campo `saludMental` OPC solo para `nuevoIngreso` (§0.2/§5.1/§6/§9), gate por
  `captureId` (`Cp4-`; `Cp2-`/`Cp3-` → `CAMPO_NO_PERMITIDO`), enum validado
  (`SI`·`NO`·vacío → `CAMPO_INVALIDO` si otro). Ficha: edición vía
  `actualizacion.campos.SALUD_MENTAL` (clave permitida). Huella canónica V4 lo
  incluye; las huellas `Cp2-`/`Cp3-` persistidas no cambian. TR-1 → `SALUD_MENTAL`;
  fuentes/borrado normalizan con `Norm_normalizarSaludMental` (sin inferencia).
- **MIG-002 (esquema 1 → 2)**: `Mig_run002()` en `docs/MIGRACIONES.md`, reutiliza
  `Modelo_asegurarEsquemaPacientes` + `Modelo_alinearVistasSectoriales` +
  `_mig002_asegurarIngresosSaludMental`. `SISTEMA_VERSION_SCHEMA_ACTUAL = 2`.
- **Instalar/reparar reactivado**: `INSTALAR_ETAPAS_MUTAN` vuelve a incluir
  fuentes/amarillo/enriquecimiento (mismo `INST-1`); toman `LockService`,
  respaldo `SNAPSHOT_ACTUAL` antes del lock y guard `Instalar_versionIncompatible_`
  antes del lock. `SNAPSHOT_ACTUAL` no toca `PROXIMO_CONTROL` ni `SALUD_MENTAL`
  de existentes. Caracteres de unidad `>`/`P`/`B` frente a `z/r/h/q/R/H`.
- **Tests**: núcleo 671/671 (MIG-002, así canónica, gates Cp4, huella), aceptación
  50/50, contrato 36/36, captura_backend_v2 73/73 (carga `29_ActualizacionCaptura.js`),
  regresiones 44/44, instalador_estabilidad PASS, `validar_html` 21/21.
- **Docs vigentes actualizadas**: `docs/CONTRATO_CAPTURA_V2.md` (V4/§0.2 +
  matriz + enums + TR-1/TR-2 + versionado), `DECISIONES.md` (DEC-065),
  `ARQUITECTURA.md`, `README.md`, `PENDIENTES.md`, `FUENTES-DATOS.md`,
  `MODELO-DATOS.md`, `docs/VERSIONADO.md`, `docs/MIGRACIONES.md`.
- **Decisión**: DEC-065. Informe: `docs/INFORME_2026-09-21_V010_SALUD_MENTAL.md`.

## v0.9.29 — QR permanente: captura abierta desde la URL base (deploy `@214`)

- **Canal de captura abierto en la URL base**: `doGet` deja de exigir token para
  la vista `captura`; la URL `…/exec` (el QR impreso) carga el formulario para
  **cualquier persona, sin cuenta Google ni clave**. Las demás vistas (paneles,
  ficha, Backups, REM…) siguen exigiendo el enlace compartido vigente.
- **Reactivación de QRs impresos**: el deployment operativo ya no cambia al
  publicar; un QR que apunte a la URL base queda **permanente** y las copias ya
  distribuidas (historias de impresión masiva) vuelven a funcionar sin reimprimir.
- **Garantía por test**: `tests/acceso_webapp.mjs` fija el nuevo contrato
  (URL base → HTML de captura + token inyectado por plantilla; vistas internas →
  texto sin clave) y el test de QR permanente valida que `WebApp_urlCompartida_()`
  deriva solo de la URL configurada + token estable.
- **Defensa contractual**: el instalador heredado de Google Forms queda
  bloqueado por diseño (`GOOGLE_FORMS_INHABILITADO`): aunque se completara
  `FORM_ID` no se instala ningún trigger `onFormSubmit`; test P0 que lo fija.
  El panel de formulario ya no presenta "canal legado" ni referencia funciones
  inexistentes.

## v0.9.28 — Auto-recarga ante caché antigua en Captura (deploy `@212`)

- **Watchdog de versión** (`_autoReloadSiVersion` en `CapturaWeb.html`): `doGet`
  incrusta `PAGE_BUILD` (`ECICEP_BUILD.commit`) en `window.ECICEP_PAGE_BUILD` y
  `WebApp_estadoInicial`/`api_webappEstado` devuelven `build` con el mismo sello.
  Si difieren, la página muestra un aviso y se **auto-recarga** (única vez por
  pestaña vía `sessionStorage` `"ecicep_reload_once"`); si hay datos sin guardar,
  alerta en vez de recargar (no pierde captura). Acceso seguro a `sessionStorage`
  (`_sesGet/_sesSet/_sesRemove`) con degradación a alerta si el almacenamiento
  está bloqueado, evitando bucles infinitos.
- **Anti-cache**: metas `Cache-Control: no-cache, no-store, must-revalidate`,
  `Pragma: no-cache` y `Expires: 0` en la plantilla de Captura.
- **Tests**: PARTE J1–J5 en `tests/formulario_web.mjs` (sello al día sin recarga,
  recarga única, anti-bucle, bloqueo por datos sin guardar, storage bloqueado);
  anclajes de versión a `0.9.28`. Batería completa verde.
- **Publicado**: deployment operativo reutilizado, nueva versión `@212`
  (primero `@211` con la versión básica del watchdog). `ECICEP.VERSION = 0.9.28`.
  `docs/CONTRATO_CAPTURA_V2.md` intacto.

## v0.9.27 — Acceso universal del QR de Captura sin cuenta Google (deploy `@210`)

- **Causa raíz**: `CapturaWeb.html` sirve el token compartido en
  `<body data-acceso="<?= CAPTURA_ACCESO ?>">` pero el bundle leía
  `window.ECICEP_ACCESO` en sus 4 RPC (`estadoInicial`, `previaDuplicadosV2`,
  `estado`, `enviar`) sin que nadie asignara la variable: un visitante anónimo
  enviaba `undefined` y `WebApp_autorizarBuscador` respondía `ACCESO_DENEGADO`
  (con sesión de Google sí entraba, por eso no se detectaba en la oficina).
- **Corrección**: puente JS justo tras `<body>` que asigna
  `window.ECICEP_ACCESO` desde `data-acceso`. Guarda `validarPuenteAcceso()` en
  `tests/validar_html.mjs` (FALLA si el HTML sirve `data-acceso` y el bundle lee
  `ECICEP_ACCESO` sin puente) y `tests/formulario_web.mjs` extrae el IIFE del
  bundle en vez del primer `<script>`.
- **Publicado**: deployment operativo reutilizado, `@210`. No cambia backend ni
  contrato de captura.

## v0.9.26 — Hotfix formato de vistas SECTOR_* migradas 15→16 columnas (deploy `@209`)

- **Fallback**: al migrar `SECTOR_*` a 16 columnas se perdía el formato visual de
  la sección `OBSERVACIONES` (col 16) tras Implementar/Reparar; el fast-path de
  `HVis_yaFormateada` aceptaba la vista como formateada con 3 de 4 secciones.
- **Corrección**: «Instalar / reparar» fuerza ahora
  `HVis_aplicarTodasLasSecciones({forzar:true})`, `HVis_yaFormateada` valida la
  etiqueta real de cada sección sobre las columnas reales y
  `HVis_pendientesVisual` verifica todo el intervalo `colInicio..colFin`. No
  cambia datos ni esquema (MIG-001 intacto).

## Fase v0.9.4 — Reversión de estadísticas INICIO + lienzo compactado (deploys @173–@175)

- **Gran mejora INICIO v3 aprobada y revertida del día (DEC-032)→revertida
  (DEC-033)**: se implementó y desplegó (deploys @173–@174) una ampliación con
  gráficos embebidos (pie sector / pie estratificación / columna de controles),
  motor de datos COUNTIF en el margen azul y fila "Controles para HOY".
- **Reversión (deploy @175) por decisión del usuario**: eliminar el bloque
  VISUALIZACIÓN de INICIO y compactar el ancho del lienzo: `FILA_FIN` 92→**55**,
  `COL_FIN` 40→**32**, `FILA_CONT` 66→**53**, `COL_CONT` 24→**24**; márgenes
  azules panorámicos cerrados (margen derecho 400px→0 y aire azul 240px→0;
  columnas decorativas 48px→30px). Se conservan: "Controles para HOY" (fila de
  ESTADO DEL SISTEMA con fórmula inline `COUNTIF(PROXIMO_CONTROL;TODAY())`),
  las descripciones geográficas de sector corregidas (NARANJO = más lejano,
  AMARILLO = distancia media, VERDE = más cercano), y las fórmulas puras
  `Hojas_formulaIngresosMes` y `Hojas_formulaSinControl` (reutilizadas en la
  tabla ESTADO). Se retiraron `Hojas_motorDatos`, `Hojas_graficoPie`,
  `Hojas_graficoColumna` y los 3 contadores de gráficos; verificación de INICIO
  vuelve a **12 checks**.
- **Tests**: núcleo **592/592** (sin gráficos/motor) · HTML **18/18** ·
  aceptación **50/50** · contrato **36/36** · E2E post-deploy @175: mismo
  snapshot **17 problemas** (sin regresión)
- **Docs**: `DECISIONES.md` DEC-032 (parcial revertido) + **DEC-033** (nuevo);
  `docs/HISTORIAL.md` (esta fase). No hubo git commit (no solicitado).

## Fase v0.9.3 — Mejoras INICIO + estabilización IA (deploys @165–@172)

- **V2 del rediseño INICIO**: alerta enriquecida con 3 categorías dinámicas
  (por revisar · RUT inválidos · controles vencidos, solo conteos > 0, sin
  separadores colgantes vía REGEXREPLACE); filas nuevas en ESTADO DEL SISTEMA
  ("Ingresos del mes" con COUNTIFS+EOMONTH y "Sin próximo control agendado");
  descripciones de botones de sector diferenciadas (Prioritario / En
  seguimiento / Estable); 12 verificaciones automáticas de regeneración;
  fórmulas extraídas a funciones puras testables (`Hojas_formulaAlerta`,
  `Hojas_formulaIngresosMes`, `Hojas_formulaSinControl`).
- **Política de revisión IA (DEC-031)**: los eventos huérfanos (143) se
  **eliminaron en bloque** (`IA_limpiarEventosHuerfanos`, acción webhook
  `limpiar_huerfanos` con `confirmar=1`; evento con ID vacío nunca se borra);
  `EVENTO_FECHA_ANTERIOR_INGRESO` y `SECTOR_EVENTO_DISTINTO` NO se reportan más
  (fuente previa al sistema: normal); `RUT_EVENTO_DISTINTO` se mantiene.
  E2E final: 2667 pacientes / 20 471 eventos → **17 problemas** reales
  (5 calidad + 12 fuente AMARILLO pendiente, que conservan estado PENDIENTE).
- **INICIO revisado**: botón muerto `CONFIGURACIÓN` eliminado; botón engañoso
  `SECTORES` reemplazado por 3 botones funcionales por sector
  (`SECTOR_NARANJO/AMARILLO/VERDE`); botón `DIAGNÓSTICO` conservado (abre LOG).
  Descripciones de módulos despojadas de instrucciones (`"Buscar · Ficha ·
  Seguimiento"`, `"Menú → ⚙"` eliminados). Alerta dinámica limpia de texto
  instruccional (`"— abrir Cola de Revisión →"` removido).
- **INICIO más ancho**: lienzo de contenido ampliado de 20 a 24 columnas;
  columnas de contenido de 58px a 72px; tarjetas de sector/estratificación
  expandidas a 6 columnas para llenar la ventana. Aire a la derecha (240px) y
  margen derecho reducido.
- **Estabilización IA (revisión de datos)**: `totalProblemas` ahora cuenta el
  arreglo completo (no la muestra de 100/15); `IA_textoRevision` muestra el
  conteo real por categoría; `REQUIERE_REVISION` acepta `VERDADERO`, `SI` y
  booleano además de `TRUE`; detalle RUT distingue "sin dígito verificador".
- **E2E**: acción `revisar` vía webhook verificada (2667 pacientes / 20 471
  eventos → **17 problemas** reales tras limpieza y política; antes 632).
- **INICIO v3 (gran mejora) — deploys @173–@174**: 3 gráficos embebidos
  (pie población por sector, pie por estratificación, columna de controles
  vencidos/próximos 30d/últimos 30d) con motor de datos en el margen azul
  (cols 30–31); tabla ESTADO ampliada a 11 filas con "Controles para HOY";
  sección VISUALIZACIÓN; descripciones de sectores corregidas a significado
  geográfico (NARANJO = más lejano, AMARILLO = distancia media, VERDE = más
  cercano); regeneración idempotente (borra charts previos antes de insertar);
  verificación ampliada a 16 checks (motorSector, motorEstrat, graficos,
  infoHoy). Funciones puras añadidas: `Hojas_formulaCuentaSector`,
  `Hojas_formulaCuentaEstrat`, `Hojas_formulaCuentaControl`, `Hojas_motorDatos`.
  E2E post-deploy: mismo snapshot (17 problemas, sin regresión).
- **Tests**: núcleo **592/592** + HTML **18/18** + aceptación **50/50** +
  contrato **36/36** · deploys `@165`–`@174`.
- **Acción requerida**: ejecutar **Instalar / Reparar Sistema** (menú → 🛠️)
  para regenerar la hoja INICIO con el nuevo diseño.

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

## Fase v0.97 — Auditoría rendimiento / IA / frontend + cierres

> Informe completo: `docs/INFORME_V097.md`. Fase de auditoría sin cambio de versión.

- **Correctores IA alineados al layout visual** de PACIENTES (helper `IA_leerBloque`,
  filas físicas y escrituras en bloque) y normalizadores delegados en el pipeline
  determinista (fechas solo VALIDA, teléfonos canónicos con `/`, sexo sin inventar OTRO).
- **Frontend**: escapedados XSS en Controles/Sidebar/IAPanel y `_errSilencioso` compartido
  en `00_Tokens.html`; fix de runtime en `RemGenerador.html` (sector fijo).
- **Captura V2**: gate real de `confirmarNuevoPaciente` en `Captura_v2_entregarIngreso`
  (POSIBLE_DUPLICADO → REVISION salvo confirmación explícita — DEC-024/025).
- **Rendimiento**: borrados/append por fila → bloques (Limpieza INGRESO_*, Recuperar
  EVENTOS, Amarillo dedup, Calidad cola, Formulario trailer/ANEXAR); índices de
  identificación incrementales `Iden_indicesAgregar` (O(1)/alta en lotes).
- **Tests**: núcleo **560/560** (+3 de regresión IA/índices) · batería completa **831/831** +
  `validar_html` 18/18.

## Resumen del estado actual frente al historial

- Google Forms está **abandonado** y no debe reactivarse como canal operativo.
- DEV/DEMO/PROD **no son entornos** de la aplicación; existe un único entorno operativo.
- La **Web App es el único canal operativo de captura**.
- Los deployments son **mecanismos técnicos de publicación**, no entornos.
- No existe segunda base de datos ni segundo pipeline; una sola fuente de verdad.
- El contrato de captura se define únicamente en `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**).