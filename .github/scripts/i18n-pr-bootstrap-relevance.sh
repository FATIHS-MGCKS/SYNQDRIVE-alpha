#!/usr/bin/env bash
# Layer A — trusted workflow bootstrap relevance classifier.
# Uses Git only. Does NOT execute PR-head governance JavaScript.
set -euo pipefail

BASE_SHA="${1:?base sha required}"
HEAD_SHA="${2:?head sha required}"
REPO_ROOT="${3:-.}"

cd "$REPO_ROOT"

git cat-file -e "${BASE_SHA}^{commit}"
git cat-file -e "${HEAD_SHA}^{commit}"

mapfile -d '' -t CHANGED < <(git diff --name-only -z "${BASE_SHA}...${HEAD_SHA}")

is_relevant_path() {
  local path="$1"
  case "$path" in
    frontend/src/*) return 0 ;;
    frontend/scripts/i18n-*.mjs) return 0 ;;
    frontend/scripts/lib/i18n-governance/*) return 0 ;;
    frontend/package.json|frontend/package-lock.json) return 0 ;;
    .github/workflows/i18n-governance-new-debt.yml) return 0 ;;
    *) return 1 ;;
  esac
}

relevant=false
for path in "${CHANGED[@]}"; do
  if [[ -z "$path" ]]; then
    continue
  fi
  if is_relevant_path "$path"; then
    relevant=true
    break
  fi
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "relevant=${relevant}" >> "$GITHUB_OUTPUT"
fi

echo "I18N_RELEVANT_CHANGES=$([[ "$relevant" == true ]] && echo YES || echo NO)"
echo "BASE_SHA=${BASE_SHA}"
echo "HEAD_SHA=${HEAD_SHA}"
