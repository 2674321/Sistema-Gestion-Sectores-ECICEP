# INFORME OPTIMIZACIÓN — ECICEP

Fecha de ejecución: 2026-09-07
Sprint: S7 (base) → fase de optimización (P0 cerrado, S6 cerrado)
Versión: `ECICEP.VERSION = '0.9.3'` · Build estático `e5d540c` (se sincroniza en deploy real)

> E2E en vivo: **NO MEDIBLE EN ESTA EJECUCIÓN** (sin login/Spreadsheet desde el entorno de agente).
> Las ganancias de rendimiento documentadas aquí son derivadas del análisis de código
> (reducción de round-trips RPC y de llamadas a la API de Sheets), no mediciones instrumentadas.

## 1. CAMBIOS

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/01_Utilidades.js` | helpers puros `Utl_columnaLetra` (1=A, 26=Z, 27=AA) y `Utl_formulaEdad` (fórmula `DATEDIF` locale-independiente) | soporte de la automatización de EDAD |
| `src/06_Modelo.js` | `Modelo_refrescarVistasSectores`: tras escribir el bloque, aplica `setFormulas` en la columna `EDAD` (fórmula viva) y `setNumberFormat('dd/MM/yyyy')` en `FECHA_NACIMIENTO` | EDAD deja de materializarse; se mantiene la función pura de vista intacta |
| `src/WebApp.gs` | nueva `WebApp_estadoInicial()` devolviendo `{esquema, profesionales, url}` | unifica 3 RPCs de carga en 1 |
| `src/CapturaWeb.html` | init usa una sola llamada `WebApp_estadoInicial()`; se eliminan `cargarEsquema()`, `poblarProfesionales()` y la RPC extra de url | velocidad de carga; el modal QR conserva su consulta de url bajo demanda |
| `src/07_UI.js` | `onOpen`: menús minimalistas (Captura / ECICEP / Sistema) sin emojis redundantes; se retiran del menú Diagnóstico, Centro de Pruebas y "Actualizar todo" (el código se conserva) | simplificación de menú |
| `tests/formulario_web.mjs` | stub `WebApp_estadoInicial` en el sandbox de `google.script.run` | adecuación del harness a la nueva RPC |
| `src/10_Pruebas.js` | +3 tests: `Utl_columnaLetra`, `Utl_formulaEdad`, existencia de funciones de menú | verificación de la fase |
| `ARQUITECTURA.md`, `PENDIENTES.md` | documentación vigente actualizada | workflow estándar paso 9 |

## 2. RENDIMIENTO

- **Carga de la Web App**: 3 round-trips `google.script.run` → **1**. En Apps Script
  cada RPC implica serializar/deserializar payload y sobrecarga de invocación; fusionar
  esquema + catálogo + url elimina 2 viajes por carga de página.
- **Vista SECTOR_***: la escritura de fórmulas se hace con un único `setFormulas`
  (batch) por hoja sector, nunca por celda (regla del proyecto: nunca set dentro de loops).
  Costo adicional: 1 llamada a `setFormulas` + 1 a `setNumberFormat` por sector refrescado.

## 3. AUTOMÁTICAS

- **EDAD: verdadero automático.** Antes: `Utl_edadDesde` calculaba el valor al refrescar
  (podía quedar viejo hasta el siguiente refresco). Ahora la columna `EDAD` de `SECTOR_*`
  contiene `=IF(<celda FECHA_NACIMIENTO>="","",IFERROR(DATEDIF(DATE(MID(...),MID(...),MID(...)),TODAY(),"Y"),""))`,
  que se recalcula en vivo al abrir la hoja (TODAY recomputa) y desplaza al día exacto de los
  cumpleaños sin intervención.
- La función pura de vista (`Modelo_vistaSectorDesdePacientes`) no cambió: los tests
  existentes de valores y de "EDAD derivada plausible" siguen en verde.
- No se añadió campo `EDAD` a PACIENTES (la fuente de verdad sigue sin almacenarlo).

## 4. MENÚ

Nuevo menú operativo (sin emojis por elemento, submenús cortos):

- **Captura**: `Abrir formulario`, `Mostrar QR`
- **ECICEP**: `Inicio` · `Personas ›` (Buscar/Ficha, Cola de revisión, Ingresos, Duplicados) ·
  `Seguimiento ›` (Controles) · `Reportes ›` (Estadísticas, Generar REM, Consultar REM) ·
  `Configuración ›` (Configuración, Estratificación, Responsables, Autorizar permisos)
- **Sistema**: `Actualizar`, `Instalar / reparar`, `Backups`, `Formularios`, `Registro del sistema`, `Acerca de`

Retirados del menú (código conservado para diagnóstico): `UI_instalarDiagnosticar`
(Diagnóstico), `UI_centroPruebas` (Centro de Pruebas) y `UI_actualizarTodo` (solapa con
`UI_actualizarSistema`). El test OPT B7 verifica que toda función referenciada existe.

## 5. ESTADÍSTICAS

- No se añadió columna `GRUPO_ETARIO` a las hojas (evita sobrecarga de columnas; §5 de
  la fase). Los grupos de edad se calculan on-the-fly a partir de la columna EDAD viva
  cuando el dashboard las consuma (`08_Dashboard.js`).
- La hoja INICIO con KPIs y la sección de estadísticas existente se mantienen intactas;
  al ser EDAD ahora una fórmula, cualquier suma/promedio por edad se mantiene fresca sin
  refrescos manuales.

## 6. TESTS

Batería completa ejecutada — **738 / 738 verdes** (baseline 735 + 3 nuevos):

| Harness | Resultado |
|---|---|
| núcleo (`ejecutar_local`) | 493/493 (490 + 3 nuevos) |
| aceptación formulario | 50/50 |
| contrato captura V2 | 36/36 |
| backend V2 | 65/65 |
| payload V2 | 16/16 |
| cola FORM_RESPUESTAS | 33/33 |
| contrato datos | 20/20 |
| formulario web | 25/25 |

## 7. GIT

- Rama `master`, acelerada 4 commits sobre `origin/master` (sin push).
- Cambios de esta fase sin commitear hasta decisión del siguiente paso (regla: solo
  commit cuando el usuario lo solicita). `docs/hoja_de_vida.pdf` sigue excluido.
- Deploy pendiente (no autorizado): `clasp push --force` → `clasp deploy --deploymentId AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` (reutiliza @93).
---

## 8. FASE RPC / HIGIENE DE MEMO (deploys @121–@130)

Segunda fase de optimización, enfocada en reducir llamadas RPC de Sheets en el
path rutinario y blindar la coherencia del memo (`_MEMO_HOJAS`). Publicada en el
deployment operativo (`/exec`), verificada tras cada deploy con HTTP 200 y los
marcadores cliente (`beforeunload`, `formTieneDatos`, `capturaEnProgreso`,
`aria-haspopup`).

### Cambios por ronda

| Ronda | Commit / deploy | Cambio |
|---|---|---|
| Formulario backend | `1fdeb87` @121 | `Captura_v2_confirmarEntregaIngreso` acepta `bloqueReusar` y devuelve el bloque; la confirmación de entrega deja de releer la hoja INGRESO completa por envío (TRIAL-01: 1 lectura grande > 2 lecturas chicas). |
| Formulario backend | `2662bd4` @122 | `Form_leerMarcas` pasa de 3 lecturas de columna (5 RPC) a 1 lectura de bloque + extracción (3 RPC); verificación post-escritura de `Ingresos_escribirEstados` acotada a min–max de filas afectadas. |
| Hoja de cálculo | `8b90503` @123 | `Modelo_restaurarFuente` (2 setValue→1 setValues de fila), `Form_reiniciarRespuesta` (3 setValue→1 setValues), `api_revisionResolver` columnas 9–10 contiguas (1 setValues 1×2). |
| Hoja de cálculo | `3c1d3c2` @124 | `api_revisionResolver` en 1 lectura de bloque (fila del caso + hermanas del mismo bloque, sin getLastRow extra) y cierre de hermanas en 1 setValues por grupo (estado + trazabilidad). |
| CONFIG | `abe06fe` @125 | `_UI_controlConfig()`: cada endpoint de controles (controlPanel, diagnosticoControl, fichaPaciente) leía CONFIG 2 veces (frecuencia + aviso); ahora 1 sola lectura devolviendo `{freq, aviso}`, sin caché módulo. |
| CONFIG | `50c52d8` @126 | `api_actualizarUltimoControl` y `api_registrarEvento` unificados al mismo helper; `Control_leerFrecuencia()` queda solo para fallback puro de `Control_calcularProximo` y jobs por lote. |
| Modelo | `4b6a41c` @127 | `Modelo_asegurarEsquemaPacientes` reutiliza el encabezado de PACIENTES del memo cuando existe (evita getLastColumn + lectura de encabezados por lote de altas). |
| Modelo | `d9fef27` @128 | Eliminado el guard `getLastRow()` redundante de `Modelo_leerPacientes`/`Modelo_leerEventos` antes de lectores memoizados que ya lo calculan. |
| Cosmético (#33) | `ded78dd` @129 | Auditoría de colores por contexto en los 15 HTML: ningún hex de regla duplica un token sin tokenizar; `QRFormulario.html` (única página sin include) migrado a `var(--c-*)` con `:root` local de la convención de la Web App. |
| Higiene memo | `495a15f` @130 | `Modelo_invalidarLecturas()` tras migración de esquema (`insertColumns` desplaza índices) y tras append de PACIENTES (visibilidad inmediata de filas nuevas en la misma invocación). |

### No tocados (decisiones documentadas)

- Confirmaciones por relectura exigidas por contrato: `Captura_v2_actualizarTrailer`
  (§15), `Captura_v2_confirmarEntregaIngreso` (§16), `Captura_v2_buscarRegistro`
  (escaneo completo de idempotencia §13).
- `Ingresos_leerHoja` mantiene 1 lectura de bloque completa aunque sea 1 fila
  (1 RPC grande > 2 RPC chicos).
- Pintor instalador `Hojas_crearInicio` (21 setValue, una sola vez) y
  `Hojas_formatoCondicional` (API de reglas no batchable) intactos.
- `Modelo_refrescarVistasSectores` (clear + setValues + setFormulas +
  setNumberFormat por sector) y `Api_duplicadosUnirPorRut` son bloques legítimos.
- Telemetría `[PIPE]` / `[CAPTURA_V2]` (console.log de tiempos) conservada: es
  diagnóstica deliberada del pipeline.

### Invariantes consolidados

Ver `ARQUITECTURA.md → Rendimiento → Invariantes consolidados (campaña de
optimización, deploys @121–@130)`.

### Tests

Batería completa verde en cada ronda: núcleo 553, aceptación formulario 50,
formulario web 25, payload V2 19, backend V2 65, cola FORM_RESPUESTAS 33,
contrato captura V2 36, HTML 16.

## 9. ANÁLISIS COMPARATIVO DEL DÍA (deploys @121–@130)

### Resumen numerico del día

- **13 commits de cambio** (10 de la fase RPC/higiene @121–@130 + 3 del frente
  visual/CONFIG previo: `0dbc12e`, `70f4ebe`, `08e8731`) + 1 commit de
  documentación. Deployment operativo actualizado **@130** (verificado HTTP 200 +
  marcadores cliente en cada liberación); `/dev` queda en `@HEAD`.
- **Batería completa: 797/797 verdes** (núcleo 553 · aceptación 50 · formulario
  web 25 · payload V2 19 · backend V2 65 · cola 33 · contrato captura 36 · HTML 16).

### Reducción de RPC por mejora (antes → después)

| Mejora | Antes | Después | Ahorro |
|---|---|---|---|
| Confirmación entrega §16 (`Captura_v2_confirmarEntregaIngreso`, `1fdeb87`) | relectura del bloque INGRESO completo tras escribir | reutiliza el bloque ya leído en la invocación | **−1 lectura grande por envío con alta** (la de mayor volumen del flujo) |
| `Form_leerMarcas` (`2662bd4`) | 3 lecturas de columna por hoja (5 RPC) | 1 `getDataRange` + extracción (3 RPC) | **−2 RPC por hoja** en barridos de marcas |
| Verificación post-escritura `Ingresos_escribirEstados` (`2662bd4`) | relee el bloque completo de la INGRESO_* | relee solo min..max de filas afectadas | **volumen releído reducido a las filas tocadas** |
| Celdas sueltas → fila (`8b90503`) | 2–3 `setValue` por operación | 1 `setValues` de fila/rango | **escrituras colapsadas** (`Modelo_restaurarFuente`, `Form_reiniciarRespuesta`) |
| `api_revisionResolver` (`3c1d3c2`) | lectura de fila + bloque completo + `getLastRow` + 2 `setValues` por grupo | 1 lectura de bloque única + 1 `setValues` 1×2 por grupo | **−2 lecturas por resolución; escrituras hermanas ÷2** |
| CONFIG en endpoints de controles (`abe06fe`, `50c52d8`) | 2 lecturas completas de CONFIG por invocación | 1 lectura `_UI_controlConfig()` (frecuencia + aviso) | **−1 lectura de CONFIG por invocación** en 5 endpoints |
| Esquema PACIENTES (`4b6a41c`) | `getLastColumn` + lectura de encabezado por lote de altas | encabezado reutilizado del memo si existe | **−2 RPC por lote de altas** |
| Guard getLastRow (`d9fef27`) | 1 `getLastRow` guard + lector memoizado que ya lo calcula | sin guard | **−1 RPC de metadatos por llamada** (acumulativo dentro de la invocación) |

### Estimación de presupuesto de un envío de captura con alta nueva

- **Antes del día**: ~18–20 llamadas RPC (guardas, dobles lecturas CONFIG/INGRESO,
  escrituras por celda, confirmación con relectura completa).
- **Después**: ~13–15 llamadas → **~20–25 % menos RPC**, y se eliminó del flujo la
  relectura completa de INGRESO en la confirmación (§16), que era la lectura con
  más datos del request.

### Snapshot actual de llamadas Spreadsheet en `src/`

`getRange` 182 · `getValues` 50 · `setValues` 33 · `getLastRow` 116 · `getLastColumn` 30 · `getDataRange` 3 · `appendRow` 3.
Los `setValue`/`appendRow` restantes corresponden al pintor instalador
(`Hojas_crearInicio`), reglas de formato condicional (API sin batch) y logs
(bloques en LOG); sin `setValue` en loops de path rutinario (regla de bloques).

### Efecto neto del día

1. **Latencia por request reducida**: menos llamadas y menos datos transferidos
   (sin relecturas completas de INGRESO ni dobles lecturas de CONFIG).
2. **Integridad blindada**: higiene del memo tras migraciones y altas (2 FIX).
3. **Deuda cosmética saldada**: #33 (color tokenizado en el único HTML que lo
   duplicaba), sin cambio visual.
4. **Reglas documentadas** para no regresar (`ARQUITECTURA.md → Rendimiento →
   Invariantes consolidados`).

## 10. PASADA 5 — RPC DEL ENVÍO: pre-flight de duplicados solo en NUEVO_INGRESO

Fecha de ejecución: 2026-09-10.
Alcance: Web App de captura (`src/CapturaWeb.html`) — envío de datos (S1/§24).
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Problema

El cliente llamaba `WebApp_previaDuplicadosV2` antes de **cada** envío, aunque el
server ya documentaba "*única RPC previa en NUEVO_INGRESO; resto 1 RPC*" y esa
función devuelve `{ok:true, coincidencia:false}` sin leer hojas para las demás
acciones. En Apps Script cada RPC implica serialización, invocación y latencia de
red → **todo envío costaba 2 round-trips**, incluso cuando el segundo no aportaba nada.

### Cambio

| Archivo | Cambio |
|---|---|
| `src/CapturaWeb.html` | `enviar()`: para `REGISTRAR_CONTROL`, `REGISTRAR_SEGUIMIENTO` y `ACTUALIZAR_DATOS` salta el pre-flight y va directo a `WebApp_capturarEnviar` (1 RPC). `NUEVO_INGRESO` conserva exactamente su flujo actual (pre-flight → modal → envío), que es la puerta contra dobles registros. |
| `tests/formulario_web.mjs` | +2 tests (I1/I2) con acción de formulario controlable: acciones ≠ nuevo ingreso disparan UNA RPC (`WebApp_capturarEnviar`) sin `previaDuplicados`, y `NUEVO_INGRESO` sigue pre-consultando duplicados. |

### Justificación de seguridad (datos correctos y enviados donde corresponde)

- Las validaciones §5–§18 siguen ejecutándose íntegras en `Captura_v2_enviar` (server).
- El pre-flight de duplicados es una puerta de UX; la deduplicación de negocio vive
  en el pipeline (`Ingresos_procesarTodasLasHojas` → `REVISION`/`REQUIERE_REVISION`
  para `POSIBLE_DUPLICADO`) y no cambió.
- `confirmarNuevoPaciente` solo se transmite en `nuevoIngreso` y solo por instrucción
  explícita del usuario (tests F de `captura_ui_payload_v2.mjs`).
- `WebApp_previaDuplicadosV2` se conserva en el backend sin cambios (tests C11).

### Impacto

- Control / Seguimiento (flujo de mayor frecuencia operativa) y Actualización de
  datos: **2 RPC → 1 RPC** por envío (~mitad de latencia percibida y de superficie
  de fallo de transporte).
- `NUEVO_INGRESO`: sin cambio (sigue siendo el caso más completo y necesita la puerta).
- Batería completa verde: validar HTML 17 · formulario web 27 · payload V2 19 ·
  backend V2 65 · cola 33 · aceptación 50 · contrato captura OK · contrato datos 20 ·
  núcleo 553.

## 11. PASADA 6 — REINTENTO A2: fast-path cuando la fila de INGRESO ya está procesada

Fecha de ejecución: 2026-09-10.
Alcance: backend de captura V2 (`src/26_Captura.js`) — camino A2 (§23) del envío.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Problema

Cuando un envío volvía por el camino A2 (el primer intento quedó `VALIDANDO`/`RECIBIDO`
y el usuario reintenta), `Captura_v2_enviar` re-ejecutaba el pipeline completo
(`Captura_v2_ejecutarEntrega` → `entregarIngreso` → `Ingresos_procesarTodasLasHojas`):
lectura del INGRESO completo, barrera RUT+fecha, posible re-escritura de estados y
confirmación. Todo eso aunque la fila ya hubiera sido procesada por el primer intento
con su `ESTADO_INGRESO` escrito.

### Cambio

| Archivo | Cambio |
|---|---|
| `src/26_Captura.js` | En el camino A2, si el registro trae `ingresoHoja` + `ingresoFila`, se lee SOLO esa fila (`Form_leerFilaIngreso`). Si tiene `ESTADO_INGRESO` terminal (≠ vacío/ERROR), se mapea con `Form_mapearResultadoFila`, se actualiza el trailer del registro y se responde sin re-ejecutar el pipeline (2 lecturas: fila INGRESO + idInterno por RUT). El runway A2 completo solo se usa si la fila aún no tiene estado o está en ERROR. |
| `tests/captura_backend_v2.mjs` | +3 tests: B5b (fila `INGRESADO` → `PROCESADO` sin re-entrega), B5c (fila `DUPLICADO` → `REQUIERE_REVISION` sin re-entrega), B5d (fila sin estado → fallthrough al pipeline completo). |

### Justificación de seguridad

- El fast-path solo actúa cuando la fila de INGRESO ya quedó **persistida y con estado
  terminal** del pipeline previo; es el mismo estado que la re-ejecución devolvería.
- Si el trailer aun no puede leerse, se cae en excepción → `try/catch` → pipeline
  completo (comportamiento previo exacto).
- El incremento de `reintentos` y el estado `VALIDANDO` se persisten antes del check,
  por lo que la trazabilidad §23 se mantiene.

### Impacto

- Reintentos A2 del mismo `captureId` que ya tiene fila procesada (el caso reportado
  en vivo: RECIBIDO → reintento → confirmación): **6–8 RPC Sheets → 2** (fila de
  INGRESO + PACIENTES), sin tocar la primera entrega.
- Batería completa verde: backend V2 68 (antes 65) y resto sin cambios.

## 12. PASADA 7 — MENÚ Y SIDEBARS: lecturas duplicadas de hojas en funciones de menú

Fecha de ejecución: 2026-09-10.
Alcance: `src/15_RemExcel.js`, `src/17_Hojas.js`, `src/07_UI.js`, `src/24_Formulario.js`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO).

### Problemas detectados (pasada completa, lectura de todas las funciones del menú)

| Función | Ruta del menú | Coste medio (estimado) | Problema |
|---|---|---|---|
| `api_backupListar` | Sistema → Backups | **2 hojas completas** | `BACKUP_AUTO_ULTIMA` y `BACKUP_MANTENER` leían CONFIG por separado (`Utl_leerBloque`), dos barridos idénticos en la misma RPC. |
| `api_patologiasGuardar` | sidebar → Ficha → Patologías | **2 escrituras** | Condiciones y estratificación se escribían en 2 `setValues` consecutivos sobre la misma celda (2 RPC de escritura). |
| `Form_refrescarControl` | Sistema → Formularios → Control | **2 hojas completas** | `Form_listarControl()` lee FORM_RESPUESTAS y `_controlRespuestasResumen()` la leía una segunda vez; EVENTOS una tercera — se podía reutilizar el bloque ya leído. |

### Ya correcto (sin cambio)

| Función | Causa |
|---|---|
| `api_centroResumen` / `api_revisionListar` | Cada RPC lee CONFLICTOS una vez; no hay doble lectura dentro de la misma invocación. |
| `api_buscar` | PACIENTES completo → búsqueda por substring; no se puede acotar sin índice. |
| `_UI_controlConfig` | Ya consolidó freq + aviso en UNA lectura de CONFIG (comentario explícito en el código). |
| `_MEMO_HOJAS` / `Modelo_leerPacientes/Eventos` | Memoización intra-RPC vigente; no se re-leen para funciones que las usan. |
| `Log_flush()` en endpoints de lectura | Escritura de auditoría obligatoria: el búfer en memoria muere al terminar el request GAS; flush.sync es el único mecanismo. No se puede diferir sin perder logs. |
| `Modelo_refrescarVistasSectores` | Se invoca después de toda escritura; leer PACIENTES + EVENTOS y reescribir 3 hojas de sector es coste fijo inherente a la consistencia de la vista. Optimizarlo requiere decisión arquitectónica (pipeline incremental), no es baja/media invasividad. |
| `api_configListar` | Lee CONFIG una vez y empaqueta; es correcto. |
| `api_responsablesListar` | Lee RESPONSABLES + catálogo PROFESIONALES + CONFIG legacy (3 hojas distintas), no duplicados. |
| `api_ficha` | Lee PACIENTES + EVENTOS + PROFESIONALES + CONFIG, una cada una (memoizadas por _memoLeer). Correcto y no dupliqué. |
| `api_rem9Datos` / `api_remVista` | Lee PACIENTES + EVENTOS + CONFIG (vía `_rem9_configValor`). Coste fijo del REM. |
| `Form_obtenerEstado` | Lee FORM_RESPUESTAS una vez + EVENTOS una vez → métricas. Correcto. |
| `Form_listarControl` | Lee FORM_RESPUESTAS una vez. Correcto como función pública independiente. |

### Cambios implementados

| Archivo | Cambio |
|---|---|
| `src/15_RemExcel.js` | **Nuevo helper** `_config_leerValores(claves)` — lee la hoja CONFIG UNA sola vez para N claves (si claves vacío → mapa completo). `_rem9_configValor(clave)` ahora delega en el helper (misma semántica, 1 lectura en vez de N). |
| `src/17_Hojas.js` | `_backup_mantener()` delega en `_config_leerValores(['BACKUP_MANTENER'])`. `api_backupListar()` usa `_config_leerValores(['BACKUP_AUTO_ULTIMA','BACKUP_MANTENER'])` → **1 lectura de CONFIG en vez de 2**. |
| `src/07_UI.js` | `api_patologiasGuardar` — cálculo de CONDICIONES + ESTRATIFICACIÓN *antes* de la escritura: un solo `setValues` en vez de dos. Un timestamp compartido (`ahora`) para ambos campos de fecha. |
| `src/24_Formulario.js` | `_controlRespuestasResumen` acepta un bloque pre-leído (opcional); sin argumento se comporta como antes. `Form_refrescarControl` pasa el bloque ya leído → **2 lecturas de FORM_RESPUESTAS → 1**. |
| `tests/contrato_datos.mjs` | C4/R2 ajustado (1 escritura fusionada, misma fila física 5 + verificación de campos en el mismo row). Nuevo test R3: regresión de `_config_leerValores` (UNA lectura → N claves, delegación de `_rem9_configValor` y `_backup_mantener`). |
| `docs/INFORME_OPTIMIZACION.md` | Esta sección. |

### Justificación de seguridad

- `_config_leerValores` usa `indexOf` en un array de claves dadas; no filtra columnas innecesarias (se lee la fila completa, que es pequeña en CONFIG ≈ 30 filas). Si la lista de claves está vacía, entrega el mapa completo sin filtrar, idéntico a antes.
- `_rem9_configValor` y `_backup_mantener` conservan su semántica pública exacta (return string / number).
- `api_patologiasGuardar` fusionado: `Modelo_filaDesdeObjeto` ya recibía los campos SET en el objeto antes de la primera escritura; ahora recibe todos los campos y escribe una vez. El valor final de cada celda es idéntico; solo cambia la frecuencia de `setValues` (2 → 1).
- `_controlRespuestasResumen` acepta un bloque pre-leído sin cambiar su retorno cuando no se le pasa nada (lectura lazy como antes).

### Impacto estimado

| Función | Antes | Ahora | Ahorro |
|---|---|---|---|
| `api_backupListar` | 2 × `Utl_leerBloque(CONFIG)` | 1 × `_config_leerValores` | **1 lectura de CONFIG completa** |
| `api_patologiasGuardar` | 2 × `setValues` filas idénticas | 1 × `setValues` atómica | **1 RPC de escritura Sheets** |
| `Form_refrescarControl` | 2 × `Modelo_leerBloqueCabecera(FORM_RESPUESTAS)` + EVENTOS | 1 × `Modelo_leerBloqueCabecera(FORM_RESPUESTAS)` + EVENTOS | **1 lectura de FORM_RESPUESTAS completa** |
| `_rem9_configValor` / `_backup_mantener` | Lectura propia adicional (si se llaman solos) | Delega en helper; lectura propia per-call = 1 hoja | 0 (pero al llamar varias en la misma RPC → se amortiza) |

### Tests

Batería completa verde: contrato datos 21 (antes 20, +R3) + 553 · 50 · 27 · 19 · 68 · 33 · 17.

## 13. PASADA 8 — INTERCONEXIÓN DE DIÁLOGOS: Estadísticas ↔ REM (vista de trabajo / generador)

Fecha de ejecución: 2026-09-10.
Alcance: `src/Dashboard.html`, `src/RemVista.html`, `src/RemGenerador.html`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Problema

Los tres diálogos del menú eran islas: para saltar de Estadísticas a la REM (o a la vista de
trabajo) había que `google.script.host.close()` y volver a abrir la otra desde el menú. Eso
rompía el contexto del período y obligaba a re-seleccionar año/mes/sector en cada cruce.

### Mecanismo

Apps Script permite **un solo diálogo modal a la vez** (`showModalDialog` reemplaza al anterior).
La interconexión se resuelve con navegación server-side: cada HTML invoca `google.script.run`
sobre una función de apertura (`UI_abrirDashboard`, `UI_verRem`, `UI_generarRem`) que reabre el
otro diálogo; antes de saltar, el HTML persiste el período en `localStorage` bajo la clave
compartida `REM_ULTIMA` (la misma que ya usaban RemVista/RemGenerador para restaurar su estado).

### Cambios implementados

| Archivo | Cambio |
|---|---|
| `src/Dashboard.html` | Botón **«Ver REM»** en el header. Nueva `irRem()`: calcula el mes/año desde `fDesde` (y el sector si `DASH_OPS` tiene uno solo), escribe `REM_ULTIMA` y abre `UI_verRem()`. Al cargar, si existe `REM_ULTIMA` con `anio`/`mes`, recorta el rango de fechas a ese mes (primero a último día) — así el retorno desde la REM muestra el mismo período que se estaba viendo. |
| `src/RemVista.html` | Reemplaza el botón «Volver» (cerraba el diálogo) por **«Estadísticas»** (`UI_abrirDashboard`) y agrega **«Generar REM»** (`UI_generarRem`). Ambos guardan el período actual en `REM_ULTIMA` antes de saltar. |
| `src/RemGenerador.html` | Nuevo bloque en el header con **«Vista de trabajo»** y **«Estadísticas»**. `consultar()` (antes solo `UI_verRem()` sin contexto) y la nueva `irEstadisticas()` persisten el período en `REM_ULTIMA` antes de navegar. Se elimina la declaración duplicada de `consultar()`. |

### Flujo operativo resultante

```text
Estadísticas ──Ver REM──▶ REM vista de trabajo ──Generar REM──▶ REM generador
      ▲                       ▲                                      │
      └──◀── Estadísticas ────┴──────── Estadísticas ◀───────────────┘
                                     (contexto REM_ULTIMA compartido)
