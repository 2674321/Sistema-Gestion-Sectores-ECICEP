# Informe de Bugs E2E — S10-FIX + POST-RELEASE + S10-FIX.3

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

En la pase E2E del release S10-FIX.3 (S12) se detectó el **BUG-E2E-003**
(estructural, vistas `SECTOR_*`): la fórmula de EDAD mostraba `#ERROR!` y las
columnas se percibían corridas desde `FECHA_NACIMIENTO`/`EDAD`. Auditada la fase
S10-FIX se determinó la causa: (1) `Utl_formulaEdad` mezclaba separadores `;` y
`,`, lo que produce error de parseo de fórmula (`#ERROR!`) en cualquier locale;
(2) el esquema canónico `COLUMNAS_SECTOR_VISTA` pasó de 15 a 16 columnas (se
añadió `FECHA_NACIMIENTO` en S7, commit f272ad4) y ninguna ruta migraba los
encabezados de hojas `SECTOR_*` existentes (el refresco de vistas escribe datos
sin tocar encabezados; `Modelo_crearEstructura` dejaba la rama divergente a HVis;
HVis no inserta columnas). Corrección en S10-FIX.3: fórmula con separador único
`;` y migración **explícita e idempotente** por nombre
(`Modelo_alinearVistasSectoriales`) enganchada en `Actualizar sistema` y en
`Modelo_crearEstructura`. Cierre formal pendiente del E2E real.

La fase POST-RELEASE (autorizada por el usuario) implementó las observaciones de
la vista REM (E11): **dropdown de censo** («Todos los pacientes» / «Solo con
actividad», nuevo parámetro `actividad` de `api_remVista`) y **barra de progreso**
durante el cálculo, con botón «Consultar» bloqueado mientras corre la RPC.

Referencias del release:

| Ítem | Valor |
|---|---|
| Release (Git) | `37d8bd7` (base) → `70af819`/`dc879b3` (S10-FIX) → POST-RELEASE → S10-FIX.3 (BUG-E2E-003) |
| Tests | 749/749 (S10-FIX) → **751/751** (núcleo 503 + 2 REMV) → **534/534 núcleo (S10-FIX.3) + 50/50 aceptación + 36/36 contrato V2** |
| Deployment operativo | `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` @94 → @95 (fix 002) → @97 (POST-RELEASE) → @100 (S10-FIX.3) |
| URL /exec | `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec` |

Cierre del BUG-E2E-003 (CERRAR solo con evidencia del E2E real): encabezados de
`SECTOR_*` con las 16 columnas canónicas (FECHA_NACIMIENTO → EDAD → TELEFONOS →
RUT_DV_VALIDO), EDAD sin `#ERROR!`, sin datos modificados/duplicados, `Actualizar`
sigue siendo solo derivados, `/exec` operativo.

## Registro E2E S10-FIX-E2E (2026-09-08) — avance del cierre

La pase real **avanzó** con la corrección activa, pero el cierre formal queda
pendiente de E7/E6/E9 (idempotencia, conteos, /exec visual). Evidencia del usuario
sobre el entorno operativo (sin copiar datos personales):

| Ítem | Evidencia |
|---|---|
| Estado previo (E2) | Las 3 hojas SECTOR_* mostraban encabezados de **15 columnas** (sin FECHA_NACIMIENTO) — esquema antiguo antes de Actualizar |
| Estado post-Actualizar (E3+E4) | Encabezados **16 columnas canónicas** (FECHA_NACIMIENTO idx4, EDAD idx5, TELEFONOS idx6, RUT_DV_VALIDO idx7), coincidiendo con `COLUMNAS_SECTOR_VISTA`. Datos alineados: TELEFONOS con teléfonos, RUT_DV_VALIDO con TRUE/FALSE, FECHA_INGRESO con fechas, ULTIMO_EVENTO con etiquetas |
| E5 (muestra) | EDAD **vacía** en filas sin FECHA_NACIMIENTO (correcto); **ningún `#ERROR!`**; FECHA_NACIMIENTO vacía en esas filas |
| Durante E3 | «el cero se convirtió en una fecha de nacimiento» → interpretado como **transitorio de la migración**: `Modelo_reordenarFilaVista` remapea por los nombres de encabezados viejos sobre datos ya-alineados a 16 (corrimiento momentáneo) que el refresco posterior regeneró desde PACIENTES a su estado correcto |
| Pendiente de confirmar (usuario) | E7 (2ª ejecución idempotente → mismas 16 columnas/valores), E6 (conteos pre/post: pacientes, filas, eventos, duplicados), E8 (Actualizar no abrió Instalador), E9 visual (/exec: profesionales + botón) |

