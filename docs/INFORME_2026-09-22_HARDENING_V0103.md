# INFORME HARDENING v0.10.3 — Separación de capacidades y trazabilidad de estratificación

**Fecha:** 2026-09-22 · **Versión:** `0.10.3` · **Deploy:** reutiliza el deployment operativo existente (URL base y QR intactos) · **Esquema:** `2` (sin cambios → **NO** se crea MIG-003).

---

## 1. Objetivo

Cerrar la auditoría de seguridad/integridad de la pasada v0.10.3 garantizando:

- **Separación de capacidades**: token de **CAPTURA** (página pública) ≠ token de **OPERADOR** (paneles, ficha, admin). Una página pública nunca entrega una credencial privilegiada; una función interna nunca se vuelve RPC pública solo por estar declarada `function` en Apps Script.
- **Superficie RPC mínima**: los helpers mutantes/destructivos del núcleo son privados (sufijo `_` + patrones `Dominio_*_`/`Ecicep_conLock_`) y solo se invocan a través de wrappers `api_*` con capacidad **OPERADOR**.
- **Integridad de mutaciones**: ficha atómica (0 cambios si un campo es inválido), revisión→INGRESO con cierre del caso, revisión idempotente, eventos reservados no creables genéricamente, cambio de estratificación **siempre trazado** como `CAMBIO_ESTRATIFICACION`.
- **No se sacrifican** las correcciones de producción @218 (`TOKEN_ACCESO`) y @219 (`ID_INICIAL_SAFE`).

---

## 2. Separación de capacidades (DEC en `DECISIONES.md`)

`WebApp_autorizarBuscador` distingue dos tokens en PropertiesService:

| Capacidad | Token | Qué autoriza |
|---|---|---|
| **CAPTURA** | `CAPTURA_ACCESS_TOKEN` | Operaciones de captura pública (`WebApp_capturarEnviar`, payload del contrato V2). |
| **OPERADOR** | `OPERADOR_ACCESS_TOKEN` | Todo lo administrativo: paneles, ficha, revisión, REM, calidad, auditoría, configuración, backups y CentroPruebas. |

Regla de precedencia: un token de CAPTURA **no** abre operador; un token de
OPERADOR **no** autoriza captura (capacidades disjuntas; verificado por test).

---

## 3. Superficie RPC mínima y fallos cerrados

### 3.1 Helpers críticos ya no son invocables desde `google.script.run`

Detectados y blindados (solo existen como `..._` privados, nunca como `function <nombre>(` público):

- `Hojas_resetFabrica_` (reset destructivo), `Recuperar_ejecutar_` (restauración de datos), `IA_limpiarEventosHuerfanos_`, `Modelo_agregarPacientes_`, `Modelo_agregarEventos_`, `Estrat_recalcularPaciente_`, `Ingresos_procesarTodasLasHojas_` → todos detrás de wrappers `api_*` que exigen token de **OPERADOR**.

### 3.2 Wrappers administrativos con `Api_error_('ACCESO_DENEGADO')`

- `18_Calidad.js`: `api_calidadSincronizarCola` (:258), `api_calidadNormalizarRuts` (:268).
- `16_Amarillo.js`: `api_amarilloImportar` (:408), `api_amarilloDedup` (:420).
- `02_Normalizacion.js`: `api_estratRecalcularPaciente` (:649).
- `15_RemExcel.js`: `api_rem9Datos` (:462).
- `14_REM.js`: `api_remExportarPdf` (:428).
- `21_Auditoria.js`: `api_auditoriaEjecutar` (:477).

Todos comprueban `WebApp_autorizarBuscador(token)` con capacidad **OPERADOR** y devuelven `ACCESO_DENEGADO` ante token CAPTURA o ausente. RemGenerador.html y exportar PDF exigen operador. CentroPruebas.html ya no invoca mutadores internos directamente (migrado a `api_*` con token).

### 3.3 CONFIG no devuelve secretos

- `CONFIG_SECRETOS` + `CONFIG_SECRETO_PATRONES` + `Config_esSecreto_` + `Config_valorPublico_` en `src/06_Modelo.js`.
- `api_configListar` **enmascara** los valores que coinciden con patrones secretos.
- `api_configGuardar`/`api_configAgregar` **rechazan** guardar secretos por la API.
- `Aud_auditarConfig` enmascara secretos en los registros de auditoría.

---

## 4. Trazabilidad de estratificación (NORMATIVO `docs/ESTRATIFICACION.md:46`)

Todo cambio del **valor vigente** de estratificación de una persona genera un evento `CAMBIO_ESTRATIFICACION`. Núcleo: `Estrat_prepararCambio_` (`src/02_Normalizacion.js:563`).

Campos del evento (contracto `MODELO_EVENTOS`):

```
ID_EVENTO       Ev_nuevoId()
FECHA_EVENTO    _fichaHoyIso_()
TIPO_EVENTO     'CAMBIO_ESTRATIFICACION'
RIESGO_G        nuevo valor vigente
DESCRIPCION     '<anterior> → <nuevo> · <motivo>'
FUENTE          según contexto (p.ej. 'SISTEMA' en recálculo masivo)
REGISTRADO_POR  usuario actual
```

