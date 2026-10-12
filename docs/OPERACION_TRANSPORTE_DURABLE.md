# Operación — Transporte Durable

Contrato operativo de la cola durable de captura. Complementa
`docs/CONTRATO_CAPTURA_V2.md` (normativo) y el `RUNBOOK_CAPTURA.md`.

## RECIBIDO ≠ PROCESADO

`RECIBIDO` solo significa que Google Forms aceptó la respuesta
(`FormResponse.submit()` devolvió un `responseId`). El pipeline clínico todavía
no la tocó. `PROCESADO` significa que `Form_worker_` la entregó a `Captura V2` y
fue clasificada.

Consecuencia práctica: un `RECIBIDO` sin `PROCESADO` **no** es un error; es
trabajo pendiente del worker.

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
- `WebApp_verificarRecepcion(clientRequestId)` devuelve, sin PII:
  `{ok:true, estado:"RECIBIDO"|"EN_PROCESO"|"NO_ENCONTRADO"}`.
