// ---------------------------------------------------------------------------
// 30_Ingesta.js — Canal de ingesta alternativo (PLACEHOLDER DESACTIVADO).
//
// AGENTS.md (reglas 3 y 4): Google Forms está abandonado y NO se reintroduce,
// activa ni documenta como canal operativo; la Web App es el único canal de
// captura. Este módulo solo DESCRIBE cómo se aislaría un adaptador futuro y
// garantiza que cualquier intento de envío por un provider distinto al Web App
// termine en `FALLBACK_PROVIDER_DISABLED`, SIN ninguna escritura.
//
// Los nombres están reservados para que ninguna lógica futura colisione.
// ---------------------------------------------------------------------------

/** Provider operativo: siempre el Web App (REGLA 3). */
var CAPTURA_INGESTA_PROVIDERS = {
  WEBAPP: 'WEBAPP',
  GOOGLE_FORMS_FUTURE: 'GOOGLE_FORMS_FUTURE'
};

/** Nombre del provider activo para diagnóstico §23/§24. */
function CapturaIngress_providerActivo() {
  return CAPTURA_INGESTA_PROVIDERS.WEBAPP;
}

/**
 * Un provider está "reservado" cuando existe su clave de configuración pero la
 * activación es falsa (placeholder). Devuelve false para GOOGLE_FORMS_FUTURE en
 * producción; verificación contra REGLA 4 (nunca activar sin decisión explícita
 * del usuario registrada en AGENTS.md/DECISIONES.md).
 */
function CapturaIngress_providerReservado(nombre) {
  return nombre === CAPTURA_INGESTA_PROVIDERS.GOOGLE_FORMS_FUTURE;
}

/**
 * Envío puerta de entrada de la ingesta alternativa.
 * - provider WEBAPP: no aplica (la captura real vive en 26_Captura.js).
 * - GOOGLE_FORMS_FUTURE DESACTIVADO: respuesta canónica de rechazo sin escritura.
 */
function CapturaIngress_enviar(payload, ctx, provider) {
  var p = provider || CAPTURA_INGESTA_PROVIDERS.WEBAPP;
  if (p === CAPTURA_INGESTA_PROVIDERS.WEBAPP) {
    if (typeof Captura_v2_enviar !== 'function') {
      return { ok: false, error: 'INGESTA_WEBAPP_NO_DISPONIBLE', escrito: 0 };
    }
    return Captura_v2_enviar(payload, ctx);
  }
  // Cualquier provider distinto de la Web App está DESACTIVADO por ahora.
  return { ok: false, error: 'FALLBACK_PROVIDER_DISABLED', escrito: 0 };
}

/**
 * Adaptador del payload hacia el pipeline (aislado). Implementará el mapeo si
 * algún día un provider fuera aprobado con decisión explícita; HOY solo rechaza.
 */
function CapturaIngress_adapterForms(payload) {
  return { ok: false, error: 'FALLBACK_PROVIDER_DISABLED', escrito: 0 };
}