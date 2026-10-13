# INFORME V256 — Cierre transversal runtime P0/P1 (consistencia, concurrencia, dry-run real y verdad operativa)

> Fase: `PROMPT_ECICEP_1_DE_4_CIERRE_RUNTIME_P0_P1.md` (v256)
> Sin producción: no se ejecutó `clasp push`, ni `deploy`, ni Form/Sheet/ScriptProperties/triggers reales.

## Estado

- **HEAD inicial:** `5560a55` (`docs(v255.1): final local hardening report (READY_FOR_GAS_PREACTIVATION)`)
- **HEAD final:** `3c814ef` (`test(forms): cover infrastructure failure semantics (v256)`)
- **Rama:** `codex/v255-operabilidad-observabilidad`
- **Local vs remoto:** local al día con `origin/codex/v255-operabilidad-observabilidad` al iniciar; push `--no-force` al cierre.
- **Producción:** intacta. Solo cambios en código de repositorio y tests.

### Commits

1. `2840074` — `fix(forms): make ack lookup fail-uncertain and decouple worker lease (v256 P0/P1)`
2. `627db10` — `fix(installer): bounded backup GC and fail-closed invariants (v256 P1)`
3. `1144f01` — `fix(update): real change counters and capture read-failure semantics (v256 P1)`
4. `3c814ef` — `test(forms): cover infrastructure failure semantics (v256)`
5. `docs: record v256 runtime consistency hardening` (este informe + correcciones documentales).

---

## Hallazgos

### #2 (P0) — `NO_ENCONTRADO` se devolvía ante errores de infraestructura
- **Causa raíz:** `Form_requestIdBuscar_` / `Form_requestIdRecuperarRespuesta_` trataban cualquier fallo (Form no configurado, `FormApp.openById` sin acceso, `getResponses()` que lanza) como "sin coincidencia" → el llamador concluía ausencia.
- **Corrección:** nuevo `Form_incierto_(codigo)` → `{ok:true, estado:'INCIERTO', incierto:true, codigo?}`. `WebApp_verificarRecepcion` ordena cache → consulta **autoritativa** al Form → `NO_ENCONTRADO` **solo** si la consulta se completó válidamente sin coincidencia; ante duda técnica devuelve `INCIERTO`. Una respuesta individual ilegible se **omite** (`omitidas`) sin anular la búsqueda.
- **Evidencia:** `tests/forms_v256_failure_semantics.mjs` (Form inaccesible ⇒ `INCIERTO`; `getResponses` throw ⇒ `INCIERTO/FORM_RESPONSES_READ_FAILED`; fila ilegible no invalida match válido).

### #3 (P0) — captura podía hacer `submit()` sin reserva de idempotencia
- **Causa raíz:** la reserva por `clientRequestId` no era concluyente ante contención de lock; se enviaba igual.
- **Corrección:** `Form_reservarRequestIdConLock_` resuelve `RECIBIDO | EN_PROCESO | RESERVADO | SERVICIO_OCUPADO`. `WebApp_capturarRecibirDurable` **solo** envía con `RESERVADO`; sin lock disponible responde `INCIERTO/SERVICIO_OCUPADO` (nunca `submit`).
- **Evidencia:** `tests/dry_run_activation_v254.mjs`, `tests/client_request_id_v255.mjs`, `tests/backend_down_durable_queue_v255.mjs`.

### #4 (P0) — el worker retenía `ScriptLock` durante I/O
- **Corrección:** lease corto (`Form_leaseTomar_`/`Form_leaseLiberar_`, TTL `WORKER_LEASE.TTL_S`) con token no-PII; el lock solo cubre el RMW del lease, jamás el pipeline. `DEFERRED_LOCK_BUSY`/`DEFERRED_LEASE_BUSY` sin mover cursor.
- **Evidencia:** `tests/worker_backlog_v254.mjs`, `tests/worker_production_backlog_v255.mjs`, `tests/worker_circuit_breaker_v255.mjs`.

