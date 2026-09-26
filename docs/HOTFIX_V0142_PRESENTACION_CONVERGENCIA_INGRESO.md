# HOTFIX V0.14.2/V0.14.3 — Convergencia de Presentación (INGRESO_NARANJO)

> Reporte: `No se pudo completar "Presentación del libro" · Subtarea: Formato
> visual · INGRESO_NARANJO` en loop; primer detalle genérico, segundo detalle
> `OK → OK` tras exponer el motivo real (v0.14.2).

## Addendum v0.14.3 — causa raíz real
`HVis_aplicarSecciones()` devuelve `estado` COMPUESTO `'pre → post'` (`'OK → OK'`
tras reparar, `'OK'` plano solo en fast-path). `HVis_reconciliarHoja()` lo
comparaba con `'OK'` → falso fallo SIEMPRE que había reparación real (PACIENTES
pasaba por fast-path; INGRESO_NARANJO con drift real fallaba). Fix: la señal de
fallo es `aplicado.ok === false`. Test T9 (estado compuesto con `ok:true`
converge). `ECICEP.VERSION` 0.14.3.

## Causa exacta
1. `HVis_reconciliarHoja()` decidía `requiereLayout` solo por pendientes
   `fila*`/`sección*`/`encabezados*`, pero su verificación final también exigía
   `FREEZE_ROWS`/`FREEZE_COLUMNS`. Hoja correcta salvo freeze → 0 escrituras →
   verificación `ok:false` → retry idéntico en loop (detectar sin converger).
2. `Presentacion_ejecutarTarea_()` ignoraba `r.errores` al construir el motivo;
   la UI mostraba solo el fallback `Falló la subtarea…` y el instalador quedaba a ciegas.

## Corrección
- **HVis** (`src/22_HojasVisual.js`): `HVis_reconciliarHoja()` repara `frozenRows/
  frozenColumns` contra `HVis_especVisual()` solo si difieren (fast-path 0 setters;
  respeta el contrato: `frozenColumns 0`, nunca introduce freeze mayor sobre la
  barra fusionada). Fallo estructurado opcional `{codigo, propiedad, motivo}` con
  `actual=`/`esperado=` para FREEZE; `HVis_firmaPendientes_()` + código
  `PRESENTACION_SIN_CONVERGENCIA` si la reparación no modifica el drift;
  `PRESENTACION_FREEZE_BLOQUEADO` si el setter lanza.
- **Presentación** (`src/35_Presentacion.js`): prioridad de motivo
  `motivo → linea → errores → fallidas → fallback` (+ `codigo` passthrough);
  `Presentacion_formatearHoja_()` devuelve `motivo` (estructurado) sin eliminar
  `errores`, más métricas no sensibles por fase
  (`estructuraMs/anchosMs/formatosMs/semanticaMs`).
- **UI**: sin cambios de código necesarios — `fallarEtapa` ya muestra
  subtarea + `motivo`; ahora el motivo trae la causa exacta
  (ej. `INGRESO_NARANJO · FREEZE_ROWS actual=0 esperado=3`).

## Auditoría de pendientes (DETECTA → REPARA)
| Pending | Detecta | Repara | Vía |
|---|---|---|---|
| fila1 color/tinta/tamaño/altura, sección color/altura, encabezados fondo/tinta/peso/tamaño/altura | `HVis_pendientesVisual` | `HVis_aplicarSecciones` | subtarea `formato:*` |
| FREEZE_ROWS / FREEZE_COLUMNS | id. | reconciliador (§2, nuevo) | id. |
| TAB_COLOR | id. | `Modelo_aplicarDiseno` (subtarea `base`) | plan |
| ANCHO:* | id. | `_modelo_anchosHoja` | subtarea `formato:*` |
| FORMATO:* | id. | `Hojas_aplicarFormatosNumero_` | id. |
| VALIDACION:* | id. | `Hojas_aplicarValidaciones_` / etapa `validaciones` | plan |
| NOTA:* | id. | `Hojas_aplicarNotas_` | subtarea `notas` |
| OCULTA:* (solo PACIENTES) | id. | `Hojas_ocultarTecnicas` (`accesorios`) | plan |
| `no inspeccionable` (excepción) | id. | — | warning no bloqueante en reconciliador solo si no hay layout pendiente; si persiste con firma idéntica → `PRESENTACION_SIN_CONVERGENCIA` explícito |

Sin casos `detectable + bloqueante + no reparable` en la ruta `formato:*`.

## Tests
- Nuevas: `presentacion_convergencia_freeze_v0142` 8/8 (rows/cols/0-writes/retry/
  AMARILLO/VERDE/SECTOR×3/sin-convergencia/firma),
  `presentacion_error_detalle_v0142` 4/4 (errores→motivo, prioridad, código, motivo+métricas).
- Existentes custodiadas verdes (timeout, convergencia, reparar, paridad, visual, formato).

## Resultado real
- Tras desplegar al mismo deployment: **Reintentar esta subtarea** sobre
  `Formato visual · INGRESO_NARANJO` debe reparar el freeze, avanzar el cursor y
  continuar; segunda reparación visual completa: 0 divergencias / ~0 writes.
- (Completar aquí con la medición real tras el retry en producción.)

## Publicación
- Commit + push + `clasp push --force` + deploy al mismo deployment/URL/QR.
- `ECICEP.VERSION` 0.14.2 (schema 2, captura V4, sin MIG-003).
