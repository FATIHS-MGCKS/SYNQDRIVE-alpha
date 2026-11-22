# P9 — Master audit endpoint response evidence (repository inspection)

| Endpoint | Verdict | Service / method | Sensitive fields (non-exhaustive) |
|----------|---------|----------------|-----------------------------------|
| `GET /api/v1/admin/dashboard/operational` | **BLOCKED_SENSITIVE** | `PlatformDashboardService.getOperationalDashboard` | `organizationsAttention[]`, `support.newest[]` (subject, reporterEmail), `billing`, `activity` (org names) |
| `GET /api/v1/admin/security/attention-summary` | **BLOCKED_SENSITIVE** | `SecurityGovernanceService.getAttentionSummary` | `topItems[].email`, `userId`, `displayName` |
| `GET /api/v1/admin/ops/overview` | **BLOCKED_SENSITIVE** | `PlatformOpsService.getOverview` | `activeIncidents`, `organizationIds` on incidents |
| `GET /api/v1/admin/ops/incidents` | **BLOCKED_SENSITIVE** | `PlatformOpsService.getIncidents` | incident rows with tenant linkage |
| `GET /api/v1/admin/vehicles/operational/overview` | **BLOCKED_SENSITIVE** | `VehiclesOperationalService.getOverview` | cross-tenant fleet / org filter |
| `GET /api/v1/admin/platform-integrations/directory` | **BLOCKED_SENSITIVE** | `PlatformIntegrationsService.getDirectory` | stripe environment, drilldown params |
| `GET /api/v1/admin/platform-integrations/attention-summary` | **BLOCKED_SENSITIVE** | `PlatformIntegrationsService.getAttentionSummary` | `topItems[].integrationName` |
| `GET /api/v1/admin/connectivity/platform-summary` | **ALLOW_OPERATIONAL_AGGREGATE** | `PlatformConnectivitySummaryService.getPlatformSummary` | counts only — no org names or emails |

Ordinary `MASTER_ADMIN` responses are unchanged. Audit identities may call only allowlisted paths; Master SPA navigation for blocked surfaces remains **BLOCKED_SENSITIVE** until P9C sanitized projections exist.