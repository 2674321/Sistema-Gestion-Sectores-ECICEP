# WORKFLOW — Flujo de desarrollo ECICEP

## Workflow estándar

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

## Tests

```bash
node tests/ejecutar_local.mjs      # núcleo (469)
node tests/aceptacion_formulario.mjs  # aceptación (29)
```

## Clasp

### Push (actualizar código)

```bash
clasp push --force
```

Actualiza el código del proyecto Apps Script en el editor.

**NO actualiza automáticamente ninguna URL de deployment.**

### Deploy (publicar en URL)

```bash
clasp deploy --deploymentId <ID>
```

Crea una nueva versión y apunta la URL del deployment a ella.

### Listar deployments

```bash
clasp deployments
```

### Listar versiones

```bash
clasp versions
```

## Deployment

### Deployment activo

- ID: `AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ`
- URL: `https://script.google.com/macros/s/AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ/exec`

### Producción (NO MODIFICAR)

- ID: `@63`
- URL: `https://script.google.com/macros/s/AKfycbxBbj3ILC_EN0TaltS9uWkgcYAQftpEY3jSNvp0FM9jmoC3G_mo_1pyZMS9truXSWnYNw/exec`

### Script automático

```bash
bash tools/push_y_abrir.sh
```

Ejecuta: push → deploy → abre Web App.

## E2E

Después de cada deploy, verificar:

1. Abrir `/exec` → Web App carga
2. Verificar menú: Captura / ECICEP / Sistema
3. Probar "Abrir formulario" → abre Web App
4. Probar "Mostrar QR" → QR visible y escaneable
5. Probar envío de formulario → éxito

## Git

```bash
git add .
git commit -m "tipo: descripción"
git push origin master
```
