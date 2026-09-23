# ARQUITECTURA — Sistema ECICEP

> **Actualización 2026-09-22 (v0.10.5):**
> - **FIABILIDAD OPERATIVA (DEC-069)**: estado de envío por las 4 acciones
>   (NUEVO_INGRESO/ACTUALIZAR_DATOS/SEGUIMIENTO/CAMBIO_SECTOR) con UNA RPC y
>   fase correcta, preflight de `NUEVO_INGRESO`, timeout de entrega que
>   desbloquea el formulario con mensaje compartido, guard de secuencia (el
>   callback de una solicitud vieja jamás toca la actual), modal de duplicados
>   que pausa el timeout humano y conserva la intención
>   (`confirmarNuevoPaciente` solo cuando el operador confirma
>   explícitamente), descarte sin RPC, recuperación de acceso con anti-bucle
>   (una sola recarga; captureId conservado en `sessionStorage` y restaurado),
>   bootstrap bloqueante: catálogo vacío → `CATALOGO_PROFESIONALES_NO_DISPONIBLE`
>   reintenta y jamás habilita el envío (invariante: `ok:true` implica
>   profesionales cargados), errores temporales reintentan y el botón
>   Reintentar recupera. Contrato RPC uniforme: **dataset vacío ≠ RPC fallida**
>   (`api_buscar` `ok:true filas:[]`, `api_revisionListar` métricas vacías,
>   `api_ficha` nunca nula, `api_remVista` `PERIODO_INVALIDO`, accesos
>   rechazados siempre `ok:false`). Idempotencia del operador vigente
>   (`CONFLICTO_IDEMPOTENCIA` §13B del contrato), lock `SERVICIO_OCUPADO` sin
>   ejecutar la mutación, y ficha todo-o-nada (PACIENTES + EVENTO; fallo de
>   vista derivada solo avisa `VISTA_SECTOR_PENDIENTE`); retry convergente
>   `FICHA_CAMBIO`.
> - **LECTURAS ACOTADAS (§41)**: la captura en la Web App y la pre-ficha del
>   sidebar leen solo encabezados + filas físicas permitidas
>   (`Ingresos_leerFilasAcotadas_`, getRange de UNA fila, nunca
>   `getDataRange`), con umbral de 50 filas en el lector; una hoja `INGRESO_*`
>   de 10.000 filas ya no se barre en ningún request de captura/pre-ficha.
> - **Se conservan** superficie RPC mínima, guards por RPC, mutaciones
>   atómicas/idempotentes, `CONFIG_SECRETOS`; **schema 2 sin migración**;
>   deployment operativo reutilizado @221 (misma URL/QR, sin deployments por
>   rutina). `ECICEP.VERSION` → `0.10.5`.
> - Batería: **23 suites · 0 fallos** (`validar_html` 22/22, operador
>   resiliencia vNEXT 32/32, captura lecturas acotadas vNEXT 9/9).
>   Informe `docs/INFORME_2026-09-22_FIABILIDAD_OPERATIVA_V0105.md`.

> **Actualización 2026-09-22 (v0.10.4):**
> - **ACCESO UNIVERSAL ECICEP (DEC-068, supera DEC-067)**: una sola credencial
>   (`CAPTURA_ACCESS_TOKEN`, valor conservado) habilita **todas** las funciones
>   operativas: captura, ficha, Controles, Dashboard, REM, Revisión,
>   Configuración, Backups y CentroPruebas. Se elimina la separación
>   CAPTURA ≠ OPERADOR (no representaba el requisito real: con el enlace del
>   sistema se captura **y** se administra). `OPERADOR_ACCESS_TOKEN` queda
>   obsoleto y se acepta solo como legacy de transición (enlaces v0.10.3
>   abiertos). Resuelve el incidente de producción «El procesamiento del envío
>   falló; reintentable (ACCESO_DENEGADO)» (página operativa con token CAPTURA,
>   más bug de token `''` por contención de lock).
> - **`WebApp_claveUniversal_` nunca devuelve `''`**: devuelve la credencial
>   existente sin lock; toma el lock **solo** para crearla; ante contención
>   relee sin lock; si realmente no existe, falla. Todas las páginas se sirven
>   con `CAPTURA_ACCESO`/`TOKEN_ACCESO`/`TOKEN_INVITACION` = credencial universal
>   y `MODO_OPERADOR=true`; `CapturaWeb.html` ya no oculta ACTUALIZAR_DATOS y se
>   auto-recupera de `ACCESO_DESACTUALIZADO` (recarga 1 vez preservando
>   `captureId`). El pipeline de entrega no re-autentica (auditado).
> - **Se mantienen los hardening de DEC-067 compatibles**: superficie RPC mínima
>   (wrappers `api_*`, helpers `_`), guards por RPC (token inválido/ausente →
>   `ACCESO_DENEGADO`), mutaciones atómicas e idempotentes, `CONFIG_SECRETOS`,
>   schema **2** (sin MIG-003).
> - Batería: **21 suites · 0 fallos** (validar_html 21/21, seguridad ACCESO
>   UNIVERSAL 10/10, rpc surface 4/4, acceso universal v0.10.4 7/7, acceso
>   webapp 8/8). `ECICEP.VERSION` → `0.10.4`, **schema 2**.
>   Informe `docs/INFORME_2026-09-22_ACCESO_UNIVERSAL_V0104.md`.

> **Actualización 2026-09-22 (v0.10.3):**
> - **Separación de capacidades CAPTURA ≠ OPERADOR**: dos tokens disjuntos en
>   PropertiesService. La página pública (`CapturaWeb.html`) entrega solo
>   capacidad de captura (`WebApp_capturarEnviar`, preflight de captura) y nunca
>   recibe ni expone el token de operador; ficha, paneles, admin, REM, calidad,
>   auditoría, configuración, backups y CentroPruebas exigen
>   `OPERADOR_ACCESS_TOKEN`. Capacidades disjuntas y verificadas por tests.
> - **Superficie RPC mínima**: helpers críticos `Hojas_resetFabrica_`,
>   `Recuperar_ejecutar_`, `IA_limpiarEventosHuerfanos_`,
>   `Modelo_agregarPacientes_`, `Modelo_agregarEventos_`,
>   `Estrat_recalcularPaciente_`, `Ingresos_procesarTodasLasHojas_` solo existen
>   con sufijo `_` (inaccesibles por `google.script.run`); el acceso pasa por
>   wrappers `api_*` de dominio con token de OPERADOR (patrón
>   `Dominio_operacion_` + `Ecicep_conLock_`). CentroPruebas.html ya no llama
>   mutadores internos.
> - **CONFIG sin secretos**: `CONFIG_SECRETOS`/`Config_esSecreto_`/
>   `Config_valorPublico_` enmascaran valores secretos en `api_configListar` y
>   auditoría; los guards de escritura rechazan secretos por API.
> - **Estratificación trazable (NORMATIVO `docs/ESTRATIFICACION.md:46`)**: todo
>   cambio del valor vigente genera `CAMBIO_ESTRATIFICACION` (ID_EVENTO,
>   FECHA_EVENTO, RIESGO_G, DESCRIPCION `anterior → nuevo · motivo`, FUENTE,
>   REGISTRADO_POR) desde `Patologias_guardarPaciente_` (31_Ficha.js:372),
>   `Estrat_recalcularPaciente_` (02_Normalizacion.js:600) y
>   `Estrat_recalcularTodos_` (:662, eventos de lote en una escritura; fallo →
>   `CAMBIO_ESTRATIFICACION_FALLIDO`/`PATOLOGIAS_NO_TRACEABLES` = revisión).
>   No-op no crea evento.
> - **Integridad de mutaciones**: ficha atómica (campo inválido → 0 cambios);
>   revisión→INGRESO cierra caso y es idempotente (`CONFLICTO_YA_RESUELTO`);
>   eventos reservados (`INGRESO`, `CAMBIO_SECTOR`, `CAMBIO_ESTRATIFICACION`,
>   `EGRESO`, `GESTION_CASO_*`, `PLAN_CUIDADO`) rechazados por el registrador
>   genérico (`TIPO_EVENTO_RESERVADO`, 31_Ficha.js:449) y no seleccionables en
>   el Sidebar; mutaciones compuestas con `Ecicep_conLock_`; fallo de vista
>   derivada acotado (fuente primaria no silenciada).
> - Batería: **20 suites · 0 fallos** (núcleo 671/671, contrato 38/38,
>   regresiones 44/44, ficha-ingresos 13/13, validar_html 22/22, seguridad
>   capacidades 10/10, rpc surface 4/4, integridad mutaciones 9/9, acceso
>   webapp 8/8). `ECICEP.VERSION` → `0.10.3`, **schema 2** (sin MIG-003).
>   Historia en `docs/HISTORIAL.md`; informe `docs/INFORME_2026-09-22_HARDENING_V0103.md`.

