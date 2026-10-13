# Desarrollo después del release candidate

`release/v0.17.0-rc1` es la referencia congelada del candidato activable. No se usa para features. La activación futura toma exactamente esa rama; el desarrollo nuevo parte en otra rama, por ejemplo `dev/post-v017`.

```text
release/v0.17.0-rc1
        |
        +-- activación futura
        |
        +-- dev/post-v017
                |
             features
```

Reglas:

- contratos públicos: tests primero;
- cambios de schema: migración explícita, nunca modificar `SISTEMA_VERSION_SCHEMA_ACTUAL` sin ella;
- no editar la release branch para features;
- un hotfix P0/P1 de activación se desarrolla y valida fuera, luego se incorpora con cherry-pick documentado y una nueva evidencia de preflight;
- no crear entornos, Spreadsheet, pipeline o deployment paralelos;
- después de una activación verde: integrar release a `master` y crear el tag estable `v0.17.0`. Ese cierre no forma parte de v260 local.
