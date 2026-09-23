# INFORME FIABILIDAD OPERATIVA + LECTURAS ACOTADAS ECICEP v0.10.5

**Fecha:** 2026-09-22 · **Versión:** `0.10.5` · **Deploy:** reutiliza el deployment operativo existente @221 (URL base y QR intactos — sin deployments por rutina) · **Esquema:** `2` (sin cambios → **NO** se crea migración).

---

## 1. Contexto

v0.10.4 (ACCESO UNIVERSAL, DEC-068) resolvió la autorización operativa; el backend
y el pipeline ya eran idempotentes (`docs/CONTRATO_CAPTURA_V2.md`, **NORMATIVO**).
Quedaban tres tipos de riesgo en el frente operativo:

1. **El envío podía colgarse o duplicarse la percepción de un envío.** El operador
   entregaba el payload sin saber si el backend lo recibió; ante latencia/timeout,
   la repetición AJAX y un reintento manual del usuario podían duplicar controles.
2. **Recarga en bucle ante `ACCESO_DESACTUALIZADO`** si el acceso quedaba
   desincronizado entre pestañas.
3. **Costo de lectura no acotado**: `Ingresos_leerHoja` barria la hoja completa
   (`getDataRange`) en requests de captura/pre-ficha, aunque la Web App siempre
   acota a filas concretas. Con hojas de miles de filas, cada request pagaba el
   escaneo sin necesidad técnica.

## 2. Qué se implementó (DEC-069, aditiva sobre DEC-067/DEC-068)

**Estado de envío por acción:**
- Las 4 acciones (`NUEVO_INGRESO`, `ACTUALIZAR_DATOS`, `SEGUIMIENTO`,
  `CAMBIO_SECTOR`) fijan `_enviando=true` con fase correcta (`entrega` /
  `preflight` para `NUEVO_INGRESO`) y producen **exactamente UNA RPC**.
- El botón se bloquea durante el envío y **siempre** se desbloquea: por respuesta,
  por timeout (mensaje compartido "tardando más de lo esperado") o por modal de
  duplicados (que pausa el timeout humano y conserva el envío activo).
- **Guard de secuencia**: un callback de una solicitud vieja (timeout que llegó
  tarde) jamás toca una solicitud nueva (`secuencia` en `sessionStorage`).

**Intención explícita de duplicado:**
- Continuar desde el modal de duplicados conserva el payload sin
  `confirmarNuevoPaciente`; "Registrar de todos modos" lo fija. El backend lo
  usa como confirmación de la intención humana y mantiene la idempotencia por
  `captureId` (mismo `captureId` con payload distinto → `CONFLICTO_IDEMPOTENCIA`;
  reenvío de un control con el mismo payload no duplica el evento).

**Recuperación de acceso anti-bucle:**
- Ante `ACCESO_DESACTUALIZADO` recarga **UNA** vez (`ecicep_reload_acceso`
  consumido), conservando `captureId` en `sessionStorage` (`ecicep_captureId`) y
  restaurándolo sin reenviar. Un segundo incidente sin marcar sano avisa y no
  recarga otra vez.

**Bootstrap bloqueante:**
- Catálogo de profesionales vacío → `CATALOGO_PROFESIONALES_NO_DISPONIBLE`,
  reintenta (máx. configurado) y **jamás habilita el envío**; errores temporales
  reintentan automáticamente; el botón Reintentar ejecuta un intento nuevo.
- Invariante verificado: el backend **NUNCA** responde `ok:true` de
  `WebApp_estadoInicial` sin `profesionales` cargados.

**Contrato RPC uniforme: dataset vacío ≠ RPC fallida.**
- Conjuntos sin datos → `ok:true` con colecciones vacías (`api_buscar` `filas:[]`,
  `api_revisionListar` `casos:[]` con métricas en cero). Fallos reales y accesos
  rechazados → `ok:false` con `codigo/motivo`. `api_ficha` nunca devuelve `null`.
- `api_remVista` valida el período: `PERIODO_INVALIDO` → `ok:false` con motivo.

**Concurrencia del operador:**
- `Ecicep_conLock_`: bajo contención responde `SERVICIO_OCUPADO` (reintentable)
  y **no ejecuta** la mutación (verificado en acceso y en `api_fichaGuardarCambios`).
- Ficha **todo-o-nada**: guarda PACIENTES + EVENTO; un fallo de vista derivada
  solo avisa `VISTA_SECTOR_PENDIENTE` (no rompe el guardado). Retry del mismo
  cambio de sector converge (un solo `CAMBIO_SECTOR`; dato obsoleto → `FICHA_CAMBIO`).

**Lecturas acotadas (§41):**
- `Ingresos_leerFilasAcotadas_` (src/12_Ingresos.js:275): lee SOLO la fila de
  encabezados + las filas físicas permitidas, con getRange de UNA fila cada una;
  nunca `getDataRange` ni `getRange(1,1,getLastRow(),...)`.
- `Ingresos_leerHoja` usa la ruta acotada cuando `filasPermitidas.length ≤ 50`
  (el umbral vive en el lector; con 51+ delega en `Modelo_leerBloqueCabecera`).
- `api_ingresoDetalle` (pre-ficha del sidebar) = una única lectura acotada.

## 3. Tests nuevos

- **`tests/operador_resiliencia_vNEXT.mjs` (32/32)** — estado de envío y una
  sola RPC por acción (A1–A3), guard de secuencia (A4), modal de duplicados
  (A5, A6, A6b, A7), recuperación de acceso anti-bucle y captureId (B1–B5),
  bootstrap bloqueante y reintentos (C1–C5), contrato RPC dataset vacío ≠ fallo
  (D1–D7), idempotencia/concurrencia/ficha todo-o-nada (E1–E7).
- **`tests/captura_rendimiento_acotado_vNEXT.mjs` (9/9)** — invariante de
  fuente (A1), fixture de 10.000 filas con objetivo fila 9.876 leído como
  encabezado + 1 fila, sin `getDataRange` ni lecturas de bloque (A2–A3),
  integración `Ingresos_leerHoja` y `api_ingresoDetalle` acotadas (B1–B3),
  umbral de 50 filas (C1–C2), pre-ficha del sidebar por ruta acotada (D1).

## 4. Batería y verificación

```
node tests/operador_resiliencia_vNEXT.mjs        → 32 · PASS 32 · FAIL 0
node tests/captura_rendimiento_acotado_vNEXT.mjs → 9 · PASS 9 · FAIL 0
node tools/verificar.mjs                         → 23 suites · 0 fallos
                                                  (validar_html 22/22, núcleo 671/671)
git diff --check                                 → limpio
```

## 5. Publicación

- `clasp push --force` (sincroniza el código con el proyecto Apps Script).
- `clasp deploy --deploymentId <id-@221>`: publica la nueva versión en el
  deployment operativo existente — misma URL `/exec` y QR; sin deployments por
  rutina.
- Smoke operativo: la URL pública carga, `WebApp_estadoInicial` responde
  `ok:true` con `profesionales`, y el envío de prueba converge sin duplicar.

## 6. Documentación actualizada

ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md (DEC-069),
docs/HISTORIAL.md, `src/00_Config.js` (`ECICEP.VERSION` → `0.10.5`),
`src/10_Pruebas.js` (asertos de versión), `src/WebApp.gs` (cabecera de versión).

## 7. Fuera de alcance (explícito)

Roles/tokens/ACL nuevos (se mantiene la credencial única de DEC-068); cambios de
schema (sigue en **2**); nuevos deployments; reopen de problemas cerrados;
procesamiento masivo de datos reales sin instrucción explícita.