Diagnóstico refinado: la hipótesis «código no activo» queda **refutada** (encabezados
16 = corrió el código @101 con la migración). La anomalía 0→fecha es transitoria,
sin pérdida de datos y corregida por el refresco desde la fuente; queda como
**mejora opcional** para S10-FIX.4 (reparar solo encabezados y regenerar desde
PACIENTES/EVENTOS, sin remapear filas por nombre).

## Registro de bugs

| ID | Capa | Severidad | Síntoma | Causa | Corrección | Test | E2E | Estado |
| -- | ---- | --------- | ------- | ----- | ---------- | ---- | --- | ------ |
| BUG-E2E-002 | FRONTEND (+ RPC) | CRÍTICO | Los dropdowns de profesional no cargan; `PROFESIONAL` es obligatorio → ninguna captura puede enviarse | La consolidación S8 de las 3 RPC en `WebApp_estadoInicial` eliminó las llamadas `_poblarDropdowns()` (success y failure) y cambió el catálogo de strings (contrato `api_profesionalesCatalogo`) a objetos | Restaurar `_poblarDropdowns()` en ambos handlers; nuevo `WebApp_profesionalesDropdown()` (solo activos, nombres canónicos string) | H1–H3 en `tests/captura_ui_payload_v2.mjs` (fallan en baseline, pasan con fix) | OK — E4 repetido post-fix: profesionales cargan (TENS/Enfermera/o) y captura completa (RECIBIDO Cp2-740b509e…) | CERRADO ✅ |
| BUG-E2E-001 | FRONTEND / VALIDACIÓN | BAJO | Al cargar /exec solo se ve el campo RUT (las secciones se pintan tras la RPC); usuario podría intentar enviar solo RUT | El fieldset RUT es el único siempre visible por defecto y el resto de secciones parten `hidden` (solo visibles tras `WebApp_estadoInicial` success/failure) | POST-RELEASE: `pintarCampos()/actualizarLimpiar()` se ejecutan al init con el esquema fallback, antes de la RPC; los handlers la repiten (idempotente). El envío solo-RUT ya lo bloqueaban cliente y servidor (CAMPO_INVALIDO, sin persistencia) | Cubierto por validación H1–H3 reutilizada (el init no rompe la regresión del dropdown) | Verificación visual E1 pendiente del usuario (@97) | CERRADO (corregido en @97) — confirmación visual pendiente |
| BUG-E2E-003 | BACKEND / VISUALIZACIÓN | MEDIO | En las vistas `SECTOR_*`, EDAD muestra `#ERROR!` y las columnas se perciben corridas desde `FECHA_NACIMIENTO`/`EDAD` (la fórmula de edad aparece bajo «TELEFONOS» y RUT_DV con números de teléfono) | (1) `Utl_formulaEdad` mezclaba separadores `;` y `,` → fórmula inválida (`#ERROR!` de parseo) en cualquier locale; (2) `COLUMNAS_SECTOR_VISTA` pasó 15→16 columnas (S7, f272ad4) y ninguna ruta migraba encabezados de `SECTOR_*` existentes (refresco no toca encabezados; `crearEstructura` remitía a HVis; HVis no inserta columnas) | (1) `Utl_formulaEdad` con separador único `;` (estrategia del proyecto); (2) migración explícita e idempotente `Modelo_alinearVistaSector`/`Modelo_alinearVistasSectoriales` (por nombre via `COLUMNAS_SECTOR_VISTA`, solo SECTOR_*, sin append/insert) enganchada en `UI_actualizarTodo` y en `Modelo_crearEstructura` | T1–T13 en `src/10_Pruebas.js` (`_pruebas_s10fix_esquema`) + OPT B2 reforzado; baterías: 534/534 núcleo, 50/50 aceptación, 36/36 contrato V2 | E2E real (2026-09-08): encabezados 16 canónicos post-Actualizar, datos alineados (TELEFONOS/RUT_DV_VALIDO), EDAD vacía sin `#ERROR!`; pendiente E7/E6/E9 para cierre formal | EN VALIDACIÓN FINAL (fix activo; cierre pend. E7 idempotencia + E6 conteos + E9 /exec) |
| BUG-E2E-004 | BACKEND / MIGRACIÓN | BAJO | Tras `Actualizar`, de forma TRANSITORIA un valor apareció desplazado («0 → fecha de nacimiento») durante la migración | `Modelo_reordenarFilaVista` remapea filas por los nombres de encabezados viejos; sobre datos ya alineados a 16 columnas el remapeo intermedio desfasa valores. El refresco posterior desde PACIENTES (vistas derivadas) regenera el estado correcto: sin pérdida ni persistencia | Sin código (mejora opcional si se realiza S10-FIX.4): alineación que repare encabezados y regenere desde PACIENTES/EVENTOS sin remapear filas por nombre | Cobertura conceptual ya en T1–T13 | Transitorio, corregido por el refresco; sin impacto de datos | ABIERTO (no bloqueante) — mejora opcional |

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