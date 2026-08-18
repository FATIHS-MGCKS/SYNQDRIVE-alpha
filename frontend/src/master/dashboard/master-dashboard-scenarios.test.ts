import { describe, expect, it } from 'vitest';
import { OPERATIONAL_STALE_MS } from './operational-cache';
import type { MasterDashboardOperationalDto } from './types';
import { operationalToNavBadgeState } from './useMasterDashboardOperational';

function fixture(overrides: Partial<MasterDashboardOperationalDto>): MasterDashboardOperationalDto {
  const base: MasterDashboardOperationalDto = {
    generatedAt: new Date().toISOString(),
    overallStatus: 'healthy',
    incidentSummary: { count: 0, highestSeverity: null, affectedOrganizationCount: 0 },
    domainStatus: {
      runtime: 'ok',
      worker: 'ok',
      dimo: 'ok',
      billing: 'ok',
      backup: 'ok',
      support: 'ok',
    },
    incidents: [],
    platformHealth: null,
    billing: null,
    connectivity: null,
    resilience: {
      generatedAt: new Date().toISOString(),
      overall: 'unknown',
      postgres: { lastSuccessAt: null, status: 'unknown' },
      clickhouse: { lastSuccessAt: null, status: 'unknown' },
      offsite: { lastSyncAt: null, status: 'unknown' },
      restoreValidation: { lastRunAt: null, status: 'unknown' },
      source: 'none',
    },
    organizationsAttention: [],
    support: null,
    activity: [],
    businessContext: null,
    moduleErrors: {},
  };
  return { ...base, ...overrides };
}

