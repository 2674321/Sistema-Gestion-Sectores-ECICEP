# Informe v260 — release baseline

Fecha: 2026-10-13. Alcance exclusivamente local: repositorio, pruebas y Git.

## Git

```text
HEAD inicial: 48355976b0a861abcaaaed6551301ee4012eaadd
HEAD final: referencia release/v0.17.0-rc1 (verificación exacta con git rev-parse)
rama de trabajo: codex/v255-operabilidad-observabilidad
release branch: release/v0.17.0-rc1
working tree: CLEAN al cierre
```

La autorreferencia de un commit no puede almacenar su propio SHA dentro del mismo contenido; el SHA final autoritativo es el target exacto de la release branch y queda informado por Git al cierre.

## Cierres

```text
atomic append: PASS
cache epoch: PASS
invalid review payload: PASS
XSS audit: PASS
release preflight: PASS
activation assistant: PASS
release manifest: PASS
```

- `Modelo_commitAtomico_` aplica prepare fuera de lock, revalidación/commit/verificación bajo lock breve y trabajo derivado fuera. `Fuentes_cargaReal_` lo utiliza y la contención termina en `SERVICIO_OCUPADO` sin commit.
- `ECICEP_DATA_EPOCH` evita que un lector anterior repueble la caché vigente; fallo de Properties desactiva la caché entre requests.
- Una revisión abierta con JSON inválido queda visible, cuenta como pendiente y no es resoluble automáticamente.
- La auditoría XSS clasificó todos los HTML con sinks y corrigió el error fatal del dashboard que insertaba texto crudo.
- El preflight GAS es read-only y el asistente no contiene operaciones de publicación.

## Versiones

```text
app: 0.17.0 (candidato rc1)
schema: 2
installer: INST-1
forms schema: 3
```

No existe MIG-003 ni cambio de contrato clínico.

## Verificación

- núcleo: 679/679;
- inventario: 149 suites;
- aceptación: 50/50;
- contrato Captura V2: 36/36;
- HTML: 21/21;
- seguridad DEC-110 y superficie RPC: PASS;
- v259/v259.1 y siete suites v260: PASS;
- `git diff --check`: PASS;
- preflight de release unificado: PASS sobre el HEAD limpio final.

## Producción

```text
CLASP_PUSH: NO
DEPLOY: NO
FORM_REAL: NO
SHEET_REAL: NO
PROPERTIES_REALES: NO
TRIGGERS_REALES: NO
E2E_REAL: NO
QR: UNCHANGED
DATOS_CLINICOS: UNCHANGED
MASTER: UNCHANGED
```

## Qué queda para activar

Solo operación runtime fuera de horario: cerrar jornada, ejecutar preflight, crear backup reciente, abrir ventana técnica, configurar operador/Form si faltan, publicar el mismo proyecto, instalar/reparar, actualizar el mismo deployment, ejecutar E2E, decidir GO y cerrar la ventana.

## Qué queda para desarrollo

Las decisiones clínicas/negocio y features futuras no bloquean el transporte. Deben continuar en una rama separada basada en el candidato; la release branch permanece congelada. Tras una activación verde se podrá integrar a `master` y etiquetar `v0.17.0` en una tarea posterior.

RELEASE_BASELINE_READY_FOR_ACTIVATION_AND_CONTINUED_DEVELOPMENT
