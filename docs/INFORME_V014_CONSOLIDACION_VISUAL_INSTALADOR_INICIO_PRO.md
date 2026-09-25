# INFORME V0.14 — Consolidación visual + instalador único + INICIO

> Alcance: arquitectura visual (P0), instalador/presentación (P1), INICIO y
> formatos (P2). Product version `0.14.0` (schema 2, captura V4, sin MIG-003).
> La versión de producto coincide ahora con la era del layout `V014` de la
> portada (antes: producto `0.13.0` + layout `v0.14.0`, ver DEC-087); ver DEC-089.

## Qué cambió (resumen)

- **Motor único de presentación**: la fase `diseno` (`Presentacion_ejecutarPaso_`)
  es la única fase principal visual. Las ex-fases `visual` e `inicio` salieron de
  `INSTALAR_ETAPAS` (19 → 17 etapas); `Instalar_pVisual` / `Instalar_pInicio`
  quedan como wrappers deprecated que delegan en las subtareas del plan.
- **Subtarea por hoja absorbida**: `Presentacion_formatearHoja_` reconcilia la
  estructura superior (`HVis_reconciliarHoja`, diagnose-first) + anchos +
  formatos + semántica. Cero pipelines paralelos.
- **Menú Sistema con 2 items**: `Actualizar sistema` + `Instalar / reparar`.
  `UI_reconstruirInicio` / `UI_repararPresentacion` siguen como wrappers
  internos deprecated. `onOpen` NUNCA escribe INICIO (solo menús + toast).
- **Actualizar vía motor**: `Act_actualizarSistema` marca dirty flags selectivos
  (estructura → ESTRUCTURA+VISUAL+VALIDACIONES; datos/vistas → INICIO) e invoca
  `Libro_mantenimiento_`. Datos OK + presentación pendiente →
  `{ok:true, advertencias:['PRESENTACION_PENDIENTE']}` (nunca error).
- **Modelo reducido**: `Modelo_aplicarDiseno` ya no aplica banding/header/freeze
  en hojas visuales (conserva tab, visibilidad, orden + gridlines/altura-dato con
  fast-path, sin otro owner aún).
- **Modos**: `PRESENTACION_MODO` {AUTO, REPARAR, FORZAR_INICIO, PROFUNDO};
  `api_instalarPaso(id, acceso, ejecucion, opciones)` backward-compatible
  (`modoPresentacion`/`forzarInicio`/`diagnosticoVisualProfundo` + legacy
  `forzarPresentacion`).
- **Instalador HTML**: diálogo 760×720, etapas agrupadas en 7 bloques,
  sección avanzada colapsable (forzar INICIO + diagnóstico profundo), subtarea y
  progreso real por cursor, cierre SISTEMA/PRESENTACIÓN separado (ya existía y se
  conserva).
- **Formatos**: `Formato_especificacionCampo_` resuelve `vertical` (MIDDLE),
  `wrapStrategy` (WRAP/CLIP/OVERFLOW, compat con `wrap`), `superficie`
  (override; vacío = contextual por hoja), `fontSize`/`fontWeight` opcionales.
  `NOTA_SISTEMA` 9pt. Semántica aplica vertical + estrategia + fontSize con
  fast-path. Anchos/valores vigentes conservados (baseline §61 pendiente de
  validación en hoja real).
- **INICIO**: sin copy provisional (subtítulo canónico + etiqueta operativa;
  el escritor pinta el resumen real), snapshot con `g1/g2/g3` en el mismo
  recorrido, tests de presupuesto en forma límite-máximo (§29).
- **Fingerprints**: presentación `pp014|` + prop `ECICEP_PRESENTACION_LAYOUT_V014`
  (fuerzan UNA reparación completa al actualizar; INICIO conserva su contrato
  `PANEL_OPERATIVO_V014`).

## Owner map (propiedad → owner → archivo)

