# Plan de superficie RPC pública (v255, DEC-110 / E29)

**NORMATIVO para el contrato de exposición del proyecto Apps Script.**

## Regla base

- Toda función cuyo nombre **termina en `_`** es **interna**: no es un
  entrypoint contractual y Apps Script la excluye de `google.script.run`. Nunca
  debe invocarse directamente desde el cliente.
- Toda función **pública** (sin guion bajo final) debe estar inventariada en
  `tests/rpc_public_allowlist.json` (formato `{runtime, public_capture,
  public_auth}`). Es el contrato ejecutable: `tests/seguridad_rpc_allowlist_vNEXT.mjs`
  y `tests/rpc_public_surface_v255.mjs` fallan si el código expone una función
  que no está en la allowlist, o si la allowlist contiene una que ya no existe.
- La superficie pública debe ser **< 15 globales** (hoy: 12).

## Frontera de acceso (DEC-110)

| Grupo | Acceso | RPC |
|-------|--------|-----|
| `runtime` | Apps Script | `doGet`, `doPost`, `onOpen`, `onEdit`, `include` |
| `public_capture` | **público / anónimo** | `WebApp_capturarRecibirDurable`, `WebApp_estadoInicial`, `WebApp_verificarRecepcion`, `api_webappEstado` |
| `public_auth` | público (gateway) | `WebApp_operadorIniciar`, `WebApp_operadorCerrar`, `WebApp_operadorRpc` |

- **CAPTURA pública** concede siempre. No depende de login, OPSESS,
  `Session.getActiveUser()`, OAuth ni permiso editor de Sheet.
- **OPERADOR / ADMINISTRACIÓN** exige sesión **OPSESS**. Toda RPC operativa es
  privada (`_`) y sólo se alcanza a través de `WebApp_operadorRpc` con el mapa
  explícito `WEBAPP_OPERATOR_RPC_` (sin despacho dinámico por nombre). Sin
  sesión válida → `OPERADOR_SESION_REQUERIDA`; método fuera del mapa →
  `RPC_OPERADOR_NO_PERMITIDA`.
- `ECICEP_ACCESS_TOKEN` es compatibilidad/trazabilidad, no autenticación.
- Alcance histórico: DEC-101/DEC-102 (acceso universal) describen la etapa
  previa; DEC-110 los acota.

## Clasificación vigente

| Prefijo | Rol |
|---------|-----|
| `WebApp_*` | Sólo las 4 de captura son públicas; el resto privadas (`_`). |
| `api_*` | Sólo `api_webappEstado` es pública; el resto privado (`_`), alcanzable por gateway. |
| `UI_*`, `Form_*`, `Modelo_*`, `Captura_v2_*`, `Utl_*`, … | internas (`_`): no son entrypoint client ni entrypoint de menú salvo lo declarado en la allowlist. |

## Garantías verificadas

- `tests/rpc_public_surface_v255.mjs`: superficie == allowlist; `< 15`; el
  receptor durable no referencia `Session`/`getActiveUser`/OPSESS; el gateway
  sin despacho dinámico.
- `tests/seguridad_rpc_allowlist_vNEXT.mjs`: críticos internos privados y
  legacy retirado.
- `tests/seguridad_webapp_capacidades_vNEXT.mjs`: captura pública + operador
  OPSESS simultáneamente.
- `tests/public_capture_unauthenticated_v255.mjs`, `tests/operator_rpc_boundary_v255.mjs`,
  `tests/operator_session_v255.mjs`, `tests/operator_no_session_no_pii_v255.mjs`,
  `tests/operator_html_gateway_v255.mjs`, `tests/private_trigger_menu_handlers_v255.mjs`.

## Cómo cambiar la superficie

1. Añadir/retirar la función en el código.
2. Actualizar `tests/rpc_public_allowlist.json` **en el mismo cambio**,
   justificando el porqué en el mensaje de commit.
3. Si es interna, terminarla en `_`. Si es de operador, agregarla al mapa
   `WEBAPP_OPERATOR_RPC_` (en `src/37_OperadorAuth.js`) en vez de hacerla pública.
4. Ejecutar `node tests/rpc_public_surface_v255.mjs` y
   `node tests/seguridad_webapp_capacidades_vNEXT.mjs`.
