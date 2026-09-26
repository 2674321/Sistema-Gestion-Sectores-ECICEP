# INFORME V0.15 — Instalador con opciones reales + INICIO PRO

> `Instalar / reparar` reconstruye INICIO automáticamente cuando cambia su
> contrato; `Forzar reconstrucción` llega hasta el builder; la persistencia
> visual exige PASS; INICIO PRO A1:AJ50 convergente.

## Causa de INICIO sin cambios (bugs confirmados contra HEAD)
1. **Opciones perdidas**: `Instalar_pDiseno(ejecucion)` ignoraba `opciones`;
   `Presentacion_ejecutarPaso_(etapaId, ejecucion)` no las recibía; la subtarea
   `inicio` construía con `{forzar:false}` siempre. El checkbox Force nunca
   llegaba a `Inicio_construir_`.
2. **Fast-path ciego**: `Presentacion_layoutVigente_()` no miraba INICIO ni
   paridad → Presentación omitida con INICIO viejo.
3. **Fingerprint desacoplado**: el general no incluía el de INICIO.
4. **Invalidación parcial**: invalidar Presentación no invalidaba INICIO.
5. **Instalación sin opciones visuales**: `llamarPaso` solo enviaba datos.
6. **Retry con `false`**: `reintentarUltimoError` sustituía las opciones.
7. **Persistencia sin PASS**: `guardarLayout_()` + limpieza de dirtys corrían
   aunque la verificación diera false.
8. **Cierre sin Presentación**: `Instalar_pVerificar()` no la certificaba.
9. **Legado `visual`** en `resumenResultado()`.
10. **Rediseño PRO inexistente**: V014 + A1:AD38 seguían vigentes.

## Backend (correcciones)
- `api_instalarPaso` reenvía `opciones` a la etapa y con force invalida
  Presentación + INICIO (`Inicio_borrarLayout_()`).
- `Instalar_pDiseno(ejecucion, opciones)` → `Presentacion_ejecutarPaso_` con
  opciones; `ejecutarTarea(tarea, opciones)`; subtarea `inicio` borra layout y
  construye `{forzar:true}` con force (si no, decide el builder).
- `layoutVigente(opciones)`: force → false; exige prop+fingerprint+dirtys+
  HVis+`Inicio_layoutVigente_`+paridad INGRESO/SECTOR.
- Fingerprint general incluye `inicioFingerprint` (cambio de contrato INICIO ⇒
  rebuild automático).
- Fin de plan: `guardarLayout_()` + limpiar dirtys SOLO si `verificacion.ok`;
  si no, invalidar + `{ok:true, advertencia:true, presentacionCompleta:false}`.
- `Instalar_pVerificar()` suma `Presentacion_verificar_()`:
  `{presentacionCompleta, presentacion, estado OK/ADVERTENCIA}`.

## Frontend (correcciones)
- `opcionesInstalacion()` (datos+presentación), `_OPCIONES_EJECUCION`
  congeladas al iniciar, retry las reutiliza exactas; `Reparar presentación`
  fija `CONSERVAR` (0 datos); `resumenResultado()` usa `diseno`.

## INICIO PRO (contrato único `INICIO_CONTRATO`, `PANEL_OPERATIVO_PRO_V015`)
- Canvas A1:AJ50 (36×50): header, subheader, estado general, 6 accesos con
  links, 6 KPIs, 3 cards (7 métricas en matrices + distribución), estado (6),
  prioridades (6), estratificación G1/G2/G3/G-pendiente (conteos existentes, sin
  inferir), info (versión/build/fechas/paridad), footer. Arial, fondo claro,
  cards blancas, acento sectorial.
- **32 merges** (25–40; sin mergear pares label/value) y construcción medida en
  **~417 RPC standalone** — PARTIAL explícito vs objetivo 190: lo exigen la
  verificación terminal exhaustiva con autocuración y el canvas mayor; la vía
  plan omite las 6 firmas de paridad del writer (T5b); el tiempo lo absorbe el
  diseño reanudable (precedente v0.14) y §13 prescribe fragmentar solo con
  evidencia de timeout. Sin bucles: 1 anchos + tramos + RangeList + matrices.
- Sin marco gigante ni `COLUMNA:SOBRANTE`: el físico extra no es drift.
- Fingerprint `pro015|` + prop `ECICEP_INICIO_LAYOUT_V015` (V014 obsoleto ⇒
  rebuild automático); semántica obsoleto→auto / vigente+force→explícito /
  vigente→fast-path (segunda pasada 0 rebuild).
- Snapshot sin PII en una pasada (per-sector vencidos/porVencer/sinProxima
  añadidos); sin fórmulas vivas (links solo en accesos).
- Verifier §18 completo (versión, canvas mínimo, secciones, merges exactos del
  contrato, freeze 2/0 + seguro, anchos 36×38, 50 alturas, colores, snapshot).

