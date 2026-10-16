# Registro maestro — Microauditoría continua ECICEP (microfixes por lote)

Registro acumulativo de los lotes de microauditoría continua. Cada lote revisa
hasta 10 candidatos, confirma errores reales, aplica un parche mínimo por causa
raíz y agrega una regresión reproducible por hallazgo.

- Huella de cada microfix: `módulo::función::síntoma`.
- Numeración de IDs continua entre lotes (Lote 002 ⇒ MF-011…).
- Reglas del ciclo: solo P2/P3 pequeños (≤ ~40 líneas netas, máx. 2 módulos de
  implementación), sin refactors, sin deuda hipotética; una causa raíz
  compartida = un solo MF.
- Guardas: ningún lote modifica datos de producción, no ejecuta `clasp push` ni
  `clasp deploy`, no cambia triggers/permisos/deployments. Solo código probado +
  push a rama aislada.

## Lotes ejecutados

| Lote | Fecha | Rama | IDs | Errores reales | Con regresión | Commit | Informe |
|------|-------|------|-----|----------------|---------------|--------|---------|
| 001 | 2026-10-16 | `codex/ecicep-microfix-lote-001` | MF-001…MF-010 | 10 | 10 | _(ver informe)_ | `docs/INFORME_MICROFIX_LOTE_001.md` |

## Índice de microfixes

| ID | Módulo::función | Síntoma | Archivo | Lote |
|----|-----------------|---------|---------|------|
| MF-001 | `08_Dashboard::Dash_calidadDatos_` | Booleanos de hoja `'TRUE'`/`'FALSE'` no contados (RUT inválido / requiere revisión subcontados) | `src/08_Dashboard.js` | 001 |
| MF-002 | `31_Ficha::Ficha_prepararMutacion_` | Editar cualquier campo fuerza `RUT_DV_VALIDO=true` (`'RUT' in final` siempre verdadero) | `src/31_Ficha.js` | 001 |
| MF-003 | `13_Eventos::Ev_ultimoPorPaciente_` | Empate de `FECHA_EVENTO` resuelto por `String(Date)` → registro cronológicamente anterior puede ganar | `src/13_Eventos.js` | 001 |
| MF-004 | `09_Log::Log_info_/warning_/error_` | 5.º argumento `duracionMs` descartado → columna `DURACION_MS` vacía | `src/09_Log.js` | 001 |
| MF-005 | `21_Auditoria::Aud_auditarConfig_` | `'días'` de-acentuado a `'dias'` nunca coincide con `'día'` → unidad marcada inválida | `src/21_Auditoria.js` | 001 |
| MF-006 | `20_Instalador::Instalar_pAmarillo_` | `r.motivo` con `r` null lanza `TypeError` | `src/20_Instalador.js` | 001 |
| MF-007 | `17_Hojas::Hojas_colorearRutIngresos_` | Fast-path compara color por string exacta (`#e3f3ea` vs `#E3F3EA`) → reescribe siempre | `src/17_Hojas.js` | 001 |
| MF-008 | `21_Auditoria::Aud_auditarProfesionales_` | Códigos de profesionales inactivos (existentes) reportados como inexistentes | `src/21_Auditoria.js` | 001 |
| MF-009 | `07_UI::_centro_resumen_` | Estratificación pendiente solo `''`/`'G'`, omite `G0`/`NSP` (inconsistente con Dash/Inicio) | `src/07_UI.js` | 001 |
| MF-010 | `07_UI::api_configEliminar_` | No bloquea claves secretas (solo protegidas) → borrado de `WEBHOOK_TOKEN` vía endpoint | `src/07_UI.js` | 001 |
