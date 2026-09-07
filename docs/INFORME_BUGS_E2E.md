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
registraron dos problemas. El segundo es **crítico** y bloquea la captura; fue
corregido y protegido con test de regresión (H1–H3). Queda pendiente repetir el
E2E original para cerrarlo (S10-FIX.20).

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
| BUG-E2E-002 | FRONTEND (+ RPC) | CRÍTICO | Los dropdowns de profesional no cargan; `PROFESIONAL` es obligatorio → ninguna captura puede enviarse | La consolidación S8 de las 3 RPC en `WebApp_estadoInicial` eliminó las llamadas `_poblarDropdowns()` (success y failure) y cambió el catálogo de strings (contrato `api_profesionalesCatalogo`) a objetos | Restaurar `_poblarDropdowns()` en ambos handlers; nuevo `WebApp_profesionalesDropdown()` (solo activos, nombres canónicos string) | H1–H3 en `tests/captura_ui_payload_v2.mjs` (fallan en baseline, pasan con fix) | PENDIENTE repetir E4 | CORREGIDO → pendiente validación E2E |
| BUG-E2E-001 | FRONTEND / VALIDACIÓN | BAJO | Al cargar /exec solo se ve el campo RUT (las secciones se pintan tras la RPC); usuario podría intentar enviar solo RUT | El fieldset RUT es el único siempre visible por defecto y el resto de secciones parten `hidden` (solo visibles tras `WebApp_estadoInicial` success/failure) | Sin cambio de código: un envío con solo RUT lo bloquea cliente (`camposRequeridos` NUEVO_INGRESO: NOMBRE/FECHA_NACIMIENTO/SECTOR/FECHA_INGRESO/PROFESIONAL) y servidor (MATRIZ REQ nuevoIngreso) → error CAMPO_INVALIDO, sin persistencia | Ya cubierto por validación (sin test nuevo) | PENDIENTE repetir E1 | ABIERTO (observación UX) — revisar tras E2E |

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