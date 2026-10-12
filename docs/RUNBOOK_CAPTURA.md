# Runbook Captura — ECICEP

Guía operativa del canal de captura (`CapturaWeb → WebApp_capturarRecibirDurable
→ FormResponse.submit() → Form_worker_ → Captura V2`). **Normativo de operación**,
no de contrato; el contrato es `docs/CONTRATO_CAPTURA_V2.md`.

Regla base: la Web App es el único canal de captura; Google Forms es la cola
durable interna. Nunca se entrega la URL del Form al usuario.

Estados de una captura (no confundir `clientRequestId` con `responseId` ni con
`captureId`; ver `docs/OPERACION_TRANSPORTE_DURABLE.md`):

```text
RECIBIDO   → el Form aceptó la respuesta (responseId existe). Aún no procesado.
EN_PROCESO → el worker tomó la respuesta y la está resolviendo.
PROCESADO  → entregada al pipeline clínico y clasificada.
INCIERTO   → no se pudo confirmar si el Form aceptó la respuesta.
NO_ENCONTRADO → no hay respuesta para ese clientRequestId.
```

---

## 1. ACK incierto (el usuario no sabe si se recibió)

Síntoma: en la UI aparece "Recepción incierta — verifica antes de reintentar" o
la respuesta tardó más de 60 s.

1. El usuario pulsa **Verificar recepción** (`WebApp_verificarRecepcion`).
2. La respuesta es una de: `RECIBIDO`, `EN_PROCESO`, `NO_ENCONTRADO`.
3. `RECIBIDO`/`EN_PROCESO` → **no reintentar**; ya está en la cola.
4. `NO_ENCONTRADO` → esperar unos segundos (tránsito) y reintentar una vez; si
   persiste, usar el mismo formulario (el `clientRequestId` se conserva en
   `sessionStorage` mientras la pestaña siga abierta).

El índice rápido vive en `CacheService`:
`FORM_REQ:<clientRequestId>` con estados `RESERVED:<ts>` (TTL 120 s) y
`RECEIVED:<responseId>` (TTL 6 h). Si la caché expira, `Form_worker_` y
`WebApp_verificarRecepcion` escanean solo respuestas recientes (≤ 6 h) y
repueblan la caché.

La UI mantiene una única máquina `IDLE → SENDING → UNCERTAIN/RECEIVED`
(`ENVIO`); no reintroducir el segundo sistema de timeout.

---

## 2. Worker detenido o atrasado

Síntoma: `Form_saludOperativa_()` reporta `WORKER_TRIGGER_AUSENTE` o
`BACKLOG_PENDIENTE`; `triggerWorker === 0`.

1. Diagnóstico sin efectos: `Form_operativoDiagnosticar_()` / `Form_operativoEstado_()`.
2. Reparación (dry-run por defecto):
   ```js
   Form_operativoReparar_({ repairTriggers: true, dryRun: true })  // simular
   Form_operativoReparar_({ repairTriggers: true, dryRun: false }) // aplicar
   ```
   Si no existe trigger de `Form_worker_`, crea uno `everyMinutes(5)`.
3. Ejecución manual de un lote: `api_formWorkerEjecutarAhora()` (delega en
   `Form_worker_`, sin bypass de dedupe).
4. El worker cuenta elegibles reales, no respuestas crudas; `MAX_POR_CORRIDA`
   limita elegibles por corrida (no respuestas ya procesadas).

---

## 3. Backlog creciente

Síntoma: `Form_backlogResumen_()` crece; alerta `OLDEST_PENDING_EXCEDIDO`
(`SALUD.OLDEST_PENDING_MAX_MIN = 180`).

1. Leer `Form_saludOperativa_()`: alertas `BACKLOG_PENDIENTE`,
   `OLDEST_PENDING_EXCEDIDO`, `WORKER_TRIGGER_AUSENTE`.
2. Confirmar worker activo (sección 2) y revisar `RECHAZADO_EN_ADAPTADOR` con
   `api_formWorkerEjecutarAhora()` repetido hasta drenar.
3. Circuit breaker: tras `PENALIZAR_TRIGGER_FALLIDOS = 3` fallos de trigger
   consecutivos, el circuit abre (`CIRCUIT`) y el worker deja de reintentar
   agresivamente; revisar la causa antes de forzar.

---

