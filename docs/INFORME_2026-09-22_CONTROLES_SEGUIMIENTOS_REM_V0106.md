# INFORME CONTROLES/SEGUIMIENTOS + REM ECICEP v0.10.6

**Fecha:** 2026-09-22 · **Versión:** `0.10.6` · **Deploy:** reutiliza el deployment operativo existente (URL base y QR intactos — sin deployments por rutina) · **Esquema:** `2` (sin cambios → sin migración).

---

## 1. Objetivo

1. **Controles por persona** → observar alternativamente **Controles** / **Seguimientos**.
2. **Vista de trabajo REM** sin animación falsa al abrir; estado neutro; loader solo cuando el usuario pulsa **Consultar** y hay RPC real.

**Fuera de alcance:** seguridad, roles/permisos, tokens, acceso, migraciones, nuevas columnas en PACIENTES, nuevas hojas, cambios de deployment/URL/QR, refactor no relacionado.

## 2. Hallazgo

- `Control_filasPanel()` (src/02_Normalizacion.js:892) ya entrega por fila:
  `ultimoControl`, `ultimoSeguimiento`, `proximo`, `estado`, `recordatorio`,
  `edad`, `sector`, `estrat`. **No hacía falta backend nuevo**: el selector
  cambia presentación 100 % en cliente.
- `RemVista.html` tenía un loader (`class="prog"` + "Calculando el informe…")
  en el HTML inicial, pero `init()` no llama `consultar()` → animación falsa
  al abrir.

## 3. Implementación (DEC-070, aditiva, UI-only)

**Controles y seguimientos por persona (`src/Controles.html`):**
- Título: "🩺 Controles y seguimientos por persona" + sub "Agenda y actividad por persona · búsqueda bajo demanda".
- Selector `[Control] [Seguimiento]` con design system (`seg-tipo` / `tipo-btn`), antes de Sector.
- Estado `CTRL.tipo` default `'CONTROL'` (comportamiento previo).
- `setTipoVista(tipo, btn)`: solo presenta sobre `CTRL.filas` (`pintar(false)`); **no** invoca `consultar`, `api_controlPanel` ni `ECICEP_lectura`; no toca sector/estados/termino/paginación/sel.
- `ultimoSegunVista()`/`etiquetaUltimo()`: CONTROL → `ultimoControl` / "Últ. control"; SEGUIMIENTO → `ultimoSeguimiento` / "Últ. seguimiento".
- Tabla: `Estado | Persona | Estrat. | [Últ. control | Últ. seguimiento] | Próxima atención`.
- Detalle: ambos últimos registros (primero el del tipo activo) + Próxima atención + Recordatorio (sin formateo).
- Registrar conserva la vista (nada resetea `CTRL.tipo`).
- Textos neutros: "las atenciones pendientes", "…con atención vencida, próxima o sin próxima atención agendada".
- **Backend sin cambios** (`api_controlPanel`, `Control_consultarControles`, `Control_filasPanel`).

**REM vista de trabajo (`src/RemVista.html`):**
- HTML inicial de `#wrap` neutro: icono `search` + "Selecciona los filtros y pulsa **Consultar**." (sin `prog` ni "Calculando el informe…").
- `consultar(btn)` conserva el loader real justo antes de `api_remVista`.
- `init()` no auto-consulta; restaura `REM_ULTIMA` (año/mes/sector/MODO/actividad).
- `api_remVista`/`_rem9_datos`/`Rem9_armarVistaDatos`/`REM_exportarPdf_` intactos.

## 4. Tests

`tests/controles_seguimientos_rem_v0106.mjs` (**9/9**):
- T1 backend entrega `ultimoControl`/`ultimoSeguimiento`/`proximo`/`estado`;
- T2 selector presente + default `CTRL.tipo='CONTROL'`;
- T3/T5 `setTipoVista` sin RPC y sin tocar filtros/búsqueda/paginación/selección;
- T4 vista CONTROL usa `ultimoControl`, SEGUIMIENTO usa `ultimoSeguimiento`, ambas usan `proximo` como "Próxima atención" (header dinámico vía `etiquetaUltimo`);
- T6 único `CTRL.tipo = tipo` está en `setTipoVista` (registrar no resetea);
- T7 REM abre sin loader ni "Calculando el informe…" y con placeholder neutro;
- T8 `consultar` sí usa loader antes de `api_remVista`;
- T9 `init()` no auto-consulta.

## 5. Batería y verificación

```
node tests/controles_seguimientos_rem_v0106.mjs → 9 · PASS 9 · FAIL 0
node tools/verificar.mjs                        → 24 suites · 0 fallos
                                                 (validar_html 22/22, núcleo 671/671)
git diff --check                                → limpio
```

## 6. Publicación

- `clasp push --force` (sincroniza código).
- `clasp deploy --deploymentId <id-@actual>` sobre el deployment operativo existente — misma URL `/exec` y QR; sin deployments por rutina.
- Smoke: el panel abre en modo Control por defecto; alternar a Seguimiento cambia la columna sin nueva carga; cambio de sector/estado/búsqueda y selección de persona se conservan al alternar; registrar control/seguimiento conserva la vista; la vista REM abre sin animación y muestra el loader solo al pulsar Consultar (Mes y General).

## 7. Documentación actualizada

ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md (DEC-070),
docs/HISTORIAL.md, `src/00_Config.js` (`ECICEP.VERSION` → `0.10.6`),
`src/10_Pruebas.js` (asertos de versión), `src/WebApp.gs` (cabecera de versión).