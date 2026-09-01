#!/bin/bash
# ECICEP — Push + deploy + abrir Web App de desarrollo
# Uso: bash tools/push_y_abrir.sh
# Nota: clasp push solo actualiza el código del proyecto.
#       clasp deploy actualiza la URL /exec que se abre en el navegador.
set -e

cd "$(dirname "$0")/.."

echo "→ clasp push --force"
clasp push --force

echo ""
echo "→ Desplegando..."
clasp deploy --deploymentId AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ

echo ""
echo "→ Abriendo Web App de desarrollo..."
URL="https://script.google.com/macros/s/AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ/exec"
xdg-open "$URL" 2>/dev/null \
  || open "$URL" 2>/dev/null \
  || echo "URL: $URL"

echo "✓ Listo"
