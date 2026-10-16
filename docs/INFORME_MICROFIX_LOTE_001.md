# Informe — Microauditoría continua LOTE 001

- **Fecha:** 2026-10-16
- **Rama base:** `hardening/v0.17.0-final` (SHA base `be8fb87`)
- **Rama de trabajo:** `codex/ecicep-microfix-lote-001`
- **Alcance:** detectar y corregir hasta 10 microerrores reales (P2/P3) con
  parche mínimo y una regresión reproducible por hallazgo.
- **Resultado:** **PASS** — 10/10 errores reales confirmados, 10/10 con regresión.
- **Restricciones respetadas:** sin datos de producción, sin `clasp push`, sin
  `clasp deploy`, sin cambios de trigger/permisos/deployment, sin PII en logs.

## Método

1. Barrido dirigido por dominio (§4 del protocolo) + verificación propia en
   código de cada candidato (evidencia → fallo previo → hipótesis única →
   parche mínimo → test → registro).
2. Causa raíz compartida ⇒ un solo MF (p. ej. color `HVis_mismosColor_` y
   `Hojas_colorearRutIngresos_` comparten MF-007).
3. Candidatos ambiguos o de diseño se descartan (ver §Descartados).

## Microfixes

| ID | Componente | Síntoma | Causa | Archivo:línea | Prueba | Estado |
|----|-----------|---------|-------|---------------|--------|--------|
| MF-001 | `Dash_calidadDatos_` | `rutInvalido`/`requiereRevision` subcontados | Comparaba `=== true/false` sin reconocer string `'TRUE'/'FALSE'` de hoja | `src/08_Dashboard.js:104-114` | `MF-001` | OK |
| MF-002 | `Ficha_prepararMutacion_` | Editar teléfono fuerza `RUT_DV_VALIDO=true` | `'RUT' in final` siempre verdadero (final = copia completa) | `src/31_Ficha.js:889` | `MF-002` | OK |
| MF-003 | `Ev_ultimoPorPaciente_` | Empate de fecha elige evento anterior | Tie-break por `Utl_texto_(Date)` (nombre de día) en vez de timestamp | `src/13_Eventos.js:135-141` | `MF-003` | OK |
| MF-004 | `Log_info_/warning_/error_` | Columna `DURACION_MS` vacía | Wrappers descartaban el 5.º arg `duracionMs` que sí pasan los callers | `src/09_Log.js:51-53` | `MF-004` | OK |
| MF-005 | `Aud_auditarConfig_` | `'días'` marcada como unidad inválida | Buscaba `'día'` sobre texto de-acentuado (`'dias'`) | `src/21_Auditoria.js:282-285` | `MF-005` | OK |
| MF-006 | `Instalar_pAmarillo_` | `TypeError` si la fuente devuelve null | `r.motivo` evaluado con `r` null | `src/20_Instalador.js:697` | `MF-006` | OK |
| MF-007 | `Hojas_colorearRutIngresos_` | Reescribe color siempre (pierde fast-path) | Comparación exacta `'#e3f3ea' === '#E3F3EA'` | `src/17_Hojas.js:482-490` | `MF-007` | OK |
| MF-008 | `Aud_auditarProfesionales_` | Inactivos reportados como inexistentes | `inexistentes` se calculaba solo contra el catálogo activo | `src/21_Auditoria.js:220-234` | `MF-008` | OK |
| MF-009 | `_centro_resumen_` | `estratPendiente` omite `G0`/`NSP` | Criterio `est===''‖est==='G'` ≠ criterio canónico `/^G[123]$/` | `src/07_UI.js:2208` | `MF-009` | OK |
| MF-010 | `api_configEliminar_` | Permite borrar claves secretas | Validaba solo `Config_estaProtegida_`, no `Config_esSecreto_` | `src/07_UI.js:693` | `MF-010` | OK |

### Detalle

- **MF-001** `_bool` local acepta `true/false` y `'TRUE'/'FALSE'`; cualquier otra
  forma ⇒ `null` (no cuenta). `sinRut`/`sinSector`/`estratPendiente` ya eran
  correctos.
