# Phase 2.5 — Evaluations Residual Resolution

`cs-evaluations-unresolved-residual` contained 17 distinct commits across 31 containing PRs. It is retired and must not appear in Phase 3.

## Exit result

- Evaluations product commits: 0
- Non-evaluations product commits: 15
- Evaluations test-hygiene-only commits: 2
- Module disposition — superseded by main: 9
- Module disposition — required but needs port: 3
- Module disposition — conflicting/design review: 5
- Proposed atomic non-evaluations change-sets: 7
- Already in main: 0
- Patch-equivalent: 0
- New evaluations capabilities: 0
- Obsolete: 0
- Remaining UNKNOWN: 0

Evaluation relevance and module recovery disposition are separate axes: all 17 commits leave the evaluations scope, while nine need no recovery because current main semantically supersedes them. The other eight remain assigned to their actual modules.

## Commit attribution

| Commit | PR memberships | Intent | Actual module | Target | Module disposition | Confidence |
|---|---:|---|---|---|---|---|
| `082464aae4a8eea85350291a0a93f946d712a3cb` | #734, #749, #753 | Provider grant consolidation | `data-authorizations/integrations` | `cs-data-authorizations-provider-grant-consolidation` | `CONFLICTING_NEEDS_DESIGN_REVIEW` | `HIGH` |
| `14eb5aa433fe2b0c231476a251c478e596ba6c2b` | #866, #870 | Typed workflow condition engine | `workflow-automation` | `cs-workflow-automation-condition-engine-base` | `REQUIRED_BUT_NEEDS_PORT` | `HIGH` |
| `198c8e22e090ce337fdcb72545070d917082f2e4` | #314, #315, #316, #317, #318 | Driving-assessment reason categories | `trips/driving-intelligence` | `cs-trips-assessment-review-reason-categories` | `REQUIRED_BUT_NEEDS_PORT` | `HIGH` |
| `1b3d814ee0ee1b7ec06ef88927df21efaba2639a` | #91 | ClickHouse waypoint and activity-window producers | `trips/clickhouse` | `cs-trips-database-and-data-model` | `SUPERSEDED_BY_MAIN` | `HIGH` |
| `3a8004c9aa8ec3c66cc3f336f446054f2f3ab93c` | #509, #549 | Station booking-rule manual override | `administration/stations/bookings` | `cs-administration-station-rule-manual-overrides` | `CONFLICTING_NEEDS_DESIGN_REVIEW` | `HIGH` |
| `55b8ac4dd743084b6fb17f35772d71e54adf4887` | #396, #397 | Document Intake required-field registry | `documents/document-extraction` | `cs-documents-api-and-domain-contracts` | `SUPERSEDED_BY_MAIN` | `MEDIUM` |
| `6434434e750ad6890db6c6ff5f7c6f3e9d3ee36c` | #801, #803, #806, #807 | Historical screenshot artifact path correction | `evaluations-testing` | `cs-evaluations-mobile-readiness` | `SUPERSEDED_BY_MAIN` | `HIGH` |
| `723b566609908ff40d621e30efb8c95cff3f17c3` | #806, #807 | Historical evaluations fixture artifact-path correction | `evaluations-testing` | `cs-evaluations-action-center` | `SUPERSEDED_BY_MAIN` | `HIGH` |
| `72ce3ba52ff18c27f0d5a884271c322171c215c6` | #506, #549 | Station calendar/timezone booking rules | `administration/stations/bookings` | `cs-bookings-stations` | `SUPERSEDED_BY_MAIN` | `MEDIUM` |
| `76a6d686b1f508f134f0f29f3d79694c76313c45` | #313, #314, #315, #316, #317, #318 | Separate vehicle load from driver conduct | `trips/customers` | `cs-trips-vehicle-intelligence` | `SUPERSEDED_BY_MAIN` | `HIGH` |
| `77e7a8e5a5a9c684f9b27a74718fbe48959c02ad` | #318 | Deprecate legacy driving-score readers | `trips/driving-impact` | `cs-trips-vehicle-intelligence` | `SUPERSEDED_BY_MAIN` | `MEDIUM` |
| `8718daad62262893034264f248d239ee621b8181` | #827, #828 | Workflow tenant/scope fail-closed enforcement | `workflow-automation/security` | `cs-workflow-automation-tenant-and-access-controls` | `SUPERSEDED_BY_MAIN` | `MEDIUM` |
| `9302bd8ba34c206f1c4bc53de8380f7e4e30fe57` | #527, #535, #538, #554 | Voice automation analytics/settings UI | `voice-ai/frontend` | `cs-voice-ai-operational-ui` | `REQUIRED_BUT_NEEDS_PORT` | `HIGH` |
| `9c02947e27a477402a2e3b774ab0d001c6fc8206` | #826, #827, #828 | Workflow dry-run execution plans | `workflow-automation` | `cs-workflow-automation-api-and-domain-contracts` | `SUPERSEDED_BY_MAIN` | `HIGH` |
| `9d958453bc8afbc7b80ce7aff5f82598f1f2e970` | #732, #749, #753 | Data Authorization deny switch | `data-authorizations/security` | `cs-data-authorizations-fail-closed-deny-switch` | `CONFLICTING_NEEDS_DESIGN_REVIEW` | `HIGH` |
| `d571a8491eb3cf15af7e24762cb90ac0e4a71424` | #867, #870 | Nested ALL/ANY/NOT workflow conditions | `workflow-automation` | `cs-workflow-automation-nested-condition-tree` | `CONFLICTING_NEEDS_DESIGN_REVIEW` | `HIGH` |
| `f69bfbe65bda93235bfbaf7b38a895adca4c1382` | #868, #870 | Workflow condition operator matrix | `workflow-automation` | `cs-workflow-automation-condition-operator-matrix` | `CONFLICTING_NEEDS_DESIGN_REVIEW` | `HIGH` |