### #5 (P0) — reparación no era realmente read-only en dry-run
- **Corrección:** `Form_asegurarColumnasTransporte255_(hoja, {simular})` y `Form_syncCatalogos_({simular})` no mutan; `Form_operativoReparar_` etiqueta `sin_cambios | necesita_cambio | aplicado | error:<motivo>`.
- **Evidencia:** `tests/forms_repair_v255.mjs` (taxonomía nueva).

### #6 (P0/P1) — cola ilegible se interpretaba como "todos elegibles"
- **Corrección:** `Form_leerEstadosCola_()` → `{ok, estados, motivo}`; `ok:false` solo por excepción (`QUEUE_STATE_READ_FAILED`). El worker activa circuito y **no** avanza. `Form_backlogResumen_` expone `disponible/motivo`.
- **Evidencia:** `tests/forms_v256_failure_semantics.mjs` (cola ilegible ⇒ `ok:false`).

### #7 (P1) — `getResponses()` del worker sin circuito
- **Corrección:** fallo ⇒ `Form_circuitoSistémico_('FORM_RESPONSES_READ_FAILED')`; no resetea circuito ni avanza cursor.

### #8 (P1) — ScriptProperties por captura (`GOOGLE_FORM_ERRORS|<captureId>`)
- **Corrección:** `Form_registrarErrorTransporte_` es **NO-OP**; el trailer de `FORM_RESPUESTAS` es autoritativo. Se conservan `Form_propClaves_`, `Form_erroresLegacy_`, `Form_limpiarErroresLegacy_` solo para reparación explícita (`errores_legacy`, opt-in).
- **Evidencia:** `tests/forms_v256_failure_semantics.mjs` (no se crea ninguna clave por captura); `grep` sin escrituras productivas.

### #9 (P1) — doble conteo y RMW no atómico de métricas
- **Corrección:** `Form_metricaSumar_` RMW atómico con lock breve; la captura no suma `SUBMIT_SIGNAL_COUNT`. El trigger `Form_onFormSubmit_` usa `Form_metricaTriggerSumar_` **lock-free** (no puede tomar lock clínico).
- **Evidencia:** `tests/forms_v256_failure_semantics.mjs` (trigger sin lock, contador incrementado); harness `assertDurableAndWorker`.

### #10 (P1) — persistencia del trailer no gateaba el avance del cursor
- **Corrección:** `Form_escribirClasificacionTrailer_` → `{ok:true, omitido:true}` si no hay fila; `{ok:false, motivo:'COLUMNAS_AUSENTES'|'ESCRITURA_FALLIDA'}` en fallo real. El worker no avanza cursor cuando el trailer falla.
- **Evidencia:** `tests/forms_v256_failure_semantics.mjs` (columnas ausentes ⇒ `COLUMNAS_AUSENTES`).

### #11 (P1) — salud/backlog sin triestado
- **Corrección:** `Form_operativoEstado_` agrega `responsesDisponible`, `triggersDisponible`; `Form_saludOperativa_` emite DEGRADED `RESPONSES_READ_FAILED`/`TRIGGERS_UNKNOWN` y los expone.
- **Evidencia:** `tests/forms_health_v255.mjs`.

### #12 (P1) — `catch` que convertían error en éxito/ausencia (auditoría)
- **Revisados:** `36_FormsCanal.js`, `26_Captura.js` (fail-closed), `20_Instalador.js`, `27_Actualizacion.js`, `30_Ingesta.js`, `37_OperadorAuth.js`, `WebApp.gs`.
- **Corrección aplicada:** `CapturaIngress_edicionDesdeForma_` distingue `FICHA_LECTURA_FALLIDA` (fallo de lectura, reintentable) de `FICHA_NO_DISPONIBLE` (ausencia real). Los `catch` de auth/WebApp son fail-closed (deniegan) y se mantienen.
- **Evidencia:** `tests/ejecutar_local.mjs` (núcleo 679/679).

