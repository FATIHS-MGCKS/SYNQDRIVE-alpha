# Phase 2 — Standalone Conflicting PR Analysis

Analyzed: 19. No conflict was resolved.

| PR | Purpose | Unique commits | Current mergeability | Conflict paths | Classification | Confidence | Evidence |
|---:|---|---:|---|---:|---|---|---|
| [#19](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/19) | Infrastructure Core, Operational UI | 1 | `CONFLICTING/DIRTY` | 4 | `SAFE_TO_IGNORE` | `HIGH` | 1 exact unique non-main commits ; 4 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Container DNS settings do not apply to the current host-PM2 production runtime. |
| [#22](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/22) | API and domain contracts, Operational UI | 1 | `CONFLICTING/DIRTY` | 3 | `PORT_REQUIRED` | `HIGH` | 1 exact unique non-main commits ; 3 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current Financial Insights still duplicates InvoiceLite/casts; port only typed API consolidation. |
| [#23](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/23) | Operational UI | 2 | `CONFLICTING/DIRTY` | 2 | `SUPERSEDED` | `HIGH` | 2 exact unique non-main commits ; 2 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current FinancialInsightsView passes stationId and current cockpit filters by station. |
| [#24](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/24) | Operational UI | 2 | `CONFLICTING/DIRTY` | 2 | `PORT_REQUIRED` | `HIGH` | 2 exact unique non-main commits ; 2 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current code retains legacy cent/euro threshold and incomplete declared-category handling. |
| [#25](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/25) | Operational UI, Runtime jobs and queues | 2 | `CONFLICTING/DIRTY` | 7 | `SUPERSEDED` | `HIGH` | 2 exact unique non-main commits ; 7 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current ActionQueue excludes finance tabs/items and tests assert that behavior. |
| [#31](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/31) | API and domain contracts, Database and data model, Operational UI | 1 | `CONFLICTING/DIRTY` | 6 | `DESIGN_REVIEW_REQUIRED` | `HIGH` | 1 exact unique non-main commits ; 6 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: POI enrichment is absent, but historical read-path writes/external calls/cache are architecturally unsafe. |
| [#66](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/66) | API and domain contracts, Operational UI, Runtime jobs and queues, Unknown Core | 1 | `CONFLICTING/DIRTY` | 9 | `DESIGN_REVIEW_REQUIRED` | `MEDIUM` | 1 exact unique non-main commits ; 9 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current durable DIMO webhook/runtime logic supersedes most code; only verified parser/logging hunks may remain. |
| [#83](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/83) | Infrastructure Core, Operational UI, Unknown Core | 1 | `CONFLICTING/DIRTY` | 9 | `SUPERSEDED` | `HIGH` | 1 exact unique non-main commits ; 9 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current main contains the ClickHouse runtime ADR, URL ping and production boundary guidance. |
| [#84](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/84) | Observability and operations, Operational UI, Tenant and access controls, Unknown Core | 1 | `CONFLICTING/DIRTY` | 9 | `SECURITY_REVIEW_REQUIRED` | `HIGH` | 1 exact unique non-main commits ; 9 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current fail-closed metrics guard exists; constant-time comparison/IP allowlist need selective security review. |
| [#85](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/85) | API and domain contracts, Operational UI, Testing and validation | 1 | `CONFLICTING/DIRTY` | 15 | `SUPERSEDED` | `HIGH` | 1 exact unique non-main commits ; 15 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current main contains ClickHouse diagnostics service, endpoint, registry, types, tests and UI. |
| [#86](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/86) | Data Analyse, Observability and operations, Operational UI, Testing and validation | 1 | `CONFLICTING/DIRTY` | 9 | `PORT_REQUIRED` | `MEDIUM` | 1 exact unique non-main commits ; 9 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current HF mirror has guards/idempotency but lacks the low-cardinality skip metric. |
| [#87](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/87) | API and domain contracts, Operational UI, Testing and validation | 1 | `CONFLICTING/DIRTY` | 18 | `SUPERSEDED` | `HIGH` | 1 exact unique non-main commits ; 18 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current producer registry/diagnostics are broader and include later audit corrections. |
| [#88](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/88) | Dimo, Operational UI, Testing and validation | 2 | `CONFLICTING/DIRTY` | 6 | `DESIGN_REVIEW_REQUIRED` | `MEDIUM` | 2 exact unique non-main commits ; 6 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Signal expansion requires DIMO schema/unit/privacy verification and cannot replace current query wholesale. |
| [#109](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/109) | API and domain contracts, Database and data model, Operational UI, Tenant and access controls, Unknown Core | 7 | `CONFLICTING/DIRTY` | 36 | `SUPERSEDED` | `HIGH` | 7 exact unique non-main commits ; 36 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current main contains the expanded tenant-safe outbound email, provider, webhook, document and UI flows. |
| [#118](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/118) | Operational UI | 1 | `CONFLICTING/DIRTY` | 4 | `DOCS_ONLY` | `HIGH` | 1 exact unique non-main commits ; 4 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current Resend guidance already contains the production setup and webhook/DNS checklist. |
| [#121](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/121) | Infrastructure Core, Notifications Core, Operational UI | 2 | `CONFLICTING/DIRTY` | 8 | `SUPERSEDED` | `HIGH` | 2 exact unique non-main commits ; 8 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current main contains DNS sync scripts, mail identity policy and expanded documentation. |
| [#173](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/173) | Operational UI | 1 | `CONFLICTING/DIRTY` | 12 | `SUPERSEDED` | `HIGH` | 1 exact unique non-main commits ; 12 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Current AppThemeProvider/toggle/bootstrap and tests implement the intended theme behavior. |
| [#194](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/194) | Operational UI | 1 | `CONFLICTING/DIRTY` | 2 | `DOCS_ONLY` | `HIGH` | 1 exact unique non-main commits ; 2 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Historical Stripe baseline is materially obsolete and retained only as dated evidence. |
| [#230](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/230) | Bookings, Database and data model, Operational UI, Runtime jobs and queues, Testing and validation | 1 | `CONFLICTING/DIRTY` | 12 | `DESIGN_REVIEW_REQUIRED` | `HIGH` | 1 exact unique non-main commits ; 12 PR paths also changed on main since merge-base ; current GitHub mergeability=CONFLICTING/DIRTY ; manual current-symbol/architecture review: Capability is absent, but historical schedulers bypass current Task Domain and need atomic claims/pagination redesign. |

## Port evidence

### PR #19

- Unique commits: `9abf28509c616802e40805e66ca0407330fc5a92`
- Conflict paths: `AGENTS.md`, `backend/docker-compose.yml`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: No port; retain as historical evidence.

### PR #22

- Unique commits: `46225c4812a9808e36a8782e64f4ad2ac2ea9969`
- Conflict paths: `frontend/src/lib/api.ts`, `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/FinancialInsightsView.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #23

- Unique commits: `86720b937602eb2f4f80439ec1ec339194846a16`, `f8c763b8415279ca38d79aa4c60a4c62708b9a7f`
- Conflict paths: `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/FinancialInsightsView.tsx`
- Plan: No port; retain as historical evidence.

### PR #24

- Unique commits: `6eb495e877ef553e731e43092ac6f48738bda91a`, `cf691f4caf872e67378dc55fd3374c2a12a09fef`
- Conflict paths: `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/insights/InsightsCockpit.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #25

- Unique commits: `61fd25c8b8ffd68b5bcd6a409b614d2746633fd8`, `a4cca5b65104f91e65de4fa3fd2f7ff2e4d39cda`
- Conflict paths: `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/dashboard/ActionQueue.tsx`, `frontend/src/rental/components/dashboard/actionQueueBuilder.ts`, `frontend/src/rental/components/dashboard/actionQueueGrouping.test.ts`, `frontend/src/rental/components/dashboard/actionQueueGrouping.ts`, `frontend/src/rental/components/dashboard/dashboardAttentionBuilder.ts`, `frontend/src/rental/components/dashboard/dashboardTypes.ts`
- Plan: No port; retain as historical evidence.

### PR #31

- Unique commits: `a0a290336e17000b3cf6933247850e7ce4a39267`
- Conflict paths: `backend/prisma/schema.prisma`, `backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts`, `frontend/src/lib/api.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/trips/trip-timeline-shared.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #66

- Unique commits: `79e0eeb87c041794983be9fba64dd44bec4d96c2`
- Conflict paths: `backend/.env.example`, `backend/src/modules/dimo/device-connection-webhook.service.spec.ts`, `backend/src/modules/dimo/device-connection-webhook.service.ts`, `backend/src/modules/dimo/dimo-webhook.controller.spec.ts`, `backend/src/modules/dimo/dimo-webhook.controller.ts`, `backend/src/modules/dimo/dimo.module.ts`, `backend/src/workers/processors/dimo-snapshot.processor.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #83

- Unique commits: `fcadf42c1aa1c059c6e19d8749075d3593196473`
- Conflict paths: `AGENTS.md`, `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`, `backend/.env.example`, `backend/docs/clickhouse-local-selfhosted.md`, `backend/package.json`, `backend/scripts/clickhouse-backup-local.sh`, `backend/scripts/clickhouse-ping-url.sh`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: No port; retain as historical evidence.

### PR #84

- Unique commits: `12a4054dddda212ca1616007e3c57a7c1eea4c6e`
- Conflict paths: `backend/.env.example`, `backend/src/app.module.ts`, `backend/src/config/index.ts`, `backend/src/main.ts`, `backend/src/modules/observability/metrics.controller.ts`, `backend/src/modules/observability/observability.module.ts`, `backend/src/shared/auth/auth.guard.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #85

- Unique commits: `c6276b5f5facef5c3b3f88f8880df1778ee4fb12`
- Conflict paths: `architecture/CLICKHOUSE_DIAGNOSTICS_2026-07-08.md`, `backend/src/modules/clickhouse/clickhouse-diagnostics.integration.spec.ts`, `backend/src/modules/clickhouse/clickhouse-diagnostics.service.spec.ts`, `backend/src/modules/clickhouse/clickhouse-diagnostics.service.ts`, `backend/src/modules/clickhouse/clickhouse-diagnostics.types.ts`, `backend/src/modules/clickhouse/clickhouse-env.util.ts`, `backend/src/modules/clickhouse/clickhouse-table-registry.ts`, `backend/src/modules/clickhouse/clickhouse.module.ts`, `backend/src/modules/data-analyse/data-analyse.controller.ts`, `backend/src/modules/data-analyse/data-analyse.service.ts`, `backend/src/modules/data-analyse/data-analyse.utils.ts`, `frontend/src/lib/api.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/DataAnalyseView.tsx`
- Plan: No port; retain as historical evidence.

### PR #86

- Unique commits: `ea706ecc277f410a80f597701fa5c7c420ce8a05`
- Conflict paths: `backend/src/modules/clickhouse/clickhouse-env.util.spec.ts`, `backend/src/modules/clickhouse/clickhouse-env.util.ts`, `backend/src/modules/clickhouse/clickhouse-hf.service.ts`, `backend/src/modules/data-analyse/data-analyse.utils.ts`, `backend/src/modules/observability/trip-metrics.service.ts`, `backend/src/modules/vehicle-intelligence/trips/hf-mirror.service.spec.ts`, `backend/src/modules/vehicle-intelligence/trips/hf-mirror.service.ts`, `backend/src/modules/vehicle-intelligence/trips/trip-behavior-enrichment.service.ts`, `frontend/src/master/components/ChangesView.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #87

- Unique commits: `585b26ee986e26b3db7f1109ef5e6d639dd8581c`
- Conflict paths: `architecture/CLICKHOUSE_TABLE_PRODUCER_REGISTRY_2026-07-08.md`, `backend/docs/clickhouse-local-selfhosted.md`, `backend/src/modules/clickhouse/clickhouse-diagnostics.integration.spec.ts`, `backend/src/modules/clickhouse/clickhouse-diagnostics.service.spec.ts`, `backend/src/modules/clickhouse/clickhouse-diagnostics.service.ts`, `backend/src/modules/clickhouse/clickhouse-diagnostics.types.ts`, `backend/src/modules/clickhouse/clickhouse-env.util.spec.ts`, `backend/src/modules/clickhouse/clickhouse-env.util.ts`, `backend/src/modules/clickhouse/clickhouse-table-registry.ts`, `backend/src/modules/clickhouse/clickhouse-table-registry.types.ts`, `backend/src/modules/clickhouse/clickhouse.module.ts`, `backend/src/modules/data-analyse/data-analyse.controller.ts`, `backend/src/modules/data-analyse/data-analyse.service.ts`, `backend/src/modules/data-analyse/data-analyse.utils.ts`, `frontend/src/lib/api.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`, `frontend/src/rental/components/DataAnalyseView.tsx`
- Plan: No port; retain as historical evidence.

### PR #88

- Unique commits: `978286d14fb951a4d3de4d5e98ecc87ec9f56308`, `e5ee5c6b34b23c17e1eacc28a458bb1b9818eecd`
- Conflict paths: `backend/src/modules/dimo/dimo-segments.service.ts`, `backend/src/modules/dimo/queries/high-frequency.query.ts`, `backend/src/modules/vehicle-intelligence/trips/hf-mirror.service.spec.ts`, `backend/src/modules/vehicle-intelligence/trips/hf-mirror.service.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.

### PR #109

- Unique commits: `904e5ab0e95e8a9f4cae1d0f661fc83235f19605`, `9636027da45da0477a98dfc643c0251e91f28063`, `c6915482e18a661215a18a2c409e87465aa35d1d`, `1005a9277d6ef0fbd9e45838f0a8ac7a4acea796`, `46d6b9507cceeb3b73e01c19d1d3695575c41c6b`, `f9461dcff1a1cd6816aa406e6105980abc1d2c33`, `6ea2e51ff8a6e4d9599c491518893bc7bf5059c3`
- Conflict paths: `backend/.env.example`, `backend/prisma/schema.prisma`, `backend/src/app.module.ts`, `backend/src/config/email.config.ts`, `backend/src/config/index.ts`, `backend/src/modules/bookings/bookings.service.ts`, `backend/src/modules/documents/booking-document-bundle.service.ts`, `backend/src/modules/documents/documents.controller.ts`, `backend/src/modules/documents/documents.module.ts`, `backend/src/modules/documents/documents.service.spec.ts`, `backend/src/modules/documents/generated-documents.service.ts`, `backend/src/modules/outbound-email/dto/send-test-email.dto.ts`, `backend/src/modules/outbound-email/dto/update-org-email-settings.dto.ts`, `backend/src/modules/outbound-email/outbound-email.module.ts`, `backend/src/modules/outbound-email/providers/dev-email.provider.ts`, `backend/src/modules/outbound-email/providers/email-provider.port.ts`, `backend/src/shared/auth/auth.guard.ts`, `frontend/src/lib/api.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`, `frontend/src/operator/OperatorShell.tsx`, `frontend/src/operator/handover/OperatorHandoverProvider.tsx`, `frontend/src/rental/App.tsx`, `frontend/src/rental/HandoverContext.tsx`, `frontend/src/rental/components/BookingDocumentsSection.tsx`, `frontend/src/rental/components/CustomerDetailView.tsx`, `frontend/src/rental/components/InvoicesView.tsx`, `frontend/src/rental/components/SettingsView.tsx`, `frontend/src/rental/components/Sidebar.tsx`, `frontend/src/rental/components/booking-detail/BookingFinanceDocumentsTab.tsx`, `frontend/src/rental/components/bookings/BookingsPage.tsx`, `frontend/src/rental/components/settings/AdministrationTabBar.tsx`, `frontend/src/rental/components/settings/settingsTypes.ts`, `frontend/src/rental/i18n/translations/de.ts`, `frontend/src/rental/i18n/translations/en.ts`, `frontend/src/rental/lib/entityMappers.ts`
- Plan: No port; retain as historical evidence.

### PR #118

- Unique commits: `ecbfc4fa8d22183273d34c5f4a78ac5453b6c4a0`
- Conflict paths: `architecture/OUTBOUND_EMAIL_2026-07-10.md`, `docs/resend-setup.md`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: No port; retain as historical evidence.

### PR #121

- Unique commits: `759c1d458f8e4e96b48a0a14b6fb3ef97767f6ec`, `54621f4a460ecf19c4b63e7d95cf41c5504129a7`
- Conflict paths: `AGENTS.md`, `architecture/OUTBOUND_EMAIL_2026-07-10.md`, `backend/scripts/ops/sync-resend-dns-to-hostinger.py`, `backend/scripts/ops/sync-resend-dns-to-hostinger.sh`, `backend/scripts/ops/sync-resend-env-to-vps.sh`, `docs/resend-setup.md`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: No port; retain as historical evidence.

### PR #173

- Unique commits: `4325f93873163a86fdb5cfbbdf50c5965e186f93`
- Conflict paths: `frontend/index.html`, `frontend/src/App.tsx`, `frontend/src/components/ThemeToggleButton.tsx`, `frontend/src/context/AppThemeContext.tsx`, `frontend/src/lib/theme.test.ts`, `frontend/src/lib/theme.ts`, `frontend/src/master/App.tsx`, `frontend/src/master/components/ChangesView.tsx`, `frontend/src/master/components/TopBar.tsx`, `frontend/src/operator/views/OperatorMoreView.tsx`, `frontend/src/rental/App.tsx`, `frontend/src/rental/components/TopBar.tsx`
- Plan: No port; retain as historical evidence.

### PR #194

- Unique commits: `40d94d0574c8a808ef464981a8cc8583215c06c5`
- Conflict paths: `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: No port; retain as historical evidence.

### PR #230

- Unique commits: `a6d1cca4f9e81abbc0df23980abfe6679d070351`
- Conflict paths: `backend/prisma/schema.prisma`, `backend/src/app.module.ts`, `backend/src/config/index.ts`, `backend/src/modules/bookings/booking-wizard-draft.service.ts`, `backend/src/modules/bookings/bookings.module.ts`, `backend/src/modules/bookings/bookings.service.ts`, `backend/src/modules/documents/booking-document-bundle.service.ts`, `backend/src/modules/documents/documents.module.ts`, `backend/src/modules/documents/documents.service.spec.ts`, `backend/src/modules/invoices/invoices.module.ts`, `frontend/src/master/components/ArchitekturView.tsx`, `frontend/src/master/components/ChangesView.tsx`
- Plan: Reconstruct only the stated remaining capability on current main; do not merge the historical branch.
