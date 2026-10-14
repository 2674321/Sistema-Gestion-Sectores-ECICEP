# Catálogo de errores — v0.17.0

Fecha de consolidación: 2026-10-14. Baseline:
`af864f873e5aa1c9e22f3d386d590d8234faa4bb`.

| ID | Sev | Área | Hallazgo | Evidencia / test | Estado |
|---|---|---|---|---|---|
| ERR-001 | P0 | Captura | La confirmación dependía de staging ya eliminado y podía dejar un ingreso clínicamente aplicado como pendiente. | `captura_confirmacion_canonica_v0170` | CORREGIDO |
| ERR-002 | P0 | Seguridad/datos | Texto público podía iniciar una fórmula al persistirse en Sheets. | `seguridad_formula_injection_v0170` | CORREGIDO |
| ERR-003 | P1 | Seguridad | RPC temporales de activación podían llegar al deploy final. | `activacion_temporal_v260` | CORREGIDO |
| ERR-004 | P1 | Observabilidad | Backlog 0 no distinguía respuestas recientes del Form aún no materializadas. | `forms_snapshot_unmaterialized_v0170` | CORREGIDO |
| ERR-005 | P1 | Contrato | Entradas excesivas podían evadir límites de UI al llegar desde el transporte. | `input_hardening_v0170` | CORREGIDO |
| ERR-006 | P1 | Seguridad | La captura pública aún transportaba un token legacy sin función de autorización. | `public_capture_zero_legacy_token_v0170` | CORREGIDO |
| ERR-007 | P0 | Integridad | Una captura directa al Form podía mutar clínica pese a no ser canal operativo autorizado. | `google_form_direct_review_v0170` | CORREGIDO |
| ERR-008 | P1 | Seguridad | RPC destructivas no tenían autorización server-side ligada a operación y sesión. | `operator_destructive_nonce_v0170` | CORREGIDO |
| ERR-009 | P1 | Release | El manifest versionado nacía con SHA/conteo obsoleto y ensuciaba el release al regenerarse. | `release_manifest_v260` + `release --check` | CORREGIDO |

## ERR-001 — Confirmación clínica basada en staging

Severidad: P0  
Síntoma: `RECIBIDO/PENDIENTE_CONFIRMACION` después de una incorporación ya aplicada.  
Causa raíz: la confirmación releía `INGRESO_*`, que el pipeline elimina al cerrar.  
Fuente de verdad: `EVENTOS.FUENTE + TIPO_EVENTO=INGRESO` y `PACIENTES.ID_INTERNO`.  
Corrección: confirmación canónica por evento y paciente; ante evidencia parcial queda pendiente, nunca éxito inventado.  
Por qué esta corrección: verifica el efecto durable, no un staging transitorio.  
Alternativas descartadas: recrear o conservar staging, porque habilita duplicación.  
Test: `tests/captura_confirmacion_canonica_v0170.mjs`.  
Mutation check: la suite falla al reinstalar la lectura de staging.  
Estado: CORREGIDO.  
Commit: `e83f528`.

## ERR-002 — Inyección de fórmulas en Sheets

Severidad: P0  
Síntoma: texto externo iniciado por `=`, `+`, `-` o `@` podía evaluarse.  
Causa raíz: escritura directa de texto público sin barrera única.  
Fuente de verdad: valores externos son texto; las fórmulas del sistema no pasan por esta barrera.  
Corrección: `Utl_textoSeguroCelda_` en TR-1 y evento directo, incluso tras whitespace/control.  
Por qué esta corrección: protege la frontera de persistencia sin alterar fechas/números deliberados.  
Alternativas descartadas: sanear solo en la UI, porque Forms la omite.  
Test: `tests/seguridad_formula_injection_v0170.mjs`.  
Mutation check: payloads hostiles dejan de quedar como texto literal al retirar la barrera.  
Estado: CORREGIDO.  
Commit: `1fd62ee`.

## ERR-003 — Superficie temporal pública

Severidad: P1  
Síntoma: helpers de activación podían permanecer invocables en producción.  
Causa raíz: activación temporal implementada como global pública.  
Fuente de verdad: allowlist RPC DEC-110.  
Corrección: retiro de `99_ActivacionTemporal.js`, helpers privados y worker manual solo por OPSESS.  
Por qué esta corrección: mantiene 12 globales auditadas sin canal alternativo.  
Alternativas descartadas: allowlist temporal en release final.  
Test: `tests/activacion_temporal_v260.mjs`.  
Mutation check: reintroducir cualquiera de las dos globales falla.  
Estado: CORREGIDO.  
Commit: `9e05287`.

## ERR-004 — Backlog falso en cero

