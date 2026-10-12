# INFORME_V255_AUDITORIA_CORREGIDA

ESTADO: READY_FOR_REVIEW
AUDITORIA_CONFIABLE: PASS
V254_CANDIDATE: FROZEN (4814e15)
V255_IMPLEMENTACION_REAL: PASS
PRODUCTION: UNCHANGED
ACTIVATION: NOT_EXECUTED

Base auditada: `PROMPT_ECICEP_V255_AUDITORIA_PROFUNDA_ERRORES_MEJORAS.md`
(31 errores + 12 mejoras). Cada corrección incluye código real, test real y
resultado verificado. No se debilitó ningún test ni se reintrodujo arquitectura
paralela.

---

## RESULTADO GLOBAL

- `tools/verificar.mjs`: **123 suites · 0 fallos**.
- `tests/ejecutar_local.mjs`: **679 / 679 OK**.
- `tools/auditar_v254.mjs`: **PASS** (incluye `UI_SELECTOR_DROPDOWN`,
  `DURABLE_RPC`, `NO_ACCIDENTAL_FORM_CREATE`, `GLOBAL_ACTION_CANONICAL`,
  `CANONICAL_ITEM_MAP`, `INSTALL`/worker, `NO_ACCIDENTAL…`).
- `tests/validar_html.mjs`: 21/21 OK.
- `tests/no_placeholder_tests_all.mjs`: 123 tests, 17 `_v255` sin placeholders.
- `tests/ejecutar_local.mjs` núcleo: 679/679.
- Producción sin tocar (no se ejecutó `clasp push`/`clasp deploy`).
---

## ERRORES CORREGIDOS

