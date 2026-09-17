# Revisión post-entrega — 2026-09-16

Versión de aplicación: **0.9.10**. Un proyecto Apps Script, un Spreadsheet,
una Web App y el pipeline vigente. Contrato V2 sin cambios.

## Evidencia inicial

- Repositorio limpio, `master` un commit por delante de `origin/master`.
- 3 fallos reproducidos: aceptación (1), cola FORM_RESPUESTAS (2).
- Núcleo: 651 pruebas; las cifras anteriores del README estaban desactualizadas.
- `clasp deployments`: operativo @191 y HEAD. URL operativa cotejada con config.
- Commit local anterior `a5a1524` incluye un instalador `.deb` de 399.595.202 bytes,
  ajeno al sistema. Se conserva el archivo y el historial local del usuario.

## Cambios aplicados

| Área | Evidencia / corrección | Verificación |
|---|---|---|
| Captura | El catálogo administrativo ampliado desplazó columnas de persistencia y mezcló ESTADO de paciente/captura. Se separó el orden físico canónico de 26 columnas; Form_campos conserva los 12 campos persistidos originales. | Baterías de aceptación y cola originales, sin reducir asertos |
| Persistencia | Escrituras y trailer asumían posiciones a pesar de describirse como escrituras por encabezado. Ahora usan los encabezados reales y conservan columnas adicionales/reordenadas. Ausencias/duplicados se rechazan antes de escribir. | Prueba del escritor real con hoja falsa; relectura y trailer, ambos órdenes |
| Reparación | Realinear solo encabezados sobre datos existentes puede cambiar su significado. Se detiene con diagnóstico si la cola poblada no coincide con el esquema. | Filas y encabezados idénticos antes/después de reparación rechazada |
| Formulario | Actualizar contacto exigía y mostraba identidad que su payload V2 no envía. Se alineó su esquema UI con §5.1 (RUT/profesional obligatorios; identidad oculta). | Aceptación existente + regresión nueva |
| Importación | Si el esquema de pacientes era incompatible, ya se habían anexado eventos y se devolvía ok:true. La verificación se anticipa al primer evento y el error detiene la importación. | Prueba con esquema rechazado: cero eventos escritos y ok:false |
| Simulación | ejecutar:false llamaba escritores de estructura, derivados, vistas, formato y logs. Se condicionaron a ejecución real. Enriquecimiento/merge simulado clonaban insuficientemente: ahora trabajan en copias de objetos leídos. | Espías de todos los escritores del orquestador + conservación del memo |
| Controles | Cambios de filtro durante RPC se perdían. Se agrupan y ejecuta la última consulta, descartando éxito/error obsoleto; paginación sin duplicar RPCs. | Pruebas de callbacks asíncronos y paginación |
| Controles | Skeleton reconstruía DOM repetidamente y dejaba el detalle anterior operativo. Se pinta en una escritura y se limpia la selección. | Revisión de implementación y tests UI |
| Fecha / clics | Registrar hoy tomaba UTC, adelantando fecha durante la noche chilena. Usa America/Santiago y bloqueo de doble envío concurrente. | Hora fija próxima a medianoche UTC, doble clic y recuperación tras error |
| Accesibilidad | Etiqueta de búsqueda, aria-busy y resumen anunciado con aria-live. | Sintaxis HTML y comprobaciones del estado UI |
| Publicación / CI | IDs duplicados, `/exec` etiquetado como `/dev`, ausencia de gate de tests. Ahora deriva URL desde config, verifica deployments, descubre suites y ejecuta tests antes de push. | 5 escenarios con clasp/navegador falsos, sin red |

## Verificación local

`node tools/verificar.mjs`: 11 suites. 941 pruebas y 17 scripts HTML,
más sintaxis de todos los JS/GS. Sin relajar asertos existentes; las tres comprobaciones de versión se actualizan
a 0.9.10 junto con el incremento de ECICEP.VERSION.

Desglose: núcleo 651, aceptación 50, backend V2 68, payload 19, cola 33,
contrato V2 36, datos 38, formulario 27, revisión 14, publicación 5.

Las pruebas nuevas usan exclusivamente datos ficticios y dobles de Sheets/RPC.
No se ejecutó INSTALAR, ACTUALIZAR, limpieza, migración ni importación sobre datos reales.

## Publicación y Git

Publicado en el deployment operativo existente como **@192** (v0.9.10), código
`745e29d` en la rama publicable `codex/revision-postentrega-20260916` y PR #5.
CI verde. El formulario abrió y cargó catálogo; no se registraron pacientes de prueba.
La revisión posterior de agenda manual continúa en `INFORME_AGENDA_MANUAL_2026_09_16.md`.

El historial local contiene un paquete .deb de 399 MB en un commit anterior del usuario.
La rama publicable incorpora sus cambios de código excluyendo únicamente ese binario,
sin borrar el archivo ni reescribir el historial local.

## Límites y decisiones pendientes

- Esta revisión no convierte las pruebas locales en una validación clínica.
- La captura positiva hasta el Spreadsheet y la inspección integral del libro
  requieren sesión operativa y un registro de prueba autorizado. Un formulario
  visible o HTTP 200 no demuestra que el registro clínico se haya completado.
- Se mantienen decisiones de `PENDIENTES.md`: reglas/indicadores clínicos,
  interpretación de fuentes, corrección de eventos, responsables/accesos y backups.
- No se modificaron permisos ni se reactivó Google Forms. No se rediseñaron
  problemas cerrados sin nueva evidencia de regresión.
