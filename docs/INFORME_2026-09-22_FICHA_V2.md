# INFORME FICHA 2.0 v0.10.2 — ficha de paciente, ingresos pendientes y guards de token

Fecha de ejecución: 2026-09-22.
Base: v0.10.1 (commit `af11d49`, deployment operativo `@216` reutilizado hacia
versión `@217`).
Objetivo: demostrar con evidencia reproducible que la ficha de paciente pasó a
**ficha 2.0** (pestañas + circuito de ingresos pendientes con incorporación
idempotente), que el write-back de `ESTADO_INGRESO`/`NOTA_SISTEMA` quedó
corregido (era código muerto) y que los guards de token de la interfaz no
rompieron ningún panel.
Resultado: **17 suites · 0 fallos**, incluyendo la nueva
`tests/ficha_ingresos_v0102.mjs` (**13/13**).

---

## 1. Alcance

Se auditaron y modificaron la promoción de ingresos (`src/12_Ingresos.js`), la
ficha de paciente (`src/Sidebar.html`, `src/31_Ficha.js`), la capa de interfaz
(`src/07_UI.js`, `src/01_Utilidades.js`), la edición desde captura
(`src/29_ActualizacionCaptura.js`), el centro de pruebas (`src/10_Pruebas.js`,
`src/CentroPruebas.html`) y los paneles (`Controles`, `Dashboard`,
`Configuracion`, `RemVista`). Solo fixtures sintéticos; sin libro real, sin red,
sin dependencias externas.

Límite vigente (bloqueador): **sin sesión Google en este host** no se pudo
ejecutar E2E real del circuito ingresos pendientes → incorporar → ficha contra
el libro operativo ni la verificación visual de los paneles en navegador
anónimo. Código, contratos y tests NO quedan bloqueados.

## 2. Metodología

1. Leer `AGENTS.md` y la documentación vigente antes de tocar contratos.
2. Auditoría adversaria: no confiar en tests verdes; reproducir el problema,
   corregir la causa, añadir test de regresión que bloquee la reaparición.
3. Fixtures 100 % sintéticos; resultados idempotencia conectados a ejecutarlo 2×.
4. No se introdujo arquitectura paralela: un solo backend, un solo libro, un
   solo pipeline, Web App único canal de captura. El panel de ingresos
   pendientes reutiliza la promoción existente (no un segundo motor).
5. `node tools/verificar.mjs` como oráculo final (17 suites, 0 fallos) +
   `tests/validar_html.mjs` (21 HTML, 0 fallos).

## 3. Hallazgos confirmados (reproducidos)

| Id | Hallazgo | Reproducción | Corrección |
|---|---|---|---|
| B10 | `Ingresos_escribirEstados` iteraba con `Object.keys(porHoja)` un `Map` (retorno de `Utl_agruparPor`, roto desde ETAPA 3b) → write-back de `ESTADO_INGRESO`/`NOTA_SISTEMA` **muerto** en producción | `git log -S Object.keys` sobre `12_Ingresos.js`; prueba C8 sin writes sobre la hoja visual | `Array.from(porHoja.entries())` + variable de grupo `resHoja` (`getRange(ini,desde,...)`) |
| B11 | Varias RPC de ficha/panel NO enviaban el token compartido → con guards nuevos devolverían `ACCESO_DENEGADO` en producción (rotas) | Inspección de `Sidebar.html`/`Controles.html`/`Dashboard.html`/`Configuracion.html`/`RemVista.html`/`CentroPruebas.html`: llamadas `api_patologiasAbrir`/`api_duplaAbrir`/`api_controlPanel`/`api_dashboardDatos`/`api_configListar`/`api_responsablesListar`/`api_remVista`/`api_pruebasSistema`… sin token | Token `TOKEN_ACCESO`/`ECICEP_ACCESO` propagado a todas las `api_*` (lectura defensiva de `body` para el harness VM); `Captura_entregarEdicion_` pasa `opciones.acceso` a `api_patologiasGuardar`/`api_registrarEvento` |
| B12 | `api_actualizarPaciente` replicaba la validación de campos en un `switch` histórico → reglas de negocio duplicadas (drift) | `diff` entre `07_UI.js` y `06_Modelo.js` para `SALUD_MENTAL` | Delegación en el dominio: `Paciente_actualizarCampos_` + `Paciente_validarCampo_` (`src/31_Ficha.js`); el `switch` desaparece; validación estricta `SI`/`NO`/vacío → `CAMPO_INVALIDO` |

