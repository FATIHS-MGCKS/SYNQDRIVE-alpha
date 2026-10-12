// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrivingIntelligenceS4DiagnosticsPanel } from './tabs/DrivingIntelligenceS4DiagnosticsPanel';

const sampleStatus = {
  generatedAt: '2026-10-12T00:00:00.000Z',
  operationalStatus: 'DISABLED' as const,
  operationalMode: 'paused' as const,
  prometheusAvailable: true,
  alertmanagerAvailable: true,
  globalKill: { state: 'KILLED' as const, updatedAt: '2026-10-12T00:00:00.000Z', readable: true },
  runtimeFlags: {
    masterEnabled: true,
    discoveryEnabled: false,
    workerEnabled: false,
    positionEnabled: false,
    r1Enabled: false,
    nativeEnabled: false,
  },
  cohort: { authorizedVehicleCount: 5, organizationAllowlistCount: 1, vehicleAllowlistIds: ['v1', 'v2', 'v3', 'v4', 'v5'] },
  metricsRefresh: {
    lastSuccessAt: '2026-10-12T00:00:00.000Z',
    lastSuccessUnixtime: 1_700_000_000,
    ageSeconds: 30,
    staleAfterSeconds: 180,
    refreshError: false,
    metricsFresh: true,
  },
  schedulerLeader: { leaderCount: 1, operationalRefreshLeaderCount: 1, replicas: [] },
  dimoBudget: { replicas: [], allReplicasBudgetEnabled: true },
  shadowProcessing: { shadowPlaneEngaged: false, activitySignal: false, workItemsByStatus: { PENDING: 1 } },
  prometheusRules: {
    groupName: 'synqdrive_di_v0_s4_shadow',
    expectedRuleCount: 15,
    loadedRuleCount: 15,
    evaluationInterval: '60s',
    rules: Array.from({ length: 15 }, (_, i) => ({
      alertname: `DiV0S4Rule${i}`,
      severity: 'warning' as const,
      evaluationState: 'inactive' as const,
      health: 'ok' as const,
      loadedInPrometheus: true,
    })),
  },
  s4ActiveAlerts: [],
  iamSeedAdminFinding: {
    alertname: 'IamSeedAdminEnabledInProduction' as const,
    representedInPlatformAlerts: true,
    representedInS4Panel: false,
    cause: 'seed',
    impact: 'risk',
    remediation: 'disable',
  },
  dataFreshness: { controlPlaneReadable: true, source: 'mixed' as const },
};

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      platformOps: {
        drivingIntelligenceS4: vi.fn(async () => sampleStatus),
      },
    },
  },
}));

describe('DrivingIntelligenceS4DiagnosticsPanel', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders operational status, 15 rules, and cohort count', async () => {
    await act(async () => {
      root.render(createElement(DrivingIntelligenceS4DiagnosticsPanel));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('DISABLED');
    expect(text).toContain('Autorisierte Fahrzeuge: 5');
    expect(text).toContain('DiV0S4Rule0');
    expect(text).toContain('IamSeedAdminEnabledInProduction');
  });
});