> **Actualización 2026-09-22 (v0.10.2):**
> - **Corrección de código muerto**: `Ingresos_escribirEstados` recorría un
>   `Map` (retorno de `Utl_agruparPor`, introducido en ETAPA 3b) con
>   `Object.keys(porHoja)` → el write-back de `ESTADO_INGRESO`/`NOTA_SISTEMA`
>   nunca llegaba a las hojas `INGRESO_*` en producción. Corregido con
>   `Array.from(porHoja.entries())` + variable de grupo `resHoja`
>   (`src/12_Ingresos.js`).
> - **Ficha de paciente 2.0** (`src/Sidebar.html`): pestañas Resumen / Datos /
>   Seguimiento / Clínico / Historial / Equipo; módulo **ingresos pendientes**
>   (lista paginada `api_ingresosPendientes` → detalle pre-ficha
>   `api_ingresoDetalle` → incorporación idempotente `api_ingresoIncorporar`).
>   La edición de ficha delega en el dominio (`31_Ficha.js`):
>   `Paciente_actualizarCampos_` + validación estricta `Paciente_validarCampo_`
>   (reemplaza el `switch` histórico de `api_actualizarPaciente`; errores
>   `CAMPO_INVALIDO:<campo>` con `motivo` humano). `_ECICEP_DEBUG=false`.
> - **Guards por token en la interfaz**: todas las RPC `api_*` de ficha exigen
>   el token compartido (`WebApp_autorizarBuscador`) y devuelven
>   `ACCESO_DENEGADO` sin él. Se propagó el token a todos los paneles que lo
>   omitían (`Controles`, `Dashboard`, `Configuracion`, `RemVista`,
>   `CentroPruebas`) para que sigan operativos con los guards — antes esas
>   llamadas estaban rotas en producción. Mutaciones compuestas usan
>   `Ecicep_conLock_` (ScriptLock; contención → `SERVICIO_OCUPADO`).
> - Batería: **17 suites · 0 fallos** (núcleo 671/671, contrato 38/38,
>   regresiones 44/44, ficha-ingresos v0.10.2 13/13, validar_html 21/21).
>   Historia en `docs/HISTORIAL.md`; informe `docs/INFORME_2026-09-22_FICHA_V2.md`.

> **Actualización 2026-09-21 (v0.10.0):**
> - **`SALUD_MENTAL` extremo a extremo**: el modelo clínico incorpora
>   `PACIENTES.SALUD_MENTAL` (`SI`/`NO`/vacío = sin información), registrado por
>   la dupla y **prohibido de inferir** desde texto libre. Esquema **2** (MIG-002):
>   `MODELO_PACIENTE` pasa a 31 columnas (índice 21 tras `OTRAS_PATOLOGIAS`);
>   las vistas `SECTOR_*` pasan de 16 a **17 columnas** (`COLUMNAS_SECTOR_VISTA`
>   índice 16, al final); `INGRESO_COLUMNAS` incorpora `SALUD_MENTAL`
>   (índice 11 → columna física 12). Extensión normativa del contrato de captura
>   **V4** en `docs/CONTRATO_CAPTURA_V2.md §0.2`: campo `saludMental` OPC solo
>   para `nuevoIngreso`, gate por `captureId` (`Cp4-`; `Cp2-`/`Cp3-` →
>   `CAMPO_NO_PERMITIDO`; enum `SI`·`NO`·vacío → si no, `CAMPO_INVALIDO`). La
>   ficha lo edita vía `actualizacion.campos.SALUD_MENTAL` (clave permitida,
>   enum `['','SI','NO']`). La huella canónica V4 lo incluye; las huellas
>   `Cp2-`/`Cp3-` ya persistidas **no cambian**. `normalizador`
>   `Norm_normalizarSaludMental` en fuentes/borrado sin inferencia. TR-1 →
>   `SALUD_MENTAL`; TR-2 `nuevoIngreso` → columna 12 del orden `INGRESO_COLUMNAS`
>   (por encabezado, no por índice fijo).
> - **Instalar/reparar reactivado** (`INSTALAR_ETAPAS_MUTAN` vuelve a declarar
>   fuentes/amarillo/enriquecimiento, mismo `INST-1`): las etapas toman
>   `LockService`, respaldan `SNAPSHOT_ACTUAL` **antes** del lock y registran el
>   guard `Instalar_versionIncompatible_` antes del lock. `SNAPSHOT_ACTUAL` no
>   toca `PROXIMO_CONTROL` ni `SALUD_MENTAL` de existentes (no-pérdida DEC-064 /
>   doctrina FIX v0.8.5). Caracteres de unidad `>`/`P`/`B` frente a `z/r/h/q/R/H`.
> - Estructura `src/` añade `29_ActualizacionCaptura.js` (edición/ficha desde
>   captura V4). Batería verde: núcleo 671/671, aceptación 50/50, contrato 36/36,
>   captura_backend_v2 73/73, regresiones 44/44, instalador_estabilidad PASS,
>   `validar_html` 21/21. Decisión **DEC-065**; Historia en `docs/HISTORIAL.md`.

> **Actualización 2026-09-21 (v0.9.28):** la Web App de Captura deja de ejecutarse
> desde versiones en caché. Cada `doGet` incrusta el sello `PAGE_BUILD` =
> `ECICEP_BUILD.commit` (BUILD.js se regenera en cada push) en
> `window.ECICEP_PAGE_BUILD`, y los endpoints `WebApp_estadoInicial` y
> `api_webappEstado` devuelven `build` con ese mismo sello. El watchdog del
> bundle (`_autoReloadSiVersion`) compara ambos: si coinciden (o alguno está
> vacío) no hace nada y limpia el flag `sessionStorage "ecicep_reload_once"`;
> si la página servida es vieja, muestra un aviso y **auto-recarga** vía
> `location.reload` (única vez por pestaña) SIN perder datos: si hay captura en
> progreso (`capturaEnProgreso()`) o ya se intentó recargar, solo alerta pidiendo
> reabrir el enlace actualizado. El acceso a `sessionStorage` es seguro frente a
> contextos con almacenamiento bloqueado (privacidad estricta): los helpers
> `_sesGet/_sesSet/_sesRemove` degradan a alerta en lugar de recargar, evitando
> bucles infinitos y protegiendo la inicialización del formulario. Se añadieron
> además metas anti-cache
> (`Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` +
> `Expires: 0`) y la batería de tests PARTE J en `tests/formulario_web.mjs`
> (J1–J5) que cubre: sello al día sin recarga, recarga única con formulario
> vacío, anti-bucle si ya se recargó, bloqueo por datos sin guardar, y
> `sessionStorage` bloqueado con alerta sin recarga. `ECICEP.VERSION` sube a 0.9.28 y
> los tests anclados a la versión se re-validan. No cambia contrato ni pipeline
> (`docs/CONTRATO_CAPTURA_V2.md` intacto).

