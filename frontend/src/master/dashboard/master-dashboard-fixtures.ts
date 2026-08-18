import type { MasterDashboardOperationalDto } from './types';

/** Redacted production-shaped fixture (2026-08-18 acceptance). */
export function productionOperationalDashboardFixture(
  overrides: Partial<MasterDashboardOperationalDto> = {},
): MasterDashboardOperationalDto {
  const generatedAt = '2026-08-18T17:00:23.478Z';
  const base: MasterDashboardOperationalDto = {
    generatedAt,
    overallStatus: 'warning',
    incidentSummary: {
      count: 4,
      highestSeverity: 'critical',
      affectedOrganizationCount: 2,
    },
    domainStatus: {
      runtime: 'ok',
      worker: 'critical',
      dimo: 'warning',
      billing: 'warning',
      backup: 'unknown',
      support: 'ok',
    },
    incidents: [
      {
        id: 'inc-worker-failed',
        severity: 'critical',
        summary: 'BullMQ failed jobs',
        affectedComponent: 'Workers',
        impact: 'Processing backlog',
        firstSeen: generatedAt,
        lastSeen: generatedAt,
        organizationIds: [],
        organizationNames: [],
        drilldownView: 'platform-ops',
        drilldownParams: { platformOps: 'processing' },
      },
    ],
    platformHealth: {
      overallStatus: 'critical',
      readiness: {
        status: 'degraded',
        checks: {
          postgres: { status: 'ok' },
          redis: { status: 'ok' },
          clickhouse: { status: 'failed' },
        },
      },
      monitoring: { errorRatePercent: 2, unhealthyWorkers: 1 },
      queues: [
        { queue: 'telemetry', status: 'critical', failed: 44, waiting: 12, active: 1, delayed: 0 },
      ],
    },
    billing: {
      mrr: 0,
      activeSubscriptions: 0,
      trialingSubscriptions: 0,
      pastDueSubscriptions: 0,
      openInvoices: 0,
      missingPaymentMethods: 4,
      stripeSyncErrors: 0,
      failedPayments: 0,
      reconciliationDrifts: 2,
      failedEmailDeliveries: 0,
      mrrIncomplete: true,
      mrrIncompleteReason: 'MBR/ABR nicht vollständig hinterlegt',
    },
    connectivity: {
      generatedAt,
      dimoLinkedVehicles: 6,
      freshness: { live: 0, standby: 2, signal_delayed: 2, offline: 2, no_signal: 0 },
      platform: {
        dimoTotal: 8,
        dimoConnected: 6,
        dimoDisconnected: 2,
        pollErrorRatePercent: 4,
        tokenHealthStatus: 'warning',
      },
    },
    resilience: {
      generatedAt,
      overall: 'unknown',
      postgres: { lastSuccessAt: null, status: 'unknown' },
      clickhouse: { lastSuccessAt: null, status: 'unknown' },
      offsite: { lastSyncAt: null, status: 'unknown' },
      restoreValidation: { lastRunAt: null, status: 'unknown' },
      source: 'none',
    },
    organizationsAttention: [
      {
        organizationId: 'org-attention-1',
        organizationName: 'F.S Mobility Service',
        reasons: ['PAYMENT_METHOD_MISSING'],
        severity: 'warning',
        drilldownView: 'billing',
        drilldownParams: { orgId: 'org-attention-1' },
      },
    ],
    support: null,
    activity: [],
    businessContext: {
      activeOrganizations: 4,
      totalUsers: 12,
      totalProspects: 0,
      mrr: null,
      mrrIncomplete: true,
      mrrIncompleteReason: 'MBR/ABR nicht vollständig hinterlegt',
    },
    moduleErrors: {
      platformHealth: undefined,
    },
  };

  return { ...base, ...overrides };
}