- **MF-002** Se cambia `'RUT' in final` por `tocados.indexOf('RUT') !== -1`. Si
  RUT se edita, ya pasó `Norm_normalizarRut_.estado === 'OK'` ⇒ DV válido es
  correcto. `Ficha_aplicarMutacion_` escribe todo `final` (`Modelo_filaDesdeObjeto_`),
  por eso el bug tenía impacto real.
- **MF-003** Se añade `registroMs` (timestamp) al registro y se compara numéricamente
  en el empate; el campo `registro` visible se conserva.
- **MF-004** Los tres wrappers reenvían `duracionMs` a `Log_registrar_` (que ya lo
  soportaba). Callers afectados: `07_UI.js:248,1985`, `02_Normalizacion.js:1152`,
  `Webhook.js:170`, `20_Instalador.js:214`.
- **MF-005** `indexOf('día')` → `indexOf('dia')` sobre el texto ya de-acentuado.
- **MF-006** `motivo: (r && (r.motivo || r.linea)) || 'No se pudo cargar el sector amarillo'`.
- **MF-007** Fast-path usa `Utl_colorIgual_` (formato-insensible) y trata `''`
  (RUT vacío) como "no forzar reescritura".
- **MF-008** `inexistentes` se compara contra `catalogoCompleto` (activos +
  inactivos); un inactivo referenciado existe como referencia histórica.
- **MF-009** Criterio unificado a `!/^G[123]$/.test(est)` (igual que
  `Dash_calidadDatos_` e `Inicio_calcularMetricas_`).
- **MF-010** Guard `Config_estaProtegida_(k) || Config_esSecreto_(k)`, alineado
  con `api_configAgregar_` y `_config_set_`.

## Descartados (falsos positivos / ambiguos)

- `12_Ingresos.js:1653` `contar('DUPLICADO')` siempre 0: el valor no se registra
  como `'DUPLICADO'` (los posibles duplicados van a `'REQUIERE_REVISION'`);
  ambiguo, no parche pequeño.
- `24_Formulario.js:1744,1750` `!== undefined` vs truthiness: contrato del form
  ambiguo (`normalizado` siempre trae todas las claves).
- `Instalar_diagnosticar_` contadores (`hojasCorrectas` vs `seccionesPendientes`):
  miden cosas distintas, no es bug.
- `12_Ingresos.js:1356-1369,1531` FUENTE/captureId: limitación de diseño.
- `HVis_mismosColor_` (`22_HojasVisual.js:989`): misma causa raíz que MF-007 ⇒
  cuenta como uno solo.

## Verificación

- **Regresión nueva:** `tests/microauditoria_lote001_vNEXT.mjs` — **10/10 PASS**
  con el parche; **10/10 FAIL** contra el código previo (reproducibilidad probada
  con `git stash`).
- **Batería base (sin regresiones):**
  - `tests/ejecutar_local.mjs` → 679/679
  - `tests/aceptacion_formulario.mjs` → 50/50
  - `tests/contrato_captura_v2.mjs` → 36/36
  - `tests/validar_html.mjs` → 20/20
  - `tests/contrato_datos.mjs` → 38/38
  - `tests/regresiones_revision.mjs` → 48/48
- **Seguridad Web App** (se tocó `07_UI`):
  `tests/seguridad_webapp_capacidades_vNEXT.mjs` → PASS (captura pública +
  operador OPSESS).

## Archivos modificados

```
src/07_UI.js         (MF-009, MF-010)
src/08_Dashboard.js  (MF-001)
src/09_Log.js        (MF-004)
src/13_Eventos.js    (MF-003)
src/17_Hojas.js      (MF-007)
src/20_Instalador.js (MF-006)
src/21_Auditoria.js  (MF-005, MF-008)
src/31_Ficha.js      (MF-002)
tests/microauditoria_lote001_vNEXT.mjs  (nuevo)
docs/AUDITORIA_MICROFIX_LOTES.md        (nuevo)
docs/INFORME_MICROFIX_LOTE_001.md       (nuevo)
```

## Estado de publicación

**No publicado.** No se ejecutó `clasp push` ni `clasp deploy`; no se modificó el
deployment operativo ni los QR. Cambios solo en la rama aislada
`codex/ecicep-microfix-lote-001`.

## Próximo lote

Lote 002 ⇒ MF-011…MF-020 (no iniciar automáticamente).