### #13 (P1) — respaldos del instalador sin cota (fuga de ScriptProperties)
- **Corrección:** índice persistido `ECICEP_INST_BK_INDEX` + `Instalar_bkRegistrarYGc_`: conserva las últimas `INSTALAR_BK_GC_MAX` (5) ejecuciones y purga claves huérfanas `ECICEP_INST_BK|<ejecucion>` de cache y ScriptProperties. Invariantes de respaldo/idempotencia intactos (lock → respaldo → primera mutación; `BACKUP_FALLIDO` no escribe).
- **Evidencia:** `tests/forms_v256_failure_semantics.mjs` (GC acota a ≤5 y conserva la más reciente).

### #14 (P1) — "Actualizar" marcaba dirty por fase exitosa
- **Corrección:** `datosCambiaron` se calcula con **contadores reales** (`fuentes.nuevos`, `merge.actualizados/conflictos`, `revision`, `escritosPacientes/Eventos`, `amarillo.puerta.nuevas`, `historico.eventosCreados/pacientesActualizados`, enriquecimiento y derivados). Una fase "ok" sin cambios ya no ensucia `INICIO`.
- **Evidencia:** `tests/regresiones_revision.mjs`, `tests/ejecutar_local.mjs` (T12 S12: sin referencias al canal de captura).

---

## Hallazgos nuevos

- **Colisión contrato S12 ↔ postcondición:** ampliar la verificación final de `Act_actualizarSistema_` con `captureId`/`FORM_RESPUESTAS` rompe el invariante S12 (Actualizar no referencia el canal). Se limitó la postcondición al estado de las hojas críticas; la verificación de transporte pertenece al instalador/diagnóstico, no a Actualizar.
- **`Form_metricaSumar_` con lock** invocada desde el trigger `Form_onFormSubmit_` violaba el contrato "trigger sin lock clínico" del harness. Resuelto con variante lock-free exclusiva del trigger.

---

## Pruebas

- **Batería:** `node tools/verificar.mjs` → **130 suites; 0 fallos** (incluye sintaxis JS/GS).
- **Núcleo:** `node tests/ejecutar_local.mjs` → **679/679**.
- **Contrato:** `node tests/contrato_captura_v2.mjs` → **36/36**.
- **HTML:** `node tests/validar_html.mjs` → **21/21**.
- **Placeholders:** `node tests/no_placeholder_tests_all.mjs` → **PASS** (130 tests, 23 v255 sin placeholders).
- **Auditoría:** `node tools/auditar_v254.mjs` → **AUDITAR_V254: PASS / DOCS_MATCH_CODE: PASS**.
- **Suite nueva (adversarial, comportamiento real):** `tests/forms_v256_failure_semantics.mjs` → **PASS**.
- **`grep -R "GOOGLE_FORM_ERRORS|" src tests docs`:** solo config (`ERRORES_PREFIJO`), reparación opt-in y este test; **sin escrituras productivas por captureId**.

---

## Invariantes verificados

- **No dry-run mutación:** sí (reparación/sync `simular` y diagnóstico del instalador read-only).
- **`NO_ENCONTRADO` solo con evidencia válida:** sí (`INCIERTO` ante fallo técnico).
- **Captura sin `submit` sin reserva** (con `clientRequestId`): sí.
- **Worker sin `ScriptLock` durante I/O/pipeline:** sí (lease corto).
- **Captura anónima (DEC-110)** y operador/admin con OPSESS: intacto; superficie pública sin cambios.
- **Sin secretos reales**, sin nuevas RPC públicas.

---

## Producción

```text
CLASP_PUSH: NO
DEPLOY: NO
FORM_REAL: NO
SHEET_REAL: NO
```

## Gate final

**READY_FOR_PROMPT_2_DATA_INTEGRITY**
