# INFORME v0.10.0 — SALUD_MENTAL extremo a extremo · MIG-002 · Instalar reactivado

Fecha de ejecución: 2026-09-21.
Alcance: campo clínico `SALUD_MENTAL` (`SI`/`NO`/vacío) de extremo a extremo
(modelo, migración, captura V4, ficha, Web App, vistas sectoriales), migración
de esquema 1 → 2 (MIG-002) y reactivación de `Instalar / Reparar Sistema` con
etapas mutantes reales. El respaldo previo real del libro (`PRE_INSTALAR` en
Drive), la idempotencia reforzada por FUENTE, el preflight de hojas autorizadas
y el endurecimiento por nombre de MIG-002 se documentan en
`docs/INFORME_2026-09-22_AUDITORIA_V0101.md`. Decisión vigente:
**DEC-065** (`DECISIONES.md`).

> E2E en vivo: **no medible en esta ejecución** (sin login/Spreadsheet desde el
> entorno de agente). Verificación por baterías deterministas completas.

## A. Contexto

- El modelo clínico carecía de un indicador de salud mental; la dupla registraba
  menciones en texto libre (`OBSERVACIONES`/`OTROS`) sin dato estructurado.
- Tras la entrega S6, las etapas de fuentes/amarillo/enriquecimiento del
  instalador eran **diagnósticas**: `Instalar` no ejecutaba el ciclo real de
  datos, dejando la importación dependiente de `Actualizar`.

## B. Reglas de `SALUD_MENTAL` (decididas en DEC-065)

1. Campos: `SI` · `NO` · vacío (**sin información**). **Prohibido inferir** de
   texto libre; se rechaza (`NO_RECONOCIDO`) en captura y se emite `warn` sin
   escribir en fuentes.