| # | Error | Solución | Test | Resultado |
|---|-------|----------|------|-----------|
| 01 | `auditar_v254.mjs` debilitado (PASS falso) | Auditor restaurado a la versión fuerte `4814e15` | `v254_auditor_must_fail_v255.mjs` | PASS (auditor falla si se debilita) |
| 02 | 7 tests v255 son placeholders | Reescritos como tests reales con aserciones | `no_placeholder_tests_all.mjs` | PASS |
| 03 | Detector de placeholders solo cubría v254 | Detector global; placeholder = ≤1 línea `console.log(PASS)`; exige ≥3 aserciones por `_v255` | `no_placeholder_tests_all.mjs` | PASS |
| 04 | v255 declarado `DEVELOPED` sin implementación | Implementación real de canal/worker/UI/docs | batería v255 | PASS |
| 05 | `clientRequestId` solo en navegador | Dedupe de transporte server-side: `Form_requestIdReservar_`/`Confirmar_`/`Buscar_` + `CLIENT_REQUEST_ID` en canonical item map | `client_request_id_v255.mjs` | PASS |
| 06 | UI afirma idempotencia inexistente | Dedupe previo + estados UI `RECIBIDO/EN_PROCESO/INCIERTO/NO_ENCONTRADO` + **Verificar recepción** | `capture_guide_dropdown_v255.mjs`, `formulario_web.mjs` | PASS |
| 07 | Falta recuperación de ACK perdido | Índice `CacheService` `FORM_REQ:<id>` (`RESERVED` 120 s / `RECEIVED` 6 h) + `Form_requestIdRecuperarRespuesta_` + `WebApp_verificarRecepcion` | `ack_lost_v255.mjs` | PASS |
| 08 | Worker reprocesa siempre los mismos 10 | Sin dependencia de `opciones.yaProcesado`; elegibilidad por estados reales | `worker_production_backlog_v255.mjs` | PASS |
| 09 | Backlog con counters acumulativos | Backlog por IDs únicos desde `FORM_RESPUESTAS` (`Form_leerEstadosCola_`) | `worker_production_backlog_v255.mjs` | PASS |
| 10 | `oldestPendingMin` usaba último deferred | `Form_leerEstadosCola_` lee `FECHA_FORMS` real vía `Utl_claveAlnum` (bug corregido) | `forms_health_v255.mjs` | PASS |
| 11 | Diagnóstico verde sin `Form_worker` | `Form_operativoEstado` reporta `triggerWorker`; salud alerta `WORKER_TRIGGER_AUSENTE` | `forms_health_v255.mjs` | PASS |
| 12 | `Form_onFormSubmit` ensucia métricas deferred | Métricas deferred separadas del hot path | `forms_health_v255.mjs` | PASS |
| 09/13 | REVIEW se volvía terminal `YA_DESCARTADO` | `REVIEW` se conserva; solo `TERMINAL` es terminal; `Form_esElegibleCandidato_` excluye PROCESADO/REVIEW/TERMINAL | `form_review_state_v255.mjs` | PASS |
| 14 | `ScriptProperties` crece por `captureId` | Errores de transporte acotados con TTL/ventana; no acumulan por captureId | `backend_down_durable_queue_v255.mjs` | PASS |
| 15 | Instalador devuelve `ok:true` con trigger/catálogo fallido | Instalación fail-closed (`INSTALL_CATALOG_FAILED`/`INSTALL_TRIGGER_FAILED`) | `installer_partial_failure_v255.mjs` | PASS |
| 16 | `PROFESIONAL2` sin catálogo en schema | Catálogo aplicado también a `PROFESIONAL2` | `catalog_profesional2_v255.mjs` | PASS |
| 17 | `setRequired()` omitido si lista sin opciones | Se aplica requerido aunque el ítem no tenga opciones | `forms_schema_drift_receiver_v255.mjs` | PASS |
| 18 | `Form_syncCatalogos()` usa títulos | Sincronización por canonical IDs | `catalog_profesional2_v255.mjs` | PASS |
| 19 | `FormResponse` pierde campos y devuelve `RECIBIDO` | Validación de payload de transporte antes de aceptar; drift detectado | `forms_schema_drift_receiver_v255.mjs` | PASS |
| 20 | Hot path usa títulos como intermediario | Flujo por canonical item map | `forms_schema_drift_receiver_v255.mjs` | PASS |
| 21 | Validación de transporte débil | `Form_validarPayloadTransporte_` endurecido (claves/acciones permitidas) | `captura_ui_payload_v2.mjs` | PASS |
| 22 | `dryRun=false` de reconciliación es semántica falsa | Reconciliación **siempre read-only**; reparación separada `Form_operativoReparar()` | `forms_repair_v255.mjs` | PASS |
| 23 | Docs v255 son placeholders | `RUNBOOK_CAPTURA.md` (9 escenarios) + `OPERACION_TRANSPORTE_DURABLE.md` completos | `runbook_completo_v255.mjs` | PASS |
| 24 | Guía UI habla de tarjetas antiguas | `#acc1..#acc4` → un paso `#accion` + descripción dinámica | `capture_guide_dropdown_v255.mjs` | PASS |
| 25 | Dos sistemas de timeout | Eliminado `_envTimeoutId/_envTimeoutInit/_envTimeoutOff`; una sola máquina `ENVIO` (`IDLE→SENDING→UNCERTAIN/RECEIVED`) | `capture_guide_dropdown_v255.mjs`, `formulario_web.mjs` (E1–E4) | PASS |
| 26 | UI de duplicados muerta | Eliminados `dupOverlay`, handlers, CSS `.dup-*`, `_dupCb`, `mostrarDuplicados`, `cerrarDuplicados` (0 callers) | `capture_guide_dropdown_v255.mjs` | PASS |
| 27 | `WebApp_previaDuplicadosV2` expone PII | Wrapper público llama `Captura_v2_previaDuplicados(datos,false)` | `public_preflight_privacy_v255.mjs` | PASS |
| 28 | Deployment anónimo sirve vistas admin | Superficie RPC pública acotada; vistas admin/operador fuera del contrato público | `rpc_public_surface_v255.mjs` | PASS |
| 29 | Superficie RPC pública enorme | `docs/RPC_SURFACE_PLAN.md` (regla `_`=interno, allowlist=contrato); 709 funcs auditadas | `rpc_public_surface_v255.mjs` | PASS |
| 30 | `LOCK_WAIT_MS=750` ignorada | `Form_worker` respeta `WORKER.LOCK_WAIT_MS` (check/reserva bajo lock ≤500 ms) | `worker_production_backlog_v255.mjs` | PASS |
| 31 | Auditoría schema no detecta literal legacy correcto | `Form_auditarSchema_` reconoce el literal correcto | `forms_schema_drift_receiver_v255.mjs` | PASS |

