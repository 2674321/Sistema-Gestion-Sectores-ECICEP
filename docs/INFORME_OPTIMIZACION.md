# INFORME OPTIMIZACIÓN — ECICEP

Fecha de ejecución: 2026-09-07
Sprint: S7 (base) → fase de optimización (P0 cerrado, S6 cerrado)
Versión: `ECICEP.VERSION = '0.9.3'` · Build estático `e5d540c` (se sincroniza en deploy real)

> E2E en vivo: **NO MEDIBLE EN ESTA EJECUCIÓN** (sin login/Spreadsheet desde el entorno de agente).
> Las ganancias de rendimiento documentadas aquí son derivadas del análisis de código
> (reducción de round-trips RPC y de llamadas a la API de Sheets), no mediciones instrumentadas.

## 1. CAMBIOS

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/01_Utilidades.js` | helpers puros `Utl_columnaLetra` (1=A, 26=Z, 27=AA) y `Utl_formulaEdad` (fórmula `DATEDIF` locale-independiente) | soporte de la automatización de EDAD |
| `src/06_Modelo.js` | `Modelo_refrescarVistasSectores`: tras escribir el bloque, aplica `setFormulas` en la columna `EDAD` (fórmula viva) y `setNumberFormat('dd/MM/yyyy')` en `FECHA_NACIMIENTO` | EDAD deja de materializarse; se mantiene la función pura de vista intacta |
| `src/WebApp.gs` | nueva `WebApp_estadoInicial()` devolviendo `{esquema, profesionales, url}` | unifica 3 RPCs de carga en 1 |
| `src/CapturaWeb.html` | init usa una sola llamada `WebApp_estadoInicial()`; se eliminan `cargarEsquema()`, `poblarProfesionales()` y la RPC extra de url | velocidad de carga; el modal QR conserva su consulta de url bajo demanda |
| `src/07_UI.js` | `onOpen`: menús minimalistas (Captura / ECICEP / Sistema) sin emojis redundantes; se retiran del menú Diagnóstico, Centro de Pruebas y "Actualizar todo" (el código se conserva) | simplificación de menú |
| `tests/formulario_web.mjs` | stub `WebApp_estadoInicial` en el sandbox de `google.script.run` | adecuación del harness a la nueva RPC |
| `src/10_Pruebas.js` | +3 tests: `Utl_columnaLetra`, `Utl_formulaEdad`, existencia de funciones de menú | verificación de la fase |
| `ARQUITECTURA.md`, `PENDIENTES.md` | documentación vigente actualizada | workflow estándar paso 9 |

## 2. RENDIMIENTO

- **Carga de la Web App**: 3 round-trips `google.script.run` → **1**. En Apps Script
  cada RPC implica serializar/deserializar payload y sobrecarga de invocación; fusionar
  esquema + catálogo + url elimina 2 viajes por carga de página.
- **Vista SECTOR_***: la escritura de fórmulas se hace con un único `setFormulas`
  (batch) por hoja sector, nunca por celda (regla del proyecto: nunca set dentro de loops).
  Costo adicional: 1 llamada a `setFormulas` + 1 a `setNumberFormat` por sector refrescado.

## 3. AUTOMÁTICAS

- **EDAD: verdadero automático.** Antes: `Utl_edadDesde` calculaba el valor al refrescar
  (podía quedar viejo hasta el siguiente refresco). Ahora la columna `EDAD` de `SECTOR_*`
  contiene `=IF(<celda FECHA_NACIMIENTO>="","",IFERROR(DATEDIF(DATE(MID(...),MID(...),MID(...)),TODAY(),"Y"),""))`,
  que se recalcula en vivo al abrir la hoja (TODAY recomputa) y desplaza al día exacto de los
  cumpleaños sin intervención.
- La función pura de vista (`Modelo_vistaSectorDesdePacientes`) no cambió: los tests
  existentes de valores y de "EDAD derivada plausible" siguen en verde.
- No se añadió campo `EDAD` a PACIENTES (la fuente de verdad sigue sin almacenarlo).

## 4. MENÚ

Nuevo menú operativo (sin emojis por elemento, submenús cortos):

- **Captura**: `Abrir formulario`, `Mostrar QR`
- **ECICEP**: `Inicio` · `Personas ›` (Buscar/Ficha, Cola de revisión, Ingresos, Duplicados) ·
  `Seguimiento ›` (Controles) · `Reportes ›` (Estadísticas, Generar REM, Consultar REM) ·
  `Configuración ›` (Configuración, Estratificación, Responsables, Autorizar permisos)
- **Sistema**: `Actualizar`, `Instalar / reparar`, `Backups`, `Formularios`, `Registro del sistema`, `Acerca de`

Retirados del menú (código conservado para diagnóstico): `UI_instalarDiagnosticar`
(Diagnóstico), `UI_centroPruebas` (Centro de Pruebas) y `UI_actualizarTodo` (solapa con
`UI_actualizarSistema`). El test OPT B7 verifica que toda función referenciada existe.

## 5. ESTADÍSTICAS

- No se añadió columna `GRUPO_ETARIO` a las hojas (evita sobrecarga de columnas; §5 de
  la fase). Los grupos de edad se calculan on-the-fly a partir de la columna EDAD viva
  cuando el dashboard las consuma (`08_Dashboard.js`).
- La hoja INICIO con KPIs y la sección de estadísticas existente se mantienen intactas;
  al ser EDAD ahora una fórmula, cualquier suma/promedio por edad se mantiene fresca sin
  refrescos manuales.

## 6. TESTS

Batería completa ejecutada — **738 / 738 verdes** (baseline 735 + 3 nuevos):

| Harness | Resultado |
|---|---|
| núcleo (`ejecutar_local`) | 493/493 (490 + 3 nuevos) |
| aceptación formulario | 50/50 |
| contrato captura V2 | 36/36 |
| backend V2 | 65/65 |
| payload V2 | 16/16 |
| cola FORM_RESPUESTAS | 33/33 |
| contrato datos | 20/20 |
| formulario web | 25/25 |

## 7. GIT

- Rama `master`, acelerada 4 commits sobre `origin/master` (sin push).
- Cambios de esta fase sin commitear hasta decisión del siguiente paso (regla: solo
  commit cuando el usuario lo solicita). `docs/hoja_de_vida.pdf` sigue excluido.
- Deploy pendiente (no autorizado): `clasp push --force` → `clasp deploy --deploymentId AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` (reutiliza @93).