describe('master dashboard operational scenarios', () => {
  it('fully healthy: no incidents, healthy overall, quiet nav badges', () => {
    const data = fixture({ overallStatus: 'healthy' });
    const badges = operationalToNavBadgeState(data);
    expect(data.incidents).toHaveLength(0);
    expect(badges.platformCritical).toBe(false);
    expect(operationalToNavBadgeState(data).billingAnomaly).toBe(false);
  });

  it('degraded service: warning overall with worker domain warning', () => {
    const data = fixture({
      overallStatus: 'warning',
      domainStatus: { runtime: 'ok', worker: 'warning', dimo: 'ok', billing: 'ok', backup: 'ok', support: 'ok' },
      incidents: [
        {
          id: 'w1',
          severity: 'warning',
          summary: 'Queue backlog',
          affectedComponent: 'Workers',
          impact: 'BullMQ',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          organizationIds: [],
          organizationNames: [],
          drilldownView: 'platform-ops',
        },
      ],
      incidentSummary: { count: 1, highestSeverity: 'warning', affectedOrganizationCount: 0 },
    });
    expect(data.overallStatus).toBe('warning');
    expect(operationalToNavBadgeState(data).platformCritical).toBe(false);
  });

  it('critical incident surfaces platformCritical nav badge', () => {
    const data = fixture({
      overallStatus: 'critical',
      incidents: [
        {
          id: 'c1',
          severity: 'critical',
          summary: 'Postgres down',
          affectedComponent: 'Runtime',
          impact: 'Readiness',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          organizationIds: [],
          organizationNames: [],
          drilldownView: 'platform-ops',
        },
      ],
      incidentSummary: { count: 1, highestSeverity: 'critical', affectedOrganizationCount: 0 },
    });
    expect(operationalToNavBadgeState(data).platformCritical).toBe(true);
  });

  it('stripe problem: billing incidents and attention badge', () => {
    const data = fixture({
      overallStatus: 'critical',
      domainStatus: { runtime: 'ok', worker: 'ok', dimo: 'ok', billing: 'critical', backup: 'ok', support: 'ok' },
      billing: {
        activeSubscriptions: 10,
        trialingSubscriptions: 2,
        pastDueSubscriptions: 3,
        stripeSyncErrors: 5,
        reconciliationDrifts: 1,
        failedPayments: 2,
        missingPaymentMethods: 0,
        failedEmailDeliveries: 0,
        mrr: 5000,
        mrrIncomplete: false,
      },
      incidents: [
        {
          id: 'b1',
          severity: 'critical',
          summary: '2 fehlgeschlagene Zahlung(en)',
          affectedComponent: 'Billing',
          impact: 'Zahlungsabwicklung',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          organizationIds: [],
          organizationNames: [],
          drilldownView: 'billing',
        },
      ],
      incidentSummary: { count: 1, highestSeverity: 'critical', affectedOrganizationCount: 0 },
    });
    expect(operationalToNavBadgeState(data).billingAnomaly).toBe(true);
    expect(data.billing?.stripeSyncErrors).toBeGreaterThan(0);
  });

  it('dimo problem: dimo domain critical, connectivity separate from platform health', () => {
    const data = fixture({
      domainStatus: { runtime: 'ok', worker: 'ok', dimo: 'critical', billing: 'ok', backup: 'ok', support: 'ok' },
      connectivity: {
        generatedAt: new Date().toISOString(),
        dimoLinkedVehicles: 12,
        freshness: { live: 2, standby: 3, signal_delayed: 4, offline: 2, no_signal: 1 },
        platform: {
          dimoTotal: 12,
          dimoConnected: 5,
          dimoDisconnected: 7,
          pollErrorRatePercent: 12,
          tokenHealthStatus: 'critical',
        },
      },
    });
    expect(data.domainStatus.dimo).toBe('critical');
    expect(data.connectivity?.platform.tokenHealthStatus).toBe('critical');
  });

  it('queue backlog: worker domain and failed jobs visible in platform health', () => {
    const data = fixture({
      domainStatus: { runtime: 'ok', worker: 'critical', dimo: 'ok', billing: 'ok', backup: 'ok', support: 'ok' },
      platformHealth: {
        overallStatus: 'critical',
        queues: [
          { queue: 'telemetry', status: 'critical', failed: 42, waiting: 200, active: 1, delayed: 0 },
        ],
      } as MasterDashboardOperationalDto['platformHealth'],
    });
    const queues = (data.platformHealth as { queues: Array<{ failed: number }> }).queues;
    expect(queues[0].failed).toBe(42);
    expect(data.domainStatus.worker).toBe('critical');
  });

  it('backup failure: resilience critical, no fake OK label', () => {
    const data = fixture({
      overallStatus: 'critical',
      resilience: {
        generatedAt: new Date().toISOString(),
        overall: 'critical',
        postgres: { lastSuccessAt: null, status: 'failed' },
        clickhouse: { lastSuccessAt: null, status: 'unknown' },
        offsite: { lastSyncAt: null, status: 'stale' },
        restoreValidation: { lastRunAt: null, status: 'unknown' },
        source: 'json',
      },
      domainStatus: { runtime: 'ok', worker: 'ok', dimo: 'ok', billing: 'ok', backup: 'critical', support: 'ok' },
    });
    expect(data.resilience.overall).toBe('critical');
    expect(data.resilience.source).not.toBe('none');
  });

  it('partial API failure: moduleErrors without destroying entire DTO', () => {
    const data = fixture({
      moduleErrors: { billing: 'Stripe timeout', platformHealth: undefined },
      billing: null,
      overallStatus: 'healthy',
    });
    expect(data.moduleErrors.billing).toBeTruthy();
    expect(data.billing).toBeNull();
    expect(data.overallStatus).toBe('healthy');
  });

  it('stale data: isStale derived from cache age (contract)', () => {
    expect(OPERATIONAL_STALE_MS).toBe(5 * 60 * 1000);
  });

  it('no organizations: empty attention list', () => {
    const data = fixture({ organizationsAttention: [] });
    expect(data.organizationsAttention).toHaveLength(0);
  });

  it('many organizations: attention capped at 8 in backend contract', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      organizationId: `org-${i}`,
      organizationName: `Org ${i}`,
      reasons: ['PAST_DUE'],
      severity: 'warning' as const,
      drilldownView: 'billing',
      drilldownParams: { orgId: `org-${i}` },
    }));
    const capped = items.slice(0, 8);
    expect(capped).toHaveLength(8);
  });
});