## MEJORAS IMPLEMENTADAS

| # | Mejora | Evidencia |
|---|--------|-----------|
| 01 | Health real | `Form_saludOperativa_` + `forms_health_v255` |
| 02 | Timestamps agregados | métricas tipadas (`WORKER_RETRYABLE/WORKER_REVIEW/WORKER_TERMINAL/DEFERRED_COUNT/OLDEST_PENDING_MIN`) |
| 03 | Circuit breaker | `CIRCUIT` + `PENALIZAR_TRIGGER_FALLIDOS=3` (`worker_circuit_breaker_v255`) |
| 04 | Repair seguro | `Form_operativoReparar` (dry-run por defecto) (`forms_repair_v255`) |
| 05 | Worker manual admin | `api_formWorkerEjecutarAhora` (delega a `Form_worker`) |
| 06 | Panel operación transporte | `Form_panelOperacion_` |
| 07 | Batch elegible | worker drena solo candidatos elegibles |
| 08 | Métricas tipadas | `Form_metricas_`/`Form_metricaSumar_` |
| 09 | Duración worker | métrica de duración en `Form_worker` |
| 10 | Catálogo una sola lectura | `Form_syncCatalogos`/`Form_catalogoProfesionales_` |
| 11 | Harness Forms realista | `tests/helpers/forms_v255_harness.mjs` |
| 12 | Runbook completo | `docs/RUNBOOK_CAPTURA.md` (`runbook_completo_v255`) |

---

## BUGS DE REGRESIÓN DETECTADOS Y CORREGIDOS EN ESTA FASE

- `Form_leerEstadosCola_`: usaba nombres de columna raw contra un mapa keyed por
  `Utl_claveAlnum` → `FECHA_FORMS`/`oldestPendingMin` siempre vacíos/0. Corregido.
- `formulario_web.mjs` PARTE E probaba la API eliminada `_envTimeout*`. Reescrita
  contra la máquina única real (`envioIniciar`/`envioFinalizar`).
- `no_placeholder_tests_all.mjs`: contaba solo `assert.`; se amplió a la
  convención real del repo (`A(`), manteniendo el umbral ≥3 aserciones.
- `CapturaWeb.html`: eliminado el overlay de duplicados y la máquina de timeout
  duplicada; alta de botón **Verificar recepción**.

## VERIFICACIÓN (comandos)

```text
node tools/verificar.mjs            → 123 suites; 0 fallos
node tools/auditar_v254.mjs         → 17/17 checks PASS
node tests/ejecutar_local.mjs       → núcleo 679/679
node tests/validar_html.mjs         → 21/21
node tests/no_placeholder_tests_all.mjs → 123 tests, 17 v255 sin placeholders
```

## PENDIENTES / NO EJECUTADO

- `clasp push` y actualización del deployment operativo: **no ejecutado**
  (requiere decisión/publicación; producción sin cambios).
- E2E sobre acceso anónimo real: **no ejecutado**.
- Commit/push a Git: **no ejecutado**.

## ESTADO FINAL

Implementación v255 completa y verde en local; canal, worker, UI, docs y
auditoría alineados con `AGENTS.md` y `docs/CONTRATO_CAPTURA_V2.md`. Listo para
revisión y publicación.
