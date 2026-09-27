# Informe de auditoría vNEXT — ECICEP v0.16.0

**Fecha:** 2026-09-26  
**Baseline:** `950f6bfba9a52c7963f5c51461653f8d83ca7a64`, 54 suites, 0 fallos.  
**Alcance:** código y pruebas locales. No se usaron datos reales ni se ejecutaron
pruebas ofensivas o instalación contra el Spreadsheet operativo.

## Resultado ejecutivo

Se cerraron los bypass de mayor impacto y se rediseñó Integridad para que el
costo de búsquedas sea constante respecto de las filas `INGRESADO`. La rama no
se declara “completamente segura”: la superficie RPC legacy sigue siendo grande
y la publicación necesita una migración de credenciales y E2E real.

| ID | Severidad | Hallazgo | Evidencia | Corrección | Tests | Riesgo residual |
|---|---|---|---|---|---|---|
| P0-A | Crítica | La ruta pública entregaba una credencial universal | Captura recibía el mismo token en variables de operador | Capacidades Captura/Operador separadas; la base no crea ni revela Operador | `seguridad_webapp_capacidades_vNEXT` | Rotar secretos y QR antes de publicar |
| P0-B | Crítica | Helpers mutantes eran RPC directas | Instalador, limpieza, backup y carga real sin sufijo `_` | Helpers críticos privatizados; inventario completo congelado | `seguridad_rpc_allowlist_vNEXT` | 695 funciones siguen visibles; solo 73 parecen boundaries/entrypoints y la reducción completa queda pendiente |
| P0-C | Crítica | Integridad repetía diagnósticos y búsquedas por fila | Hasta 2 búsquedas puntuales por `INGRESADO`, más relecturas y refrescos repetidos | Snapshot/indexación batch, diagnóstico reutilizado, vistas diferidas y máquina de seis pasos | `integridad_rendimiento_vNEXT`, `instalador_integridad_reanudable_vNEXT` | Medir duración con volumen real |
| P0-D | Crítica | Cualquier usuario activo podía ser Operador | Autorización por mera existencia de email | Allowlist explícita por email/dominio o token Operador | `seguridad_webapp_capacidades_vNEXT` | La visibilidad de identidad depende de la configuración del deployment |
| P1-WH | Alta | Mutaciones y secreto en GET | Dispatcher aceptaba una lista mixta | GET solo lectura; POST JSON + opt-in para mutar; salida minimizada | `webhook_seguridad_vNEXT` | Mantener opt-in apagado fuera de ventanas controladas |
| P1-XF | Alta | `ALLOWALL` desactivaba protección de framing | Uso en respuestas HTML | Eliminado de todas las vistas | `seguridad_webapp_capacidades_vNEXT` | Verificar headers/comportamiento del deployment real |
| P1-XSS | Alta | Sinks HTML dinámicos con datos backend | URL de backup y handler inline de ficha | Escape incluye comilla simple, URL HTTPS validada, listener DOM sin JS interpolado | `web_xss_vNEXT`, `validar_html` | Auditoría exhaustiva de todos los sinks heredados aún pendiente |
| P1-IA | Alta | Denylist clínica y API key en query | Payload permitía ejemplos futuros por defecto | Allowlist de egress, cero ejemplos PACIENTES/EVENTOS, key en header, modelo vigente | `privacidad_ia_vNEXT` | Confirmar políticas contractuales del proveedor antes de habilitar IA |
| P1-LOG | Alta | Trazas incluían RUT parcial y objetos clínicos | Consola de captura serializaba payload/resultados | Redacción final, contexto allowlist y eliminación de serializaciones sensibles | `logs_privacidad_vNEXT` | Heurística; revisar nuevos logs en cada PR |
| P1-PRES | Alta | Presentación podía terminar en advertencia | `PRESENTACION_PENDIENTE` y mensaje de instalación incompleta | Se conserva advertencia explícita; Integridad ya no monopoliza el request | Suites de presentación existentes | Estado real no comprobado en esta rama |
| P1-VER | Media | Versión/documentos desalineados | Código y tests esperaban v0.15 | `0.16.0` alineado en código, README y tests | `version_consistency_vNEXT` | Deployment seguirá en versión anterior hasta publicar |
| P2-PERF | Media | Escrituras demasiado amplias | Caches reescribían PACIENTES y vistas limpiaban capacidad física | Solo columnas/filas cambiadas; rangos contiguos; clear por área usada | `integridad_rendimiento_vNEXT` | Los grupos dispersos aún generan varias escrituras |

CI descubre automáticamente las suites vNEXT, incluye heurísticas de secretos,
PII, `ALLOWALL`, query strings sensibles, mutadores públicos, I/O crítico, XSS y
versión, y fija `actions/checkout`/`actions/setup-node` a SHA inmutable. Se
configuró protección de `master`: PR y check `tests` obligatorios también para
administradores, branch actualizada antes de merge, y force-push/eliminación
bloqueados. No se exige aprobación de tercero para no bloquear el flujo unipersonal.