Senderos que lo emiten:

- `Estrat_recalcularPaciente_` (02_Normalizacion.js:600): recáculo de un paciente.
- `Estrat_recalcularTodos_` (:662): recáculo masivo — colecciona los eventos y los escribe **en una sola escritura** bajo `Ecicep_conLock_` con contexto `{autorizacion:'IMPORT_AUTORIZADO', operacion:'recalcular-todos'}`. Contradicción de integridad: si la escritura del evento falla → `{ok:false, motivo:'CAMBIO_ESTRATIFICACION_FALLIDO: revisión requerida'}` (el valor no se presenta como trazado sin su evento).
- `Patologias_guardarPaciente_` (31_Ficha.js:372): cambio por patologías. Si la escritura del evento falla → `PATOLOGIAS_NO_TRACEABLES ...` (revisión requerida).

**No-op**: recáculo que no cambia el valor vigente (p.ej. `G2→G2`, o `SIN_DATOS` conservando el valor manual) **no** crea evento (regla `$útil`: no-op de estratificación no crea evento).

---

## 5. Integridad de mutaciones y eventos reservados

- **`EVENTOS_FICHA_MANUALES`** (`CONTROL`/`SEGUIMIENTO`/`LLAMADO`/`OTRO`): únicos tipos que acepta el registrador genérico de ficha.
- **Reservados** (`INGRESO`, `CAMBIO_SECTOR`, `CAMBIO_ESTRATIFICACION`, `EGRESO`, `GESTION_CASO_*`, `PLAN_CUIDADO`): no seleccionables en el `<select>` del Sidebar y rechazados por el guard `TIPO_EVENTO_RESERVADO` (`31_Ficha.js:449`). Entran al pipeline exclusivamente por sus puertas de dominio (ingreso, revisión, ficha, recáculo).
- **Ficha atómica**: `api_fichaGuardarCambios` valida **todo** antes de escribir — un campo inválido (`CAMPO_INVALIDO:...`) produce **0 cambios** en PACIENTES y EVENTOS.
- **Revisión→INGRESO**: `api_revisionResolver` con `RECHAZAR_MATCH` crea el paciente y su evento `INGRESO`, cierra el caso (`RESUELTO`) y clausura las hermanas del mismo origen. Reintentar sobre un caso ya resuelto → `CONFLICTO_YA_RESUELTO` sin mutaciones.
- **Locks**: mutaciones compuestas (`api_fichaGuardarCambios`, `api_revisionResolver`, `Estrat_recalcularTodos_`, `api_ingresoIncorporar`) toman `Ecicep_conLock_`; contención → `SERVICIO_OCUPADO`; si no hay LockService (entorno acotado) proceden sin lock (verificado).
- **Vista derivada**: un fallo de `Modelo_refrescarVistasSectores_` en guardado de ficha **no** silencia la escritura fuente (best-effort acotado); en recáculo masivo el refresco de vistas es best-effort con el fallo informado.

---

## 6. Tests añadidos / actualizados (batería completa)

| Suite | Resultado |
|---|---|
| `tests/acceso_webapp.mjs` (reescrita, tokens CAPTURA vs OPERADOR distintos) | **8/8** |
| `tests/seguridad_capacidades_v0103.mjs` (nueva) | **10/10** |
| `tests/rpc_surface_v0103.mjs` (nueva): superficie RPC mínima | **4/4** |
| `tests/integridad_mutaciones_v0103.mjs` (nueva): atomicidad, revisión, reservados, estrat, locks, vista fallida | **9/9** |
| `tests/regresiones_revision.mjs` (actualizado): contrato de evento `CAMBIO_ESTRATIFICACION` en recáculo masivo | **44/44** |
| `tests/ejecutar_local.mjs` (núcleo, bump de versión a 0.10.3) | **671/671** |
| `tests/validar_html.mjs` (scripts embebidos) | **22/22** |
| `node tools/verificar.mjs` | **20 suites · 0 fallos** |

Detalles no aceptados en los harnesses: la dupla, revisión, captura vía V2, etc. permanecen sin regresión (ver el resumen por suite de `tools/verificar.mjs`).

---

## 7. Regresiones de producción protegidas

- **@218 `TOKEN_ACCESO`**: permanece — CentroPruebas no inyecta ni expone el token en la página pública; los diálogos/sidebars inyectan el token de operador solo donde corresponde.
- **@219 `ID_INICIAL_SAFE`**: permanece — la aplicación no asume el ID de inicio cuando está vacío (test de regresión en `acceso_webapp.mjs`).
- El **schema continúa en 2**; no se introdujo arquitectura paralela, ni entorno nuevo, ni un segundo canal de captura.

---

## 8. Estado del deploy

`clasp push --force` + actualización del **deployment operativo reutilizado** (misma URL base `.../exec` y QR; sin crear deployments por rutina). Inspección posterior con `clasp deployments` confirma la URL intacta.