> **Actualización 2026-09-21 (v0.9.27):** se restauró el **acceso universal del
> QR de Captura sin permisos ni cuenta Google**. Causa raíz: `CapturaWeb.html`
> sirve el token compartido en `<body data-acceso="<?= CAPTURA_ACCESO ?>">` pero
> el bundle leía `window.ECICEP_ACCESO` en sus 4 RPC (`estadoInicial`,
> `previaDuplicadosV2`, `estado`, `enviar`) sin que nadie asignara la variable:
> un visitante anónimo enviaba `undefined` y `WebApp_autorizarBuscador(undefined)`
> respondía `ACCESO_DENEGADO` (el operador con sesión sí veía la página, por eso
> "en la oficina parecía que iba"). Corrección: puente JS inyectado justo tras
> `<body>` — `<script>window.ECICEP_ACCESO=document.body.getAttribute("data-acceso")||"";</script>`
> — ejecutado antes de la primera lectura. Se añadió la guarda `validarPuenteAcceso()`
> en `tests/validar_html.mjs` (FALLA si el HTML sirve `data-acceso` y el bundle
> lee `ECICEP_ACCESO` sin puente, o si el puente no precede al uso) y se endureció
> `tests/formulario_web.mjs` para extraer el IIFE del bundle en vez del primer
> `<script>` (el puente es ahora un segundo script inline legítimo). No cambia
> backend ni contrato de captura (`docs/CONTRATO_CAPTURA_V2.md` intacto).

> **Actualización 2026-09-18 (v0.9.26):** hotfix de producción: las vistas
> `SECTOR_NARANJO`/`SECTOR_AMARILLO`/`SECTOR_VERDE` migradas de 15 a 16
> columnas quedaban sin formatear la sección `OBSERVACIONES` (columna 16)
> tras «Instalar / reparar». MIG-001 alineaba los encabezados (fila 3) pero
> no repintaba la fila 2, y el fast-path `HVis_yaFormateada` aceptaba la
> vista como formateada con solo 3 de 4 secciones. «Instalar / reparar»
> fuerza ahora el formato visual (`HVis_aplicarTodasLasSecciones({forzar:true})`),
> `HVis_yaFormateada` valida la etiqueta real de cada sección sobre las
> columnas reales y `HVis_pendientesVisual` verifica todo el intervalo
> `colInicio..colFin` de cada sección. El fast-path se conserva para el
> uso cotidiano: solo se fuerza al instalar/reparar. No cambia datos ni
> esquema (`COLUMNAS_SECTOR_VISTA` intacto, MIG-001 intacto).

> **Actualización 2026-09-18 (v0.9.25):** hotfix de producción: el picker de
> FECHA_NACIMIENTO de la fase «Preparando la portada» usaba
> `DataValidationBuilder.setDateValid`, API inexistente en Apps Script, que
> hacía fallar «Instalar / reparar» en Sheets reales. Se reemplaza por
> `requireDate()` y el harness de pruebas ahora monta un builder estricto que
> rechaza cualquier método inexistente, con regresión específica sobre la
> portada.

> **Actualización 2026-09-18 (v0.9.24):** instalar y reparar ya no agrupa
> columnas técnicas no contiguas de PACIENTES, que podían ocultar RUT y
> NOMBRE; repara únicamente el grupo heredado 1..12 o ese mismo bloque
> completamente oculto. Los formatos de fecha de otras hojas siguen el encabezado físico,
> aunque cambie el orden de columnas; las marcas de auditoría muestran hora.
> Las validaciones respetan las filas disponibles y el semáforo de próximo
> control usa fórmulas válidas en PACIENTES y SECTOR_*.

> **Actualización 2026-09-18 (v0.9.23):** el diagnóstico previo del
> instalador inspecciona validaciones, formato condicional y columnas técnicas
> sin modificarlas. Una etapa escritora se detiene si no puede obtener el
> bloqueo exclusivo. El menú de Sheets se omite desde la Web App, donde no
> existe interfaz para crearlo, y su fallo se informa al ejecutarse en Sheets.

> **Actualización 2026-09-18 (v0.9.22):** al ajustar el libro, las hojas
> visuales conservan las filas inmovilizadas y liberan cualquier inmovilización
> de columnas: su título combinado cruza todo el ancho y Google Sheets rechaza
> inmovilizar solo parte de esa celda. Las hojas simples, como EVENTOS, siguen
> inmovilizando las columnas configuradas. Corrige el fallo observado en la
> etapa «Ajustando el libro» de la instalación operativa.

> **Actualización 2026-09-17 (v0.9.21):** Instalar aplica una línea de acento
> por pestaña, oculta la cuadrícula de las hojas con bandas y ajusta la altura
> de filas ocupadas; informa los fallos de formato condicional y coloración
> de RUT en lugar de declarar la etapa completa. INICIO calcula estratificación pendiente sobre pacientes
> reales (ID presente) y usa ese mismo total para porcentajes. Estadísticas
> excluye filas vacías, incluye el sector MÚLTIPLE y clasifica todo valor ajeno
> a G1/G2/G3 como pendiente; el mes vigente usa la fecha del servidor en Chile.
> Recalcular estratificación invalida la caché tras
> escribir; el recálculo individual conserva el nivel de fuente si no hay
> cálculo, igual que el masivo. La próxima atención permanece manual.

> **Actualización 2026-09-17 (v0.9.20):** Actualizar sistema conserva el
> procesamiento por etapas, pero devuelve un error global si una etapa falla,
> incluida una aplicación parcial de formato, diseño o validaciones. El resumen
> identifica cada etapa y su motivo, la interfaz lo muestra y el Registro deja
> una entrada de error. El libro clínico no se modifica para comprobarlo: la
> regresión se prueba con servicios simulados.

> **Actualización 2026-09-17 (v0.9.19):** el instalador distingue las etapas
> omitidas y el inventario de solo lectura de las etapas que modifican el libro.
> Las primeras no bloquean otras escrituras ni se presentan como trabajo
> realizado. El progreso cuenta etapas terminadas y muestra las hojas
> adicionales conservadas.

> **Actualización 2026-09-17 (v0.9.18):** el instalador detiene las etapas de
> escritura ante un esquema ilegible o posterior al código. Los fallos de
> validación y diseño se informan al operador. La revisión de hojas adicionales
> es de solo lectura y la instalación conserva también `Hoja 1`.

> **Actualización 2026-09-17 (v0.9.17):** el deployment Web App sirve las
> interfaces existentes mediante rutas `vista` protegidas por la misma clave
> compartida: Pacientes/ficha, Controles, Estadísticas, REM, Configuración,
> Backups, Registro e Instalación/reparación. El botón Funciones en Captura abre el portal. El backend,
> Spreadsheet y pipeline no se duplican; Sheets conserva su interfaz propia.

> **Actualización 2026-09-17 (v0.9.15):** los paneles de ficha/dupla,
> registro, configuración y Backups reciben la clave compartida en su propia
> interfaz y la validan en cada operación protegida. La ausencia de email en
> otras cuentas de Sheets ya no bloquea esas funciones. La hoja de cálculo
> sigue siendo una interfaz de Google; el acceso sin cuenta se realiza por la
> Web App y su enlace compartido.

