# P2.3.2 — Scanner Coverage & Residual Classification Implementation

**Date:** 2026-08-30  
**Branch:** `cursor/p232-scanner-classification-3c10`  
**Baseline strategy:** **A — DIRECT FROM CLOSEOUT BASELINE**  
**Baseline SHA:** `381671605ea1cd55844518312839b0f7d99a48bd`  
**Reason:** Current `main` (`913f028f3`) deleted core i18n scanner/governance files; closeout merge is the authoritative i18n foundation.

---

## PART A — Baseline

| Metric | Verified |
|--------|----------|
| EN keys | **9736** |
| DE keys | **9736** |
| Parity | **100%** |
| Orphans | **0** |
| Legacy enforce-clean | **0** |
| P2.2 active actionable rental debt (historical) | **0** |

`npm run i18n:check` — PASS (535 tests)

---

## PART B — Scanner architecture

Dual-mode scanner in `frontend/scripts/i18n-hardcoded-scan.mjs`:

| Mode | Flag | Used by |
|------|------|---------|
| Legacy | `includeEnhanced: false` | `i18n:check`, inventory refresh |
| Governance | `includeEnhanced: true` | `i18n:governance`, adversarial tests |

Supporting modules under `frontend/scripts/lib/i18n-governance/`.

---

## PART C — Presentation coverage

| Pattern | Legacy regex | Enhanced analysis |
|---------|--------------|-------------------|
| JSX text | ✓ | ✓ |
| title/aria/placeholder/alt (quoted) | ✓ | ✓ |
| title/aria via local const | ✗ | ✓ |
| Conditional presentation literals | ✗ | ✓ |
| Template literal host framing | ✗ | ✓ |
| Config object labels | ✗ | ✓ (bounded) |
| toast()/toast.success() literals | ✗ | ✓ |
| setError() user fallbacks | ✗ | ✓ |
| Translated `t()` / resolvers | skipped | skipped |
| Raw `.message` / provider vars | skipped | skipped |

---

## PART D — False-positive firewall

- `FORMAT_LOCALE` intrinsically classified `MACHINE_DOMAIN`
- Quoted-only attribute regex (no `{expr}` false captures)
- `isLikelyUserCopy` heuristics preserved
- Machine enums, routes, CSS, test IDs, raw variables excluded
- Developer `throw new Error` excluded from host-presentation debt

---

## PART E — Ownership taxonomy

`HOST_PRESENTATION`, `RAW_USER`, `RAW_PROVIDER`, `MACHINE_DOMAIN`, `EDITORIAL_CONTENT`, `DATA_ANALYSE_PLANNED_REMOVAL`, `IAM_PRODUCT_WIRING_REQUIRED`, `LEGACY_DEAD`, `OTHER_JUSTIFIED`, `ACTIVE_REMEDIATION_REQUIRED`

---

## PART F — Classification manifest

**Path:** `frontend/src/i18n/i18n-debt-classifications.json`

Schema: `version`, `rules[]`, `entries[]` with `classification`, `reason`, `owner`, optional `reviewAt`.

Seeded rules (not blanket ignores): master deferred, operator deferred, shell/shared deferred, data-analyse removal, IAM RolesTab wiring, rental residual debt (`severity: debt`), help-center editorial shell.

---

## PART G — Fingerprint model

`sha256(file + category + presentationOwner + kind + normalizedLiteral).slice(0,16)`

Line-independent; literal/context change produces new fingerprint.

---

## PART H — Comparator

`compareFindingsToManifest()` returns:

- `totalFindings`
- `classifiedResidualCount`
- `unclassifiedCount`
- `newUnclassifiedActiveHostDebtCount` (enforce-clean enhanced findings)
- diagnostics via `formatDiagnostic()`

---

## PART I — Adversarial fixtures

`frontend/src/i18n/__fixtures__/governance-adversarial/` — 11 positive, 13 negative fixtures.

**HomeAway regression:** `BadHomeAwayRegression.tsx` — local const German tooltip → `title={tooltip}` — **DETECTED**.

---

## PART J — Repository recensus

| Scope | P2.3.1 (legacy) | P2.3.2 legacy | P2.3.2 governance | Delta driver |
|-------|----------------:|--------------:|------------------:|--------------|
| Global | 1241 | 1232 | 1530 | +298 enhanced patterns |
| Rental | 144 | 139 | 312 | toast, indirect props, setError |
| Finance/Billing | 25 | 24 | 42 | enhanced presentation |

**Newly discovered active host debt (enforce-clean, enhanced): 78**

Top surfaces: `rental/App.tsx` (cleaning toasts), `BookingsView.tsx`, `NewBookingView.tsx`, `BookingDossier.tsx`, customer detail hooks.

**Verdict:** Pre-closeout debt hidden by scanner blind spots (primarily toast/setError/indirect props). **Not remediated in P2.3.2.**

---

## PART K — Performance / determinism

| Command | Runtime |
|---------|--------:|
| Legacy scan | ~0.24s |
| Governance scan | ~1.74s |

Deterministic: repeated governance runs produce identical counts and fingerprints.

---

## PART L — Next step

**P2.3.3** — changed-file PR gate using comparator + `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT` blocking.

**Blocker before P2.3.3:** remediate 79 `ACTIVE_REMEDIATION_REQUIRED` enforce-clean findings (dedicated micro-slice PR).

---

## Validation

| Check | Result |
|-------|--------|
| `npm run i18n:scanner:test` | PASS (29/29) |
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `npm run i18n:governance` | Exit 2 (expected — reports 79 active debt) |
| Typecheck | PASS |
| Build | PASS |
| Category E | 0 |
| Product semantic diff | 0 |

---

## Final verdict

**B — P2.3.2 IMPLEMENTED — NEW ACTIVE HOST DEBT DISCOVERED — REMEDIATION REQUIRED BEFORE P2.3.3**
