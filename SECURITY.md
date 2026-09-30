# Política de seguridad de ECICEP

## El acceso concede siempre 2026-09-30 (DEC-102)

`WebApp_autorizar` concede siempre y el token deja de ser la puerta: pasa a ser un
valor de trazabilidad inyectado por el servidor al servir cada vista. Ningún guard
RPC puede devolver `ACCESO_DENEGADO`; los fallos del motor se reportan como tales.

Motivo: con DEC-101 ya en producción, `api_buscar` respondió «se requiere
autorización» porque los guards delegaban en un validador de **formato**
(`^[0-9a-f]{64}$`). Una pestaña con el token vacío, cacheado de una versión
anterior o heredado del modelo ACCESO LIBRE quedaba rechazada, bloqueando
búsquedas, fichas, duplicados, instalador y guardado de captura. El
autoaprovisionamiento cubría el token *ausente*, no el *obsoleto*.

Consecuencias aceptadas: la credencial ya no limita por sí sola el alcance dentro
del sistema (no lo hacía de forma útil, porque todas las funciones son del mismo
personal y se autoaprovisionaba). El control efectivo es quién conoce el enlace
del deployment publicado, y ese enlace no se distribuye por la URL de la credencial
sino por el QR y la comunicación interna. El invariante queda cubierto por
`tests/seguridad_webapp_capacidades_vNEXT.mjs`.

## Acceso universal 2026-09-30 (DEC-101)

ECICEP tiene **una sola capacidad de acceso**: no se distingue entre operador y
usuario, porque el sistema solo lo manejan los trabajadores del CESFAM y todos
operan. La separación Captura/Operador introducida en v0.16.0 (DEC-097) se revierte
porque dejó el sistema inaccesible para todos: exigía una credencial que el código
nunca creaba y una allowlist de identidades que nunca se configuró.

- `ECICEP_ACCESS_TOKEN` es la credencial canónica y habilita **todas** las
  funciones: capturar, ficha, ingresos, controles, estadísticas, configuración,
  backups, registro, REM e instalación. Se **autoaprovisiona** si falta, por lo que
  una credencial ausente nunca deja el sistema inaccesible.
- `CAPTURA_ACCESS_TOKEN`, `OPERADOR_ACCESS_TOKEN` y `LEGACY_ACCESS_TOKEN` se
  aceptan como **alias equivalentes** para no invalidar QR impresos, enlaces y
  pestañas abiertas. No otorgan ningún alcance especial entre sí.
- La credencial **nunca viaja en la URL ni en el QR**. El servidor la inyecta al
  servir cada vista; por eso la URL base del QR abre el sistema completo y
  sobrevive a cualquier rotación.
- No existe allowlist de correos ni de dominios. `WebApp_diagnosticoSeguridad_`
  informa únicamente si el acceso universal está configurado, nunca su valor.
- Se conservan sin cambios: allowlist de superficie RPC, redacción defensiva en
  logs, egress de IA, `XFrameOptionsMode` restringido, y el hecho de que
  `WEBHOOK_TOKEN` siga siendo independiente —GET es solo lectura y las acciones
  mutantes requieren POST JSON y `WEBHOOK_MUTACIONES_HABILITADAS=SI` (por
  defecto deshabilitadas)—.

La consecuencia operativa a asumir es explícita: **quien tenga el enlace puede
usar el sistema completo**. El control real es el enlace del deployment, no un
token, porque la credencial se entrega a cualquier navegador que abra una vista.

## Hardening 2026-09-27

El panel administrativo de Google Forms, su trigger `Form_onFormSubmit` y los
cuatro RPC `api_formulario*` fueron retirados: no tenían consumidores vigentes y
mantenían una segunda superficie de procesamiento incompatible con el contrato
de captura actual. `FORM_RESPUESTAS` permanece únicamente como persistencia
técnica durable de la Web App. El inventario de funciones globales es una
superficie congelada en reducción, no una allowlist mínima aprobada.

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
- Acceso universal: `ECICEP_ACCESS_TOKEN` (+ alias heredados) abre todas las
  funciones del sistema. No hay roles, ni identidades, ni permisos por usuario.
- `WEBHOOK_TOKEN` es independiente. GET es solo lectura; las acciones mutantes
  requieren POST JSON y `WEBHOOK_MUTACIONES_HABILITADAS=SI` (por defecto están
  deshabilitadas). Las respuestas remotas eliminan campos clínicos y secretos.

No se debe registrar, mostrar ni devolver ningún token. `WebApp_diagnosticoSeguridad_`
informa únicamente si el acceso universal está configurado.

## Rotación segura

1. Crear un valor aleatorio de 64 caracteres hexadecimales.
2. Configurarlo en `ECICEP_ACCESS_TOKEN` en Script Properties.
3. Publicar sobre el deployment operativo existente y comprobar el acceso.
4. Distribuir o reutilizar el QR existente: la URL no cambia al rotar, porque la
   credencial viaja inyectada por el servidor y no en la URL.
5. Eliminar los alias heredados (`CAPTURA_ACCESS_TOKEN`,
   `OPERADOR_ACCESS_TOKEN`, `LEGACY_ACCESS_TOKEN`) **solo después** de confirmar
   que ningún enlace antiguo depende de ellos. Mantener mutaciones de webhook
   deshabilitadas salvo durante una ventana operativa controlada.

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