> **Actualización 2026-09-17 (v0.9.14):** el deployment sigue siendo único y
> ejecuta como propietario. Para acceso sin cuenta Google, Captura distribuye
> desde el menú Sheets un enlace con clave independiente del webhook. La Web
> App exige ese enlace para servir HTML anónimo y revalida la clave en sus RPC;
> no depende del email oculto por Apps Script.

> **Actualización 2026-09-17 (v0.9.13):** las fechas de último control y
> seguimiento no retroceden al registrar atenciones históricas. Después de
> importar fuentes, las correcciones V4 auditadas restauran la caché de
> PACIENTES desde EVENTOS efectivo antes de refrescar vistas; la agenda manual
> se conserva. `PREINGRESO` admite fecha o estado canónico en la Web App.

> **Actualización 2026-09-17 (v0.9.12):** la Web App edita la ficha existente
> mediante Captura V4, con lectura autenticada, escritura por cambios y protección
> ante modificaciones simultáneas. La misma fuente PACIENTES/EVENTOS conserva
> el historial de correcciones y la agenda exclusivamente manual.

> **Actualización 2026-09-16 (v0.9.11):** próxima atención exclusivamente manual en
> `PROXIMO_CONTROL`, editable desde Captura (V3, compatible con V2) y ficha.
> Registrar atenciones, actualizar o importar no recalcula la agenda. Captura
> reúne botón de apertura, QR y copia de URL. Estratificación se gestiona en Patologías.
> Esta regla sustituye cualquier descripción histórica de agenda automática.

> Estado documental: consolidación de la arquitectura vigente. Los hitos ETAPA 2/2.5/3 y las versiones 0.x se conservan como historial; no describen por sí solos el estado operativo actual.

## Estado vigente de mantenimiento (2026-09-21)

- `Instalar / reparar` (**reactivado v0.10.0**): ejecuta el pipeline estructural
  completo y las etapas de **fuentes, Amarillo, enriquecimiento y derivados vuelven
  a mutar datos reales** (mismo `INST-1`). Antes de la primera mutación de una
  ejecución crea un **respaldo real del libro en Drive** (`Backup_crear('PRE_INSTALAR')`,
  token/ejecución, reutilizado por el resto de etapas; si falla → `BACKUP_FALLIDO`
  y cero escrituras) con guard de versión. El merge usa `SNAPSHOT_ACTUAL` y no toca
  `PROXIMO_CONTROL` ni `SALUD_MENTAL` de pacientes existentes (no-pérdida DEC-064 /
  doctrina FIX v0.8.5).
- `Actualizar`: ejecuta `Act_actualizarSistema` (fuentes autorizadas, merge,
  enriquecimiento, derivados y vistas). El procesamiento masivo real sigue
  requiriendo instrucción explícita. `ejecutar:false` simula sin escrituras ni
  cambios en objetos memoizados; no aplica estructura, formato, vistas o logs.
- La captura mantiene su contrato normativo **V4** (`docs/CONTRATO_CAPTURA_V2.md`),
  compatible con V2/V3 (prefijos `Cp2-`/`Cp3-`/`Cp4-`). Su esquema físico canónico
  tiene 26 columnas y no deriva del catálogo ampliado de edición administrativa.
  Persistencia y trailer usan encabezados reales; las columnas adicionales o
  reordenadas se conservan. Un esquema incompleto o ambiguo falla antes de escribir.
- El instalador del formulario no reetiqueta una cola poblada que tenga otro
  orden; reporta `ESQUEMA_CAPTURA_REQUIERE_REVISION` sin modificar sus datos.
- Las secciones de etapas/versiones inferiores describen hitos históricos. Para
  responsabilidades actuales prevalecen este resumen, el código y `AGENTS.md`.

## Visión general funcional

```text
   SECTOR NARANJO        SECTOR AMARILLO       SECTOR VERDE
  [INGRESO_…][SECTOR_…] [INGRESO_…][SECTOR_…] [INGRESO_…][SECTOR_…]
        │  puertas de entrada controladas + superficies operativas
        └───────────────┬───────────┴───────────────────┘
                        ▼
      VALIDACIÓN → NORMALIZACIÓN → IDENTIFICACIÓN → CONSOLIDACIÓN
                        │  (explicable, reversible vía MAPA_ORIGEN)
           ┌────────────┴────────────┐
           ▼                         ▼
      PACIENTES (entidad)       EVENTOS (actividad, append-only)
           └────────────┬────────────┘
                        ▼
     DASHBOARD (análisis dinámico) · REM (agregación mensual) · SEGUIMIENTO
                        │
                   LOG + métricas
```

Detalle del modelo paciente/evento: **MODELO-EVENTOS.md**.

## Módulos Apps Script (archivos planos numerados — patrón clasp)

| Archivo | Responsabilidad | No hace |
|---|---|---|
| `00_Config.gs` | IDs hojas, mapa canónico de columnas, sinonimos, estados, constantes | lógica |
| `01_Utilidades.gs` | Batch helpers, cache, fechas, texto genérico | negocio |
| `02_Normalizacion.gs` | RUT(DV mód11), teléfono, fecha, nombre, encabezados. **Funciones puras** | I/O Sheets |
| `03_Fuentes.gs` | Lectura de hojas fuente, detección de encabezado/separadores, validador estructural pre-import | consolidar |
| `04_Identificacion.gs` | Claves de match, scoring, cola de revisión | escribir BASE |
| `05_Consolidacion.gs` | Merge multi-fuente con conflictos; DRY RUN integrado | decidir solo |
| `06_Modelo.gs` | Acceso a PACIENTES (lectura por bloques, índices) + instalación/reparación de estructura de hojas | normalizar |
| `07_UI.gs` | Interfaz Sheets-nativa (DEC-012): menú ECICEP, toasts, navegación. Sidebar/dialog solo si una interacción lo justifica | lógica pesada |
| `08_Dashboard.gs` | KPIs: pendientes, próximos controles, por sector/estratificación | — |
| `09_Log.gs` | Logging INFO/WARNING/ERROR/DEBUG a hoja LOG con búfer + escritura por lotes (DEC-014) | — |
| `10_Pruebas.js` | Suites deterministas del núcleo (corren en GAS y en node, DEC-016) | — |
| `11_DatosPrueba.js` | Dataset ficticio único para las pruebas (sin datos reales) | — |
| `24_Formulario.js` | Backend de captura Web App: validación, decisión, persistencia en `FORM_RESPUESTAS`, procesamiento idempotente, métricas/trazabilidad y wrappers GAS | escritura clínica fuera del pipeline |
| `25_Entorno.js` | Utilidades históricas o de transición relacionadas con identidad/configuración del proyecto, si todavía existen en el código | crear ambientes operativos paralelos |
| `26_Captura.js` | Backend contrato de captura V2/V3/V4: validación §5.1/§14, idempotencia §13, estados §18, TR-1/TR-2 §21, entrypoints `WebApp_capturarEnviar`/`WebApp_capturarRetomar`, gate `saludMental` solo `Cp4-` | lógica fuera del contrato |
| `27_Actualizacion.js` | Mantenimiento de datos: `Act_actualizarSistema`, merge conservador (DEC-064), enriquecimiento demográfico | decidir clínica |
| `29_ActualizacionCaptura.js` | Edición de ficha desde captura V4: `actualizacion.campos` (claves permitidas, incl. `SALUD_MENTAL`), `api_actualizarPaciente`, `WebApp_cargarPacienteEdicion` | captura desde canales paralelos |

