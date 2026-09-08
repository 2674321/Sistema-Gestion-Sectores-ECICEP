#!/bin/bash
# ECICEP — Push + abrir /dev (revisión rápida)
# Uso: bash tools/push_y_abrir.sh
# Flujos:
#   push_y_abrir.sh          → regenera BUILD.js + push + abrir /dev (revisión)
#   push_y_abrir.sh --publish → regenera BUILD.js + push + deploy operativo + abrir /exec
set -e

cd "$(dirname "$0")/.."

# Deployment operativo (fuente única de publicación, ver ENTORNO.md).
DEPLOY_ID="AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw"
DEV_URL="https://script.google.com/macros/s/AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT/exec"
EXEC_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"

# Regenera src/BUILD.js (gitignored): identidad commit+fecha del despliegue.
# Así el sello de INICIO nunca queda desactualizado respecto al código enviado.
regenerarBuild() {
  local commit fecha
  commit="$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')"
  fecha="$(date '+%Y-%m-%d %H:%M')"
  printf "var ECICEP_BUILD = { commit: '%s', fecha: '%s' };\n" "$commit" "$fecha" > src/BUILD.js
  echo "→ BUILD.js: commit $commit · $fecha"
}

regenerarBuild

echo "→ clasp push --force"
clasp push --force

if [ "$1" = "--publish" ]; then
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
