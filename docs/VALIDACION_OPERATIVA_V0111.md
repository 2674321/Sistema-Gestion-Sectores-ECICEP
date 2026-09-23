# Checklist de validación operativa v0.11.1

Ejecutar con una cuenta Google autorizada sobre el único Spreadsheet operativo.
No crear otro deployment, Spreadsheet ni proyecto.

- [ ] Abrir **Instalar / reparar** y confirmar que la salud rápida identifica Datos, Integridad, Ingreso y Respaldo por separado.
- [ ] Ejecutar **Auditoría profunda** y verificar que informa conteos, sin nombres, RUT, teléfonos ni otros datos personales.
- [ ] Ejecutar **Instalar / reparar** y comprobar que crea un backup previo antes de la primera fase que escribe.
- [ ] Confirmar que existe exactamente un trigger `ECICEP_onEditIngreso`, `ON_EDIT`, asociado al Spreadsheet operativo.
- [ ] Cambiar una fila válida de `INGRESO_*` a `INGRESADO` y verificar paciente, evento `INGRESO`, fuente hoja/fila y vista sectorial.
- [ ] Ejecutar nuevamente la auditoría profunda; debe quedar `OK` o explicar cada diferencia restante.
- [ ] Abrir **Backups** y comprobar horario, retención, carpeta, última copia y tipos de backup.
- [ ] Verificar el `/exec` sin cuenta Google: inicio, Captura, QR/enlace y ficha mediante la credencial universal.

Si una comprobación falla, conservar los eventos/filas implicados y registrar el
estado técnico; la reparación no elimina huérfanos ni duplicados automáticamente.
