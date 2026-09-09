# ENTORNO — Arquitectura de entorno único

## Decisión vigente

ECICEP funciona como **un único entorno operativo**.

Esto significa:

- un proyecto Apps Script;
- un Spreadsheet activo;
- una Web App;
- un backend;
- un pipeline;
- una fuente de verdad.

```text
                      ECICEP
                         │
              ┌──────────┴──────────┐
              │                     │
           WEB APP              SHEETS / ADMIN
              │                     │
              └──────────┬──────────┘
                         │
                      BACKEND
                         │
                      PIPELINE
```

## Lo que NO existe como arquitectura

No existen ni deben crearse:

- entorno DEV;
- entorno DEMO;
- entorno PROD/PRODUCCIÓN separado;
- bases de datos paralelas;
- Spreadsheet operativo paralelo;
- pipeline paralelo.

Las referencias antiguas a estos conceptos corresponden a etapas históricas del desarrollo y no describen el estado actual.

## Deployments de Apps Script

Un **deployment** de Apps Script es una forma técnica de publicar una versión del proyecto en una URL concreta.

Un deployment no crea por sí mismo un nuevo entorno funcional.

```text
clasp push
    ↓
sincroniza el código del proyecto Apps Script

clasp deploy --deploymentId <ID>
    ↓
publica una versión en un deployment existente
```

Por lo tanto, `/dev`, `/exec`, `@HEAD`, un número de versión o un ID de deployment deben interpretarse como mecanismos de publicación/versionado. La aplicación sigue siendo una sola.

## Regla de publicación

La URL operativa se determina verificando el deployment que realmente debe servir la aplicación.

No se debe asumir que una URL es correcta por aparecer en un documento histórico. Cuando una tarea afecte la publicación:

1. listar deployments;
2. identificar cuál corresponde a la URL operativa;
3. comprobar la versión publicada;
4. actualizar ese deployment si corresponde;
5. verificar la URL real mediante E2E.

## Deployments históricos eliminados

`@63`, `@89` (legacy) y `@86` (test) fueron deployments antiguos. Fueron eliminados después de verificar que no tenían dependencias operativas activas.

## Deployments vigentes

- **Operativo (publicación real)**: `@108`, servido por `ECICEP.WEB_APP_URL` (`src/00_Config.js`), QR y menú "Abrir formulario".
- **`/dev` (`@HEAD`)**: usado por `tools/push_y_abrir.sh` para revisión rápida tras cada `clasp push` (antes de publicar en el operativo).

## Regla de código

No introducir lógica de entorno, por ejemplo:

```javascript
if (DEV) { ... }
if (DEMO) { ... }
if (PROD) { ... }
```

salvo que exista una decisión arquitectónica futura explícita del usuario.

El sistema se distingue por su configuración real, no por ramas de entorno.
