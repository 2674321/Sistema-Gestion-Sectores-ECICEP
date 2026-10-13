# Informe v257 — Integridad de datos y flujos

Fecha: 2026-10-13  
Rama: `codex/v255-operabilidad-observabilidad`  
Base: `9e1b034`  
Decisión: DEC-112

## Resultado

Se cerraron las rutas locales que confundían error técnico con ausencia,
unicidad, persistencia o rollback exitoso. Se conserva un único proyecto,
Spreadsheet, Web App, pipeline y canon `PACIENTES + EVENTOS`; no se tocó ningún
recurso real.

## Hallazgos, causa y corrección

| Hallazgo | Causa raíz | Corrección / evidencia |
|---|---|---|
| `captureId` fail-open | dos lookups con `catch` vacío | barrera única `LIBRE/DUPLICADO/LOOKUP_FAILED`; fallo = 0 escrituras |
| confirmación de captura ambigua | relectura de `getLastRow()` | confirma la fila física reservada y devuelve esa fila |
| cambio de RUT fail-open | validador puro mezclado con I/O silenciado | validador sintáctico + guard GAS `RUT_*`; fallo = reintentable, 0 escrituras |
| rollback no comprobado | se informaba «aplicado» tras solo intentar | escritura + relectura de campos críticos; divergencia = `ROLLBACK_CLINICO_FALLIDO` + `CONFLICTOS` |
| rollback de altas posicional | borraba las últimas N filas | localiza `ID_INTERNO` exactos, valida fuente, borra descendente y verifica ausencia |
| estado de ingreso best-effort | el llamador no recibía resultado | `{ok,actualizadas,fallidas,verificadas}` y warning durable; sin confirmación no hay limpieza |
| conflicto perdido | error de `CONFLICTOS` solo se logueaba | warning `CONFLICTO_PENDIENTE`, origen conservado y reconciliador idempotente |
| ficha engañosa | error de lectura se convertía en `[]` | `meta.integridad` distingue `OK/NO_DISPONIBLE`; UI no dice «Sin eventos» ante fallo |
| vistas silenciosas | `catch {}` tras escritura canónica | warning uniforme `VISTA_SECTOR_PENDIENTE`; canon no se revierte |
| estratificación sin auditoría | evento best-effort irrecuperable | marca verificada, conflicto técnico e idempotencia por `ID_EVENTO` |
| alta por RUT duplicable | barrera solo de `ID_INTERNO` | `Modelo_agregarPacientes_` comprueba RUT intra-lote e histórico fail-closed |
| merge confundía conflicto con cambio | agregaba `FUENTE` ante divergencia no aceptada | `FUENTE` solo crece por valor aplicado; segunda pasada no reescribe canon |
| REM B incompleto | demografía disponible no agregada | sexo, edad, G y sector para pacientes con actividad; conservación de masa probada |

## Invariantes demostrados

- Ningún `captureId`, `ID_INTERNO`, `ID_EVENTO` o RUT se escribe si su
  comprobación de identidad falla.
- La confirmación apunta a la fila escrita aunque exista un append concurrente.
- Todo rollback queda `ok/verificado` o se declara fallido; nunca se afirma una
  coherencia no comprobada.
- Un tercero posterior o una fila reordenada no puede ser borrado por una
  compensación basada en cantidad.
- `INGRESO_*` permanece si estado, conflicto, vista o identidad está pendiente.
- EVENTOS sigue append-only; los máximos de control/seguimiento no dependen del
  orden físico.
- Una ficha parcial muestra datos básicos y declara qué subsistema no estuvo
  disponible.
- Cada dimensión demográfica REM conserva `sum(subgrupos) == total`.

## Pruebas

Suite adversarial nueva: `tests/data_integrity_v257.mjs`. También se amplió
`tests/ingresos_rollback_pacientes_vNEXT.mjs` con tercero posterior y lote
parcial. Resultado final: `tools/verificar.mjs` **131 suites / 0 fallos**;
núcleo **679/679**; contrato captura **36/36**; aceptación **50/50**; HTML
**21/21**; `auditar_v254`, placeholders y `git diff --check`: PASS.

## Producción

```text
CLASP_PUSH: NO
DEPLOY: NO
FORM_REAL: NO
SHEET_REAL: NO
PROPERTIES_REALES: NO
TRIGGERS_REALES: NO
QR: UNCHANGED
MASTER: UNCHANGED
PR13: UNCHANGED
```