| Propiedad | Owner | Archivo |
|---|---|---|
| plan y subtareas de presentación | Presentación (motor único) | `src/35_Presentacion.js` |
| modos AUTO/REPARAR/FORZAR_INICIO/PROFUNDO | Presentación | `src/35_Presentacion.js` |
| estructura superior (título/secciones/header/merges fila 1-2) | Presentación/HVis | `src/22_HojasVisual.js` (vía `formato:*`) |
| freeze / tab color / orden / visibilidad | Presentación (+ `Hojas_colorPestana_`/`Hojas_ordenObjetivo_`) | `src/35_Presentacion.js`, `src/34_LibroUX.js` |
| ancho / number format / alineación / vertical / wrapStrategy | `FORMATO_CAMPOS` + Presentación | `src/00_Config.js`, `src/06_Modelo.js`, `src/34_LibroUX.js` |
| superficie contextual (editable/derivado/sistema/técnico) | `HOJAS_UX.familia` + Presentación | `src/34_LibroUX.js` |
| validaciones puertas INGRESO_* | `Modelo_validarIngresos` (etapa `validaciones`) | `src/06_Modelo.js` |
| validaciones complementarias | Presentación (`validaciones:extras`) | `src/35_Presentacion.js` |
| conditional rules (builder único) | helper canónico + Presentación | `src/17_Hojas.js`, `src/35_Presentacion.js` |
| notes | helper canónico + Presentación | `src/34_LibroUX.js` |
| INICIO (canvas, snapshot, verificación) | `Inicio_*` (subtarea `inicio` del motor) | `src/34_LibroUX.js` |
| protecciones / filtros / ocultas | Presentación (`accesorios`) | `src/35_Presentacion.js`, `src/17_Hojas.js` |
| dirty flags / mantenimiento selectivo | `Libro_*` | `src/34_LibroUX.js` |
| gridlines + altura de datos (visual, transitorio) | `Modelo_aplicarDiseno` (fast-path) | `src/06_Modelo.js` |
| retoques puntuales post-ingreso | callers de dominio (no libro completo) | `src/12_Ingresos.js`, `src/24_Formulario.js` |

## Código retirado / reclasificado

- `INSTALAR_ETAPAS`: eliminadas `visual`, `inicio` (absorbidas por `diseno`).
- `Instalar_pVisual`, `Instalar_pInicio`: → wrappers deprecated sobre subtareas.
- `UI_reconstruirInicio`, `UI_repararPresentacion`: → wrappers internos
  deprecated (fuera del menú).
- Bloque visual paralelo de `Act_actualizarSistema` (secciones, formato,
  condicional, validaciones, diseño, inicio, RUT, mantenimiento duplicado):
  → dirty flags + `Libro_mantenimiento_` + advertencias.
- `HVis_aplicarTodasLasSecciones`: → `@deprecated` (sin callers en `src`;
  el motor usa `HVis_reconciliarHoja` por hoja).
- Banding de `Modelo_aplicarDiseno` en hojas visuales: retirado (preferencia
  `banda:false`; EVENTOS y técnicas conservan banding).
- Copy provisional INICIO (`en preparación` ×2): eliminado.
- Tests actualizados por cambio intencional de contrato (menú 2 items, etapas
  17, Actualizar-advertencia, versiones, fingerprint `pp014`, merges en forma
  presupuesto). Ningún umbral se bajó para conseguir verde.

## Medición local (reproducible con `node tools/verificar.mjs`)

- 49 suites, 0 fallos; núcleo `ejecutar_local` 673/673.
- Nuevas: `arquitectura_visual_v014` 7/7, `formato_celdas_v014` 7/7 (49 campos),
  `inicio_snapshot_v014` 4/4 (G1/G2/G3, sin PII, sin fórmulas).
- INICIO medido: 251 RPC de servidor (techo test 260), 72 merges del panel + 2
  del marco, 1 `setColumnWidths`, alturas por tramos, setters agrupados ≤150.
- `git diff --check` limpio.

## PARTIAL declarado (no escondido)

1. **INICIO PRO gran formato (A1:AJ50, ≤40 merges, ≤190 RPC)**: NO implementado
   en esta pasada. Causa: el constructor vigente ya emite 251 RPC / 72 merges y
   tiene historial de timeout; ampliar el canvas sin validación en hoja real
   violaría §27. Lo entregado (copy real, snapshot G, budgets como límite
   máximo, matrices documentadas como vía) es la base. Requiere fase con Sheets
   real: rediseño de cards con matrices + reverificación + medición.
2. **Validación en Google Sheets real** (instalar/reparar, 1.ª/2.ª ejecución,
   paridad PASS, convergencia 0 divergencias): pendiente — este host no dispone
   de sesión Google autorizada (`clasp` sin credenciales). Tras publicar,
   ejecutar con `Forzar reconstrucción de INICIO` y luego sin forzar.
3. **Afinos §61** (anchos 118/240/…, OBSERVACIONES CLIP, alturas 24, freeze
   3/2–3/3): conservados los valores vigentes; requieren validación visual real.
4. **Publicación** (`clasp push`, deploy operativo, smoke `/exec`): pendiente de
   credenciales; commit y push de git según disponibilidad (ver estado final).

## Riesgos residuales

- Primer `Instalar / reparar` post-actualización ejecuta reparación completa
  (fingerprint `pp014` + dirty ESTRUCTURA/VISUAL/VALIDACIONES): es lo esperado,
  una sola vez, reanudable por RPC.
- `HVis_repararDiferencias_` sin callers: candidata a eliminación en limpieza
  futura (conservada por ahora; no ambigua: no la llama ningún flujo).
- Altura de datos y gridlines visuales aún en `Modelo_aplicarDiseno`: migrar al
  motor cuando exista owner (paso documentado, sin drift actual).
