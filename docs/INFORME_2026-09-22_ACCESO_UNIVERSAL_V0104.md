# INFORME ACCESO UNIVERSAL ECICEP v0.10.4 — Hotfix de acceso operativo

**Fecha:** 2026-09-22 · **Versión:** `0.10.4` · **Deploy:** reutiliza el deployment operativo existente (URL base y QR intactos — la credencial canónica `CAPTURA_ACCESS_TOKEN` se conserva, no se invalida) · **Esquema:** `2` (sin cambios → **NO** se crea MIG-003).

---

## 1. Incidente

Error real de producción al enviar un registro desde la Web App:

```
El procesamiento del envío falló; reintentable (ACCESO_DENEGADO)
```

Mensaje emitido por `Captura_v2_errorEntrega(motivo)` (`src/26_Captura.js:139`) cuando la entrega vuelve `{estado:'ERROR', motivo:'ACCESO_DENEGADO'}`.

## 2. Requisito del propietario

> ECICEP lo usan trabajadores autorizados con el enlace del sistema.
> Mínima fricción, máxima disponibilidad.

La separación de capacidades `CAPTURA ≠ OPERADOR` implementada en v0.10.3 **no representa el requisito real**: un trabajador con el enlace operativo debía poder capturar **y** administrar (ficha, Controles, Dashboard, REM…), no tener capacidades separadas.

## 3. Causa raíz (auditoría completa del pipeline)

- **El pipeline de entrega NO re-autentica.** Grep en la ruta de entrega (`26_Captura`, `29_ActualizacionCaptura`, `24_Formulario`, `31_Ficha`, `12_Ingresos`): ninguna llamada interna a `api_*` ni `WebApp_autorizar*` (solo un comentario en `26_Captura.js:1295`). Los únicos emisores de `ACCESO_DENEGADO` son los guards de los wrappers `api_*` de `07_UI.js` (superficie RPC) y `WebApp_previaDuplicadosV2`.
- **Contradicción del contrato v0.10.3 en la página operativa**: `WebApp_servirCaptura_` servía `MODO_OPERADOR=true` (por sesión activa) pero `window.ECICEP_ACCESO` siempre era el token **CAPTURA** (`data-acceso="<?= CAPTURA_ACCESO ?>"`). Las RPC privilegiadas velaban por el token **OPERADOR** (`WebApp_autorizarBuscador`) → la página mostraba funciones de operador que sus propias RPC rechazaban con `ACCESO_DENEGADO`.
- **Bug de token vacío**: `WebApp_claveCaptura_`/`WebApp_claveOperador_` devolvían `''` ante contención de lock o excepción. `WebApp_servirCaptura_` inyectaba `TOKEN_ACCESO=''` a la página, dejándola sin credencial válida.

## 4. Solución: ACCESO UNIVERSAL ECICEP (DEC-068 supera DEC-067)

| Aspecto | v0.10.3 | v0.10.4 |
|---|---|---|
| Credenciales | `CAPTURA` y `OPERADOR` disjuntas | **Una** credencial canónica: `CAPTURA_ACCESS_TOKEN` (valor conservado) |
| `OPERADOR_ACCESS_TOKEN` | Capacidad privilegiada | Obsoleto, aceptado **solo como legacy** de transición |
| Página base | `TOKEN_ACCESO=''`, `MODO_OPERADOR` condicional, ACTUALIZAR_DATOS oculta | `TOKEN_ACCESO`/`TOKEN_INVITACION` = credencial universal, `MODO_OPERADOR=true`, ACTUALIZAR_DATOS visible |
| `WebApp_claveUniversal_` | — | Nunca devuelve `''`; lock **solo** para crear; bajo contención relee; si no existe, falla |
| Cliente | — | Auto-recuperación: ante `ACCESO_DESACTUALIZADO`/`ACCESO_DENEGADO` recarga 1 vez preservando `captureId` (`ecicep_captureId`/`ecicep_reload_acceso`) |
| Guardas RPC | `WebApp_autorizarBuscador` (OPERADOR) y `WebApp_autorizarCaptura` (CAPTURA) | Ambas delegan en `WebApp_autorizar` (universal). Token inválido/ausente → `ACCESO_DENEGADO` |

Se mantienen intactos los hardening compatibles de DEC-067: superficie RPC mínima (wrappers `api_*`, helpers `_`), guards por RPC, mutaciones atómicas e idempotentes, `CONFIG_SECRETOS`, schema `2`.

## 5. Implementación

- `src/WebApp.gs`: nuevo bloque ACCESO UNIVERSAL (`WebApp_autorizar`, `WebApp_claveUniversal_`, `WebApp_accesoUniversalValido_`), aliases heredados delegan en la capacidad universal, `WebApp_urlCompartida_`/`WebApp_urlVista_` con URL única, `doGet` y `WebApp_servirCaptura_` inyectan la credencial universal (`CAPTURA_ACCESO`/`TOKEN_ACCESO`/`TOKEN_INVITACION`, `MODO_OPERADOR=true`, `PORTAL_URL`).
- `src/CapturaWeb.html`: se elimina el ocultamiento de `cardActualizar`/`.hdr .hdr-btn` por `!ECICEP_MODO_OPERADOR`; se añade auto-recuperación `_recargarAcceso` (recarga 1 vez preservando `captureId` vía `sessionStorage`) en los manejadores de `enviar`, preflight y `WebApp_estadoInicial`.
- `src/29_ActualizacionCaptura.js`/`src/26_Captura.js`: solo comentarios (§40/§42) actualizados a "sin re-autorización"; sin cambios de lógica (la entrega no re-autentica, confirmado por auditoría).

## 6. Tests

- Nueva `tests/acceso_universal_v0104.mjs` (**7/7**): credencial única, legacy solo de transición, `claveUniversal_` nunca `''`, página base operativa, auto-recuperación HTML.
- `tests/acceso_webapp.mjs` reescrita al contrato universal (**8/8**).
- `tests/seguridad_capacidades_v0103.mjs` (**10/10**) y `tests/rpc_surface_v0103.mjs` (**4/4**) ajustadas: token inválido/ausente → denegado; credencial universal autoriza; legacy autoriza (transición).
- Batería total **21 suites · 0 fallos** (verifier 2026-09-22; `validar_html` 21/21).
- `git diff --check` limpio.