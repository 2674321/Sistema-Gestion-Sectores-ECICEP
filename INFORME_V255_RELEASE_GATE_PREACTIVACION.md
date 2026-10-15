# INFORME — V255 RELEASE GATE PREACTIVACIÓN

ESTADO: READY_FOR_PREACTIVATION_REVIEW
V255_LOCAL_HEAD: 1ae040d64d570cb33b6d223f3c767dbe93aaf90e
V255_REMOTE_HEAD: 2a004abafcbe75037d6ffc23e390189b4e107f12
V255_PADRE: 5c84cc6e75d31688e21e2704ed6c03a8f27ff5be
V254_FROZEN_HEAD: 4814e15e20d377422833f12161d8009466231c02
PR13_HEAD: 4814e15e20d377422833f12161d8009466231c02 (branch `codex/vnext-campos-e-identidad`, OPEN, base `master`)
PRODUCTION: no tocada
CLASP_PUSH: NO
DEPLOY: NO
FORM_REAL: NO
SHEET_REAL: NO
TRIGGERS_REALES: NO

## TESTS

- suites: 123 suites, 0 fallos (`node tools/verificar.mjs`)
- fallos: 0
- nucleo: 679/679 (`node tests/ejecutar_local.mjs`)
- contrato: 36/36 (`node tests/contrato_captura_v2.mjs`); aceptación 50/50 (`node tests/aceptacion_formulario.mjs`)
- html: 21/21 (`node tests/validar_html.mjs`)
- auditar_v254: 17/17 PASS, exit 0 (`node tools/auditar_v254.mjs`); meta-test `tests/v254_auditor_must_fail_v255.mjs` real (inyecta regresión `LOCK_WAIT_MS 750→7500` y exige fallo del auditor)
- placeholders: 129 tests, 23 v255, 0 placeholders (`node tests/no_placeholder_tests_all.mjs`)
- `git diff --check`: limpio (exit 0)
- suites actuales: **129 suites, 0 fallos** (`node tools/verificar.mjs`)

## GATES

- clientRequestId: PASS — `tests/client_request_id_v255.mjs`; `GLOBAL|CLIENT_REQUEST_ID` en `src/36_FormsCanal.js:837,1344`; `PATRON_CLIENT_REQUEST_ID=/^CR-[0-9a-f]{32}$/`; sin PII clínica.
- ack_lost: PASS (`tests/ack_lost_v255.mjs`)
- worker_starvation: PASS — `tests/worker_production_backlog_v255.mjs` (25 respuestas → 10/10/5/0 sin `opciones.yaProcesado` operativo; sólo inyección de test).
- backlog_real: PASS — `Form_backlogResumen_()` (`src/36_FormsCanal.js:1079`) + suite.
- health: PASS (`tests/forms_health_v255.mjs`; `Form_saludOperativa_` 1264)
- circuit_breaker: PASS — `tests/worker_circuit_breaker_v255.mjs` + `tests/backend_down_durable_queue_v255.mjs` (`CIRCUIT.UMBRAL=3`).
- repair: PASS (`tests/forms_repair_v255.mjs`; `Form_operativoReparar` 1137, dry-run por defecto, no borra respuestas).
- admin_no_pii: PASS (`tests/forms_admin_no_pii_v255.mjs`)
- form_builder_fail_closed: PASS — `Form_crearRespuestaDesdePayloadWeb_()` (1394): canonical keys primero, título sólo como reparación, fail-closed `FORM_SCHEMA_DRIFT` (`tests/forms_schema_drift_receiver_v255.mjs`).
- installer_fail_closed: PASS — `tests/installer_partial_failure_v255.mjs` + `tests/catalog_profesional2_v255.mjs` + `tests/forms_installer_idempotence_v254.mjs`.
- review_durable: PASS (`tests/form_review_state_v255.mjs`: REVIEW permanece REVIEW, reprocesable).
- public_preflight_privacy: PASS — `tests/public_preflight_privacy_v255.mjs`; `WebApp_previaDuplicadosV2` usa modo público sin candidatos PII (`src/26_Captura.js:1688`, `Captura_v2_previaDuplicados(datos, false)`).
- rpc_operator_boundary: PASS — superficie pública **12** (5 runtime, 4 public_capture, 3 public_auth); operador/admin vía gateway OPSESS `WebApp_operadorRpc` (mapa `WEBAPP_OPERATOR_RPC_`, 73 métodos), sin sesión → `OPERADOR_SESION_REQUERIDA`; resto interno (`_`). Evidencia: `tests/rpc_public_surface_v255.mjs`, `tests/operator_rpc_boundary_v255.mjs`, `tests/operator_session_v255.mjs`, `tests/operator_no_session_no_pii_v255.mjs`, `tests/operator_html_gateway_v255.mjs`, `tests/private_trigger_menu_handlers_v255.mjs`, `tests/public_capture_unauthenticated_v255.mjs`, `tests/seguridad_rpc_allowlist_vNEXT.mjs`, `tests/seguridad_webapp_capacidades_vNEXT.mjs`. Ver `INFORME_RPC_BOUNDARY_V255.md`.
- docs: PASS — `tests/runbook_completo_v255.mjs` 17/17 (ack incierto, clientRequestId/responseId/captureId, worker, backlog, Form down, Sheet down, schema drift, permisos deployer, repair, rollback, RECIBIDO != PROCESADO).

## BLOQUEANTES

- Ninguno de código/tests. `rpc_operator_boundary` pasa a **PASS** vía DEC-110:
  CAPTURA pública anónima (4 RPC) + OPERADOR/ADMIN con sesión OPSESS + resto
  interno (sufijo `_`). Superficie pública **12**.
- Consecuencia declarada (no bloqueante): `EditorPaciente.html` (incluido por
  `CapturaWeb.html`) pasa a exigir OPSESS para cargar/editar ficha existente; el
  alta de captura nueva sigue anónima. Ver `INFORME_RPC_BOUNDARY_V255.md`.

## Evidencia adicional

- `git diff 5c84cc6..HEAD`: rename de frontera RPC en `src/*` (709→12 públicas),
  `src/37_OperadorAuth.js` y `src/00_OperadorRuntime.html` nuevos/ampliados,
  tests/docs actualizados; sin tocar `.clasp.json`/`appsscript.json`/deployment/
  Form ID/URL QR; PR #13 intacto; sin `master`.
- Rename reproducible: `tools/privatizar_rpc_surface_v255.mjs` (0 colisiones, 0
  abortos); sin strings de datos renombrados (auditado).
- `tests/google_forms_arquitectura_v253.mjs` y `tests/google_forms_instalador_v253.mjs`: stubs legacy removidos; verifican scopes/WebApp y funciones del canal.
- Núcleo 679/679 · HTML 21/21 · `tools/auditar_v254.mjs` PASS (exit 0) ·
  `tests/no_placeholder_tests_all.mjs` 129 tests / 23 v255 / 0 placeholders ·
  `git diff --check` limpio.

## Acción permitida

- Commit y push del código v255 en `codex/v255-operabilidad-observabilidad`:
  **PERMITIDO** (no forzado, sin deploy).
- Deploy, `clasp push`, activación de Form/triggers, configurar
  `ECICEP_OPERATOR_SECRET_SHA256` real y merge (PR #13 / `master`): **NO**.

## Siguiente paso

Ejecución separada `PREACTIVACIÓN GAS + E2E SINTÉTICO + ACTIVACIÓN CONTROLADA`:
configurar el secreto de operador real, `clasp push`/deploy al deployment
operativo y verificar en vivo (captura anónima + login operador), sin tocar QR
hasta confirmar.