## Presentación / formatos / paridad
- Fast-path y persistencia arriba; dirty flags intactos; verificación final con
  INICIO+paridad+drift y refresh INFO (2 escrituras con skip).
- `FORMATO_CAMPOS` única fuente con baseline §19 aplicado (RUT 118, NOMBRE
  240/CLIP, TEL 140, FECHA_HORA 150, EDAD 65, ESTADO 130, PROF 180, OBS 320/CLIP,
  datos 24px, header 36px Arial 11 bold middle) — a validar visualmente en real.
- Paridad INGRESO/SECTOR idéntica salvo identidad + hotfixes v0.14.2–5 intactos.

## Tests
- Nuevas: `inicio_pro_v015` 10/10 (contrato, convergencia, merges, secciones,
  RPC 417≤430, viaPlan, fast-path, extra-dims, fórmulas, autocura),
  `instalador_presentacion_opciones_v015` 8/8 (19 casos §21).
- Actualizadas por contrato intencional: `inicio_v012`, `inicio_visual_v014`,
  `instalador_formato_visual_v0122` (T15/T16/T19/T20), `inicio_snapshot_v014`
  (+sectores); eliminada `inicio_rendimiento_v014` (superseded).
- Batería total y fallos: ver `node tools/verificar.mjs` (0 fallos).

## Validación real (pendiente del operador con acceso)
- CONSERVAR: diagnóstico muestra INICIO anterior → `Instalar / reparar` pasa
  por `Portada INICIO` y reconstruye; INICIO visiblemente nuevo (6+6+cards).
- Segunda sin force: INICIO vigente, rápida. Force (instalación y Reparar):
  reconstruye aunque PRO vigente. Cierre: PASS/PASS/PASS/PASS/PASS/0.
- PACIENTES/EVENTOS antes = después (CONSERVAR).

## Publicación
- Commit + `clasp push --force` + MISMO deployment/URL/QR (con quiebres de
  límite de versiones documentados si aplica). Schema 2, Captura V4.

## Riesgos residuales
- RPC ~417/subtarea INICIO standalone (PARTIAL): cabe en el patrón reanudable;
  si el tiempo real excede, fragmentar con evidencia (§13).
- Afinos visuales §19 pendientes de ojo humano en producción.
- `HVis_repararDiferencias_` y wrappers deprecated conservados explícitamente.

## Hotfix v0.15.1 — «Debes seleccionar todas las celdas de un intervalo combinado» (incidente productive)

**Síntoma**: en producción, `Instalar / reparar` → `Presentación del libro` →
subtarea `Portada INICIO` → `No se pudo completar ... La estructura visual de una
hoja impidió completar el formato`, con detalle técnico «Debes seleccionar todas
las celdas de un intervalo combinado para combinarlas o separarlas».

**Causa raíz** (confirmada contra el código de v0.14.x): el builder pintaba el
"marco de color" de la tarjeta con dos `merge()` gigantes **fuera** del panel:

| merge legacy v0.14 | rango real en producción | efecto |
| --- | --- | --- |
| `inferior` | filas 39..maxFilas × ancho completo (`A39:AD1000`) | cruza el borde inferior del lienzo gestionado |
| `derecha` | columnas sobrantes × filas 1-38 | cruza el borde derecho del lienzo |

Google Sheets exige seleccionar el intervalo combinado **completo** para
separarlo o modificarlo. Por eso:

1. `breakApart()` sobre `A1:AJ50` fallaba (y el error se tragaba en un `catch`
   vacío, dejando los merges intactos);
2. al llegar a `merge()` del footer `A49:AJ50`, el rango chocaba con el merge
   `inferior` (filas 39-50) → excepción y muerte de la subtarea.

**Corrección (DEC-096)**:
- `Inicio_construir_` descombina la **hoja completa** (`A1:maxCols × maxFilas`)
  **antes** de insertar/expandir y **antes** de cualquier `merge()`; si no logra
  deshacerlo, lanza `INICIO_NO_DESCOMBINABLE` en vez de fallar en silencio.
- limpia el área física sobrante (el marco heredado es residuo visual propio, no
  dato) para que no queden bandas oscuras ni combinaciones parciales;
- `Inicio_verificar_` exige cero combinaciones fuera del lienzo
  (`ver.sinMergesFuera`, token `MERGE_FUERA`), de modo que cualquier resto
 Similar fuerza reconstrucción en vez de pasar inadvertido.

**Prueba de regresión**: `tests/inicio_pro_v015.mjs` T10/T10b siembran el marco
heredado (`A39:AD1000` y `AE1:AN38`) sobre una hoja de 1000×30 y 1000×40; el mock
del harness ahora **fielmente** reproduce la regla de Sheets (selección parcial
sobre un merge lanza la misma excepción), y se comprobó que contra el código sin
el fix la suite falla con el error exacto de producción (DEC-096).
