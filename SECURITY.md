# Política de seguridad de ECICEP

ECICEP es un sistema de gestión **sanitaria**: maneja datos personales y
clínicos. La protección de esos datos es prioridad absoluta.

## Regla fundamental

Los datos reales de la clienta **jamás** se versionan en este repositorio
público. Regla aplicada por diseño:

- `.gitignore` excluye planillas, backups, volcados y cualquier artefacto con
  datos reales.
- El contenido real vive solo en el Spreadsheet operativo de la clienta.
- Las baterías de prueba (`tests/`) y la demo publicada (`examples/`) usan
  únicamente datos ficticios.

## Alcance

- Un único entorno operativo: 1 Web App + 1 backend + 1 Spreadsheet.
- Sin claves, tokens, credenciales ni secrets en el código o en Git.
- La configuración real (IDs de Spreadsheet/deployments) se mantiene en
  `src/00_Config.js`, nunca hardcodeada en el repositorio.

## Reportar una vulnerabilidad

Por favor **no abras un issue público** para vulnerabilidades de seguridad.

Reporta por correo al autor (ver sección Autoría del `README.md`) indicando:

- componente y versión afectada;
- descripción del problema (sin exponer datos reales);
- pasos de reproducción si aplica.

El reporte se tria, se corrige y se coordina la divulgación antes de publicar
cualquier detalle.

## Expectativas de respuesta

- Acuse de recibo del reporte: dentro de ~7 días hábiles.
- Análisis y estado: se comunica al remitente.
- Corrección: se publica cuando existe, junto con la actualización
  correspondiente, sin exposición innecesaria.