Severidad: P1  
Síntoma: respuestas recientes del Form sin fila materializada no aparecían.  
Causa raíz: métricas limitadas a `FORM_RESPUESTAS`.  
Fuente de verdad: cruce acotado `Form.getResponses` reciente vs. response IDs materializados.  
Corrección: snapshot con `unmaterialized` y edad; tolerancia de una iteración, DEGRADED/CRITICAL después.  
Por qué esta corrección: detecta pérdida de materialización sin PII ni barrido ilimitado.  
Alternativas descartadas: declarar recepción por señal `onFormSubmit`.  
Test: `tests/forms_snapshot_unmaterialized_v0170.mjs`.  
Mutation check: omitir una respuesta reciente incrementa el contador.  
Estado: CORREGIDO.  
Commit: `bf17785`.

## ERR-005 — Límites solo en UI

Severidad: P1  
Síntoma: payload profundo/grande o textos largos podían entrar por Forms.  
Causa raíz: límites no centralizados en el contrato autoritativo.  
Fuente de verdad: `CAPTURA_V2.LIMITES`.  
Corrección: validación temprana compartida de bytes, profundidad, cantidad y longitudes.  
Por qué esta corrección: todos los providers cruzan la misma frontera.  
Alternativas descartadas: truncar silenciosamente.  
Test: `tests/input_hardening_v0170.mjs`.  
Mutation check: fuzz hostil debe rechazarse sin excepción ni PII.  
Estado: CORREGIDO.  
Commit: `9dd2045`.

## ERR-006 — Token legacy en captura anónima

Severidad: P1  
Síntoma: credencial sin efecto seguía en DOM y argumentos RPC.  
Causa raíz: residuo anterior a DEC-110.  
Fuente de verdad: la captura pública concede siempre y no depende de token.  
Corrección: retiro del HTML, puente y cuatro llamadas públicas; operador conserva OPSESS.  
Por qué esta corrección: elimina seguridad ficticia sin romper captura.  
Alternativas descartadas: hacer obligatorio el token, prohibido por DEC-110.  
Test: `tests/public_capture_zero_legacy_token_v0170.mjs`.  
Mutation check: cualquier alias legacy en captura falla.  
Estado: CORREGIDO.  
Commit: `bd16be0`.

## ERR-007 — Form directo mutaba clínica

Severidad: P0  
Síntoma: `GOOGLE_FORM_DIRECT` llegaba a TERMINAL y escribía PACIENTES/EVENTOS.  
Causa raíz: el adaptador no distinguía transporte interno de canal operativo.  
Fuente de verdad: Web App única; Form solo transporte durable.  
Corrección: recepción durable + `REQUIERE_REVISION`, retorno antes de TR-2.  
Por qué esta corrección: preserva evidencia sin autorizar una interfaz paralela.  
Alternativas descartadas: rechazar/perder la respuesta o procesarla automáticamente.  
Test: `tests/google_form_direct_review_v0170.mjs`.  
Mutation check: el test espía y prohíbe entrega clínica.  
Estado: CORREGIDO.  
Commit: `54f00a9`.

## ERR-008 — RPC destructiva sin nonce server-side

Severidad: P1  
Síntoma: una sesión OPSESS válida podía invocar una eliminación sin autorización ligada a la llamada exacta.  
Causa raíz: confirmaciones solo de cliente/diálogo y gateway sin fase prepare/execute.  
Fuente de verdad: gateway único `WebApp_operadorRpc`.  
Corrección: nonce TTL 120 s consume-once, hash de método+args canónicos+OPSESS, diálogo DOM y fail-closed.  
Por qué esta corrección: protege la frontera única y no duplica lógica por endpoint.  
Alternativas descartadas: `confirm()` nativo (no confiable en iframe) y nonce reutilizable.  
Test: `tests/operator_destructive_nonce_v0170.mjs` y `operator_rpc_boundary_v255.mjs`.  
Mutation check: replay, otra sesión y argumentos cambiados fallan; no ejecutan destino.  
Estado: CORREGIDO.  
Commit: se asigna en el cierre de esta ejecución.

## ERR-009 — Manifest de release autorreferente obsoleto

Severidad: P1  
Síntoma: el archivo declaraba SHA `54f00a9` y 162 suites con HEAD posterior.  
Causa raíz: el manifest con SHA estaba versionado; el commit que lo actualiza cambia HEAD.  
Fuente de verdad: Git HEAD + fuentes de versión + salida JSON del verificador.  
Corrección: artefacto generado e ignorado, regenerado por tooling desde HEAD.  
Por qué esta corrección: elimina el ciclo autorreferente y mantiene Git limpio tras generar.  
Alternativas descartadas: editar SHA/conteos manualmente.  
Test: `tests/release_manifest_v260.mjs` y `node tools/release.mjs --check`.  
Mutation check: el builder sin reporte no concede `testsMatchVerifier`.  
Estado: CORREGIDO.  
Commit: se asigna en el cierre de esta ejecución.