**Roadmap de módulos futuros** (se crean en su etapa, no antes):
`03b_ValidadorEstructura` (reporte APTO/ADVERTENCIAS/REVISIÓN), `12_Ingresos`
(procesador hojas INGRESO_*), `13_Eventos` (registro/consulta EVENTOS + sync
caché PACIENTES), `14_Estratificacion` (motor regla-configurable, apagado hasta
regla oficial), `15_Dashboard` (agregaciones on-demand), `16_Rem` (generador).

Dependencia estricta hacia abajo: UI/Dashboard → Modelo → Normalización → Utilidades.
La normalización nunca llama a SpreadsheetApp (testeable sin hoja real).

## Estado de implementación

### ETAPA 2 ✅
- Núcleo completo: Config v1, Utilidades, Normalización pura, Log por lotes,
  Modelo con instalación idempotente, menú ECICEP, 85 pruebas verdes.

### ETAPA 2.5 ✅ (refinamiento funcional — diseño)
- Modelo entidad/evento definido (`MODELO-EVENTOS.md`); PACIENTES ampliado a
  **30 campos** (sexo, fecha nacimiento, condiciones, estrat origen/calculada).
- Config v0.3: sectores geográficos permanentes ≠ estratificación (DEC-018),
  tipos de evento, estados de ingreso, motor G apagado hasta regla oficial.
- Normalizadores nuevos: sector (alias NARANJA→NARANJO), sexo, tipo evento.
- Diseños aprobados: DASHBOARD (filtros dinámicos, trazabilidad), REM (mapa de
  trazabilidad campo a campo), ESTRATIFICACIÓN (motor data-driven), protecciones.
- ⬜ ETAPA 3: staging, validador estructural, identificación/deduplicación,
  hoja EVENTOS y sincronización de caché.

### ETAPA 3 — estado por componente

| Componente | Estado | Nota |
|---|---|---|
| Estructura STAGING_IMPORT | **IMPLEMENTADO** | `Fuentes_crearFila/normalizar/validar/validarEstructura` + hoja añadida al instalador; I/O batch (`Fuentes_guardarFilas`) |
| Validador estructural | **IMPLEMENTADO** | ERROR/WARNING/OK trazables por campo; sin crashes (fechas corruptas, RUT malos, sector inválido, G-como-sector, incompatibilidad origen) |
| Normalización aplicada | **IMPLEMENTADO** | Reutiliza Norm_* 1:1; originales siempre conservados |
| Identificación | **IMPLEMENTADO** | MATCH_EXACTO/PARCIAL/POSIBLE_DUPLICADO/SIN_MATCH/REQUIERE_REVISION con criterio+confianza (DEC-024) |
| Duplicados en lote | **IMPLEMENTADO** | Explicables y no destructivos |
| Transformación a EVENTOS | **IMPLEMENTADO** | Ev_desdeStaging con gates; escritura real vía Ingresos_procesarTodasLasHojas |
| Adaptador INGRESO_* → staging | **IMPLEMENTADO (3b)** | Sector derivado de la hoja (HOJAS_INGRESO); contradicciones declaradas como ERROR; idempotente (filas INGRESADO se saltan) |
| Transacción PACIENTES/EVENTOS | **IMPLEMENTADO (3b)** | Gates explícitos por fila; nuevo→crea entidad+evento enlazado; existente→solo evento (sin sobrescritura); append-only garantizado; escrituras batch |
| Ejecución controlada desde el sheet | **IMPLEMENTADO (3b)** | Menú ECICEP: 📥 Procesar ingresos · 🧪 Sembrar datos ficticios (prueba) |
| Ejecución real verificada en el spreadsheet | ✅ **VERIFICADA (EJ-MT3IJ7RG)**: 18 leídos = 3 OK + 11 WARNING + 4 ERROR intencionales; 11 pacientes nuevos + 3 enlazados; 14 eventos; SECTOR_* refrescadas |
| Captura histórica basada en Google Forms | **OBSOLETA / HISTÓRICA** | Canal utilizado en versiones anteriores. `Form_onFormSubmit`, `FormApp`, `FORM_ID` y `onFormSubmit` no forman parte de la operación actual. Su presencia eventual en código debe tratarse como compatibilidad/deuda histórica, no como canal activo.

