# Plan de superficie RPC pública (v255, E29)

**NORMATIVO para el contrato de exposición del proyecto Apps Script.**

## Regla base

- Toda función cuyo nombre **termina en `_`** es **interna**: no es un
  entrypoint contractual y nunca debe invocarse desde el cliente.
- Toda función **pública** (sin guion bajo final) debe estar inventariada en
  `tests/rpc_public_allowlist.json`. Es el contrato ejecutable: la suite
  `tests/seguridad_rpc_allowlist_vNEXT.mjs` y `tests/rpc_public_surface_v255.mjs`
  fallan si el código expone una función que no está en la allowlist, o si la
  allowlist contiene una que ya no existe.
- El acceso es **universal** (DEC-101 / DEC-102 / `AGENTS.md` regla 11): ninguna
  vista ni RPC queda bloqueada por token. La autorización es trazabilidad
  inyectada por el servidor, no una puerta. Prohibido `ACCESO_DENEGADO` como
  motivo de fallo.

## Clasificación vigente (709 funciones)

| Prefijo | Rol | Ejemplos |
|---------|-----|----------|
| `WebApp_*` | Entrypoints de la Web App (canal único de captura). | `WebApp_capturarRecibirDurable`, `WebApp_verificarRecepcion`, `WebApp_previaDuplicadosV2` |
| `api_*` | RPC del panel/sidebar administrativo. | `api_configGuardar`, `api_formWorkerEjecutarAhora`, `api_ficha` |
| `UI_*` | Menús/paneles de Google Sheets y panel operativo. | `UI_googleFormsPanel`, `UI_proceso…` |
| `Form_*` operativas | Ciclo del canal Google Forms (transporte durable interno). | `Form_operativoInstalar`, `Form_operativoEstado`, `Form_operativoDiagnosticar`, `Form_operativoReparar`, `Form_reconciliarTransporte`, `Form_syncCatalogos`, `Form_worker` |
| `WebApp_*`, `api_*` críticos | Exigen `WebApp_autorizar*` (trazabilidad, no puerta) | `api_fichaGuardarCambios`, `api_configGuardar`, `api_instalarPaso`, `api_integridadReparar` |
| Resto con prefijo (`Captura_v2_`, `Form_aIsoConHora`, `Modelo_`, `Utl_`, …) | públicas por compatibilidad con la Web App / paneles existentes; se conservan inventariadas | — |

## Añadidos v255

| RPC | Rol |
|-----|-----|
| `api_formWorkerEjecutarAhora` | Ejecuta el worker manualmente desde admin; **delega** en `Form_worker()` sin bypass de lock. |
| `Form_operativoReparar` | Reparación idempotente del canal (dry-run por defecto); nunca borra respuestas. |
| `WebApp_verificarRecepcion` | Consulta el ACK de un `CLIENT_REQUEST_ID` (RECIBIDO / EN_PROCESO / NO_ENCONTRADO); sin PII. |

## Garantías verificadas

- `tests/rpc_public_surface_v255.mjs`: superficie == allowlist; añadidos v255
  presentes; el receptor durable no referencia `Session`/`getActiveUser`/token.
- `tests/seguridad_rpc_allowlist_vNEXT.mjs`: críticos internos privados y
  legacy retirado.
- `tests/seguridad_webapp_capacidades_vNEXT.mjs`: falla si se reintroduce un
  gate de token en el acceso (DEC-102).

## Cómo cambiar la superficie

1. Añadir/retirar la función en el código.
2. Actualizar `tests/rpc_public_allowlist.json` **en el mismo cambio**,
   justificando el porqué en el mensaje de commit.
3. Si es interna, terminarla en `_` en vez de tocar la allowlist.
4. Ejecutar `node tests/rpc_public_surface_v255.mjs` y
   `node tests/seguridad_webapp_capacidades_vNEXT.mjs`.
