# OAUTH SCOPES — ECICEP (una sola verdad)

> Fuente: `src/appsscript.json` (`oauthScopes`). Este documento mapea cada scope
> con su **consumidor real** en el código y por qué es necesario. El test
> `tests/oauth_scopes_v270.mjs` falla si aparece un consumidor nuevo sin scope
> documentado o si el manifiesto y este documento divergen.
>
> **No eliminar scopes a ciegas:** cada uno tiene un consumidor verificable.

| Scope | Consumidor real | Necesidad |
|---|---|---|
| `.../auth/spreadsheets` | `SpreadsheetApp` (casi todo `src/`: modelo, ingresos, captura, instalador, menús, Web App) | Leer/escribir el único Spreadsheet operativo (`ECICEP.SPREADSHEET_ID`). |
| `.../auth/documents` | `DocumentApp` (`src/14_REM.js`, `src/19_Permisos.js`) | Generar/actualizar documentos REM (respaldo clínico de la Red de Salud Mental). |
| `.../auth/drive` | `DriveApp` (`src/28_IA.js`, `src/20_Instalador.js`, `src/14_REM.js`, `src/17_Hojas.js`) | Backup, instalador y exportaciones de IA en Drive. |
| `.../auth/script.container.ui` | `HtmlService` (`src/WebApp.gs`, `src/07_UI.js`, `src/36_FormsCanal.js`, `src/28_IA.js`) | Servir la Web App, menús y paneles (UI ligada al contenedor). |
| `.../auth/script.external_request` | `UrlFetchApp` (`src/28_IA.js`, `src/38_Release.js`, `src/19_Permisos.js`) | Llamadas salientes a IA/Gemini (solo con configuración explícita). |
| `.../auth/script.scriptapp` | `ScriptApp` (`src/38_Release.js`, `src/36_FormsCanal.js`, instalación de triggers en varios `src/`) | Crear/gestionar los triggers del canal durable y de mantenimiento. |
| `.../auth/forms` | `FormApp` (`src/36_FormsCanal.js`, `src/24_Formulario.js`, `src/38_Release.js`) | Leer respuestas del Form de transporte durable interno. |
| `.../auth/forms.body` | `FormApp` (`src/24_Formulario.js`, `src/36_FormsCanal.js`) | Crear/editar el Form (schema, ítems) durante instalación/reparación. |

## Notas de arquitectura

- El Form es **solo transporte durable interno** (AGENTS.md regla 4): su URL no se
  publica; la Web App es el único canal operativo visible.
- `access: ANYONE_ANONYMOUS` + `executeAs: USER_DEPLOYING` permiten la **captura
  pública anónima** (DEC-110): el visitante no autoriza ni aporta OAuth; la
  ejecución corre como quien publica.
- Las vistas/RPC de **operador/administración** exigen sesión OPSESS (no OAuth
  individual del visitante).
- `script.external_request` no implica egress automático: la IA está desactivada
  salvo configuración explícita (ver §23 del megaprompt y `src/28_IA.js`).
