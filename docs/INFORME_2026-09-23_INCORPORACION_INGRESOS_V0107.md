# INFORME INCORPORACIÓN DE INGRESOS ECICEP v0.10.7

**Fecha:** 2026-09-23 · **Versión:** `0.10.7` · **Deploy:** reutiliza el deployment operativo existente (URL base y QR intactos — sin deployments por rutina) · **Esquema:** `2` (sin cambios → sin migración).

---

## 1. Objetivo

Hacer **clara para el operador la incorporación de ingresos** pendientes
(`INGRESO_*`) al sistema, respetando el pipeline único y la Web App como único
canal:

1. Eliminar la promesa de "copia" a sectores ("Al incluirlo se copiará al
   sector…") y el verbo "copiar": la única operación vigente es
   **incorporar** (correr el pipeline único `INGRESO_* → PACIENTES →
   EVENTO INGRESO → INGRESADO → SECTOR_*`).
2. Que el operador sepa **qué pasará** al confirmar y **qué pasó con cada
   fila** (válida / con advertencias / con error / pendiente de revisión).
3. Incorporación **masiva de los válidos en UNA RPC**, sin N RPC por fila y
   sin duplicar pacientes ni eventos.

**Fuera de alcance:** seguridad, roles/permisos, tokens, acceso, migraciones,
columnas nuevas en PACIENTES, nuevas hojas, cambios de deployment/URL/QR,
refactor del pipeline de ingresos (se reutiliza literalmente).

## 2. Hallazgo

- El panel antiguo `#panelIngreso` insistía en "copiar" filas al sector, pero
  el backend jamás copia: ejecuta el pipeline de incorporación. La promesa de
  copia era confusa y no decía al operador qué obtendría.
- El pipeline existente (`Ingresos_procesarTodasLasHojas_`) ya tiene el gate
  completo (validación/normalización → identificación → barrera RUT+fecha
  (2b) → exclusión de INGRESADO en lectura → REVISION/POSIBLE_DUPLICADO sin
  escritura). La incorporación masiva no requiere **ningún filtro nuevo**: solo
  reutilizar `soloHojas` + `confirmarNuevos:false`.

## 3. Implementación (DEC-071, aditiva; UI + 1 endpoint)

**Backend (`src/12_Ingresos.js`, `src/07_UI.js`):**
- `Ingresos_hojasParaSector_(sector)`: PURA, devuelve todas las hojas
  `INGRESO_*` de un sector (canónico + alias `INGRESO_NARANJA`); vacío si no
  existe.
- `Ingresos_listarPendientes` ahora devuelve `conteos: {total, validos,
  advertencias, errores}` calculados sobre el mismo conjunto filtrado (KPI sin
  RPC extra) → expuesto por `api_ingresosPendientes`.
- `Ingresos_incorporarValidos_(opciones)`: invoca
  `Ingresos_procesarTodasLasHojas_({soloHojas, confirmarNuevos:false,
  incluirResultados:true})` y **recompone** el resumen plano del pipeline
  (`Ingresos_respuesta_` aplana los contadores) en el contrato estructurado
  `{resumen, resultados}`. Los contadores de agrupación (ingresados, revisión
  = `REQUIERE_REVISION`, errores = `ERROR`, duplicados = `DUPLICADO`) se
  derivan de `resultados` para que el resumen coincida exactamente con lo que
  la UI pinta por fila (el contador plano `duplicados` del pipeline incluye
  `POSIBLE_DUPLICADO`, que aquí son filas de revisión).
- `api_ingresosIncorporarValidos(opciones, token)` (nuevo): token válido +
  `Ecicep_conLock_`; devuelve `{ok, resumen, resultados}`. **Un solo pipeline,
  un solo lock** → nunca N RPC de cliente.

**Web App (`src/Sidebar.html`):**
- Panel renombrado **"Incorporación de ingresos"** + subtítulo "Revisa e
  incorpora al sistema las personas registradas en las hojas de ingreso." +
  tarjeta **"¿Qué significa incorporar?"** (crear/actualizar paciente,
  registrar su ingreso y actualizar su sector — sin "copiar").
- Filtros: **Sector** (Todos/Naranjo/Amarillo/Verde) y **Estado**
  (Todos/Válidos/Advertencias/Errores). Chips de conteo (Válidos / Advertencias
  / Errores) con retroceso automático de página si la incorporación la dejó
  vacía (§38).
- Botón **"Incorporar todos los válidos"** + aviso "Ir a Cola de revisión"
  cuando quedaron filas en revisión; resumen estructurado tras el masivo
  (Ingresados / Revisar / Errores / Sin cambios) y recarga de la lista.
- Detalle individual: **"Sector destino: X"**, checklist **"Al incorporar"**,
  nota neutra sobre el pipeline, errores/advertencias de la fila. En `ERROR`
  el botón de incorporar queda **deshabilitado** ("No incorporable" + mensaje
  correctivo); con advertencias el botón dice **"Incorporar a {Sector}"** y se
  avisa "⚠ Tiene advertencias, pero puede incorporarse.".
- Resultados traducidos por estado (§13): INGRESADO → "Incorporado
  correctamente"; REQUIERE_REVISION → "Requiere revisión antes de incorporar";
  DUPLICADO → "Ya existe un ingreso equivalente"; ERROR → "No pudo
  incorporarse"; toasts "Nuevo paciente creado" / "Ingreso asociado a paciente
  existente" y "Paciente incorporado a {sector}".
- Tras incorporar se abre la ficha (`_ingDesdeFicha = true` después de
  `abrirFicha`, que resetea el flag) y `volver()` regresa a la lista recargada.
- **Menú ECICEP de Sheets** (`src/07_UI.js`): entrada **"Incorporar ingresos"**
  (`UI_abrirIngresos`) que abre la sidebar directamente en el panel de
  incorporación (modo `ingresos` auto-cargado); menú ECICEP pasa de 4 a **5
  items** (límite testado ≤5). El orquestador legacy "📥 Procesar ingresos"
  sigue existiendo solo como función interna de batch completo.

## 4. Tests

`tests/incorporacion_ingresos_vNEXT.mjs` (**12/12**):
- T1 flujo individual → 1 PACIENTE + 1 EVENTO INGRESO + `INGRESADO` + SECTOR;
- T2 vista `SECTOR_NARANJO` derivada desde PACIENTES+EVENTOS (registro obsoleto
  no persiste; nunca copia manual INGRESO_* → SECTOR_*);
- T3 doble clic / retry idempotente → sin duplicados, "sin cambios";
- T4 ERROR → sin PACIENTES/EVENTO/INGRESADO y botón deshabilitado en UI
  ("No incorporable");
- T5 WARNING (reglas vigentes) sí se incorpora y la UI avisa que es
  incorporable;
- T6 POSIBLE_DUPLICADO → `REQUIERE_REVISION`, sin auto-crear paciente;
- T7 paciente existente → no duplica, EVENTO +1, nota "Registrado sobre
  paciente existente";
- T8 masivo: 3 válidos + 1 warning → 4 `INGRESADO`; 1 `ERROR`; 1
  `REQUIERE_REVISION`; 1 fila ya-`INGRESADO` ignorada; resumen estructurado
  correcto;
- T9 `{sector:'NARANJO'}` procesa solo INGRESO_NARANJO(+) y no toca
  AMARILLO/VERDE; `Ingresos_hojasParaSector_` correcto;
- T10 fila incorporada sale de pendientes pero permanece en INGRESO_*
  (trazabilidad);
- T11 textos UI (renombrado, subtítulo, Sector destino, Incorporar a,
  ausencia de "Copiar al sector" y de promesas de copia);
- T12 `ingMensajeResultado` traduce estados; token denegado en el endpoint
  batch; `conteos` correctos.

## 5. Batería y verificación

```
node tests/incorporacion_ingresos_vNEXT.mjs → 12 · PASS 12 · FAIL 0
node tests/validar_html.mjs                 → 22 archivos · FAIL 0
node tools/verificar.mjs                    → 25 suites · 0 fallos
git diff --check                            → limpio
```

## 6. Definición de terminado (pasada 4)

- Código implementado (backend + UI), tests verdes, docs vigentes actualizados
  (ARQUITECTURA.md, README.md, PENDIENTES.md, DECISIONES.md DEC-071, HISTORIAL),
  `ECICEP.VERSION` → `0.10.7`, deployment operativo reutilizado, commit y push.