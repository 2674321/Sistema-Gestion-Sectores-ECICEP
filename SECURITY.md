# Política de seguridad de ECICEP

## Hardening 2026-09-27

El panel administrativo de Google Forms, su trigger `Form_onFormSubmit` y los
cuatro RPC `api_formulario*` fueron retirados: no tenían consumidores vigentes y
mantenían una segunda superficie de procesamiento incompatible con el contrato
de captura actual. `FORM_RESPUESTAS` permanece únicamente como persistencia
técnica durable de la Web App. La Captura pública no incluye capacidad Operador.
El inventario de funciones globales es una superficie congelada en reducción,
no una allowlist mínima aprobada.

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

## Alcance y capacidades

- Un único entorno operativo: 1 Web App + 1 backend + 1 Spreadsheet.
- Sin claves, tokens, credenciales ni secretos en código o Git. Las credenciales
  viven exclusivamente en **Script Properties**.
- `CAPTURA_ACCESS_TOKEN` autoriza solo el canal de captura. Su URL/QR no concede
  acceso a fichas, estadísticas, configuración, backups ni instalación.
- `OPERADOR_ACCESS_TOKEN` autoriza paneles operativos y administrativos. También
  puede autorizarse una sesión Google mediante `OPERADOR_EMAILS` o
  `OPERADOR_DOMINIOS`, ambos allowlists explícitos separados por coma.
- `LEGACY_ACCESS_TOKEN`, si se conserva durante una migración, solo tiene alcance
  de captura. Debe eliminarse al terminar la rotación.
- `WEBHOOK_TOKEN` es independiente. GET es solo lectura; las acciones mutantes
  requieren POST JSON y `WEBHOOK_MUTACIONES_HABILITADAS=SI` (por defecto están
  deshabilitadas). Las respuestas remotas eliminan campos clínicos y secretos.

No se debe registrar, mostrar ni devolver ningún token. `WebApp_diagnosticoSeguridad_`
informa únicamente si cada capacidad está configurada.

## Rotación segura

1. Crear valores aleatorios independientes de 64 caracteres hexadecimales para
   Captura, Operador y Webhook.
2. Configurarlos en Script Properties; añadir el correo o dominio operador solo
   si se usará identidad Google explícita.
3. Publicar sobre el deployment operativo existente y comprobar primero el
   acceso de Operador en una sesión autorizada.
4. Regenerar y distribuir el QR de Captura; revocar el anterior reemplazando
   `CAPTURA_ACCESS_TOKEN`.
5. Eliminar `LEGACY_ACCESS_TOKEN`. Mantener mutaciones de webhook deshabilitadas
   salvo durante una ventana operativa controlada.

Rollback: restaurar la versión anterior del deployment y los valores anteriores
de Script Properties desde el registro seguro externo. Nunca guardar esos valores
en commits, issues, logs o documentos del repositorio.

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
