# AGENTS.md — Contrato permanente para agentes ECICEP

## REGLAS INVIOLABLES

1. Este repositorio trabaja sobre **un único entorno operativo**.
2. No crear DEV/DEMO/PROD como arquitectura ni separar la aplicación en ambientes paralelos.
3. La **Web App es el único canal operativo de captura de datos**.
4. **Google Forms está abandonado** y no debe reintroducirse, activarse ni documentarse como canal operativo.
5. Existe **una sola fuente de verdad** para el sistema y un solo pipeline clínico.
6. No crear una segunda base de datos, un segundo Spreadsheet operativo ni lógica de negocio paralela.
7. No cambiar backend para resolver un problema que pertenece a UI, publicación o navegación, salvo necesidad técnica demostrada.
8. Leer `AGENTS.md` y la documentación vigente relevante antes de cambiar arquitectura o contratos.
9. No reabrir problemas explícitamente cerrados y validados salvo evidencia nueva de regresión.
10. Ejecutar los tests correspondientes antes de declarar una tarea terminada.

---

## PRECEDENCIA DE INSTRUCCIONES

Cuando exista conflicto documental, utilizar este orden:

1. `AGENTS.md`
2. Código actual
3. Tests actuales
4. Documentación vigente (`docs/`)
5. Decisiones históricas
6. Informes históricos

Una referencia histórica no puede convertirse por sí sola en una instrucción vigente.
Si un documento antiguo contradice el sistema actual, corregir la documentación en lugar de reconstruir la arquitectura antigua.

---

## ARQUITECTURA ACTUAL

ECICEP se entiende como **un solo sistema operativo**, compuesto por:

- **1 proyecto Apps Script**: el proyecto definido por el `.clasp.json` del repositorio.
- **1 Spreadsheet activo**: configurado por `00_Config.js` mediante `ECICEP.SPREADSHEET_ID`.
- **1 Web App**: interfaz/canal operativo de captura.
- **1 backend**: reglas de negocio y servicios existentes.
- **1 pipeline**: reutilizado por todas las operaciones de captura.
- **1 fuente de verdad**: el modelo/configuración vigente del proyecto.

Los IDs de deployment, las versiones de Apps Script y las URLs `/dev` o `/exec` son **mecanismos técnicos de publicación**. No deben describirse como entornos separados.

### Flujo conceptual

```text
                 ECICEP
                    │
          ┌─────────┴─────────┐
          │                   │
       WEB APP            SHEETS / ADMIN
          │                   │
          └─────────┬─────────┘
                    │
                 BACKEND
                    │
                 PIPELINE
                    │
              MODELO CLÍNICO
        PACIENTES + EVENTOS + DERIVADOS
```

Sheets conserva su función administrativa y operativa interna cuando corresponda; eso no crea un segundo sistema ni un segundo entorno.

---

## WEB APP — ÚNICO CANAL DE CAPTURA

La Web App es la única interfaz operativa destinada a registrar datos de captura.

⚠️ CONTRATO DE CAPTURA INVALIDADO.

El flujo contractual anterior (nombres de funciones de captura, `FORM_RESPUESTAS`, estados, acciones, validación e idempotencia) fue retirado deliberadamente y **no debe utilizarse como especificación normativa**. La especificación vigente está definida en `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO** — única fuente del contrato de captura).

Google Forms **no es parte del flujo actual** y no debe reactivarse: no crear formularios, no completar `FORM_ID`, no instalar triggers `onFormSubmit` y no diseñar lógica de aislamiento para formularios.

`FORM_RESPUESTAS` es **implementación existente pendiente de redefinición contractual**: no se asume que su esquema actual sea correcto ni incorrecto.

---

## DEPLOYMENT Y PUBLICACIÓN

`clasp push` y `clasp deploy` cumplen funciones distintas:

- `clasp push --force`: sincroniza el código del repositorio con el proyecto Apps Script.
- `clasp deploy --deploymentId <ID>`: publica una nueva versión en un deployment existente.
- `clasp deployments`: permite inspeccionar los deployments existentes.
- `clasp versions`: permite inspeccionar versiones publicadas.

Para publicar una actualización de la Web App, reutilizar el deployment operativo existente cuando sea posible. **No crear deployments por rutina.**

Nunca asumir que `/dev`, `/exec`, `@HEAD` o un número de versión representan ambientes distintos. Primero verificar qué deployment/versión sirve realmente cada URL.

No eliminar un deployment únicamente por su antigüedad. Antes de una operación destructiva, verificar si alguna URL, configuración, QR, automatización o usuario depende de él.

---

## CONFIGURACIÓN

No hardcodear nuevos IDs de Spreadsheet, formularios o recursos externos.

La configuración activa se determina desde `00_Config.js` y la configuración real del proyecto.

No crear lógica del tipo `if (DEV)`, `if (DEMO)` o equivalente salvo una decisión arquitectónica futura explícita del usuario.

---

## TESTS

No ocultar fallos modificando tests.

Ejecutar, según el alcance de la modificación:

```bash
node tests/ejecutar_local.mjs
node tests/aceptacion_formulario.mjs
node tests/contrato_captura_v2.mjs
```

Los tests de aceptación no deben representar el flujo histórico de Google Forms; el contrato de captura vigente es `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**), al cual se ajustarán los tests al implementarlo (hasta entonces, la batería existente sigue siendo la red de seguridad).