| Web App de captura | **ÚNICO canal operativo actual (regla arquitectónica)** | ⚠️ El flujo contractual anterior (`CapturaWeb.html` → `Form_capturarDesdeUI()` → `FORM_RESPUESTAS` → `Form_procesarPendientes()`, identificador `UI-`) fue **INVALIDADO** y no constituye especificación normativa. La especificación vigente es `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**, única fuente del contrato de captura). Sin segunda base de datos ni lógica paralela.
| Migración masiva | **BLOQUEADA** | Por diseño hasta validar el flujo completo con muestra controlada de datos reales |

Pruebas: **171 casos verdes** (143 ETAPA 2 + 36 ETAPA 3 + 13 ETAPA 3b + ajustes).
Las pruebas de integración con Spreadsheet real son manuales/documentadas (menú 🧪→📥) y no corren en node.

## Entorno operativo

El sistema funciona como **un único entorno operativo**: un proyecto Apps Script, un Spreadsheet y una Web App. El backend reside en el mismo proyecto Apps Script y accede al Spreadsheet configurado mediante un único pipeline. La Web App es la interfaz operativa de captura; Sheets conserva las herramientas administrativas.

Los deployments, `/dev`, `/exec`, `@HEAD` y los números de versión de Apps Script son mecanismos técnicos de publicación. No representan DEV/DEMO/PROD como arquitectura.

**GitHub Actions + GitHub Pages:** el CI (`node tests/*.mjs`, puro, sin red ni Sheets) verifica cada push y PR; GitHub Pages (`https://2674321.github.io/Sistema-Gestion-Sectores-ECICEP/`) publica **exclusivamente** la demo estática `examples/formulario_demo.html` (datos ficticios, sin backend). No es un entorno operativo, un canal de captura ni un deployment de la aplicación.

Una referencia histórica como `@63` no debe documentarse como "producción" ni utilizarse para reconstruir el sistema. `@63` fue eliminado después de verificar sus dependencias reales.

**Versión canónica vigente:** `ECICEP.VERSION` en `src/00_Config.js:19` (single source of truth). El sistema operativo actual incluye el módulo de captura **V4** (`src/26_Captura.js`, contrato `docs/CONTRATO_CAPTURA_V2.md`), la Web App 100% V2/V3/V4 (`src/CapturaWeb.html`), la edición de ficha desde captura (`src/29_ActualizacionCaptura.js`) y el layout visual de `PACIENTES` (`CONTRATO_LAYOUT_VISUAL`); sus invariantes de datos se definen en `CONTRATO_DATOS.md` (**NORMATIVO**). Stack `Google Sheets + Apps Script + CapturaWeb.html + 00_Tokens.html + WebApp.gs + 26_Captura.js + 29_ActualizacionCaptura.js + 24_Formulario.js` sin dependencias externas; `ECICEP.WEB_APP_URL` centralizada con fallback `ScriptApp.getService().getUrl()`.

## Canal de captura

La Web App es la única interfaz operativa de captura. El backend reutiliza el mismo pipeline ya existente. No existe un segundo canal de negocio que deba mantenerse en paralelo.

### S3 — Comportamiento del formulario web

El formulario web interpreta la respuesta del backend V2 con una única regla de
limpieza: **solo limpia el formulario cuando `data.estado === 'PROCESADO'`**
(aceptada + persistida + entregada). En `RECIBIDO`/`VALIDANDO`/`VALIDO`
(pendiente, p. ej. `PENDIENTE_ENTREGA`), `REQUIERE_REVISION` y `ERROR` el
formulario se conserva y se muestra un mensaje no ambiguo. El reintento
idéntico es inocuo (idempotencia A1/A2) porque el `captureId` se conserva
mientras el contenido no cambie. El envío está protegido contra doble clic
(`_enviando`), y un timeout de 60 s (que cubre también la verificación previa
de duplicados) desbloquea botón y spinner ante una respuesta colgada. El
`captureId` cumple estrictamente `Cp2-` + 32 hex minúsculas (§12). Detalles y
pruebas: `AUDITORIA_ESTABILIZACION.md` §8.

#### S4 — Publicación controlada y validación E2E real

El código V2 estabilizado (S0–S3) quedó **publicado en la instancia real** (v91
sobre el deployment operativo de captura) y validado de extremo a extremo con un
registro de prueba descartable: FORMULARIO → FORM_RESPUESTAS (captureId
`Cp2-55cac2c87ab08e34541ba94ab82590c4`, una sola fila) → `INGRESO_AMARILLO`
→ PACIENTES (`EC-MTR7FJY3-B6NB`) → EVENTOS (`EV-0001`, ingreso). La
**idempotencia A1/A2** se verificó en vivo: el reenvío idéntico devuelve el mismo
captureId sin duplicar efectos. En esa versión la Web App exigía sesión de Google
autenticada (comportamiento histórico sustituido por el enlace compartido en
v0.9.14). Evidencia y detalle: `AUDITORIA_ESTABILIZACION.md` §9.

### S5 — Instalar/reparar sistema: instalación + enriquecimiento seguro de PACIENTES

El instalador (`⚙️ Instalar / reparar sistema`, `UI_instalarSistema` → panel
`Instalador.html` → etapas de `src/20_Instalador.js`) incorpora, desde **DEC-057**,
la etapa **`enriquecimiento`** (`Instalar_pEnriquecimiento`, `src/27_Actualizacion.js`):
completa **solo campos vacíos** (`SEXO`, `FECHA_NACIMIENTO`) de PACIENTES desde los
datos demográficos que ya viven en las hojas `INGRESO_*` (layout visual estándar
de la captura: título/secciones/encabezados/datos), reutilizando funciones de hoja
y del pipeline real. Corre como la penúltima etapa, antes de `verificar`, y su resumen
(`Completados: N pacientes (M campos) · En revisión: K`) se muestra en la pantalla final.

- **Identidad**: `ID_INTERNO` es la identidad canónica; el match a fuentes es por
  `RUT` normalizado exacto. **Regla de escritura**: valor candidato válido (SEXO ∈
  {M,F,OTRO}; fecha ISO en `[1900,2040]`) sobre campo vacío; fuentes
  inconsistentes → `REQUIERE_REVISION` **sin escribir**; sin fuente aplicable → el
  campo queda vacío (no se infiere). `EDAD` nunca se almacena: la vista `SECTOR_*`
  la deriva con **fórmula DATEDIF(FECHA_NACIMIENTO; HOY(); "Y")** viva en la hoja
  (locale-independiente), de modo que se actualiza sola al pasar el tiempo y nunca
  se materializa como valor estático.
- **Idempotencia y trazabilidad**: segunda ejecución no cambia nada; `FUENTE`
  acumula `ENRIQUECIMIENTO|<hoja>|<fila>` (append sin duplicar), se estampa
  `FECHA_ACTUALIZACION` y se registra `Log_info`.
- **Separación funcional (S12, DEC-058)** — **"🔄 Actualizar sistema"**
  (`UI_actualizarSistema`) actualiza **solo datos derivados y vistas** y delega en
  `UI_actualizarTodo` (`Estrat_recalcularTodos` + `Control_recalcularTodos` +
  `Modelo_refrescarVistasSectores` + `HVis_formatearIngresos` +
  `Hojas_formatoCondicional`). No importa fuentes, no enriquece, no repara
  estructura, no crea pacientes/eventos y no toca `FORM_RESPUESTAS`, contrato V2,
  captureId ni deployments (idempotente sobre la fuente). El mensaje de confirmación
  describe esas responsabilidades.
- **"⚙️ Instalar / reparar sistema"** (`UI_instalarSistema`) mantiene el **pipeline
  estructural completo**: `Instalador.html` → `INSTALAR_ETAPAS` (runtime, diagnóstico,
  estructura, fuentes, amarillo, visual, validaciones, limpieza, diseño, inicio, menú,
  enriquecimiento, verificación). Es la única entrada para importar fuentes y para
  ejecutar la etapa `enriquecimiento` (`Instalar_pEnriquecimiento`).
- El recálculo de vistas `SECTOR_*` vive también en el pipeline de captura y en puntos
  de `07_UI.js`; dentro del instalador ocurre solo en la etapa `amarillo`.

### S6 — Versionado del esquema y motor de migraciones (INST-1, DEC-059)

- **Fuente única de versiones**: `SISTEMA_VERSION_SCHEMA_ACTUAL` (=**`2`**,
  MIG-002 v0.10.0: `PACIENTES.SALUD_MENTAL` + vistas `SECTOR_*` 16→17 +
  `INGRESO_*` columna 12) y `SISTEMA_VERSION_INSTALADOR` (=**'INST-1'**) en
  `src/00_Config.js`. Clave `SCHEMA_VERSION` ausente/vacía ≡ esquema legacy
  **`'0'`** (nunca se asume VIGENTE); **solo el motor de migraciones** escribe
  `SCHEMA_VERSION`/`LAST_MIGRATION` en CONFIG (no se siembra en `_CONFIG_SEMILLA`).
- **Declarativo e idempotente**: `REGISTRO_MIGRACIONES` (MIG-001 `0→1`, alinear
  `SECTOR_*` 15→16 con `COLUMNAS_SECTOR_VISTA`; defiende la regresión de
  BUG-E2E-003 por el camino del instalador; MIG-002 `1→2`, añade `SALUD_MENTAL`
  a PACIENTES/vistas/INGRESO_* con `_mig002_asegurarIngresosSaludMental`).
  `Mig_pendientesPura` (cadena determinista, objetiva canónico),
  `Mig_clasificarInstalacion` (NUEVA/VIGENTE/ANTIGUA/DIVERGENTE/INCOMPLETA/
  DESCONOCIDA), `Mig_ejecutarDeclaradas` (`persistir:true` → única autora de la
  versión; fallo → detiene sin avanzar versión), `Mig_ejecutarPersistente` (GAS).
  Detalle: `docs/MIGRACIONES.md`.
- **Etapas nuevas** en `INSTALAR_ETAPAS`: **`versionado`** (solo lectura,
  diagnosticar) y **`migraciones`** (mutante, aplica pendientes) entre
  `diagnostico` y `estructura`. `api_instalarPaso` toma **LockService**
  (`tryLock(30000)`, `releaseLock` en `finally`) para las etapas de
  `INSTALAR_ETAPAS_MUTAN`; `{ok:false, motivo:'CONCURRENCIA'}` si está ocupado.
  Desde **v0.10.0**, `INSTALAR_ETAPAS_MUTAN` vuelve a declarar
  **fuentes/amarillo/enriquecimiento** (importan datos reales) con respaldo
  previo real `PRE_INSTALAR` (`Instalar_asegurarBackup_`: una copia Drive por
  token de ejecución, reutilizada por las etapas siguientes; si falla →
  `BACKUP_FALLIDO` y cero escrituras) y guard `Instalar_versionIncompatible_`
  antes del lock; un carácter `>`/`P`/`B` en el paso indica unidad con respaldo
  disponible (`z/p` son layouts substituibles, `r/h/q/R/H` respaldos selectivos).
- **Diagnóstico no-mutante**: `Instalar_diagnosticar` usa `Modelo_escanearEstructura`
  (solo lecturas) en lugar de `Modelo_crearEstructura()`, e imprime el bloque
  VERSIONADO (instalador, esquema leído→esperado, estado, pendientes, sectores).
  La ventana del instalador muestra este diagnóstico al abrirse y solo inicia
  las etapas cuando el usuario pulsa **Instalar / reparar**. Los RPC exigen la
  misma clave de acceso compartido que el resto de la Web App; la ruta
  `?vista=instalar` permite abrirla sin una cuenta de Google. En Sheets se
  conserva el diálogo del menú. `Instalar_pVerificar` informa fallo si el
  esquema no queda VIGENTE; la etapa visual también falla si alguna hoja no
  pudo formatearse. Validaciones y diseño también propagan fallos por hoja.
  La etapa de revisión de hojas adicionales solo informa candidatas: ni
  Instalar ni Actualizar las borran por su nombre o por estar vacías.
- **Webhook**: `action:'instalar'` → `Instalar_ejecutarPolitica()` (DIVERGENTE/
  DESCONOCIDA → error sin mutar; INCOMPLETA → repara estructura; luego
  `Mig_ejecutarPersistente()`).
- **Tests**: `_pruebas_inst1_versionado` T1–T15 (+15; núcleo **549**/549,
  batería completa verde).

