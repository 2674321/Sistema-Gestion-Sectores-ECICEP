# Operación — Transporte Durable

Contrato operativo de la cola durable de captura. Complementa
`docs/CONTRATO_CAPTURA_V2.md` (normativo) y el `RUNBOOK_CAPTURA.md`.

> **v259 (DEC-114):** `FORM_RESPUESTAS` contiene tanto transporte actual como
> historia pre-Forms. Solo `CAPTURE_PROVIDER=GOOGLE_FORMS` pertenece al backlog
> vigente. El legado se marca `WEBAPP_LEGACY` + `LEGACY_PRE_FORMS`, se observa
> por separado y no se auto-reprocesa.

> **v258 (DEC-113):** el lease corto solo evita worker/worker. Cada entrega al
> pipeline clínico toma además `Ecicep_conLock_`, sin incluir lectura del Form,
> schema, extracción ni escritura del trailer. Fallo de LockService o contención
> produce `LOCK_NO_DISPONIBLE`/`SERVICIO_OCUPADO`, ambos reintentables y sin
> mutación. El trailer es gate común para las cuatro clasificaciones y su fallo
> conserva el candidato y detiene el cursor seguro.

> **Corregido por v256 (2026-10-13, DEC-111):** los errores por captura ya **no**
> viven en ScriptProperties (`GOOGLE_FORM_ERRORS|<captureId>` eliminado); el
> trailer de `FORM_RESPUESTAS` (`CLASIFICACION`/`TRANSPORTE_ERROR`) es
> autoritativo. Estado de cola ilegible ⇒ el worker activa circuito y no avanza
> (`QUEUE_STATE_READ_FAILED`). El worker usa un lease corto, no el `ScriptLock`
> durante el pipeline.

## RECIBIDO ≠ PROCESADO

`RECIBIDO` solo significa que Google Forms aceptó la respuesta
(`FormResponse.submit()` devolvió un `responseId`). El pipeline clínico todavía
no la tocó. `PROCESADO` significa que `Form_worker_` la entregó a `Captura V2` y
fue clasificada.

Consecuencia práctica: un `RECIBIDO` de `GOOGLE_FORMS` sin `PROCESADO` **no** es
un error; es trabajo pendiente del worker. Un `RECIBIDO` histórico sin provider
es deuda de reconciliación legacy, no trabajo elegible del worker moderno.

## Tres identificadores distintos

```text
clientRequestId  Lo genera la Web App (CR- + 16 bytes hex). Idempotencia de
                 transporte. Se conserva en sessionStorage mientras la pestaña
                 siga abierta para poder reintentar sin duplicar.
responseId       Lo asigna Google Forms al aceptar la respuesta. Es el ACK real.
captureId        Derivado determinista de (formId, responseId)
                 (CapturaIngress_captureId_). Es la clave en FORM_RESPUESTAS.
```

Un mismo dato nunca se identifica por `clientRequestId` en la base operativa; el
`clientRequestId` vive en el ítem canónico del Form y en el índice de caché.

## Índice rápido (CacheService)

```text
FORM_REQ:<clientRequestId> → RESERVED:<timestamp>   TTL 120 s
                           → RECEIVED:<responseId>  TTL 6 h
```

- `Form_requestIdReservar_(clientRequestId)` → reserva (check bajo `ScriptLock`,
  ≤ 500 ms, liberado **antes** de `FormResponse.submit()`).
- `Form_requestIdConfirmar_(clientRequestId, responseId)` → confirma y guarda el
  `responseId` para recuperar ACK perdidos.
- `Form_requestIdBuscar_(clientRequestId)` → consulta el índice.
- `Form_requestIdRecuperarRespuesta_` — si la caché falla o expiró, escanea solo
  respuestas recientes (≤ 6 h) buscando el `CLIENT_REQUEST_ID`, recupera el
  `responseId` y repuebla la caché.

## Puntos clave

- La Web App es el único canal de captura; el Form es transporte interno y su
  URL no se publica.
- La cola es durable: un fallo de Sheets no pierde respuestas; el worker las
  drena cuando el destino vuelve.
- Nunca se borran respuestas ni filas de cola; la reparación es aditiva.
- La migración legacy solo completa las seis columnas modernas, es dry-run por
  defecto, idempotente y no altera estados ni datos históricos.
- La salud presenta canal actual y legado en bloques separados; las fechas
  legacy no participan en `oldestPendingMin` actual.
- `WebApp_verificarRecepcion(clientRequestId)` devuelve, sin PII:
  `{ok:true, estado:"RECIBIDO"|"EN_PROCESO"|"NO_ENCONTRADO"}`.