## Medición de complejidad e I/O

Antes, por `N` filas `INGRESADO`, el diagnóstico podía ejecutar una búsqueda de
evento y otra en la vista por fila: aproximadamente **2N búsquedas**, además de
repetir el diagnóstico dentro de la misma reparación. Para N=10/N=1000 esto
escalaba aproximadamente 20/2000 búsquedas puntuales.

Después, esas búsquedas dentro del loop son **0**. PACIENTES, EVENTOS y cada vista
se leen una vez por snapshot y se indexan en memoria; el número de lecturas de
Spreadsheet depende del número fijo de hojas, no de N. Una reparación acumula
sectores y refresca vistas una sola vez. Caches escriben tres columnas derivadas
solo para filas cambiadas. El test de rendimiento falla si reaparece
`TextFinder`, búsqueda de evento/paciente por fila, `getMaxRows()` para limpiar
vistas o reescritura completa de PACIENTES.

La convergencia local prueba cursor, retry sin avance, datos de cache sin PII y
post-check obligatorio. No mide segundos reales de Apps Script; ese dato requiere
el libro operativo.

## Superficie RPC

El inventario estático contiene **695** funciones top-level sin sufijo `_`:
57 `api_*`, 12 `WebApp_*`, 4 entrypoints conocidos y 622 helpers/handlers legacy.
La allowlist impide crecimiento silencioso y los bypass mutantes confirmados ya
son privados, pero el inventario completo no equivale a aprobación. Objetivo de
la siguiente fase: conservar solo entrypoints, handlers de menú necesarios y
wrappers con guard, renombrando dependencias en lotes verificables.

Respuestas clave:

- Un visitante anónimo no obtiene credencial Operador desde la ruta base.
- Captura no satisface los guards administrativos.
- El bypass más peligroso era ejecutar etapas del instalador directamente.
- Integridad pasa de ~2N búsquedas puntuales a 0 y refresca vistas una vez.
- El CI anterior no modelaba el costo por fila ni la fuga: incluso esperaba el
  token universal. Las suites vNEXT fijan ambos contratos.
- Gemini solo recibe esquema y métricas agregadas permitidas; no ejemplos de
  PACIENTES/EVENTOS.
- El webhook conserva diagnósticos GET; las mutaciones solo están disponibles
  por POST cuando el propietario activa expresamente el opt-in.
- El warning de presentación codificado es `PRESENTACION_PENDIENTE` y la UI lo
  muestra como `INSTALACIÓN FUNCIONAL / PRESENTACIÓN INCOMPLETA`; falta saber si
  aparece en el libro real.
- La segunda instalación se prueba como reanudable/idempotente a nivel local;
  el volumen omitido y duración reales requieren E2E.

## Migración operativa

1. Confirmar backup `PRE_INSTALAR` reciente y registrar la versión de deployment
   actual para rollback.
2. Crear secretos hexadecimales independientes de 64 caracteres en Script
   Properties: `CAPTURA_ACCESS_TOKEN`, `OPERADOR_ACCESS_TOKEN` y `WEBHOOK_TOKEN`.
3. Configurar `OPERADOR_EMAILS` o `OPERADOR_DOMINIOS` solo si se autorizará por
   sesión Google. Mantener `WEBHOOK_MUTACIONES_HABILITADAS` distinto de `SI`.
4. Publicar en el deployment operativo existente; no crear otro por rutina.
5. Validar Operador con una sesión permitida, después Captura anónima, y comprobar
   que Captura recibe `ACCESO_DENEGADO` en endpoints administrativos.
6. Regenerar/distribuir el QR y retirar `LEGACY_ACCESS_TOKEN`.
7. Ejecutar Instalar/Reparar dos veces. Registrar solo tiempos, conteos, pasos y
   códigos: backup, seis pasos de Integridad, post-check, Presentación y trabajo
   omitido en la segunda pasada.

## Rollback

Si hay regresión, volver el deployment existente a la versión registrada, restaurar
las Script Properties anteriores desde el gestor seguro externo y, solo si se
alteraron datos, restaurar el backup `PRE_INSTALAR`. No borrar deployments ni
hojas. Conservar evidencias técnicas sin PII y abrir una corrección desde Git.

## Riesgos residuales

- Superficie RPC legacy de 695 funciones, aunque los mutadores críticos hallados
  quedaron privados y el inventario ya no puede crecer sin fallo de CI.
- Revisión XSS completa pendiente para todos los sinks históricos.
- Falta E2E real: tiempos, backup, trigger, convergencia de segunda instalación,
  Presentación y versión publicada.
- Los IDs de Apps Script/Spreadsheet son identificadores de configuración, no
  secretos; la autorización nunca depende de ocultarlos.
