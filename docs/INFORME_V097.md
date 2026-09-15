# INFORME V0.97 — Auditoría rendimiento / IA Gemini / frontend + cierres

Fecha de ejecución: 2026-09-11.
Alcance: `src/00_Config.js`·`01_Utilidades.js`·`02_Normalizacion.js`·`04_Identificacion.js`,
`06_Modelo.js`·`10_Pruebas.js`·`12_Ingresos.js`·`14_REM.js`·`15_RemExcel.js`,
`16_Amarillo.js`·`17_Hojas.js`·`18_Calidad.js`·`21_Auditoria.js`·`24_Formulario.js`,
`26_Captura.js`·`28_IA.js`, HTML (`RemGenerador.html`, `Sidebar.html`, `Controles.html`,
`IAPanel.html`, `00_Tokens.html`), `tests/*.mjs`.

No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline de captura.

> E2E en vivo: **no medible en esta ejecución** (sin login/Spreadsheet desde el entorno de agente).

## Resumen

Se auditaron 4 áreas a fondo (rendimiento, contrato de captura V2, IA Gemini, frontends),
se aplicaron los hallazgos P0/P1 (corrupción/seguridad/UX) y la ronda P2 de rendimiento,
y se añadieron tests de regresión que fijan el comportamiento corregido. Batería final:
**831/831 verdes + `validar_html` 18/18** (núcleo 560 — 3 tests nuevos — contrato datos
38, backend V2 68, payload V2 19, cola 33, aceptación 50, formulario web 27, contrato V2 OK).

## 1. Correcciones P0/P1

| Área | Hallazgo | Corrección |
|---|---|---|
| REM (`src/RemGenerador.html:208`) | error en runtime `sectorSel is not defined` al abrir el generador con sector fijo (caso sin `selSector` presente) | se lee directamente `document.getElementById('selSector').value`; además se añadieron `failureHandlers` a `UI_abrirDashboard()`/`UI_verRem()` para no dejar el diálogo zombie en falla de RPC |
| IA lectura de PACIENTES (`src/28_IA.js`) | `IA_leerEstadisticas`, `IA_leerColumna`, `IA_detectarDuplicados`, `IA_verificarIntegridadEventos` y los 5 correctores (RUT/Fechas/Nombres/Teléfonos/Sexo) asumían datos desde fila 1 y confundían fila de datos con fila física | nuevo helper **`IA_leerBloque(hojaNombre, hoja)`**: para hojas visuales (`LAYOUT_HOJAS_VISUALES`, PACIENTES) delega en `Modelo_leerBloqueCabecera` (encabezados + datos desde `dataStartRow`), para hojas simples en `Utl_leerBloque`. Lecturas por encabezado (`IA_columnaPorNombre`), filas físicas por `Modelo_filaFisica(hoja, f-1)`, escrituras únicas por bloque con `Utl_escribirBloque(hoja, Modelo_dataStartRow(HOJAS.PACIENTES), 1, valores)` |
| IA normalizadores (desde `28_IA.js`) | el corrector de fechas podía fabricar fechas de estados ambiguos y el de teléfonos reimplementaba un formato propio | **`IA_parsearFecha`** delega en `Norm_normalizarFecha` y solo devuelve ISO si `estado === 'VALIDA'` (MES_ANO/INVALIDA/NO_RECONOCIDA → null, sin inventar); **`IA_normalizarTelefono`** delega en `Norm_normalizarTelefono` y une con `/` (sin números claros → conserva el texto original, no muta ni borra); **`IA_corregirSexo`** delega en `Norm_normalizarSexo` y jamás fuerza `OTRO` para valores desconocidos (los conserva) |
| Frontend XSS/hygiene | mensajes de estado, `MODO`/`ID_INICIAL` en el sidebar e historial del panel IA podían inyectar HTML | `Controles.html` `estadoMsg(texto)` escapa con `_esc`; `Sidebar.html` escapa `JSON.stringify(...).replace(/</g,'\\u003c')` en los template literals `<?!= ?>`; `_errSilencioso` es un helper compartido movido a `00_Tokens.html` (se eliminó su duplicado del sidebar); `IAPanel.html` usa `textContent` en el chat (solo permite el spinner trusted `<span class="spin">`) y escapa tiempo/tipo/cantidad/detalle en `renderLog` |
| Captura V2 (`src/26_Captura.js`) | `Captura_v2_entregarIngreso` forzaba `confirmarNuevos: true` en la barrera de duplicados | respeta la semántica DEC-024/025: `confirmarNuevos: norm.confirmarNuevoPaciente === true`, alineado con `WebApp.gs` (`__fuerzaNuevoPaciente`, nunca seteado por la UI) — POSIBLE_DUPLICADO → REVISION salvo confirmación humana explícita |

