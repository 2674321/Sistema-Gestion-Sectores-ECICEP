# Informe de Bugs E2E — S10-FIX

Registro histórico de errores reales detectados durante el uso del sistema
publicado (después del release). Ningún error se considera corregido sin:

- reproducción;
- causa determinada;
- corrección mínima;
- test de regresión que fallara antes;
- batería completa verde;
- deploy;
- E2E original repetido.

## Estado actual del registro

Durante la primera pase del E2E real (GO-LIVE VALIDATION, E1–E4) se
registraron dos problemas. El **BUG-E2E-002** (crítico, bloqueaba la captura)
fue corregido, protegido con test de regresión (H1–H3), publicado (@95) y
**validado por E2E real repetido** (E4 completo): se cierra como CERRADO. El
**BUG-E2E-001** queda como observación UX de baja severidad no bloqueante.
La vista REM (E11) generó observaciones de mejora registradas como
POST-RELEASE. Quedan por ejecutar E9 (error controlado), E10 (retry) y
E12 (limpieza de datos de prueba).

Referencias del release:

| Ítem | Valor |
|---|---|
| Release (Git) | `37d8bd7` |
| Tests | 749/749 (núcleo 501 + UI payload 19) |
| Deployment operativo | `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` @94 (→ @95 tras fijar) |
| URL /exec | `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec` |

## Registro de bugs

| ID | Capa | Severidad | Síntoma | Causa | Corrección | Test | E2E | Estado |
| -- | ---- | --------- | ------- | ----- | ---------- | ---- | --- | ------ |
| BUG-E2E-002 | FRONTEND (+ RPC) | CRÍTICO | Los dropdowns de profesional no cargan; `PROFESIONAL` es obligatorio → ninguna captura puede enviarse | La consolidación S8 de las 3 RPC en `WebApp_estadoInicial` eliminó las llamadas `_poblarDropdowns()` (success y failure) y cambió el catálogo de strings (contrato `api_profesionalesCatalogo`) a objetos | Restaurar `_poblarDropdowns()` en ambos handlers; nuevo `WebApp_profesionalesDropdown()` (solo activos, nombres canónicos string) | H1–H3 en `tests/captura_ui_payload_v2.mjs` (fallan en baseline, pasan con fix) | OK — E4 repetido post-fix: profesionales cargan (TENS/Enfermera/o) y captura completa (RECIBIDO Cp2-740b509e…) | CERRADO ✅ |
| BUG-E2E-001 | FRONTEND / VALIDACIÓN | BAJO | Al cargar /exec solo se ve el campo RUT (las secciones se pintan tras la RPC); usuario podría intentar enviar solo RUT | El fieldset RUT es el único siempre visible por defecto y el resto de secciones parten `hidden` (solo visibles tras `WebApp_estadoInicial` success/failure) | Sin cambio de código: un envío con solo RUT lo bloquea cliente (`camposRequeridos` NUEVO_INGRESO: NOMBRE/FECHA_NACIMIENTO/SECTOR/FECHA_INGRESO/PROFESIONAL) y servidor (MATRIZ REQ nuevoIngreso) → error CAMPO_INVALIDO, sin persistencia | Ya cubierto por validación (sin test nuevo) | OK en la repetición (el usuario completó todos los campos sin bloqueo) | ABIERTO (observación UX, no bloqueante) — evaluar mejora visual en POST-RELEASE |

## Observaciones E2E post-fix (E11 / REM)

Registradas como trabajo pendiente POST-RELEASE (no son errores de captura y S10-FIX
prohíbe abrir funcionalidad nueva; no se implementaron):

1. **REM — filtro del censo**: la vista al vuelo no ofrece seleccionar si se
   generan *todos* los usuarios o solo los que tuvieron actividad. Requiere
   decidir contrato (dropdown) → pendiente para fase posterior.
2. **REM — feedback de carga**: la vista de trabajo del REM demora y carece de
   barra/spinner de progreso. Mejora de UI → pendiente para fase posterior.
3. Estado de la prueba E2E: E1→E8 OK (el E2E original del bug 002 se repitió con
   éxito). Pendientes: confirmar que el envío doble no dejó fila duplicada en
   EVENTOS (se mostró una sola, EV-0001), E9 (error controlado), E10 (retry),
   E12 (limpieza de datos de prueba).

## Clasificación de capas (S10-FIX.2)

1. URL / DEPLOYMENT
2. FRONTEND
3. RPC
4. VALIDACIÓN
5. BACKEND
6. FORM_RESPUESTAS
7. PROCESAMIENTO
8. IDENTIFICACIÓN
9. PACIENTES
10. EVENTOS
11. REM
12. PERMISOS
13. DATOS
14. CONCURRENCIA
15. DOCUMENTACIÓN