## 4. Cambios de código (sintaxis verificada con `node --check` + `validar_html`)

- `src/12_Ingresos.js`: `Ingresos_escribirEstados` con `Array.from` + `resHoja` (B10);
  `api_ingresosPendientes` (paginado, hojas `INGRESO_*` pendientes),
  `api_ingresoDetalle` (VALOR_* + PROFESIONALES → pre-ficha),
  `api_ingresoIncorporar` (promoción única bajo `Ecicep_conLock_`, idempotente).
- `src/31_Ficha.js` (nuevo): `Paciente_actualizarCampos_`,
  `Paciente_validarCampo_` con validación estricta por campo (B12).
- `src/01_Utilidades.js`: `Ecicep_conLock_` (ScriptLock; contención →
  `SERVICIO_OCUPADO`; en tests sin LockService ejecuta directo).
- `src/Sidebar.html`: reescritura 2.0 (pestañas, ingresos pendientes,
  `_ECICEP_DEBUG=false`, tokens en todas las `api_*`).
- `src/07_UI.js`: `api_actualizarPaciente` delega en el dominio;
  guards `WebApp_autorizarBuscador(token)` en las RPC de ficha/panel;
  ajustes de regresión asociados.
- `src/29_ActualizacionCaptura.js`: token en `api_patologiasGuardar` y
  `api_registrarEvento` (B11).
- `src/Controles.html`, `src/Dashboard.html`, `src/Configuracion.html`,
  `src/RemVista.html`, `src/CentroPruebas.html`: token compartido en las RPC
  (B11).
- `src/10_Pruebas.js`: prueba de `SALUD_MENTAL` actualizada a la validación del
  dominio; `ECICEP.VERSION` → `0.10.2`.

## 5. Suites y resultados

| Suite | Resultado |
|---|---|
| `tests/ejecutar_local.mjs` (núcleo) | 671/671 |
| `tests/contrato_datos.mjs` | 38/38 |
| `tests/regresiones_revision.mjs` | 44/44 |
| `tests/captura_backend_v2.mjs` | 73/73 |
| `tests/aceptacion_formulario.mjs` | 50/50 |
| `tests/regresiones_auditoria_v010.mjs` | 15/15 |
| `tests/ficha_ingresos_v0102.mjs` | **13/13** |
| `tests/agenda_manual.mjs` | 21/21 |
| `tests/edicion_paciente_v4.mjs` | 13/13 |
| `tests/formulario_web.mjs` | 32/32 |
| `tests/cola_form_respuestas.mjs` | 33/33 |
| `tests/contrato_captura_v2.mjs` | 36/36 |
| `tests/captura_ui_payload_v2.mjs` | 23/23 |
| `tests/acceso_webapp.mjs`, `publicacion.mjs`, `instalador_estabilidad.mjs` | PASS |
| `tests/validar_html.mjs` | 21/21 (0 fallos) |
| **Total** | **17 suites · 0 fallos** |

## 6. Verificación manual (no automatizada / pendiente)

- Recorrido visual del flujo ingresos pendientes → detalle → incorporar en el
  libro real (requiere sesión Google autorizada).
- Smoke `/exec` (acceso anónimo) para confirmar que la ficha 2.0 y los paneles
  siguen operativos tras el push/deploy @216.

## 7. Publicación

Catálogo de acciones: `clasp push --force` + redeploy en el deployment
operativo reutilizado (versión `@217`, URL base/QR intactos). Cambios locales en
git pendientes de commit/push hasta cerrar el último E2E disponible.