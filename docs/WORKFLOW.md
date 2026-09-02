# WORKFLOW — Flujo de desarrollo ECICEP

## Objetivo

Mantener un único sistema ECICEP coherente desde el código hasta la Web App publicada, evitando que el estado del repositorio, el deployment y la documentación se separen entre sí.

## Flujo estándar

```text
1. leer AGENTS.md
2. leer documentación relevante
3. inspeccionar código, tests y estado real de publicación
4. identificar contratos y dependencias
5. planificar
6. implementar
7. ejecutar tests
8. corregir
9. actualizar documentación
10. clasp push --force
11. actualizar deployment operativo cuando corresponda
12. E2E / verificación real
13. git add / commit
14. git push
```

No pedir confirmación para pasos rutinarios. Solicitar intervención humana solo cuando exista una decisión arquitectónica, destructiva, de permisos, de pérdida de datos o irreversible.

## Tests

Ejecutar los tests que correspondan al alcance:

```bash
node tests/ejecutar_local.mjs
node tests/aceptacion_formulario.mjs
```

El test de aceptación representa el **flujo actual de la Web App**. No debe reinterpretarse como una prueba que requiera Google Forms.

No modificar tests para ocultar un fallo.

## Clasp

### Sincronizar código

```bash
clasp push --force
```

Esto actualiza el código del proyecto Apps Script.

**No actualiza automáticamente las versiones servidas por un deployment existente.**

### Publicar en un deployment existente

```bash
clasp deploy --deploymentId <ID>
```

Esto publica una nueva versión en ese deployment.

### Inspeccionar deployments

```bash
clasp deployments
```

### Inspeccionar versiones

```bash
clasp versions
```

## Regla de publicación

El proyecto tiene un único entorno operativo, aunque Apps Script pueda mostrar múltiples deployments o URLs técnicas.

Antes de cambiar o eliminar deployments:

1. listar el estado real;
2. identificar la URL operativa;
3. comprobar qué versión sirve cada deployment relevante;
4. comprobar dependencias de URL, QR, hojas, automatizaciones y usuarios;
5. actualizar el deployment correcto;
6. realizar E2E;
7. eliminar únicamente lo que esté demostrado como obsoleto.

No crear deployments nuevos por cada push. Reutilizar el deployment operativo existente cuando sea posible.

## `/dev` y `/exec`

`/dev` y `/exec` **NO son ambientes separados**. Son mecanismos técnicos de publicación de Apps Script que sirven el mismo proyecto.

| Canal | Mecanismo | Cuándo usarlo |
|-------|-----------|---------------|
| `/dev` | `clasp push --force` | Revisión rápida del código actual (`@HEAD`) |
| `/exec` | `clasp push --force` + `clasp deploy --deploymentId <ID-operativo>` | Publicación operativa (ver `clasp deployments`) |

**HEAD** es el código fuente actual del proyecto después de `clasp push`.

**`/dev`** es la URL de desarrollo que refleja HEAD sin necesidad de crear una versión.

**`@HEAD` / deployment operativo** es el que sirve `/exec` (verificar con `clasp deployments` cuál es el operativo actual; `@85` fue histórico).

**`/exec`** es la URL estable que utilizan los usuarios finales.

La diferencia es de **mecanismo de publicación**, no de arquitectura.

### Desarrollo / revisión

```bash
clasp push --force
# → recargar /dev en el navegador
```

No crear versión. No ejecutar `clasp deploy`. No cambiar URL.

### Publicación operativa

```bash
clasp push --force
clasp deploy --deploymentId <ID-operativo>
# → probar /exec (identificar ID con clasp deployments)
```

Verificar que `/exec` carga la versión esperada.

### Script automatizado

```bash
bash tools/push_y_abrir.sh            # push + abrir /dev
bash tools/push_y_abrir.sh --publish  # push + deploy @85 + abrir /exec
```

## E2E mínimo después de un cambio de Web App

Verificar, según corresponda:

1. la URL operativa `/exec` carga la versión esperada;
2. la UI muestra el estado/versión correspondiente;
3. **Abrir formulario** genera y abre la URL correcta de la Web App;
4. **Mostrar QR** genera un QR real, visible y escaneable;
5. una captura de prueba completa el pipeline hasta el estado esperado;
6. no se crea una ruta paralela ni se duplica un evento.

## Git

```bash
git add .
git commit -m "tipo: descripción"
git push origin master
```

La documentación debe quedar actualizada en el mismo cambio cuando el comportamiento, contrato, deployment o arquitectura haya cambiado.
