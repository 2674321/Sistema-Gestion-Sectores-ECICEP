# Correcciones operativas v0.9.11 — 2026-09-16

## Cambios solicitados

- **Agenda manual:** Captura permite indicar Próximo control / seguimiento en sus cuatro
  operaciones. Ficha permite guardar o quitar la fecha. Campo único existente
  `PROXIMO_CONTROL`; omitirlo en Captura conserva la fecha anterior.
- Registrar control/seguimiento, actualizar el sistema y cargar histórico Amarillo
  conservan la agenda. Actualizar no repone fechas borradas desde fuentes antiguas. Paneles, ficha, recordatorios y auditoría leen la fecha guardada.
- **Captura desde Sheets:** una ventana con botón Abrir formulario, QR, copia y descarga.
  Se elimina la dependencia de abrir una pestaña automáticamente tras una RPC, que puede
  bloquear el navegador. El alias QR sigue disponible para accesos previos.
- **Ficha:** se retira CAMBIO_ESTRATIFICACION del selector de nuevos eventos; se conserva
  su historial. Patologías / Estratificación mantiene la edición específica.
- Fechas «hoy» de ficha usan America/Santiago. Fechas inválidas no modifican ni la hoja
  ni el objeto memoizado del paciente.

## Contrato y datos

Extensión V3 (§0 de `CONTRATO_CAPTURA_V2.md`) con `proximoControl` opcional y prefijo Cp3.
El mismo backend acepta Cp2 manteniendo sus huellas, trazabilidad e idempotencia.
FORM_VERSION distingue ambas versiones; la fecha queda en TRAZA_CRUDA, sin otra columna
ni hoja operativa. Si falla guardar agenda después de registrar la atención, el envío
queda ERROR/AGENDA_NO_GUARDADA y puede recuperarse sin duplicar el evento.

No se borran fechas existentes ni se reestratifican pacientes como parte de la publicación.
Las pruebas históricas que exigían cálculo automático se adaptaron explícitamente a la
nueva regla solicitada; se conservan las pruebas de la función matemática histórica.

## Verificación

- `node tools/verificar.mjs`: 12 suites, 965 pruebas y 18 scripts HTML; sintaxis JS/GS incluida.
- Pruebas adicionales: fecha manual en cuatro operaciones, fechas inválidas, compatibilidad
  Cp2 literal, persistencia de versión/traza, fallo y recuperación de agenda, deduplicación,
  conservación de fechas, ficha, panel/auditoría y acceso único con QR.
- Sin registros sintéticos en el Spreadsheet operativo. La captura positiva y apertura de
  la ficha desde otras cuentas requieren sesión de esas cuentas; las pruebas locales no
  sustituyen esa comprobación.

## Publicación

Se reutiliza el deployment operativo y su URL. Versión y evidencia web se completan al publicar.
