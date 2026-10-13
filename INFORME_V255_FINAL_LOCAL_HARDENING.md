ESTADO: READY_FOR_GAS_PREACTIVATION

HEAD_INICIAL: 0f0d1377f2dc888a427cc3e4099ffb7e2f828004
HEAD_FINAL: 6d7c5f1e0ccc392adb7496f166be0a42d742f53f

FIXES:
- correct secret bypasses failed-login throttle: PASS
- malformed gateway args fail-closed: PASS
- DEC-110 docs/comments consistent: PASS
- RENAMES_PLAN hygiene: PASS

SECURITY:
- public globals: 12
- capture RPC: 4
- auth/gateway RPC: 3
- direct operator RPC: 0
- PII without OPSESS: 0
- real secrets committed: 0

TESTS:
- suites: 129
- failures: 0
- core: 679/679
- contract: 36/36
- HTML: 21/21
- auditar_v254: PASS
- placeholders: PASS

PRODUCTION:
- clasp push: NO
- deploy: NO
- Form real: NO
- Sheet real: NO
- properties reales: NO
- triggers reales: NO
- QR: unchanged

V254:
- frozen: YES
- PR13 unchanged: YES

---

## Detalle de los fixes

### 1. DoS de login por rate-limit global — cerrado
`WebApp_operadorIniciar` comprobaba el contador de fallos **antes** de verificar
la clave, así que 20 fallos anónimos bloqueaban también al operador legítimo.
Nuevo orden: `cache` → `configurado` → `hash esperado` → `hash clave` →
`comparar constante` →

- **clave correcta** → `ok:true` SIEMPRE, limpia `OPLOGIN_FAIL_COUNT`, crea OPSESS;
- **clave incorrecta** → contador `>=20` ⇒ `OPERADOR_LOGIN_TEMPORALMENTE_LIMITADO`;
  contador `<20` ⇒ registra fallo y devuelve `CREDENCIALES_INVALIDAS`.

Sin sleep/lock largo/captcha/OAuth/IP-tracking.
Cubierto por `tests/operator_session_v255.mjs` (19º/20º/21º intento, bypass con
clave correcta, contador limpiado y reinicio) y
`tests/seguridad_webapp_capacidades_vNEXT.mjs` §8.

### 2. Gateway fail-closed ante `args` malformado — cerrado
`WebApp_operadorRpc`: `undefined`/`null` ⇒ `[]`; **no-array** (objeto, string,
número, booleano, función) ⇒ `RPC_OPERADOR_ARGUMENTOS_INVALIDOS` **antes** de
invocar; la función destino no se ejecuta. Sin conversión de objetos ni
array-like ni `JSON.parse` implícito.
Cubierto por `tests/operator_rpc_boundary_v255.mjs` §4b.

### 3. Comentarios/docs vigentes alineados a DEC-110
`src/WebApp.gs`: bloque de cabecera y de control de acceso reescritos
(CAPTURA anónima/universal · OPERADOR/ADMIN con OPSESS + secret independiente ·
`ECICEP_ACCESS_TOKEN` compatibilidad/trazabilidad, NO autenticación), con
referencia histórica explícita a DEC-101/DEC-102. `docs/CONTRATO_CAPTURA_V2.md`
acota el acceso universal a la captura.

### 4. Higiene de `RENAMES_PLAN.json`
Artefacto generado (700 entradas) reflejado en código/tests/informe y
reproducible con `tools/privatizar_rpc_surface_v255.mjs`; se **elimina** y se
añade `/RENAMES_PLAN.json` a `.gitignore`.

## Verificaciones extra
- CacheService no disponible: login y RPC de operador fail-closed; captura
  pública sigue PASS (`operator_session_v255`, `public_capture_unauthenticated_v255`).
- Webhook separado: `WEBHOOK_TOKEN` independiente de OPSESS y del secreto de
  operador (`tests/webhook_seguridad_vNEXT.mjs`; GET lectura + POST según flag).
- Superficie privada intacta: `rpc_public_surface_v255` → 12 públicas, 0
  inesperadas. TTL OPSESS = 21600 s sin cambios; sin sesiones en ScriptProperties.
- Sin reabrir la privatización (`private_trigger_menu_handlers_v255`: 6 triggers,
  13 items de menú).
- `git diff --check` limpio.

## Alcance
Sólo código/tests/docs + `.gitignore`. Sin `clasp push`, sin deploy, sin tocar
Form/Sheet/ScriptProperties/triggers/deployment/QR; sin `master`/PR#13; sin
configurar el secreto de operador real.

## Siguiente etapa
`GAS PREACTIVATION: snapshot → backup → deployment discovery → controlled source
push → operator secret provisioning → Form adoption → triggers → synthetic E2E →
rollback rehearsal → GO/NO-GO`.
