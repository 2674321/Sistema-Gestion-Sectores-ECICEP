# AGENTS.md — Contrato permanente para agentes ECICEP

## Entorno

Este repositorio trabaja sobre **un único proyecto Apps Script** y **un único Spreadsheet configurado**.

No introducir separación DEV/DEMO/PRODUCCIÓN salvo instrucción explícita del usuario.

**Estado actual: arquitectura de entorno único.**

La existencia de deployments/versiones técnicas de Apps Script NO cambia esta decisión arquitectónica.

---

## Arquitectura

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

- **1 proyecto Apps Script** (`.clasp.json` define el proyecto activo)
- **1 Spreadsheet** (`00_Config.js` define `ECICEP.SPREADSHEET_ID`)
- **1 Web App** (canal único de captura)
- **1 backend** (mismo pipeline para todas las operaciones)
- **1 fuente de verdad** (`00_Config.js`)

---

## Web App

La Web App es el **único canal de recolección de datos** ECICEP.

Google Forms **no forma parte** del sistema de captura actual.

No reintroducir Google Forms.

---

## Backend

Reutilizar el pipeline existente.

No crear pipelines paralelos.

No crear bases paralelas.

---

## Configuración

No hardcodear nuevos IDs de Spreadsheet, Form o recursos externos.

La fuente de verdad es `00_Config.js`.

---

## Deployment

`clasp push` y `clasp deploy` son operaciones distintas:

- `clasp push` → actualiza el código del proyecto Apps Script
- `clasp deploy --deploymentId <ID>` → actualiza una URL de deployment

Para publicar código actualizado en la Web App:

```bash
clasp push --force
clasp deploy --deploymentId <deployment activo>
```

No crear deployments innecesarios. Reutilizar el deployment existente cuando sea posible.

---

## Tests

No ocultar fallos modificando tests.

Ejecutar tests antes y después de cambios:

```bash
node tests/ejecutar_local.mjs      # núcleo
node tests/aceptacion_formulario.mjs  # aceptación
```

---

## Git

Ejecutar commit/push automáticamente en el workflow normal de desarrollo.

Workflow estándar:

```
1. leer AGENTS.md
2. leer documentación relevante
3. inspeccionar código
4. planificar
5. implementar
6. tests
7. corregir
8. actualizar documentación
9. clasp push
10. deployment
11. E2E
12. git commit
13. git push
```

---

## Seguridad

No realizar operaciones destructivas ni modificar recursos fuera del alcance.

Producción `@63` **NO MODIFICAR**.

---

## Done

Una tarea está terminada cuando:

- código implementado;
- tests ejecutados;
- deployment actualizado cuando corresponda;
- E2E realizado cuando corresponda;
- documentación actualizada;
- git commit realizado;
- git push realizado si las credenciales están disponibles;
- no existen cambios accidentales;
- no se introdujo arquitectura paralela.

---

## Fuentes de verdad

Cuando exista conflicto entre:

- prompt antiguo
- documentación antigua
- informe antiguo

y:

- código actual
- tests actuales
- arquitectura vigente

**la fuente de verdad actual debe prevalecer.**

Investigar la contradicción y actualizar la documentación, no reconstruir la arquitectura antigua.

---

## Documentación histórica

Referencias a DEV/DEMO en documentos existentes son **HISTÓRICAS** ( DEC-049, v0.9.1 ).

Estado actual: un único entorno operativo.

No utilizar documentación histórica como justificación para crear arquitectura multi-entorno.
