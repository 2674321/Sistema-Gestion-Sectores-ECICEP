# Informe v0.11.0 — Mejora integral ECICEP

**Fecha:** 2026-09-23  
**HEAD inicial:** `25ba1c5cf018c1a078bc4f1c36115c5bf7b9582e`  
**Commit de código:** `ca94c6454052abd5980bc0c244f88d6f61734806`  
**Deployment operativo:** `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`  
**Versión publicada:** `@228` (antes `@227`)  
**Versión / esquema / captura:** `0.11.0` / `2` / `V4`

## Resultado

PASS en código, pruebas, sincronización y publicación. Se conservan un solo
proyecto Apps Script, un Spreadsheet, una Web App, un backend y un pipeline.
Google Forms no se reintrodujo. La URL `/exec` y el QR no cambiaron.

## Cambios P0

- La edición manual de `ESTADO_INGRESO` a `INGRESADO` ejecuta una incorporación
  real mediante `ECICEP_onEditIngreso`, limitada a una celda, una fila y una
  hoja `INGRESO_*`.
- La confirmación exige paciente, evento `INGRESO`, `FUENTE` hoja/fila e
  `ID_INTERNO` consistentes. Los resultados `ERROR`, `REQUIERE_REVISION` y
  `DUPLICADO` no se fuerzan a `INGRESADO`.
- El trigger se instala de forma idempotente: conserva uno, elimina solo sus
  duplicados y deja intactos los triggers ajenos.
- El diagnóstico histórico clasifica `OK_REAL`, `INGRESADO_FALSO`,
  `DERIVADO_DESACTUALIZADO` e `INCONSISTENTE`; la reparación reutiliza el
  pipeline y refresca solo sectores afectados.
- La búsqueda de `captureId` usa `TextFinder` en `RESPONSE_ID`; la idempotencia
  por evento usa búsqueda puntual de `FUENTE`. La captura ya no llama
  `Form_leerMarcas` en el hot path.

## Rendimiento

| Operación | Antes | Después |
|---|---|---|
| `captureId` | barrido de `FORM_RESPUESTAS` | lookup puntual en `RESPONSE_ID` |
| `FUENTE` evento | barrido de `EVENTOS` | lookup puntual en la columna `FUENTE` |
| ID evento post-write | segundo lookup | retorno directo de `ID_EVENTO` |
| nuevo ingreso | `appendRow` | `setValues` sobre la fila calculada |
| ficha de una persona | construir colección de pacientes | `Modelo_buscarPaciente` |
| índices de paciente | búsqueda repetida | índices efímeros por ID y RUT |
| invalidación | siempre global | selectiva, con compatibilidad global |
| INGRESADO manual | etiqueta sin garantía | incorporación real e idempotente |
| sector stale | corrección manual | diagnóstico y reconciliación |

No se inventaron milisegundos de Google Sheets. Los tests sintéticos comprueban
rangos y llamadas, incluida una cola `FORM_RESPUESTAS` de 20.000 filas.

## Integridad y observabilidad

`Integridad_diagnosticarDerivados_` comprueba eventos huérfanos, cachés de
último control/seguimiento, pertenencia a vistas sectoriales, ingresos falsos y
estratificación cuando existe una regla oficial calculable.
`Integridad_repararDerivados_` solo reconstruye derivados respaldados por
fuentes y evidencia. `Sistema_estadoSalud_` entrega conteos técnicos sin PII.

`Log_perf` admite únicamente métricas técnicas. `Log_flush` detecta si la
invocación ya posee el lock, evita espera anidada y conserva el recorte por
bloque con `deleteRows`.

## UX e instalador

- El runtime común normaliza errores, mensajes humanos, reintentos de lectura,
  acceso desactualizado y `SERVICIO_OCUPADO`.
- Control/Seguimiento recuerda la selección en `sessionStorage`, actualiza
  `aria-pressed`, conserva filtros y no realiza RPC al alternar.
- La fila manual muestra “Procesando incorporación…” mientras el pipeline
  trabaja y deja un estado de error recuperable si no recibe confirmación.
- Instalar/Reparar asegura un único `PRE_INSTALAR`, incorpora la fase de
  trigger, ejecuta integridad y exige post-check verde. El diagnóstico inicial
  sigue siendo de solo lectura.

## Verificación

- `node tools/verificar.mjs`: **29 suites, 0 fallos**.
- Núcleo: **671/671**.
- Ingreso manual v0.11.0: **15/15**.
- Arquitectura v0.11.0: **8/8**.
- Rendimiento estructural v0.11.0: **5/5**.
- Integridad/observabilidad v0.11.0: **5/5**.
- HTML embebido: **22/22**.
- `git diff --check`: sin errores.
- Smoke anónimo del `/exec`: HTTP 200; contiene `0.11.0`, `ca94c64`, Captura y
  ECICEP.

## Publicación

`clasp push --force` sincronizó 54 archivos. Se actualizó el mismo deployment
operativo a **@228**. No se creó un deployment, URL, QR, Spreadsheet ni backend
paralelo.

## Riesgos residuales

La función del trigger está publicada, probada e integrada al instalador, pero
`clasp run Triggers_asegurarIngresoOnEdit_` respondió que la CLI no tiene
permiso para ejecutar funciones. Su instalación efectiva debe confirmarse al
ejecutar **Instalar / reparar** desde la interfaz autorizada. La validación real
del backup y del libro formateado permanece en los pendientes operativos #29 y
#30.

## Pendientes de decisión clínica

No se cerraron sin evidencia los pendientes #3, #4, #5, #6, #7, #11, #12,
#13, #14, #15, #16, #17, #18, #25, #26, #27, #28, #29, #30 y #32.
