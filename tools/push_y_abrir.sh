#!/bin/bash
# ECICEP — Push + abrir /dev (revisión rápida)
# Uso: bash tools/push_y_abrir.sh
# Flujos:
#   push_y_abrir.sh          → push + abrir /dev (revisión)
#   push_y_abrir.sh --publish → push + deploy @85 + abrir /exec (publicación)
set -e

cd "$(dirname "$0")/.."

DEPLOY_ID="AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ"
DEV_URL="https://script.google.com/macros/s/AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT/exec"
EXEC_URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"

echo "→ clasp push --force"
clasp push --force

if [ "$1" = "--publish" ]; then
  echo ""
  echo "→ Publicando en @85..."
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
