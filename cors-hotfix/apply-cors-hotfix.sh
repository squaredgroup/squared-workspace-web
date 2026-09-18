#!/usr/bin/env bash
# Check all hunks before changing files. Never deploys, restarts or rewrites secrets.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$SCRIPT_DIR/cors.patch"
ROOT="${1:?Usage: apply-cors-hotfix.sh /path/to/native-project [--check|--apply]}"
MODE="${2:---check}"
case "$MODE" in --check|--apply) ;; *) echo "Mode attendu : --check ou --apply" >&2; exit 2;; esac
command -v git >/dev/null || { echo "Git est requis." >&2; exit 2; }
cd -- "$ROOT"
test -f Backend/src/server-foundation.ts || { echo "Racine incorrecte : Backend/src/server-foundation.ts absent." >&2; exit 2; }
if git apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "Ce correctif est déjà appliqué. Aucun fichier modifié."
  exit 0
fi
if ! git apply --check "$PATCH"; then
  echo "Les sources diffèrent de la base vérifiée. Aucun fichier modifié ; réconcilier les changements avant application." >&2
  exit 1
fi
if [[ "$MODE" == "--check" ]]; then
  echo "Tous les changements sont applicables. Aucun fichier modifié."
  exit 0
fi
git apply "$PATCH"
echo "Correctif source appliqué. Compiler et tester le Backend avant tout déploiement Oracle."