## Merge-commit check

- None of the 17 residual commits is a merge commit; each was analyzed against its first parent.
- Action Center merge join: `364bd93733e30c6a98ea579f1707b8a73be2ecd8`.
- Parent 1 (Recommendation Domain): `9eae4b1246fcbfe5efa7f04caa2bb429600ccf3b`; delta to merge: 224 paths; path-list SHA-256 `22f306c2df25af7d1bfdf429c43f9567e02ea0952fd38d4bcccdc6ade2498b09`.
- Parent 2 (UI/a11y chain): `ddad560687ad7d42ca7a15bb033e85bc06b25187`; delta to merge: 101 paths; path-list SHA-256 `a7af6628424bb73fd02d9219caff87a24e409e35ce14305f212885ab17b6a7b5`.
- Parent merge base: `57f6b06fbf1b5e9c942206b09163d96f3ead443a`. Combined-diff conflict/result surface: 33 paths.
- The final Action Center change-set keeps only its recommendation/action integration surface and uses `RECONSTRUCT_MERGE_RESULT`; it does not treat either inherited parent delta as the feature.

## Proposed non-evaluations atomic change-sets

- `cs-administration-station-rule-manual-overrides`
- `cs-data-authorizations-fail-closed-deny-switch`
- `cs-data-authorizations-provider-grant-consolidation`
- `cs-trips-assessment-review-reason-categories`
- `cs-workflow-automation-condition-engine-base`
- `cs-workflow-automation-condition-operator-matrix`
- `cs-workflow-automation-nested-condition-tree`

## Source-PR coverage

All residual source PRs are represented in the CSV: #91, #313, #314, #315, #316, #317, #318, #396, #397, #506, #509, #527, #535, #538, #549, #554, #732, #734, #749, #753, #801, #803, #806, #807, #826, #827, #828, #866, #867, #868, #870.