## 4. Google Form caído / no accesible

Síntoma: `Form_operativoEstado_()` con `error` en `info`, o
`FORM_NO_ACCESIBLE` en reconciliación.

1. `Form_operativoReparar_({ dryRun: true })` para ver acciones propuestas.
2. La cola es durable: las capturas web ya aceptadas quedan en
   `FORM_RESPUESTAS`; el worker las drena cuando el Form vuelve.
3. Si el Form no se puede abrir, **no** recrear uno nuevo sin decidir: consultar
   `Form_operativoInstalar_` (adopta o crea un único Form) y revisar dependencias.
4. No se pierde ni se borra ninguna respuesta durante la contingencia.

---

## 5. Spreadsheet caído / no accesible

1. El `FormResponse.submit()` puede completar aunque Sheets falle; la respuesta
   queda en el Form.
2. Cuando Sheets vuelva, `Form_reconciliarTransporte_({ dryRun: true })`
   (siempre read-only) lista `nuevos`, `yaEnCola`, `fallidos`.
3. `Form_worker_()` reencola lo `SIN_PROCESAR`. La reconciliación nunca repara
   por sí sola: la reparación es `Form_operativoReparar_()`.

---

## 6. Schema drift (Form vs. esquema canónico)

Síntoma: `INSTALL_SCHEMA_DRIFT` / receptor detecta columnas o items faltantes.
`GOOGLE_FORM_SCHEMA_VERSION` menor que el esperado.

1. `Form_operativoDiagnosticar_()` → detalle de drift.
2. Dry-run: `Form_operativoReparar_({ repairPropiedades: true, dryRun: true })`.
3. Aplicar: `Form_operativoReparar_({ repairPropiedades: true, dryRun: false })`
   reconstruye `GOOGLE_FORM_CANONICAL_ITEM_MAP` y asegura columnas de transporte.
4. El receivador de schema drift del worker procesa estas respuestas sin pérdida.

---

## 7. Permisos del deployer / publicación

1. La Web App concede siempre acceso (DEC-102): el token es trazabilidad, no
   puerta. Un fallo del motor se reporta como fallo del motor.
2. Tras cualquier cambio de código: `clasp push --force` y republicar la versión
   sobre el **deployment operativo existente** (`clasp deploy --deploymentId <ID>`).
   No crear deployments por rutina.
3. Antes de tocar el acceso: `node tests/seguridad_webapp_capacidades_vNEXT.mjs`.

---

## 8. Reparación segura (`Form_operativoReparar_`)

Contrato de reparación (M04):

- `dryRun` por defecto `true` (nunca aplica sin pedirlo explícitamente).
- Acciones conmutables: `repairColumnas`, `repairTriggers`,
  `repairCatalogos`, `repairPropiedades`.
- Salida: `{ ok, dryRun, formId, acciones:[{accion, estado, detalle}] }`.
- **Nunca** borra respuestas ni toca pacientes/eventos/historial clínico.
- La reconciliación (`Form_reconciliarTransporte_`) es **siempre read-only**;
  toda escritura pasa por esta función separada.

---

## 9. Rollback

1. Código: restaurar la versión previa del proyecto Apps Script y
   `clasp deploy --deploymentId <ID>` sobre el mismo deployment operativo.
2. Contrato de datos: no hay migración destructiva; `FORM_RESPUESTAS` conserva
   las respuestas y columnas de transporte (`TRANSPORTE_ERROR`,
   `CLASIFICACION`). Un rollback no borra filas.
3. Trigger: si el rollback cambia el handler del worker, reparar con
   `Form_operativoReparar_({ repairTriggers: true, dryRun: false })`.
4. Verificar post-rollback: `Form_saludOperativa_()`, `WebApp_verificarRecepcion`
   y un envío de prueba de extremo a extremo.

---

## 10. Verificación post-incidente

1. `Form_saludOperativa_()` sin alertas (`WORKER_TRIGGER_AUSENTE`,
   `BACKLOG_PENDIENTE`, `OLDEST_PENDING_EXCEDIDO`).
2. `Form_operativoEstado_()`: `triggerOnFormSubmit === 1`, `triggerWorker >= 1`,
   `schemaVersion` esperada.
3. Un envío de prueba: `NO_ENCONTRADO → RECIBIDO → PROCESADO` con el mismo
   `clientRequestId`.
