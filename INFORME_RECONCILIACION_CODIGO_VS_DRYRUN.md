# Reconciliación de código real vs dry-run v254.4

| Hallazgo | Código anterior | Corrección | Test | Resultado |
|---|---|---|---|---|
| Radios vs dropdown | Cuatro `input[type=radio]` | Un `select#accion` con cuatro opciones y descripción dinámica | `webapp_dynamic_ui_v254.mjs` | PASS |
| Lock de 12 s | `tryLock(12000)` | `LOCK_WAIT_MS=750`; ocupado devuelve `DEFERRED_LOCK_BUSY` | `worker_backlog_v254.mjs` | PASS |
| Cursor tras retryable | Escritura dentro del bucle | Escritura única; se detiene antes del primer retryable; overlap 24 h | `worker_backlog_v254.mjs` | PASS |
| Creación accidental | ID vacío ejecutaba `FormApp.create` | Solo crea con `crearNuevo:true`; por defecto exige ID | `forms_installer_idempotence_v254.mjs` | PASS |
| `opciones.formId` | Ignorado | Prevalece sobre propiedad persistida y adopta el ID exacto | `forms_installer_idempotence_v254.mjs` | PASS |
| Pregunta de cierre | Ítem `Enviar respuesta` por sección | Cada `PageBreakItem` navega a `SUBMIT` | `forms_canonical_item_map_v254.mjs` | PASS |
| Mapa canónico | Solo itemId → campo por título | `GOOGLE_FORM_CANONICAL_ITEM_MAP`, clave → itemId | `forms_canonical_item_map_v254.mjs` | PASS |
| Acción global | Sin clave estable | `GLOBAL|ACCION` persistida y priorizada por itemId | `forms_canonical_item_map_v254.mjs` | PASS |
| Trigger submit | Tomaba lock, procesaba y movía cursor | Señal liviana sin mutación clínica, lock ni cursor | `webapp_durable_receiver_v254.mjs` | PASS |
| Identidad navegador | El browser fabricaba `captureId` | Browser usa `clientRequestId`; adaptador deriva `captureId` de Form/response | `captura_ui_payload_v2.mjs` | PASS |
| Preflight bloqueante | Nuevo ingreso esperaba consulta de duplicados | Todas las acciones llaman directamente a la recepción durable | `preflight_nonblocking_v254.mjs` | PASS |
| Campos de actualización | `TELEFONO_OBS` y `SALUD_MENTAL` no tenían ítem | Se añadieron al schema y al roundtrip | `forms_roundtrip_v254.mjs` | PASS |
| Comentario WebApp obsoleto | Declaraba Forms retirado y RPC antigua | Documenta CapturaWeb → Forms → worker → V2 | `architecture_docs_consistency_v254.mjs` | PASS |
| Tests declarativos | Algunas pruebas solo comprobaban presencia | Harness ejecuta instalador, receptor, respuestas, adaptador y worker reales | `no_placeholder_tests_v254.mjs` | PASS |

Producción permaneció intacta. La activación sigue siendo una operación futura y
controlada sobre el deployment existente.
