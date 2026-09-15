# ECICEP — Jornada autónoma de ingeniería

Este directorio contiene los archivos de control para ejecutar una jornada autónoma de mejora del sistema `Sistema-Gestion-Sectores-ECICEP`.

## Instalación

Copia:

- `.opencode/agents/autonomous-builder.md`
- `.opencode/AUTONOMOUS_WORK_QUEUE.md`

y fusiona el contenido de `opencode.json` con el `opencode.json` existente del proyecto.

## Ejecución ~4 h

Desde la raíz del repositorio:

```bash
timeout --foreground 4h opencode run \
  --agent autonomous-builder \
  --auto \
  "Ejecuta una jornada autónoma completa de ingeniería sobre el proyecto actual. Trabaja exclusivamente mediante la cola .opencode/AUTONOMOUS_WORK_QUEUE.md. Consume tareas, implementa mejoras, ejecuta pruebas, corrige regresiones, actualiza la cola y continúa con la siguiente tarea mientras exista trabajo seguro y útil. No hagas preguntas. No ejecutes git commit, git push ni clasp deploy."
```

`timeout` fija la ventana máxima del proceso; `steps` fija el techo de iteraciones del agente. La cola persistente mantiene una fuente explícita de trabajo siguiente.

## Importante

- No se incluye ninguna API key.
- `git commit`, `git push` y `clasp deploy` quedan protegidos.
- El agente debe actualizar `docs/INFORME_JORNADA_AUTONOMA.md` al finalizar.
