/**
 * Master UI audit — per-endpoint classification (authorization ≠ HTTP GET safety).
 * Verdicts drive the server allowlist only; ordinary MASTER_ADMIN behavior is unchanged.
 */
export type MasterAuditEndpointVerdict =
  | 'ALLOW_OPERATIONAL_AGGREGATE'
  | 'BLOCKED_SENSITIVE';

export const UI_AUDIT_MASTER_ENDPOINT_VERDICTS: ReadonlyArray<{
  path: string;
  verdict: MasterAuditEndpointVerdict;
  rationale: string;
}> = [
  {
    path: '/api/v1/admin/dashboard/operational',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Platform KPI aggregates; no per-tenant credential payloads',
  },
  {
    path: '/api/v1/admin/organizations',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Cross-tenant organization directory with identifiers and billing linkage',
  },
  {
    path: '/api/v1/admin/billing/overview/operational',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'Billing/subscription operational intelligence — not synthetic-audit safe',
  },
  {
    path: '/api/v1/admin/vehicles/operational/overview',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Fleet operational counts only',
  },
  {
    path: '/api/v1/admin/connectivity/platform-summary',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Connectivity health aggregates',
  },
  {
    path: '/api/v1/admin/ops/overview',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Ops queue aggregates',
  },
  {
    path: '/api/v1/admin/ops/incidents',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Incident list — audit UI should treat as operational (P9C synthetic org only)',
  },
  {
    path: '/api/v1/admin/security/attention-summary',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Summary counts only (not user directory)',
  },
  {
    path: '/api/v1/admin/security/users',
    verdict: 'BLOCKED_SENSITIVE',
    rationale: 'User directory / identity management surface',
  },
  {
    path: '/api/v1/admin/platform-integrations/directory',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Integration registry metadata (no secrets)',
  },
  {
    path: '/api/v1/admin/platform-integrations/attention-summary',
    verdict: 'ALLOW_OPERATIONAL_AGGREGATE',
    rationale: 'Integration attention aggregates',
  },
];

export const UI_AUDIT_MASTER_ALLOWED_PATHS: readonly string[] = UI_AUDIT_MASTER_ENDPOINT_VERDICTS.filter(
  (row) => row.verdict === 'ALLOW_OPERATIONAL_AGGREGATE',
).map((row) => row.path);