## Interfaz dentro de Google Sheets (DEC-012)

Sheets es la interfaz principal: menús personalizados, botones, listas
desplegables, formato condicional, vistas filtradas y navegación entre hojas.
HTML/sidebar/dialog únicamente como complemento justificado. Las hojas se
diseñan como interfaz (encabezados congelados, anchos, colores consistentes,
columnas técnicas agrupadas y ocultas). Fórmulas nativas cuando sean simples y
no penalicen rendimiento; Apps Script para procesamiento complejo.

### DESIGN SYSTEM (v0.8.9.6, DEC-046)

Una sola especificación visual en `00_Config.js` (`DESIGN_SYSTEM`): tipografía,
alturas (28/26/42/30/21), anchos con fallback, bordes, superficies, marca,
encabezados uniformes (#0E5C68/blanco en TODAS las hojas), estados clínicos
(`ESTADOS`) separados de la identidad de sector, y rampas de color por familia
(GENERAL/AMARILLO/NARANJO/VERDE) con jerarquía única barra→sección→encabezado.
Cero colores literales fuera de la configuración (verificado por grep).

- **Layout por contrato**: hoja visual = fila 1 barra de identidad, fila 2
  secciones, fila 3 encabezados, fila 4+ datos. Hoja simple = fila 1
  encabezados, fila 2+ datos.
- **Identidad por hoja** (`HVis_identidad`): SECTOR_*/INGRESO_* → su familia;
  EVENTOS → NARANJO; PACIENTES/técnicas → GENERAL. Las hojas de sector son
  monocromáticas por familia; PACIENTES conserva barras semánticas azules.
- **Reconciliación** (`22_HojasVisual`): `HVis_especVisual` (estado deseado,
  puro) + `HVis_pendientesVisual` (CAMBIOS PENDIENTES, solo lectura) +
  `HVis_reconciliarHoja` (aplicar→verificar). El diagnóstico del instalador
  reporta los pendientes por hoja.
- **Regla de escritura**: nunca `get/setValue` dentro de loops (bloques
  `setValues` con ranuras fila→valor); verificada con auditoría transversal.
- **Notificaciones (toasts)**: una sola implementación cliente en
  `00_Tokens.html` (`toast(msg,tipo)` con ok/err/warn/info, pila máx. 4, cierre
  por clic y `role`/`aria-live`), usada por todos los paneles **y** por la Web
  App (ésta no carga Lucide → iconos por glifo de texto). En servidor, el toast
  nativo de Sheets `Utl_toast` (`01_Utilidades.js`). No hay notificaciones
  paralelas: `ui.alert` se reserva solo para confirmaciones/diálogos modales.
- **Fuentes**: carga condicional vía marcador `data-ecicep-fuentes` en
  `00_Tokens` (inyector de `<link>`). Por defecto Inter+Sora (paneles); la Web
  App declara `data-ecicep-fuentes="sora"` (solo Sora, que usa para el título;
  no usa Inter) y `"none"` desactiva las webfonts. Evita descargar familias no
  usadas en el canal móvil de captura.
- **Carga diferida de la librería QR**: `CapturaWeb.html` incluye la librería
  `qrcode` (~56 KB) en un bloque `<script type="text/plain" id="qrLibSrc">` que
  el navegador **no compila al cargar**; `_cargarLibQR()` lo inyecta como
  `<script>` real la primera vez que se abre el overlay QR (compartir/descargar).
  Reduce el trabajo de parse+compile del arranque de la Web App en el canal
  móvil sin cambiar el comportamiento: `generarQR` y el botón "Descargar QR"
  aseguran la carga previa. `QRFormulario.html` (sidebar) conserva su copia
  propia de la librería.
- **Protección de captura en curso**: `CapturaWeb.html` registra un
  `beforeunload` que avisa al recargar/cerrar la pestaña si hay una captura a
  medio llenar (`capturaEnProgreso()` = envío en curso o `formTieneDatos()`),
  evitando perder un registro clínico en el canal móvil. Se desactiva solo al
  limpiar o tras un envío PROCESADO (el formulario queda vacío). El botón
  "Limpiar" y su estado visible usan la misma `formTieneDatos()`, ampliada a
  **todos** los campos (antes solo RUT/nombre/profesional/obs). Al abrir la
  dupla, el foco se mueve al segundo profesional (`aria-expanded` coherente).
- **Guía interactiva**: motor reutilizable `ECICEP_guia` en `00_Tokens.html`
  (CSS `.guia-*` + JS). Toma pasos `{sel, titulo, texto, sugerencia, puntos,
  replicas, replicasCondicionales, modoInformativo}`. Atenuación **parcial**
  (mask clara `rgba(15,23,42,.14)` + spotlight de color sobre el objetivo) en
  lugar de oscurecer toda la página. Panel lateral derecho (400px, hoja inferior
  en móvil) con navegación Atrás/Siguiente/Terminar, cierre por `Escape`/clic
  fuera/`✕`, y una **réplica interactiva bidireccional** del control real que
  hereda sus clases CSS reales (apariencia idéntica al original): botones
  (`click` → acción real), selects/campos/textarea espejo
  (`input`/`change` → control real), réplica de **grupos de radios tipo tarjeta**
  (`.action-card`), réplicas extra por paso (`paso.replicas`, p.ej. dupla) y
  **réplicas condicionales** (`paso.replicasCondicionales`): solo se muestran si
  el control real es visible (p.ej. segundo profesional cuando la dupla está
  activa). Tras una acción de botón réplica se re-pinta la réplica y se
  re-alinea el spotlight (evita desalineación al mostrar/ocultar campos).
  `paso.modoInformativo` muestra una vista previa no funcional del botón objetivo
  (evita abrir modales detrás del panel, p.ej. ventana QR). Cada paso puede
  mostrar una **sugerencia breve** resaltada (`.guia-sug`) y una lista de
  **puntos clave** (`.guia-info`), y el bloque "**Resultado actual**" muestra en
  vivo el valor (incluye las réplicas condicionales visibles). La guía recorre
  los 4 tipos de formulario (Nuevo ingreso/Control/Seguimiento/Actualizar),
  la dupla, los campos y **Compartir por QR** antes de Enviar. Se invoca desde
  `#btnGuia` (con `aria-haspopup="dialog"`) en `CapturaWeb.html` (17 pasos) y en
  el demo `examples/formulario_demo.html` (motor y pasos equivalentes a
  producción). Accesibilidad: al abrir marca `aria-expanded="true"` en el
  botón disparador y restaura foco + `aria-expanded="false"` al cerrar.
  Excluida del anti doble-clic global (`.guia-panel`). No-op sin pasos, sin
  `document`, o si ya hay una guía en curso.

## Hojas

Inventario completo y justificado: **MODELO-EVENTOS.md §7** (≈15 hojas).
Creadas hoy: CONFIG · PACIENTES · LOG · CONFLICTOS · FUENTES.

## Protecciones (control operativo, NO seguridad institucional)

> **Advertencia honesta:** la protección de hojas/rangos de Google Sheets es un
> mecanismo de control operativo contra errores accidentales. NO es una
> arquitectura de seguridad avanzada; no se dependerá de ocultar hojas como
> medida de protección, y la confidencialidad real se apoya en el control de
> acceso a la cuenta de Google del spreadsheet.

Plan por capas:

| Capa | Mecanismo |
|---|---|
| Hojas administrativas (CONFIG, LOG, FUENTES, REGLAS_ESTRATIFICACION, columnas técnicas) | Protección estricta, solo propietario/desarrollo |
| Columnas técnicas de PACIENTES/EVENTOS | Rango protegido siempre (el usuario jamás las edita) |
| SECTOR_* e INGRESO_* | Protección con editor = responsable del sector; otras áreas solo advertencia o lectura |
| Áreas de resultado (DASHBOARD, REM_SALIDA) | Protegidas: solo Apps Script escribe. El REM de trabajo se calcula **al vuelo** (`api_remVista`, sin depender de la hoja REM_SALIDA) |

Limitación técnica documentada: los menús de Apps Script ejecutan con la
autoridad de quien hace clic — si un área le está protegida al usuario, la
escritura del script fallaría. Patrón adoptado: operaciones del sistema sobre
áreas protegidas se realizan mediante funciones instaladas/ejecutadas bajo
autorización del propietario (instalable triggers / ejecución por propietario),
y las áreas operativas de cada sector quedan editables SOLO para su responsable.
Asignación de responsables = correos por sector (PENDIENTES #13).

## Infraestructura remota identificada

| Recurso | ID | Estado |
|---|---|---|
| **Apps Script ligado (OFICIAL)** "Back-End Proyecto - Sectores - ECICEP - C.S.J" | `1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI` | Confirmado por desarrollador (DEC-007). Container-bound al Spreadsheet base. Contiene solo comentario de reserva. Manifest: tz America/Santiago, STACKDRIVER, V8, sin servicios avanzados (DEC-011) |
| Spreadsheet base "PROYECTO - Sectores - ECICEP - C.S.J" | `1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE` | **Vacío** (solo "Hoja 1" predeterminada, confirmado 2026-08-21). Listo para crear hojas del sistema en ETAPA 2 |
| Apps Script standalone "Proyecto sin título" | `1-b9YTL-u7x8M9eNeOBcqWEmMc1QYki2kaCfFBRe1508rdRTO7cC9hWvx` | Descartado (escombro de prueba, 6 stubs vacíos). NO usar |
| Copias importadas en Drive de NARANJO y PCTS 2023 | `17cNcOTd…`, `1T9a8Z85…` | Referencia; no usar como fuente directa |

⚠️ El `.clasp.json` de la raíz del workspace pertenece al proyecto de
**cotizaciones Servicitecnico** (mismo scriptId). NUNCA hacer push desde ahí.
El proyecto usa su propio `.clasp.json` local → script ligado, rootDir `src`
(DEC-010; fuera de Git a propósito, scriptId documentado arriba).

## Rendimiento (reglas desde el día 1)

- Lectura única por hoja: `getDataRange().getValues()` → procesamiento en memoria.
- Escrituras masivas: arrays con `setValues()`; jamás `setValue()` en loops.
- Índices en memoria (Map RUT→fila) reconstruidos por carga; memorización por
  ejecución (`_memoLeer` para PACIENTES/EVENTOS/PROFESIONALES) e invalidación al
  escribir. Las utilidades `Utl_cache*` sobre CacheService eran código muerto y se
  removieron en S9 (sin pérdida funcional: nunca se ejecutaron operativamente).
- LockService en escrituras concurrentes y en el log.
- Presupuesto objetivo: importación completa (~3.000 filas × 12 columnas) < 60 s,
  dentro de límites de cuota de Apps Script (6 min/ejecución).

### Invariantes consolidados (campaña de optimización, deploys @121–@130)

- **CONFIG se lee una sola vez por endpoint** vía `_UI_controlConfig()` (devuelve
  `{freq, aviso}`); no reintroducir `Control_leerFrecuencia()` + un barrido propio
  de `AVISO_CONTROL_DIAS` en el mismo request, ni caché módulo (la administración
  escribe CONFIG en la misma sesión).
- **Autovalidación de RPC**: no hacer `getLastRow()`/`getLastColumn()` como guard
  antes de un lector que ya los calcula (`_memoLeer`/`Modelo_leerBloqueCabecera`).
  Los guards previos a `Utl_leerBloque` sí son legítimos (no se auto-vacía).
- **Una lectura por hoja por invocación**: fila del caso derivada del bloque
  (`indiceHoja-1`), hermanas del mismo bloque, `Form_leerMarcas` en 1 bloque,
  escrituras contiguas en rangos `setValues` (p. ej. columnas 9–10 de CONFLICTOS).
- **Higiene del memo** (`Modelo_invalidarLecturas()`): obligatoria tras append de
  PACIENTES/EVENTOS y tras una migración de esquema (`insertColumns` desplaza
  índices → un memo viejo en la misma invocación leería encabezados/filas stale).
- **Confirmaciones contractuales** (§13/§15/§16 del contrato de captura) se
  conservan como relecturas deliberadas: no "optimizar" verificaciones que el
  contrato exige.
- El telemetría `[PIPE]`/`[CAPTURA_V2]` (console.log de tiempos) es diagnóstica
  deliberada del pipeline: conservar mientras se monitorice latencia.

## Modo simulación (DRY RUN)

Toda operación de escritura masiva acepta `modoSimulacion=true`:
procesa todo, reporta (válidos/duplicados/conflictos/revisión) y **no escribe**.
Obligatorio en la primera migración real.

## Entornos

Un solo proyecto Apps Script + un solo Spreadsheet, separación **lógica**:
hoja CONFIG distingue datos de prueba vs reales; dataset ficticio en
`datos_prueba/` para desarrollo local y pruebas de normalización.
(Ver DEC-008; tres proyectos independientes = sobrediseño para este volumen.)

## Herramientas del entorno (evaluación ETAPA 0)

| Herramienta | Veredicto |
|---|---|
| clasp 3.3.0 (instalado, autenticado) | ✅ Usar para sync; push solo tras verificar `.clasp.json` → script ligado |
| Python 3.12 + openpyxl 3.1.5 (local) | ✅ Análisis/validación estructural de Excel fuera de línea; ya usado en ETAPA 0 |
| Node v18 (local) | ✅ Runner de pruebas del núcleo (`tests/ejecutar_local.mjs`) — mismo runner que GAS |
| Git local | ✅ Repo inicializado; commits por etapa |
| Node/npm para linting .gs | ⏸️ Aplazado: `node --check` cubre sintaxis; evaluar en ETAPA 3+ si el código crece |
| GAS tests framework externos | ⏸️ No instalar; runner propio simple cumple (DEC-016) |
