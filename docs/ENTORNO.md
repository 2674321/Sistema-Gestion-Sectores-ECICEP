# ENTORNO — Arquitectura de entorno único

## Decisión definitiva

ECICEP utiliza un **único entorno activo de trabajo**.

```
          ECICEP
             │
      ┌──────┴──────┐
      │             │
   WEB APP       SPREADSHEET
      │             │
      └──────┬──────┘
             │
          BACKEND
             │
          PIPELINE
```

- 1 proyecto Apps Script
- 1 Spreadsheet
- 1 Web App
- 1 backend
- 1 fuente de verdad

## No existe

- Entorno DEV
- Entorno DEMO
- Entorno PRODUCCIÓN como arquitectura

## Deployments

Los deployments de Apps Script son **mecanismos técnicos de publicación/versionado**.

No constituyen por sí mismos entornos de aplicación.

```
clasp push → actualiza código
clasp deploy → actualiza URL de deployment
```

## Producción @63

Existe una implementación histórica identificada como `@63`.

No debe utilizarse como argumento para crear arquitectura multi-entorno.

No modificar. No utilizar para pruebas.

## Regla

No crear lógica de entorno (`if (DEV) ...`, `if (DEMO) ...`) salvo decisión explícita futura.

El sistema actual es portable mediante su configuración real, no mediante múltiples ramas de entorno.
