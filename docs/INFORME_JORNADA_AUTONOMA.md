# INFORME JORNADA AUTÓNOMA — Auditorías P0 y correcciones críticas

Fecha de ejecución: 2026-09-11.
Alcance: auditorías paralelas de **operaciones destructivas**, **exposición PII/secretos**
y **integridad pacientes↔eventos**; fixes críticos con tests de regresión.

No toca el contrato `docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline de captura.

> E2E en vivo: **no medible en esta ejecución** (sin login/Spreadsheet desde el entorno de agente).

## Resumen

Tres agentes explore auditaron en paralelo las tres áreas P0. Se consolidaron los hallazgos
(F1-F8) y se aplicaron los fixes de mayor impacto con tests que fijan el comportamiento.
Batería final: **855/855 verdes + `validar_html` 18/18** (núcleo 566 — suite nueva
`_pruebas_p0_auditoria_v098` — contrato datos 38, aceptación 50, contrato V2 36, cola 33,
backend V2 68, payload V2 19, formulario web 27).

Quedan **dos bloqueos que exigen decisión humana** (acceso de deploy; secretos en disco local),
documentados al final.

## 1. Correcciones aplicadas

| # | Área | Hallazgo | Corrección | Archivo |
|---|---|---|---|---|
| F3 | Integridad P0 | `ID_EVENTO` colisiona en cada corrida: `seqEv` arrancaba en 1 (PKs `EV-0001..EV-00NN` duplicados rompen joins, dedup e idempotencia) | `Ingresos_procesarFilas` solo emite IDs secuenciales cuando el caller pasa `evSecuenciaInicial` explícito (modo tests); producción usa el ID random de `Ev_nuevoId()` (36^4 × timestamp, colisión práctica nula) | `12_Ingresos.js:125,191` |
| F1 | Destructivo P1 | Guard `escribibles` en `HVis_normalizarLayout` era código muerto: se empujaba una advertencia pero **se sobreescribían igual las filas 1-2 del usuario** (título/secciones/encabezados) cuando `HVis_filasSuperioresEscribibles` devolvía false | Ahora `escribibles` **gatea** las escrituras (fila título, secciones, encabezados reales y congelado); solo se conserva la advertencia saliente | `22_HojasVisual.js:326-465` |
| P1-P9 | PII P0 | Cero `Session` checks en ~12 RPC admin alcanzables desde una Web App `ANYONE_ANONYMOUS`: `api_buscar`, `api_ficha`, `api_duplaGuardar`, `api_config*`, `api_logLeer`, `api_backup*`, `IA_*`, `Form_capturarDesdeUI` | Helper **`WebApp_usuarioActivo()`** + guard de denegación en cada endpoint admin de lectura PII o escritura | `WebApp.gs`, `07_UI.js`, `17_Hojas.js`, `28_IA.js`, `WebApp.gs` |
| P6 | PII P1 | `IA_guardarApiKey` sin sesión: un anónimo podía sobrescribir la API key de Gemini | Rechaza (`false`) sin usuario activo | `28_IA.js:855` |
| L1-L2 | PII P1 | Logs exponían RUT completo (`Log_info` unir duplicados, `console.log` DUPLICADO del pipeline) | Enmascarado con `Aud_anonRut()` → `**.***.**XX-X` | `06_Modelo.js:1957`, `12_Ingresos.js:515` |
| F3 | Destructivo P1 | `limpiar_prueba` del webhook borraba datos de prueba sin confirmación | Exige doble señal `confirmacion=OK` (coherente con DEC-012) | `Webhook.js:107-112` |

## 2. Hallazgos documentados (sin fix automático)

| # | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| F2 | P1 | Merges de celdas irreversibles en `HVis_formatearIngresos` (destruye formato del usuario) | Revisión: identificar rangos de merge del sistema vs. usuario antes de formatear |
| F4 | P1 | Eventos creados antes del paciente pueden quedar huérfanos si la escritura a PACIENTES falla (path transactional 26_Captura) | Revisión de orden transaccional (orquestable con lock + rollback) |
| F5 | P1 | `Iden_reducirLote` reasigna `idProv` sin actualizar los eventos que referencian los IDs perdidos | Revisión de reasignación con backfill de `ID_INTERNO` en EVENTOS |
| F6 | P0 | `appsscript.json access: ANYONE_ANONYMOUS` expone los endpoints admin a anónimos | **BLOQUEO HUMANO**: defensa en profundidad ya aplicada (guards), pero el cambio de nivel de acceso requiere redeploy y afecta al formulario de campo (operadores sin cuenta). Decisión del propietario |
| F7 | P0 local | `SESION 10 SEPT 20:58.json` (103 MB) y `secrets/credentials.json` en disco con OAuth tokens | **BLOQUEO OPERADOR**: cifrar/eliminar; ambos gitignored pero sensibles a robo local |
| F8 | P1 | Mensajes de error y logs exponen PII en >10 ubicaciones (se corrigieron las 2 del flujo álgido) | Tarea de barrido sistemático con `Aud_anonRut`/`Aud_anonNombre` (cola) |

## 3. Tests de regresión (`_pruebas_p0_auditoria_v098`)

1. `Ev_nuevoId()` sin secuencia → IDs random únicos (60 iteraciones, sin colisión, sin formato `EV-0001`).
2. `Ev_nuevoId(n)` → secuencial explícito preservado (modo tests).
3. `Ingresos_procesarFilas` sin `evSecuenciaInicial` → evento con ID_EVENTO random (no reinicia en 1).
4. `Ingresos_procesarFilas` con `evSecuenciaInicial:7` → `EV-0007` (semántica auto-test intacta).
5. `Aud_anonRut` enmascara RUT normalizado/con puntos/sin DV.
6. Guards de sesión: sin `Session` → `api_buscar`=[], `api_ficha`/`api_duplaGuardar`/`Form_capturarDesdeUI` deniegan, `IA_guardarApiKey` rechaza.

Además, `tests/ejecutar_local.mjs` ahora inyecta un mock de `Session` para que los guards
pasen en modo autenticado sin tocar GAS (no se modificó ningún test existente).

## 4. Verificación

- Núcleo `node tests/ejecutar_local.mjs` → **566/566** (eran 560 previos).
- Batería completa → **855/855** (todos los `.mjs` independientes verdes).
- `node tests/validar_html.mjs` → 18/18.
- `node --check` OK en todos los `.js` modificados (`01-28`, `Webhook.js`).

## 5. Pendiente (cola `AUTONOMOUS_WORK_QUEUE.md`)

- Bloqueos humanos: acceso de deploy y secretos en disco (ver §2).
- P1 restantes: atomicidad `Limpieza`/`Recuperar`, orfandad F4, reasignación F5, barrido PII F8.
- P1 auditorías de flujo: WebApp→backend→FORM_RESPUESTAS, dependencias por índice,
  validación de datos, duplicados, rendimiento hojas grandes, estados de carga,
  auditoría/LOG, backups, Gemini, errores/retries, concurrencia/idempotencia.