#!/bin/bash
# ECICEP — Push + abrir /dev (revisión rápida)
# Uso: bash tools/push_y_abrir.sh
# Flujos:
#   push_y_abrir.sh          → regenera BUILD.js + push + abrir /dev (revisión)
#   push_y_abrir.sh --publish → regenera BUILD.js + push + deploy operativo + abrir /exec
set -euo pipefail

cd "$(dirname "$0")/.."

# Rechazar errores de invocación antes de cualquier sincronización.
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--publish" ]; }; then
  echo "Uso: bash tools/push_y_abrir.sh [--publish]" >&2
  exit 2
fi

# La URL operativa se lee de la configuración; no mantener otro ID en este script.
EXEC_URL="$(node - <<'NODE'
const fs = require('fs');
const vm = require('vm');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('src/00_Config.js', 'utf8'), ctx);
const url = ctx.ECICEP.WEB_APP_URL;
if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
  throw new Error('WEB_APP_URL operativa inválida');
}
console.log(url);
NODE
)"
DEPLOY_ID="${EXEC_URL%/exec}"
DEPLOY_ID="${DEPLOY_ID##*/}"
DEPLOYMENTS="$(clasp deployments)"
if ! printf '%s\n' "$DEPLOYMENTS" | awk -v id="$DEPLOY_ID" '$2 == id { found=1 } END { exit !found }'; then
  echo "Deployment operativo no encontrado; no se sincronizó código." >&2
  exit 1
fi
HEAD_ID="$(printf '%s\n' "$DEPLOYMENTS" | awk '$3 == "@HEAD" {print $2}')"
if [ -z "$HEAD_ID" ]; then
  echo "Deployment HEAD no encontrado; no se sincronizó código." >&2
  exit 1
fi
DEV_URL="https://script.google.com/macros/s/${HEAD_ID}/dev"

# No publicar una versión que falle las pruebas.
node tools/verificar.mjs

# Regenera src/BUILD.js (gitignored): identidad commit+fecha del despliegue.
# Así el sello de INICIO nunca queda desactualizado respecto al código enviado.
regenerarBuild() {
  local commit fecha
  commit="$(git rev-parse --short HEAD)"
  if ! git diff --quiet HEAD -- src; then commit="${commit}-dirty"; fi
  fecha="$(date '+%Y-%m-%d %H:%M')"
  printf "var ECICEP_BUILD = { commit: '%s', fecha: '%s' };\n" "$commit" "$fecha" > src/BUILD.js
  echo "→ BUILD.js: commit $commit · $fecha"
}

regenerarBuild

echo "→ clasp push --force"
clasp push --force

if [ "${1:-}" = "--publish" ]; then
  echo ""
  echo "→ Publicando en el deployment operativo ($DEPLOY_ID)..."
  clasp deploy --deploymentId "$DEPLOY_ID"

  echo ""
  echo "→ Abriendo /exec..."
  URL="$EXEC_URL"
else
  echo ""
  echo "→ Abriendo /dev (revisión)..."
  URL="$DEV_URL"
fi

xdg-open "$URL" 2>/dev/null \
  || open "$URL" 2>/dev/null \
  || echo "URL: $URL"

echo "✓ Listo"
