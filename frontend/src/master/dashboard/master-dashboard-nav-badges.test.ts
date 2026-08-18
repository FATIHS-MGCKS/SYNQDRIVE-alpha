import { describe, expect, it } from 'vitest';
import { operationalToNavBadgeState } from './useMasterDashboardOperational';
import type { MasterDashboardOperationalDto } from './types';

const baseOperational = (): MasterDashboardOperationalDto => ({
  generatedAt: new Date().toISOString(),
  overallStatus: 'healthy',
  incidentSummary: { count: 0, highestSeverity: null, affectedOrganizationCount: 0 },
  domainStatus: {
    runtime: 'ok',
    worker: 'ok',
    dimo: 'ok',
    billing: 'ok',
    backup: 'unknown',
    support: 'ok',
  },
  incidents: [],
  platformHealth: null,
  billing: {
    mrr: 1000,
    activeSubscriptions: 1,
    trialingSubscriptions: 0,
    pastDueSubscriptions: 0,
    openInvoices: 0,
    missingPaymentMethods: 0,
    stripeSyncErrors: 0,
    failedPayments: 0,
    reconciliationDrifts: 0,
  },
  connectivity: {
    generatedAt: new Date().toISOString(),
    dimoLinkedVehicles: 5,
    freshness: { live: 1, standby: 2, signal_delayed: 0, offline: 0, no_signal: 0 },
    platform: { dimoTotal: 5, dimoConnected: 5, dimoDisconnected: 0, pollErrorRatePercent: 0, tokenHealthStatus: 'ok' },
  },
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
  support: { openTickets: 2, criticalOpen: 0, newest: [] },
  activity: [],
  businessContext: null,
  moduleErrors: {},
});

describe('operationalToNavBadgeState', () => {
  it('flags billing anomaly from canonical overview fields', () => {
    const data = baseOperational();
    data.billing!.pastDueSubscriptions = 1;
    const state = operationalToNavBadgeState(data);
    expect(state.billingAnomaly).toBe(true);
  });

  it('flags platform critical from overall status', () => {
    const data = baseOperational();
    data.overallStatus = 'critical';
    const state = operationalToNavBadgeState(data);
    expect(state.platformCritical).toBe(true);
  });

  it('uses support open ticket count', () => {
    const state = operationalToNavBadgeState(baseOperational());
    expect(state.openSupportTickets).toBe(2);
  });
});
