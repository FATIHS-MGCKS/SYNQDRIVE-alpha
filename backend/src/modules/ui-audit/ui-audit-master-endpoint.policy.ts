/**
 * Master UI audit — per-endpoint classification (authorization ≠ HTTP GET safety).
 * Field-level evidence: inspect service return shapes (not controller @Roles only).
 */
export type MasterAuditEndpointVerdict =
  | 'ALLOW_OPERATIONAL_AGGREGATE'
  | 'BLOCKED_SENSITIVE';

export const UI_AUDIT_MASTER_ENDPOINT_VERDICTS: ReadonlyArray<{
  path: string;
  verdict: MasterAuditEndpointVerdict;
  rationale: string;
  inspectedFields?: string;
}> = [
  {
    path: '/api/v1/admin/dashboard/operational',
    verdict: 'BLOCKED_SENSITIVE',
    rationale:
      'PlatformDashboardService.getOperationalDashboard returns organizationsAttention (org IDs/names), billing, support ticket subjects/emails, activity with org names',
    inspectedFields:
      'organizationsAttention[], support.newest[].subject|reporterEmail, billing, activity[].organization',
  },
  {
    path: '/api/v1/admin/organizations',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Cross-tenant organization directory',
    inspectedFields: 'companyName, taxId, billing identifiers',
  },
  {
    path: '/api/v1/admin/billing/overview/operational',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Billing/subscription operational intelligence',
    inspectedFields: 'subscription rows, payment failure detail',
  },
  {
    path: '/api/v1/admin/vehicles/operational/overview',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Cross-tenant vehicle operational rollup; optional organizationId filter still exposes fleet detail',
    inspectedFields: 'organizationId, vehicle identifiers, attention queue entries',
  },
  {
    path: '/api/v1/admin/connectivity/platform-summary',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale:
      'PlatformConnectivitySummaryService.getPlatformSummary — fleet freshness counts and DIMO connection totals only',
    inspectedFields: 'dimoLinkedVehicles, freshness{*}, platform{dimoTotal,dimoConnected,pollErrorRatePercent}',
  },
  {
    path: '/api/v1/admin/ops/overview',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'PlatformOpsService.getOverview includes incidents with organizationIds and degraded service detail',
    inspectedFields: 'activeIncidents[].organizationIds, criticalSignals',
  },
  {
    path: '/api/v1/admin/ops/incidents',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Incident list rows may include tenant context and operational narrative',
    inspectedFields: 'incidents[].organizationIds, title, description',
  },
  {
    path: '/api/v1/admin/security/attention-summary',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'SecurityGovernanceService.getAttentionSummary topItems include userId, email, displayName',
    inspectedFields: 'topItems[].email, userId, displayName',
  },
  {
    path: '/api/v1/admin/security/users',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'User directory / identity management surface',
    inspectedFields: 'email, platformRole, session metadata',
  },
  {
    path: '/api/v1/admin/platform-integrations/directory',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Integration registry may include environment mode (stripe TEST/LIVE) and tenant-scoped drilldown params',
    inspectedFields: 'entries[].environment, drilldownParams',
  },
  {
    path: '/api/v1/admin/platform-integrations/attention-summary',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Integration attention topItems name integration instances (operational detail)',
    inspectedFields: 'topItems[].integrationName, integrationId',
  },
];

export const UI_AUDIT_MASTER_ALLOWED_PATHS: readonly string[] = UI_AUDIT_MASTER_ENDPOINT_VERDICTS.filter(
  (row) => row.verdict === 'ALLOW_OPERATIONAL_AGGREGATE',
).map((row) => row.path);