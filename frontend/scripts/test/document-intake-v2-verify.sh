#!/usr/bin/env bash
# Document Intake V2 — frontend verification (tsc, vitest, e2e, build).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_typecheck() {
  echo "==> TypeScript"
  npx tsc -b
}

run_unit() {
  echo "==> Vitest — Document Intake V2"
  npm test -- \
    src/rental/lib/document-intake-test-fixtures.ts \
    src/rental/lib/document-intake-v2-surfaces.test.ts \
    src/rental/lib/document-intake-v2-flow.contract.test.ts \
    src/rental/lib/document-intake-v2-tenant-isolation.test.ts \
    src/rental/lib/document-extraction-apply-polling.test.ts \
    src/rental/lib/document-apply-result.test.ts \
    src/rental/lib/document-intake-navigation.test.ts \
    src/rental/lib/document-intake-entry.test.ts \
    src/rental/lib/document-intake-entry-points.test.ts \
    src/rental/lib/document-intake-processing-steps.test.ts \
    src/rental/lib/document-intake-processing-steps.ui.test.tsx \
    src/rental/lib/document-extraction-lifecycle.test.ts \
    src/rental/lib/document-extraction-session.test.ts \
    src/rental/lib/document-extraction-polling.test.ts \
    src/rental/lib/document-extraction-i18n-fr.test.ts \
    src/rental/lib/document-review-inbox.util.test.ts \
    src/rental/lib/document-archive-audit.util.test.ts \
    src/rental/lib/document-follow-up-contact.test.ts \
    src/rental/lib/document-classification-result.test.ts \
    src/rental/lib/document-entity-review.test.ts \
    src/rental/lib/document-schema-field-review.test.ts \
    src/rental/lib/document-action-plan-preview.test.ts \
    src/rental/lib/document-upload-duplicate-flow.test.ts \
    src/rental/hooks/useDocumentIntakeFlow.test.ts \
    src/rental/hooks/useDocumentExtractionFlow.test.ts \
    src/rental/hooks/document-intake-initial-state.test.tsx \
    src/rental/components/document-upload-page.test.tsx \
    src/rental/components/documents/document-upload-ui-coverage.test.ts \
    src/rental/components/documents/document-upload-responsive.test.ts \
    src/rental/components/documents/document-apply-result-panel.ui.test.tsx \
    src/rental/components/documents/document-action-plan-review.ui.test.tsx \
    src/rental/components/documents/document-classification-result.ui.test.tsx \
    src/rental/components/documents/document-entity-review.ui.test.tsx \
    src/rental/components/documents/document-schema-field-review.ui.test.tsx \
    src/rental/components/documents/document-follow-up-panel.ui.test.tsx \
    src/rental/components/documents/document-archive-panel.ui.test.tsx \
    src/lib/document-upload-context.test.ts \
    src/lib/document-upload-duplicate.test.ts \
    src/lib/document-upload-identification.test.ts \
    src/lib/document-upload-rate-limit.test.ts
}

run_e2e() {
  echo "==> Playwright — Document Intake V2"
  npm run test:e2e -- document-intake-v2-flow.spec.ts document-intake-v2-responsive.spec.ts --project=desktop-1280
  npm run test:e2e -- document-intake-v2-responsive.spec.ts --project=mobile-320 --project=mobile-390
}

run_build() {
  echo "==> Production build"
  npm run build
}

case "${1:-all}" in
  typecheck) run_typecheck ;;
  unit) run_unit ;;
  e2e) run_e2e ;;
  build) run_build ;;
  all)
    run_typecheck
    run_unit
    run_e2e
    run_build
    echo "==> Document Intake V2 frontend verification complete"
    ;;
  *)
    echo "Usage: $0 [typecheck|unit|e2e|build|all]" >&2
    exit 1
    ;;
esac