## 2. Ronda P2 — rendimiento (escrituras/borrados por celdas → bloques)

Todas con la misma invariante: **1 lectura de bloque + filtro + reescritura en bloque**,
nunca `deleteRow`/`appendRow`/`setValue` dentro de loops (regla de bloques vigente).

| Archivo / función | Antes | Después |
|---|---|---|
| `06_Modelo.js` Limpieza `INGRESO_*` | `deleteRow` por fila | relectura en bloque → filtrar fuera → `clearContent` → reescritura |
| `06_Modelo.js` `Recuperar_ejecutar` (EVENTOS) | `deleteRow` por fila | idéntica conversión a bloque |
| `16_Amarillo.js` `Amarillo_dedupHistorico` | `deleteRow` por fila | idéntica conversión a bloque |
| `18_Calidad.js` `Calidad_sincronizarCola` | `appendRow` por fila | `Utl_escribirBloque` al final (`desde + i`) en una sola escritura |
| `24_Formulario.js` `Form_actualizarTrailer` | relectura/reescritura por columna | `setValues` único sobre filas contiguas; fallback por fila solo si hay huecos (no contiguas) |
| `24_Formulario.js` anexo `ANEXAR` | escritura por hoja en varias llamadas | un solo `setValues` por hoja con el bloque completo |
| `04_Identificacion.js` + `12_Ingresos.js` | `Iden_construirIndices` se reejecutaba completo por cada paciente creado en un lote (O(n²)) | nuevo **`Iden_indicesAgregar(indices, paciente)`** incremental O(1) por alta (misma semántica *última entrada gana* en RUT, arrays por cuerpo/nombre) |

### No tocados (decisión documentada)

- `Form_buscarFilaIngresoPorMarca` (`24_Formulario.js:103`): ya optimizado — una sola
  lectura de la columna de marca (o de bloque en fallback legacy) por hoja.
- `Captura_v2_buscarRegistro` (`26_Captura.js:780`): 1 lectura de bloque + escaneo
  secuencial intencional (idempotencia §13 del contrato); no se revierte a índice.
- `Control_estadoVigencia` (`02_Normalizacion.js:676`): la lectura de CONFIG solo ocurre
  cuando `avisoDias == null`; todos los llamadores por lote (`Control_analizar`,
  `Aud_clasificarPoblacion`) inyectan el valor — mismo patrón que `Control_leerFrecuencia`.

## 3. Justificación de seguridad

- Lectura física: todos los correctores IA operan sobre bloque sin encabezado real
  (layout visual) y filas físicas calculadas; la escritura respeta `dataStartRow`.
- Ningún corrector normalizador fabrica datos: fechas solo si VALIDA, teléfonos solo
  dígitos reales (uniendo con `/`), sexo solo valores canónicos reales.
- Escapes XSS únicamente en salida a cliente; la lógica de negocio no cambió.
- El gate `confirmarNuevoPaciente` refuerza el comportamiento contractual de los
  duplicados sin eliminar la puerta de UX (`webApp_previaDuplicadosV2` intacta).
- Los bloques de borrado reescriben SOLO las filas que sobreviven el filtro; la
  semántica del filtro se conservó (mismas condiciones, mismo orden estable).

## 4. Tests añadidos

`src/10_Pruebas.js` → suite **`_pruebas_ia_v097`** (+3 asertos-grupo, núcleo 557→560):

1. `IA_parsearFecha`: ISO y dd/mm/yyyy válidos → ISO; `2026-02-30`, `03/2026`, mes 13,
   texto, vacío y null → `null` (nunca fabrica).
2. `IA_normalizarTelefono`: número único, varios ordenados unidos con `/`, `+56` de país
   descartado, sin números → conserva el texto original, vacío/null → `''`.
3. `Iden_indicesAgregar`: equivalente incremental a `Iden_construirIndices` (JSON-idéntico),
   RUT indexado, cuerpo indexado, paciente sin RUT no indexa, agrupación por nombre.

Fuera de baterías: `node --check` en todos los `.js` tocados + `validar_html` (18/18).

## 5. Estado git / deploy

- Cambios de esta fase **sin commitear** (regla: solo commit cuando el usuario lo
  solicita); `docs/hoja_de_vida.pdf` sigue excluido.
- Deploy **no ejecutado**: requiere `clasp push --force` + `clasp deploy` sobre el
  deployment operativo existente (`/exec`), verificando primero el estado real con
  `clasp deployments`/`clasp versions`.