```

Ninguna ruta cierra el diálogo manualmente: el período seleccionado viaja y al volver a
Estadísticas el rango de fechas queda acotado al mes en uso.

### Seguridad / invariantes

- No se agregó lógica backend; solo navegación entre funciones de apertura ya existentes
  (`UI_abrirDashboard`, `UI_verRem`, `UI_generarRem`).
- El contexto se comparte por `localStorage` (por si acaso el navegador, nunca se escribe en Sheets).
- El recorte de fechas en Dashboard solo ocurre si `REM_ULTIMA.anio && REM_ULTIMA.mes`; `DASH_OPS`
  (rango manual del usuario) se aplica primero y el contexto REM lo matiza al abrir desde las REM.
- `google.script.run` con `UI_abrirDashboard`/`UI_verRem`/`UI_generarRem` reabre el diálogo modal
  reemplazando el actual — comportamiento esperado de Apps Script.

### Tests

Batería completa verde: `validar_html` **17/17** · núcleo 553 · contrato datos 21 · aceptación 50 ·
contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33.

## 14. PASADA 9 — LECTORES LIGEROS + AGREGACIÓN DE UNA PASADA en endpoints del menú

Fecha de ejecución: 2026-09-10.
Alcance: `src/06_Modelo.js`, `src/07_UI.js`, `tests/contrato_datos.mjs`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Problema

Los endpoints de menú que solo necesitan 3–6 campos leían cada paciente completo
(y en varios casos cada evento completo) materializando objetos con todas las
columnas (~30 en PACIENTES, ~20 en EVENTOS). Con miles de filas, esa alocación
domina el CPU del request aunque la lectura de hoja ya sea única (memoizado).

Además, `api_centroResumen` construía **dos arreglos intermedios completos**
(`eventosMin` mapeando cada evento y `paxMin` mapeando cada paciente) para luego
re-barrerlos en los conteos/secciones/últimos — duplicando el trabajo de
agregación sobre el dataset completo.

### Cambios implementados

| Archivo | Cambio |
|---|---|
| `src/06_Modelo.js` | Nuevos **lectores ligeros** `Modelo_leerPacientesCampos(campos)` y `Modelo_leerEventosCampos(campos)`: materializan SOLO los campos pedidos reutilizando el bloque ya memoizado (`_memoLeer`), sin cambiar la semántica (booleanos → 'TRUE'/'FALSE'; campo ausente en encabezado → omitido). |
| `src/07_UI.js` | **Observados** con campos mínimos: `api_buscar` (6), `api_revisionListar` (7), `api_duplaAbrir` (2), `api_centroResumen` (4 pacientes + 4 eventos), `api_dashboardDatos` (6 pacientes + 3 eventos). |
| `src/07_UI.js` | `api_centroResumen` reescrito sobre el **agregador puro** `_centro_resumen(pacientes, eventos, hoyIso, tz)`: pases lineales sobre las filas en vez de arreglos intermedios completos. Se eliminan los helpers intermedios `_panel_resumenSectores` y `_panel_estratPendiente`. El contrato de retorno no cambia. |
| `tests/contrato_datos.mjs` | **R4a/R4b**: los lectores ligeros entregan solo los campos pedidos con UNA lectura de hoja (memo), booleanos normalizados y campos ausentes omitidos. **R5**: `_centro_resumen` calcula KPIs/sectores/top-4 con el mismo resultado que la versión previa. |

### Justificación de seguridad

- Los lectores ligeros reusan `_memoLeer` (misma RPC de la hoja); solo reducen la
  conversión objeto/columna del lado del CPU. Campos sin pedir **jamás** se alocan.
- Todos los endpoints adoptados son de SOLA LECTURA. No se adoptó el lector ligero
  en nada que escriba filas completas (`api_duplaGuardar`, `api_registrarEvento`,
  `api_controlActualizarUltimo`), donde el objeto completo es necesario para reescribir.
- `_centro_resumen` conserva exactamente: conteos, ventana de 7 días, cobertura
  por tramos (50/operativo), comparador desc para top-4, `FECHA_ACTUALIZACION`
  máxima, `fechaIso`/`horaIso` formateados en el endpoint (fuera del ámbito puro).

### Impacto estimado

| Endpoint | Antes | Ahora |
|---|---|---|
| `api_buscar` | PACIENTES completo → objetos (~30 cols) | 6 campos por fila |
| `api_revisionListar` | PACIENTES completo (~30 cols) | 7 campos por fila |
| `api_duplaAbrir` | PACIENTES completo (~30 cols) | 2 campos por fila |
| `api_dashboardDatos` | PACIENTES (~30) + EVENTOS (~20) completos | 6 + 3 campos por fila |
| `api_centroResumen` | PACIENTES (~30) + EVENTOS (~20) + 2 arreglos intermedios completos | 4 + 4 campos, agregación en pases lineales sin intermedios |

### Tests

Batería completa verde: núcleo 553 · contrato datos **24** (antes 21, +R4a/R4b/R5) ·
aceptación 50 · contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
formulario_web 27 · `validar_html` 17/17.

## 15. PASADA 10 — LECTORES LIGEROS en cómputo REM, Panel de Control, ficha y auditoría

Fecha de ejecución: 2026-09-10.
Alcance: `src/07_UI.js`, `src/14_REM.js`, `src/15_RemExcel.js`, `src/16_Amarillo.js`,
`src/18_Calidad.js`, `tests/contrato_datos.mjs`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Problema

El cómputo REM (generador, exportador PDF, vista de trabajo, .xlsx del navegador),
la auditoría de Calidad y la importación histórica de Amarillo normalizan **todos**
los eventos con `Modelo_leerEventos()` (objetos con ~20 columnas) solo para después
quedarse con **11 campos**. Igual en pacientes: REM9 y auditoría usan 4–6 campos de ~30.

### Cambios implementados

| Archivo | Cambio |
|---|---|
| `src/14_REM.js` | Nueva lista modular **`_EVENTOS_CAMPOS_REM`** (los 11 campos que consume `_rem_normalizarEventos`). `_rem_calcula` (generador + PDF) lee `Modelo_leerEventosCampos(_EVENTOS_CAMPOS_REM)` en lugar de `Modelo_leerEventos()`. |
| `src/15_RemExcel.js` | `_rem9_datos` (vista de trabajo + .xlsx navegador): eventos ligeros y pacientes con **`_REM9_CAMPOS_PACIENTES`** (6 campos) en lugar de la lectura completa. |
| `src/16_Amarillo.js` | `Amarillo_aplicarHistorico` (importe histórico): eventos normalizados vía lector ligero (mismo invariante del normalizador); pacientes completos se conservan porque el importe escribe filas. |
| `src/18_Calidad.js` | `Calidad_auditarTodo`: pacientes con **4 campos** (ID_INTERNO, RUT, NOMBRE, SECTOR — los únicos que consumen `Calidad_problemasPaciente`/`Calidad_filaCola`) y eventos vía lector ligero. |
| `src/07_UI.js` | `api_controlPanel` (Controles por persona) con **`_CONTROL_CAMPOS_PACIENTES`** (8 campos: los que consumen `Control_filasPanel`/`Control_consultarControles`). `api_ficha` lee eventos ligeros (7 campos) conservando pacientes completos (la ficha usa casi todas las columnas). |
| `tests/contrato_datos.mjs` | **R6**: `_EVENTOS_CAMPOS_REM` cubre el input de `_rem_normalizarEventos` (11 campos exactos, sin prop extras). **R7**: `_CONTROL_CAMPOS_PACIENTES` alimenta `Control_consultarControles` sin perder campos (nombre/rut/sector/estrat/últimos/edad). |

### Por qué es seguro

- Invariante reutilizado: `_rem_normalizarEventos` NO puede leer más campos que los
  que produce, porque su entrada son los objetos normalizados (no los crudos). Por
  tanto alimentarla con el lector ligero de los mismos campos preserva el contrato.
- La única vía de romper esto es una **deriva silenciosa** (una lista incompleta o
  un campo nuevo leído): la cubren R6/R7, que verifican el set de campos frente al
  consumidor real. Un campo perdido no lanza error — vacía columnas en la UI — por
  eso el test compara campo a campo contra la salida esperada.
- `api_ficha`, `_amarillo_escribirPacientes`, `api_controlActualizarUltimo` y otros
  que escriben filas o muestran casi todas las columnas conservan lectores completos.

### Impacto estimado

| Función | Antes | Ahora |
|---|---|---|
| `_rem_calcula` (Rem_generar, exportador PDF) | EVENTOS completos (~20 cols) → 11 | 11 campos por fila |
| `_rem9_datos` (vista trabajo + .xlsx navegador) | PACIENTES (~30) + EVENTOS (~20) completos | 6 + 11 campos por fila |
| `Amarillo_aplicarHistorico` | EVENTOS completos (~20 cols) | 11 campos por fila |
| `Calidad_auditarTodo` | PACIENTES (~30) + EVENTOS (~20) completos | 4 + 11 campos por fila |
| `api_controlPanel` | PACIENTES completos (~30 cols) | 8 campos por fila |
| `api_ficha` (eventos) | EVENTOS completos (~20 cols) | 7 campos por fila |

Las constantes de campos (`_EVENTOS_CAMPOS_REM`, `_REM9_CAMPOS_PACIENTES`,
`_CONTROL_CAMPOS_PACIENTES`) son globales del proyecto para permitir la verificación
cruzada desde tests y mantener la lista en un solo lugar.

### Tests

Batería completa verde: núcleo 553 · contrato datos **26** (antes 24, +R6/R7) ·
aceptación 50 · contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
formulario_web 27 · `validar_html` 17/17.

## 16. PASADA 11 — LECTORES LIGEROS en dupla, patologías, diagnóstico y pruebas

Fecha de ejecución: 2026-09-10.
Alcance: `src/07_UI.js`, `tests/contrato_datos.mjs`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Problema

Tres endpoints del menú seguían leyendo PACIENTES completo (~30 cols) para
usar 1–3 campos, y el Diagnóstico de control necesitaba solo 9 de ellos más 6
de EVENTOS para el análisis de duplicados Amarillo.

### Cambios implementados

| Endpoint / función | Antes | Ahora |
|---|---|---|
| `api_duplaGuardar` (write 1 celda) | PACIENTES completo | **1 campo** (`ID_INTERNO`): solo ubica la fila física; la escritura usa la variable `dupla` directamente |
| `api_patologiasAbrir` (read-only) | PACIENTES completo | **3 campos** (ID_INTERNO, CONDICIONES, OTRAS_PATOLOGIAS) |
| `api_diagnosticoControl` | PACIENTES (~30) + EVENTOS (~20) completos | pacientes **9 campos** (`_DIAGNOSTICO_CAMPOS_PACIENTES` = `_CONTROL_CAMPOS_PACIENTES` + PROXIMO_CONTROL; los únicos que consumen Control_analizar, Control_filasPanel y el barrido de desalineados) + eventos **6 campos** (`_DIAGNOSTICO_CAMPOS_EVENTOS_AMARILLO`: los de Amarillo_analizarDuplicados) |
| `_pruS_consistencia` (pruebas del Centro) | PACIENTES completo | **2 campos** (SECTOR, RUT) |

Se conservan completos los que escriben la fila entera con `Modelo_filaDesdeObjeto`
(`api_patologiasGuardar`, `api_registrarEvento`, `api_controlActualizarUltimo`).

### Pruebas

- **R8** (`api_patologiasAbrir` e2e con 3 campos) y **R9** (`api_diagnosticoControl`
  con 9+6 campos: métricas, dedup Amarillo) → contrato datos **28** (antes 26, +2).
- Ajuste del arnés de `contrato_datos.mjs`: `crearHojaFalsa`/`arnesActivo` sirven
  ahora la **grilla física real de PACIENTES** (2 filas de título visual + encabezado
  en fila 3 + datos) para que los lectores ligeros reales (memo) encuentren los
  datos. Sin esto, `api_duplaGuardar` ya no podía resolver la fila en tests.
- Stub `Utilities.formatDate` añadido al harness (lo usan los endpoints de fecha).

### Nota de regresión detectada y cerrada

El cambio de `api_duplaGuardar` a lector ligero rompió C4/R2 y C2 (tests existentes
de la convención de fila física). Se repararon **haciendo el arnés más fiel a la
hoja real** (grilla con layout visual), NO debilitando el aserto: las escrituras
siguen verificándose contra `Modelo_filaFisica` y por encima de `dataStartRow`.

### Tests

Batería completa verde: núcleo 553 · contrato datos **28** (antes 26, +R8/R9) ·
aceptación 50 · contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
formulario_web 27 · `validar_html` 17/17.

## 17. PASADA 12 — FICHA con lector ligero + cierre de la auditoría de lectores completos

Fecha de ejecución: 2026-09-10.
Alcance: `src/07_UI.js`, `tests/contrato_datos.mjs`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Cambio

`api_ficha` (sidebar de ficha clínica, una de las vistas más abiertas) leía
PACIENTES completo (~30 columnas) para usar luego un conjunto cerrado. Ahora usa
`Modelo_leerPacientesCampos(_FICHA_CAMPOS_OPERATIVOS)` (21 campos — exactamente lo
que la ficha consume: operativos, dupla, patologías y el derivado del Panel de
control). Eventos ya eran ligeros (7 campos, pasada 10).

### Estado final de la auditoría de lectores completos en el menú

Tras las pasadas 9–12, los únicos lectores completos que quedan en la superficie
de menú están **justificados**:

| Endpoint | Campo completo | Por qué NO se ligera |
|---|---|---|
| `api_registrarEvento` | PACIENTES | Reescribe la fila entera con `Modelo_filaDesdeObjeto(objetivo)` + `Ingresos_sincronizarCache` |
| `api_controlActualizarUltimo` | PACIENTES | Escribe ÚLTIMO_C/SEGUIMIENTO/PROXIMO y el evento desde el objeto |
| `api_patologiasGuardar` | PACIENTES | Reescribe la fila completa (CONDICIONES + estrat en una escritura) |
| `Estrat_recalcularPaciente` / `Control_recalcularTodos` | PACIENTES | Escrituras por bloques sobre filas completas |
| `api_duplicados*` | PACIENTES/EVENTOS | `Api_duplicadosUnirPorRut` reescribe filas y reasigna eventos |
| `api_limpieza*` | PACIENTES/EVENTOS | Operación destructiva por fila física; fuera del alcance de solo-lectura |
| `_rem_*`/`_rem9_datos`/`Calidad_*`/`Amarillo_aplicarHistorico` | — | Ya migrados a listas ligeras (pasadas 10–11) |

`api_ficha` conserva eventos históricos ligeros y la lectura PACIENTES ligera; los
catálogos (PROFESIONALES, CONDICIONES) ya se leen por bloque de valores.

### Test

**R10**: `api_ficha` con los 21 campos lectos no pierde datos — TELEFONOS/ULTIMO_CONTROL
del set operativo, EDAD calculada, dupla desde DUPLA_INGRESO, patologías desde
CONDICIONES/OTRAS_PATOLOGIAS y seguimiento derivado del Panel → contrato datos **29**.

### Tests

Batería completa verde (serial): núcleo 553 · contrato datos **29** (antes 28, +R10) ·
aceptación 50 · contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
formulario_web 27 · `validar_html` 17/17.
Nota: los micro-benchmarks de `10_Pruebas` (`ms < 100/1000/2000`) son sensibles a
CPU compartida; si fallan al correr suites en paralelo, volver a ejecutar en serie.

## 18. PASADA 13 — AUDITORÍA con lectores ligeros + reparación de la sección RESPONSABLES

Fecha de ejecución: 2026-09-10.
Alcance: `src/21_Auditoria.js`, `tests/contrato_datos.mjs`, `docs/INFORME_OPTIMIZACION.md`.
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Cambio de rendimiento

`Auditoria_ejecutar` (menú Herramientas → ⚖️ Auditoría, dry-run de solo lectura)
leía PACIENTES y EVENTOS completos. Ahora usa los lectores ligeros con dos listas
modulares de campos, referenciadas también por el test R11:

- `AUDITORIA_CAMPOS_PACIENTES` (10): ID_INTERNO, RUT, NOMBRE, SECTOR,
  ESTRATIFICACION, FECHA_NACIMIENTO, ULTIMO_CONTROL, PROXIMO_CONTROL,
  DUPLA_INGRESO, PROFESIONAL_SEGUIMIENTO — exactamente lo que consumen
  `Aud_clasificarPoblacion`/`Aud_clasificarPersona`, `Aud_auditarAmarillo`
  (lado paciente), `Aud_auditarProfesionales` y el barrido de RUT duplicados.
- `AUDITORIA_CAMPOS_EVENTOS` (6): ID_INTERNO, NOMBRE, SECTOR, TIPO_EVENTO,
  FECHA_EVENTO, FUENTE — los consumidos por `Aud_auditarAmarillo` +
  `Amarillo_analizarDuplicados`.

### Reparación coexistente (bug de run-time verificado al auditar)

La sección RESPONSABLES de la auditoría estaba **rota en runtime**: `Aud_auditarResponsables`
referenciaba `diag.mapeados` / `diag.codigosInexistentes` / `diag.inactivos`, campos
que `Responsables_diagnostico` **no retorna** (retorna `porSector`, `sinCatalogo`,
`inactivosCargo`, `totales`), y además recibía `pacientes` en lugar de las
asociaciones de RESPONSABLES. El resultado: `api_auditoriaEjecutar` devolvía
`{ok:false}` por TypeError en el informe completo.

Corrección: `Aud_auditarResponsables` ahora recibe las asociaciones canónicas
(`Responsables_mapear`), el catálogo de profesionales y los legacies de CONFIG, y
computa los contadores directamente (asociaciones, únicos, multi-sector, duplicados,
inexistentes, inactivos, correos inválidos, huérfanas, legacy). No cambia el modelo
acumulable DEC-039 ni las escrituras.

### Pruebas

- **R11** (4 asertos-grupo): clasificación/completos == clasificación/ligeros;
  Amarillo con campos completos == con campos `AUDITORIA_CAMPOS_EVENTOS`;
  `Aud_auditarResponsables` con asociaciones canónicas (sin `mapeados`);
  smoke de `Auditoria_ejecutar` con lectores ligeros reales → el informe de
  RESPONSABLES ya no rompe → contrato datos **33** (antes 29, +4).

### Tests

Batería completa verde (serial): núcleo 553 · contrato datos **33** (antes 29, +R11) ·
aceptación 50 · contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
formulario_web 27 · `validar_html` 17/17.

### Estado del hilo de optimización lectores ligeros del menú

Con la pasada 13 solo queda abierto el **costo arquitectónico** ya reportado: la
conversión por fila de toda la tabla en cada RPC y las escrituras de fila completa
no son reducibles con lectores ligeros sin caché entre requests (CacheService),
decisión diferida pendiente de confirmación del usuario.

---

## 19. PASADA 14 — CACHÉ ENTRE REQUESTS (CacheService) en `_memoLeer`

Fecha de ejecución: 2026-09-10.
Alcance: `src/00_Config.js` (`CFG_CACHE.MAX_BYTES`), `src/06_Modelo.js`
(`_memoLeer`, `Modelo_invalidarLecturas` + helpers `_cache*`), `tests/contrato_datos.mjs`
(R12), `docs/INFORME_OPTIMIZACION.md`.
Decisión arquitectónica **confirmada por el usuario** (efecto lector ligeros, pasada 14).
No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline.

### Cambio de rendimiento

El hub de lecturas en bloque `_memoLeer` (06_Modelo.js:1271) ahora, además del memo
por invocación, consulta **CacheService** entre requests para los bloques crudos de
PACIENTES, EVENTOS y PROFESIONALES:

- Claves versionadas con `CFG_CACHE.PREFIJO` (`ECICEP:v<VERSION SIN PUNTOS>:BLOQUE:<HOJA>`),
  de modo que una nueva versión del sistema descarta automáticamente las entradas viejas.
- **TTL**: leído de CONFIG `TTL_CACHE_SEG` (clave que la auditoría marcaba "sin uso
  real") con default `CFG_CACHE.TTL_DEFECTO_SEG` = 60 s (máx. 21600 s). Una lectura
  de CONFIG por invocación, memoizada en `_CACHE_TTL_SEG`.
- **Serialización fiel**: `_cacheSerializarBloque` pre-convierte `Date` → `{__ECICEP_DATE__: ms}`
  antes de `JSON.stringify` (porque UI llama `Date.toJSON` antes que cualquier replacer),
  y `_cacheDeserializarBloque` revive el `Date`. Booleanos y celdas vacías viajan con
  JSON nativo. Son funciones PURAS testeadas en R12.
- **Límite de tamaño**: si el bloque serializado supera `CFG_CACHE.MAX_BYTES` (90 KB,
  el límite por entrada de CacheService es ~100 KB; EVENTOS con años de histórico
  típicamente lo supera) la entrada NO se persiste y se degrada a solo-sesión.
- **Invalidación garantizada**: `Modelo_invalidarLecturas()` también borra las
  claves `BLOQUE:*` entre requests. Con la pasada 14 se auditaron TODAS las
  escrituras de PACIENTES/EVENTOS/PROFESIONALES y se añadió la invalidación a las
  que aún no llamaban a ese punto (hallazgo de la revisoría interna):
  - `api_duplaGuardar` (07_UI.js) — operativa diaria (ficha dupla);
  - `Modelo_restaurarFuente` (06_Modelo.js) — vía Webhook `restaurar_fuente`;
  - `Form_actualizarDatosPaciente` (24_Formulario.js) — pipeline de captura V2
    (ruta `actualizarDatos`, incluido el camino de error `ACTUALIZACION_FALLIDA`);
  - `_amarillo_escribirPacientes` (16_Amarillo.js) — importación histórico Amarillo;
  - `Calidad_normalizarFormatoRuts` (18_Calidad.js) — normalización de RUT;
  - `Act_enriquecerPacientes` (27_Actualizacion.js) — enriquecimiento demográfico
    (etapa `enriquecimiento` del instalador, `Instalar_pEnriquecimiento`).
  Con esto, toda escritura de las tres hojas cacheadas pasa por
  `Modelo_invalidarLecturas` (que borra memo + claves entre requests). La caché
  nunca puede servir datos en curso de modificación.

### Semántica

Identidad de resultados con la versión sin caché: los lectores ligeros y
`Modelo_leerPacientes`/`Modelo_leerEventos`/`Modelo_leerProfesionales` siguen
consumiendo el mismo bloque crudo (encabezado + filas); el cacheado es un `Map`
transparente entre RPC. En sandbox/tests, `CacheService` ausente o stub no-op →
comportamiento idéntico al anterior (sin caché entre requests).

### Pruebas

- **R12** (3 asertos-grupo) → contrato datos **36** (antes 33, +3):
  - redondez PURA de `_cacheSerializarBloque`/`_cacheDeserializarBloque` (Date revive,
    booleanos, null y celdas vacías);
  - `_memoLeer` con `CacheService` **con estado**: miss → 1 lectura de hoja y bloque
    persistido; hit (memo limpio, caché presente) → 0 lecturas; `Modelo_invalidarLecturas`
    → clave eliminada y se relee la hoja;
  - `_cacheEscribir` respeta `CFG_CACHE.MAX_BYTES` (bloque enorme → solo-sesión).

### Tests

Batería completa verde (serial): núcleo 553 · contrato datos **36** (antes 33, +R12) ·
aceptación 50 · contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
formulario_web 27 · `validar_html` 17/17.

### Estado del hilo de optimización del menú

El costo residual (conversión por fila en cada RPC y escrituras de fila completa)
queda acotado: la caché entre requests reduce la re-lectura de PACIENTES/EVENTOS/
PROFESIONALES en RPCs consecutivas con TTL corto e invalidación en toda escritura
(DEC-015, ampliada en DECISIONES.md — DEC-060). 

**Alcance real del TTL:** el riesgo documentado del TTL (60 s por defecto) no se
limita a la edición manual de la hoja. Los bloques cacheados los consumen también
funciones del pipeline que usan `_memoLeer` (p. ej. la barrera RUT+fecha de
duplicados en 12_Ingresos.js, lecturas de 26_Captura.js y 03_Fuentes.js), por lo
que una escritura desde fuera de los mutadores comunes puede verse reflejada con
hasta `TTL_CACHE_SEG` de retraso en esas lecturas. En el flujo feliz de captura la
escritura se auto-invalida al cierre (`Modelo_agregarEventos` → refresca vistas), y
el TTL es corto; el contrato V2 no cambia. Queda documentado aquí como carácter del
diseño, no como defecto.

---

## 20. PASADA 15 — BÚSQUEDA PUNTUAL POR ID_INTERNO en los endpoints de escritura

### Problema

Tres endpoints del menú reescriben la fila completa de UN paciente y por eso
necesitan el objeto canónico completo: `api_controlActualizarUltimo`,
`api_registrarEvento` y `api_patologiasGuardar`. Lo obtenían con
`Modelo_leerPacientes()` que convierte TODAS las filas del bloque (N pacientes ×
todos los campos) para luego buscar el que les interesa. Con la caché entre
requests (pasada 14) la lectura de la hoja ya se evita entre RPCs, pero la
**conversión por fila en memoria** seguía alocando N objetos canónicos por RPC.

### Cambio

1. **`_filaAObjeto(campos, fila)` (PURA, 06_Modelo.js)**: factoriza la conversión
   fila cruda → objeto canónico (booleanos → TRUE/FALSE) que ya hacía
   `Modelo_leerPacientes`, para reutilizarla sin duplicar semántica. El lector
   completo ahora la usa internamente (resultado idéntico).
2. **`Modelo_buscarPaciente(idInterno)` (06_Modelo.js)**: recorre el bloque crudo
   ya memoizado (`_memoLeer` → UNA lectura de hoja, con caché entre requests de la
   pasada 14) comparando SOLO la columna `ID_INTERNO`; al encontrar la fila
   devuelve `{idx, obj}` construyendo el objeto canónico **de esa única fila**.
   Sin coincidencia → `null` (misma semántica que "paciente no encontrado").
3. **Endpoints migrados (07_UI.js)**: `api_controlActualizarUltimo`,
   `api_registrarEvento` y `api_patologiasGuardar` usan `Modelo_buscarPaciente`
   y reescriben la fila con `Modelo_filaFisica(HOJAS.PACIENTES, idx)` — la
   escritura no cambia (una sola `setValues` de la fila completa, invalidación vía
   `Modelo_refrescarVistasSectores`/`Modelo_invalidarLecturas` como antes).

### Por qué es seguro

- El objeto devuelto es **idéntico** al que producía `Modelo_leerPacientes()` para
  esa fila (misma `_filaAObjeto`); las escrituras de fila completa quedan igual.
- La identidad `idx` coincide con la posición de bloque (0-based desde `dataStartRow`);
  `Modelo_filaFisica` no cambia.
- No se toca el pipeline de captura ni `docs/CONTRATO_CAPTURA_V2.md`: las
  funciones de 26_Captura, 03_Fuentes y 12_Ingresos que llaman
  `Modelo_leerPacientes()`/`Modelo_leerEventos()` se mantienen intactas (usan
  `_memoLeer`, ya cacheado).
- Sin lecturas extra: mismo `_memoLeer(PACIENTES)` que usaba el lector completo.

### Impacto estimado

En los 3 endpoints migrados la conversión pasa de **N × todos los campos** a
**N comparaciones de una columna + 1 conversión**, con la misma lectura de hoja
(1, memo/caché). En PACIENTES de 1000+ filas el costo de alocar ~30 campos por
fila se elimina por RPC de control/ficha/patologías.

### Tests

- **R13** (2 grupos) → contrato datos **38** (antes 36, +2):
  - `_filaAObjeto` PURA: texto directo, boolean→TRUE/FALSE, Date conservado;
  - `Modelo_buscarPaciente`: idx 0-based correcto, objeto idéntico al de
    `Modelo_leerPacientes()[idx]`, una sola lectura (bloque memoizado),
    `null` ante idInterno inexistente.
- Batería completa verde (serial): núcleo 553 · contrato datos 38 · aceptación 50 ·
  contrato captura V2 36 · payload V2 19 · backend V2 68 · cola 33 ·
  formulario_web 27 · `validar_html` 17/17.