---

## WORKFLOW ESTÁNDAR

```text
1. leer AGENTS.md
2. leer documentación relevante
3. inspeccionar código y estado real
4. identificar contratos y dependencias
5. planificar
6. implementar
7. ejecutar tests
8. corregir regresiones
9. actualizar documentación vigente
10. clasp push
11. actualizar el deployment operativo cuando corresponda
12. E2E / verificación real cuando corresponda
13. git commit
14. git push
```

El agente debe ejecutar automáticamente las tareas rutinarias del workflow cuando las credenciales y herramientas estén disponibles.

Solo solicitar confirmación humana para decisiones realmente arquitectónicas, destructivas, de permisos, de pérdida de datos o irreversibles.

---

## PROBLEMAS CERRADOS

Un problema marcado como resuelto y validado se considera **cerrado**.

No volver a implementar, rediseñar o auditarlo sin evidencia nueva de que el problema reapareció.

Esto incluye, mientras no exista una regresión demostrada, los problemas ya cerrados de contrato de profesionales/dupla, renderizado de `include('00_Tokens')`, esquema de PACIENTES, trazabilidad de `FUENTE`, deduplicación histórica de Amarillo y demás correcciones documentadas como validadas.

---

## SEGURIDAD Y OPERACIONES DESTRUCTIVAS

No modificar ni eliminar recursos fuera del alcance de la tarea.

Una operación destructiva sobre deployments, hojas, archivos, datos o permisos requiere comprobar previamente sus dependencias reales.

Una referencia histórica como `@63` **no tiene protección arquitectónica especial**: si existe y ya no tiene dependencia activa, puede ser candidata a eliminación dentro de una tarea explícita de limpieza, después de verificar sus dependencias. `@63` fue eliminado en la tarea de limpieza de deployments.

---

## DEFINITION OF DONE

Una tarea está terminada cuando, según corresponda:

- código implementado;
- tests ejecutados y verdes;
- documentación vigente actualizada;
- deployment operativo actualizado;
- E2E realizado;
- commit realizado;
- push a Git realizado si las credenciales están disponibles;
- no quedan cambios accidentales;
- no se introdujo arquitectura paralela;
- el estado final quedó explícito para el siguiente agente.

---

## DOCUMENTACIÓN DEL PROYECTO

| Documento | Propósito |
|-----------|-----------|
| `AGENTS.md` | Contrato permanente para agentes |
| `README.md` | Visión general, estado y evolución del proyecto |
| `ARQUITECTURA.md` | Arquitectura técnica y funcional vigente |
| `DECISIONES.md` | Registro de decisiones; conserva también las obsoletas como historial |
| `FORMULARIO.md` | Contrato de captura **INVALIDADO** (obsoleto, sin contenido normativo); el contrato vigente es `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**) |
| `CONTRATOS.md` | Contratos de entrada, salida y pipeline — **INVALIDADOS** (obsoletos, sin contenido normativo); el contrato vigente es `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**) |
| `docs/CONTRATO_CAPTURA_V2.md` | Contrato de captura V2 — **NORMATIVO**, única fuente del contrato de captura (operaciones, payload, idempotencia, estados, errores) |
| `ENTORNO.md` | Definición del único entorno operativo y mecánica de deployments |
| `WORKFLOW.md` | Procedimiento de desarrollo, publicación y verificación |
| `PENDIENTES.md` | Trabajo pendiente real; no contiene tareas históricas ya invalidas |
| `docs/HISTORIAL.md` | Evolución completa por versión y fase (historial, sin valor normativo) |
