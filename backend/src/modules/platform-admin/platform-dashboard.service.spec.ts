import {
  buildDashboardIncidents,
  computeDomainStatus,
} from './platform-dashboard.service';
import type { ResilienceStatusDto } from './platform-dashboard.types';

describe('platform dashboard aggregation', () => {
  const resilienceUnknown: ResilienceStatusDto = {
    generatedAt: new Date().toISOString(),
    overall: 'unknown',
    postgres: { lastSuccessAt: null, status: 'unknown' },
    clickhouse: { lastSuccessAt: null, status: 'unknown' },
    offsite: { lastSyncAt: null, status: 'unknown' },
    restoreValidation: { lastRunAt: null, status: 'unknown' },
    source: 'none',
  };

  it('marks runtime critical when readiness is degraded', () => {
    const { domainStatus } = computeDomainStatus({
      platformHealth: {
        overallStatus: 'critical',
        readiness: { status: 'degraded', checks: { postgres: { status: 'error' } } },
        monitoring: { systemHealth: 'healthy' },
        queues: [],
        integrations: { dimo: { total: 0, connected: 0, disconnected: 0, tokenHealth: {} } },
        alerts: [],
        generatedAt: new Date().toISOString(),
      } as any,
      billing: null,
      resilience: resilienceUnknown,
      supportOpenTickets: 0,
      moduleErrors: {},
    });
    expect(domainStatus.runtime).toBe('critical');
  });

  it('builds billing critical incidents from failed payments', () => {
    const incidents = buildDashboardIncidents({
      platformHealth: null,
      billing: {
        failedPayments: 2,
        reconciliationDrifts: 0,
        pastDueSubscriptions: 0,
        stripeSyncErrors: 0,
      } as any,
      resilience: resilienceUnknown,
      supportCriticalOpen: 0,
    });
    expect(incidents.some((i) => i.affectedComponent === 'Billing' && i.severity === 'critical')).toBe(
      true,
    );
  });

  it('includes queue critical incident', () => {
    const incidents = buildDashboardIncidents({
      platformHealth: {
        queues: [{ queue: 'test', status: 'critical', failed: 12, waiting: 0, active: 0, delayed: 0 }],
        alerts: [],
      } as any,
      billing: null,
      resilience: resilienceUnknown,
      supportCriticalOpen: 0,
    });
    expect(incidents.some((i) => i.affectedComponent === 'Workers')).toBe(true);
  });

  it('returns empty incidents for healthy snapshot', () => {
    const incidents = buildDashboardIncidents({
      platformHealth: { alerts: [], queues: [] } as any,
      billing: {
        failedPayments: 0,
        reconciliationDrifts: 0,
        pastDueSubscriptions: 0,
        stripeSyncErrors: 0,
      } as any,
      resilience: { ...resilienceUnknown, overall: 'healthy' },
      supportCriticalOpen: 0,
    });
    expect(incidents).toHaveLength(0);
  });

  it('marks dimo warning when disconnected vehicles exist', () => {
    const { domainStatus } = computeDomainStatus({
      platformHealth: {
        readiness: { status: 'ok', checks: {} },
        monitoring: { errorRatePercent: 0 },
        integrations: {
          dimo: { total: 10, connected: 7, disconnected: 3, tokenHealth: { status: 'ok' } },
        },
        queues: [],
      } as any,
      billing: null,
      resilience: resilienceUnknown,
      supportOpenTickets: 0,
      moduleErrors: {},
    });
    expect(domainStatus.dimo).toBe('warning');
  });

  it('marks backup unknown when no observer configured', () => {
    const { domainStatus } = computeDomainStatus({
      platformHealth: { readiness: { status: 'ok' }, queues: [], monitoring: {} } as any,
      billing: null,
      resilience: resilienceUnknown,
      supportOpenTickets: 0,
      moduleErrors: {},
    });
    expect(domainStatus.backup).toBe('unknown');
  });

  it('builds backup failure incident', () => {
    const incidents = buildDashboardIncidents({
      platformHealth: null,
      billing: null,
      resilience: { ...resilienceUnknown, overall: 'critical' },
      supportCriticalOpen: 0,
    });
    expect(incidents.some((i) => i.affectedComponent === 'Backup')).toBe(true);
  });

  it('builds stripe webhook warning incident', () => {
    const incidents = buildDashboardIncidents({
      platformHealth: null,
      billing: {
        failedPayments: 0,
        reconciliationDrifts: 0,
        pastDueSubscriptions: 0,
        stripeSyncErrors: 3,
      } as any,
      resilience: resilienceUnknown,
      supportCriticalOpen: 0,
    });
    expect(incidents.some((i) => i.affectedComponent === 'Stripe')).toBe(true);
  });

  it('does not mark runtime healthy when module error present', () => {
    const { domainStatus } = computeDomainStatus({
      platformHealth: { readiness: { status: 'ok' }, queues: [] } as any,
      billing: null,
      resilience: resilienceUnknown,
      supportOpenTickets: 0,
      moduleErrors: { platformHealth: 'timeout' },
    });
    expect(domainStatus.runtime).toBe('unknown');
  });
});
