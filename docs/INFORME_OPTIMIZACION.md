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
