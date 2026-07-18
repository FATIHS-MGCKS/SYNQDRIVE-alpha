#!/usr/bin/env bash
# Voice AI — unified backend verification (prisma, typecheck, build, security, billing/protection).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_prisma() {
  echo "==> Prisma validate + generate"
  npm run prisma:validate
  npm run prisma:generate
}

run_typecheck() {
  echo "==> TypeScript typecheck (full backend build graph)"
  npx tsc -p tsconfig.build.json --noEmit
  echo "==> TypeScript typecheck (voice module scope)"
  npx tsc -p tsconfig.voice.json --noEmit
}

run_build() {
  echo "==> NestJS build"
  npm run build
}

run_lint() {
  echo "==> ESLint (voice backend scope)"
  npm run lint:voice
}

run_security() {
  echo "==> Voice security suite"
  npm run test:voice:security
}

run_billing_protection() {
  echo "==> Voice billing + protection"
  npm test -- voice-billing voice-protection
}

case "${1:-all}" in
  prisma) run_prisma ;;
  typecheck) run_typecheck ;;
  build) run_build ;;
  lint) run_lint ;;
  security) run_security ;;
  billing) run_billing_protection ;;
  all)
    run_prisma
    run_typecheck
    run_build
    run_lint
    run_security
    run_billing_protection
    echo "==> Voice AI backend verification complete"
    ;;
  *)
    echo "Usage: $0 [prisma|typecheck|build|lint|security|billing|all]" >&2
    exit 1
    ;;
esac
