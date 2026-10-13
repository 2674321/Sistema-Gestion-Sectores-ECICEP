# INFORME — RPC_OPERATOR_BOUNDARY (v255, DEC-110)

ESTADO: PASS
V255_LOCAL_HEAD: 1ae040d64d570cb33b6d223f3c767dbe93aaf90e
V255_REMOTE_HEAD: (pendiente de push)
PADRE: 5c84cc6e75d31688e21e2704ed6c03a8f27ff5be

## Resultado

La frontera RPC queda aplicada: la **CAPTURA pública concede siempre y es
anónima**; **OPERADOR/ADMINISTRACIÓN exige sesión OPSESS**; el resto es interno
(sufijo `_`, fuera de `google.script.run`). La superficie pública pasa de
**~709 a 12** funciones.

## Superficie pública resultante (12)

| Grupo | RPC |
|-------|-----|
| `runtime` (5) | `doGet`, `doPost`, `onOpen`, `onEdit`, `include` |
| `public_capture` (4) | `WebApp_capturarRecibirDurable`, `WebApp_estadoInicial`, `WebApp_verificarRecepcion`, `api_webappEstado` |
| `public_auth` (3) | `WebApp_operadorIniciar`, `WebApp_operadorCerrar`, `WebApp_operadorRpc` |

Contrato ejecutable: `tests/rpc_public_allowlist.json`
(`{_nota, runtime, public_capture, public_auth}`).

## Mecanismo

- `src/37_OperadorAuth.js`: hash SHA-256 con comparación de tiempo constante,
  `WebApp_operadorConfigurarClave_` (mín. 20 chars, sólo persiste el hash),
  rate limit (`OPLOGIN_FAIL_COUNT`), tokens `OPS-<64hex>`, sesión OPSESS en
  `CacheService` (`OPSESS:<sha256(token)>`, TTL 21600). Gateway
  `WebApp_operadorRpc(token, nombre, args)` con mapa explícito
  `WEBAPP_OPERATOR_RPC_` (**73 métodos**, sin despacho dinámico por nombre). El
  mapa se construye de forma **perezosa** (`WebApp_operadorMapa_()`) para no
  depender del orden de carga entre `37_OperadorAuth.js` y `Webhook.js`.
- `src/00_OperadorRuntime.html`: runtime cliente. `ECICEP_run()` (Proxy que
  enruta al gateway), `ECICEP_rpcOperador`, `ECICEP_operadorLogin/Logout`,
  `ECICEP_mostrarLogin`. El token vive sólo en `sessionStorage` (nunca en URL).
  Se incluye en 11 vistas de operador + CapturaWeb (con `ECICEP_MODO_OPERADOR`).
- Respuestas de rechazo declaradas (`ok:false`, sin lanzar):
  `OPERADOR_SESION_REQUERIDA`, `OPERADOR_NO_CONFIGURADO`,
  `CREDENCIALES_INVALIDAS`, `RPC_OPERADOR_NO_PERMITIDA`, `RPC_OPERADOR_FALLO`,
  `OPERADOR_LOGIN_TEMPORALMENTE_LIMITADO`, `OPERADOR_NO_DISPONIBLE`,
  `CLAVE_OPERADOR_CORTA`.

## Reproducibilidad del rename

`tools/privatizar_rpc_surface_v255.mjs` (dry-run → `RENAMES_PLAN.json`;
`--apply`): 950 funciones top-level, 709→9 en el barrido base; 0 colisiones,
0 abortos. Las 3 RPC de auth (`WebApp_operador*`) viven en el nuevo
`37_OperadorAuth.js` y completan la allowlist de 9→12. Reglas: ABORTA si
`CapturaWeb.html` referencia algo a privatizar; migra `google.script.run` →
`ECICEP_run()` en HTML de operador (nunca en `CapturaWeb.html`); no toca IDs,
URLs, labels clínicos ni datos (auditado: sin strings de datos renombrados).

## Evidencia (tests)

- `tests/rpc_public_surface_v255.mjs`: 12 RPC públicas; 73 métodos operador.
- `tests/seguridad_rpc_allowlist_vNEXT.mjs`, `tests/seguridad_webapp_capacidades_vNEXT.mjs`: PASS.
- `tests/operator_rpc_boundary_v255.mjs`: gateway OPSESS fail-closed (73 métodos).
- `tests/operator_session_v255.mjs`: login/uso/logout/TTL/rate-limit.
- `tests/operator_no_session_no_pii_v255.mjs`: shell sin PII + gateway cerrado.
- `tests/operator_html_gateway_v255.mjs`: 11 vistas de operador vía gateway.
- `tests/private_trigger_menu_handlers_v255.mjs`: 6 triggers y 13 items de menú.
- `tests/public_capture_unauthenticated_v255.mjs`: captura pública anónima.
- `tests/helpers/operador_vm.mjs`: VM con mocks (CacheService/PropertiesService/
  Utilities SHA-256/Session/HtmlService).
- Batería completa `node tools/verificar.mjs`: **129 suites, 0 fallos**.
- Núcleo `node tests/ejecutar_local.mjs`: 679/679. HTML 21/21.
  `tools/auditar_v254.mjs`: PASS exit 0. `git diff --check`: limpio.

## Consecuencia de frontera (declarada)

`EditorPaciente.html` (fragmento incluido por `CapturaWeb.html`) ya no llama
`google.script.run.WebApp_cargarPacienteEdicion`: usa `ECICEP_run()` →
gateway OPSESS. Es decir, **cargar/editar la ficha de un paciente existente
desde la captura exige sesión de operador** (protección de PII); el alta/anexo
de captura nueva permanece anónimo. Coherente con DEC-110.

## Alcance

Sin `clasp push`, sin deploy, sin tocar Form/Sheet/ScriptProperties/triggers/
deployment/QR, sin `master`/PR#13, sin configurar `ECICEP_OPERATOR_SECRET_SHA256`
real. Sólo código/tests/docs + rename reproducible.
