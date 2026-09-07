# Informe de Bugs E2E — S10-FIX + POST-RELEASE

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

Durante la primera pase del E2E real (GO-LIVE VALIDATION, E1–E11) se registraron
dos problemas y dos observaciones de mejora en REM. El **BUG-E2E-002** (crítico,
bloqueaba la captura) fue corregido, protegido con test de regresión (H1–H3),
publicado (@95) y **validado por E2E real repetido** (E4 completo): **CERRADO**.
El **BUG-E2E-001** (UX, no bloqueante) quedó atendido en la fase POST-RELEASE
(las secciones se pintan al instante con el esquema fallback antes de la RPC) y
se publica en @97; su cierre formal queda condicionado a la verificación visual
del usuario. E9 (error controlado) y E12 (limpieza de datos de prueba) fueron
ejecutados por el usuario con resultado **OK** y, en E8, **sin duplicación**.

La fase POST-RELEASE (autorizada por el usuario) implementó las observaciones de
la vista REM (E11): **dropdown de censo** («Todos los pacientes» / «Solo con
actividad», nuevo parámetro `actividad` de `api_remVista`) y **barra de progreso**
durante el cálculo, con botón «Consultar» bloqueado mientras corre la RPC.

Referencias del release:

| Ítem | Valor |
|---|---|
| Release (Git) | `37d8bd7` (base) → `70af819`/`dc879b3` (S10-FIX) → POST-RELEASE |
| Tests | 749/749 (S10-FIX) → **751/751** (núcleo 503 + 2 REMV) |
| Deployment operativo | `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` @94 → @95 (fix 002) → **@97 (POST-RELEASE)** |
| URL /exec | `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec` |

## Registro de bugs

| ID | Capa | Severidad | Síntoma | Causa | Corrección | Test | E2E | Estado |
| -- | ---- | --------- | ------- | ----- | ---------- | ---- | --- | ------ |
| BUG-E2E-002 | FRONTEND (+ RPC) | CRÍTICO | Los dropdowns de profesional no cargan; `PROFESIONAL` es obligatorio → ninguna captura puede enviarse | La consolidación S8 de las 3 RPC en `WebApp_estadoInicial` eliminó las llamadas `_poblarDropdowns()` (success y failure) y cambió el catálogo de strings (contrato `api_profesionalesCatalogo`) a objetos | Restaurar `_poblarDropdowns()` en ambos handlers; nuevo `WebApp_profesionalesDropdown()` (solo activos, nombres canónicos string) | H1–H3 en `tests/captura_ui_payload_v2.mjs` (fallan en baseline, pasan con fix) | OK — E4 repetido post-fix: profesionales cargan (TENS/Enfermera/o) y captura completa (RECIBIDO Cp2-740b509e…) | CERRADO ✅ |
| BUG-E2E-001 | FRONTEND / VALIDACIÓN | BAJO | Al cargar /exec solo se ve el campo RUT (las secciones se pintan tras la RPC); usuario podría intentar enviar solo RUT | El fieldset RUT es el único siempre visible por defecto y el resto de secciones parten `hidden` (solo visibles tras `WebApp_estadoInicial` success/failure) | POST-RELEASE: `pintarCampos()/actualizarLimpiar()` se ejecutan al init con el esquema fallback, antes de la RPC; los handlers la repiten (idempotente). El envío solo-RUT ya lo bloqueaban cliente y servidor (CAMPO_INVALIDO, sin persistencia) | Cubierto por validación H1–H3 reutilizada (el init no rompe la regresión del dropdown) | Verificación visual E1 pendiente del usuario (@97) | CERRADO (corregido en @97) — confirmación visual pendiente |

## Observaciones E2E (E11 / REM) — implementadas en POST-RELEASE

Durante la pase E2E se registraron dos mejoras de la vista REM (no eran errores de
captura y S10-FIX no podía abrir funcionalidad nueva). Ambas se implementaron en
la fase POST-RELEASE autorizada:

1. **REM — filtro del censo**: nuevo dropdown «Censo: Todos los pacientes / Solo
   con actividad» en `RemVista.html`. Contrato: `api_remVista(anio, mes, sector,
   modo, actividad)` → `Rem9_armarVistaDatos({...actividad})` →
   `Rem9_censoPacientes(..., soloActividad)`. El filtro excluye del censo a los
   pacientes sin eventos en el período (MES: del mes; GENERAL: histórico). El meta
   de la vista refleja el estado y se agrega una nota explicativa. Tests nuevos:
   2 casos REMV (MES y GENERAL) validan exclusión + compatibilidad del default.
2. **REM — feedback de carga**: barra de progreso indeterminada (`.prog`) durante
   el cálculo y botón «Consultar» deshabilitado mientras la RPC está en curso
   (restaurado en success/failure). Reemplaza el esqueleto estático.
3. Estado del E2E real: E1→E8 OK (E4 repetido post-fix, captura RECIBIDO sin
   duplicación en E8), **E9 OK** (error controlado), **E12 OK** (limpieza de datos
   de prueba). E10 (retry) no fue reportado por el usuario; sin impacto para GO.

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