2. Captura V4: campo `saludMental`, **OPC solo para `nuevoIngreso`** (§0.2).
   Gate por `captureId`: en `Cp2-`/`Cp3-` → `CAMPO_NO_PERMITIDO` ("El indicador
   de salud mental requiere captura V4"); valor fuera de `SI`/`NO`/vacío →
   `CAMPO_INVALIDO` ("Solo SI, NO o vacío (sin información)").
3. Ficha: se edita vía `actualizacion.campos.SALUD_MENTAL` (clave permitida,
   enum `['','SI','NO']`), nunca como plano del payload.
4. Huella canónica: incluye `saludMental` **solo** en `Cp4-`; huellas
   `Cp2-`/`Cp3-` persistidas no cambian (no se reescriben).
5. TR-1 → `SALUD_MENTAL`; TR-2 `nuevoIngreso` → columna 12 del orden
   `INGRESO_COLUMNAS` (escritura por encabezado).

## C. Solución implementada

1. **Modelo**: `MODELO_PACIENTE` 30 → 31 columnas (`SALUD_MENTAL` índice 21,
   tras `OTRAS_PATOLOGIAS`); `COLUMNAS_SECTOR_VISTA` 16 → **17** (índice 16,
   al final); `INGRESO_COLUMNAS` índice 11 → columna física 12.
2. **MIG-002 (esquema 1 → 2)**: `Mig_run002()` en `docs/MIGRACIONES.md`;
   reutiliza `Modelo_asegurarEsquemaPacientes` + `Modelo_alinearVistasSectoriales`
   + `_mig002_asegurarIngresosSaludMental`. `SISTEMA_VERSION_SCHEMA_ACTUAL = 2`.
   `_mig002_asegurarIngresosSaludMental` es por **nombre** y orden canónico, no
   por posición: inserta `SALUD_MENTAL` después de `NOTA_SISTEMA` solo si la
   celda siguiente está libre y una hoja con esa columna queda intacta; cualquier
   divergencia (encabezado ausente, orden alterado o columna ya ocupada) BLOQUEA
   la migración en revisión sin escribir (endurecido en la auditoría v0.10.1).
   Ruta única; mismo backend, mismo Spreadsheet, mismo pipeline.
3. **Captura V4**: `src/26_Captura.js` (`saludMental` en `CAPTURA_V2.CAMPOS` 18,
   gate Cp4-, enum por `Norm_normalizarSaludMental`, huella estable).
4. **Ficha/edición**: `src/29_ActualizacionCaptura.js` (`SALUD_MENTAL` en
   `CAPTURA_EDICION_CAMPOS` y en la validación de `actualizacion.campos`);
   `07_UI.js` aplica la clave en `api_actualizarPaciente`.
5. **Fuentes**: normalización defensiva `Norm_normalizarSaludMental` en
   `src/03_Fuentes.js` y `src/12_Ingresos.js` (sin inferencia); borrado aditivo
   que conserva el campo.
6. **Web App / vistas**: `CapturaWeb.html`, `EditorPaciente.html` y `07_UI.js`
   exponen el indicador; Sector 16 → 17 columnas.
7. **Instalar reactivado** (`src/20_Instalador.js`): `INSTALAR_ETAPAS_MUTAN`
   vuelve a declarar fuentes/amarillo/enriquecimiento (mismo `INST-1`); cada
   ejecución crea un **respaldo real del libro en Drive** (`Backup_crear('PRE_INSTALAR')`
   en la primera etapa mutante, reutilizado por el token de la ejecución; si
   falla → `BACKUP_FALLIDO` y cero escrituras), las etapas toman `LockService`,
   registran `Instalar_versionIncompatible_` antes del lock y usan el merge
   `SNAPSHOT_ACTUAL`. `SNAPSHOT_ACTUAL` no toca `PROXIMO_CONTROL` ni
   `SALUD_MENTAL` de existentes (no-pérdida DEC-064 / doctrina FIX v0.8.5).
   Caracteres de unidad `>`/`P`/`B` frente a `z/r/h/q/R/H`.

## D. Verificación

| Batería | Resultado |
|---|---|
| `tests/ejecutar_local.mjs` (núcleo) | **671/671** |
| `tests/aceptacion_formulario.mjs` | 50/50 |
| `tests/contrato_captura_v2.mjs` | 36/36 |
| `tests/captura_backend_v2.mjs` | 73/73 (carga `29_ActualizacionCaptura.js`) |
| `tests/agenda_manual.mjs` | 21/21 |
| `tests/regresiones_revision.mjs` | 44/44 |
| `tests/instalador_estabilidad.mjs` | PASS |
| `tests/regresiones_auditoria_v010.mjs` | 15/15 |
| `tests/validar_html.mjs` | 21/21 |
| `node tools/verificar.mjs` (16 suites) | **0 fallos** |

### Alineación de `tests/agenda_manual.mjs`

El normalizador ahora emite **claves estables** (los campos ausentes se
normalizan a su valor por omisión: `proximoControl: ''`, acorde a §0 del
contrato: ausencia ≡ `null` ≡ `''`). El test de persistencia esperaba literalmente
`undefined` para una agenda ausente en V2; se alineó el aserto a `p.proximoControl || ''`
(comportamiento estable equivalente). No hay fallo funcional: la ausencia sigue
equivalente al vacío tanto en huella como en escritura de agenda.

## E. Documentación vigente actualizada

- `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**): §0.2 extensión V4
  (`saludMental`), §5.1 matriz, §6 tabla de campos, §6.1 regla de cierre V4, §9
  enum, §21.1 TR-1 y TR-2 (columna 12), §26 versionado (`CAPTURE_CONTRACT_VERSION = 4`),
  Anexo A.
- `MODELO-DATOS.md`, `docs/VERSIONADO.md` (esquema 2), `docs/MIGRACIONES.md`
  (fila `Mig_run002`), `docs/HISTORIAL.md` (entrada v0.10.0), `DECISIONES.md`
  (DEC-065), `ARQUITECTURA.md`, `README.md`, `PENDIENTES.md`, `FUENTES-DATOS.md`,
  `docs/ENTORNO.md`.

## F. Publicación y siguientes pasos

- **Publicado**: `clasp push --force` (sync completo) + versión **`@215`**
  desplegada en el **deployment operativo reutilizado**
  (`AKfycbx16n…YSCw`, el de `ECICEP.WEB_APP_URL`). Smoke anónimo `GET /exec`
  → **200** con la vista de captura sirviendo `saludMental` (`ECICEP_ACCESO`
  y `ECICEP_PAGE_BUILD` presentes).
- **E2E interactivo en vivo pendiente** (necesita sesión Google/Spreadsheet o
  diadema autorizada): ejecutar `Instalar / Reparar Sistema` sobre el libro
  real, comprobar la etapa «Ajustando el libro» (v0.9.22) y las cifras de
  INICIO, y verificar captura V4 + ficha con `SALUD_MENTAL`.
- **Commit/push Git** pendientes (base `7492957`).