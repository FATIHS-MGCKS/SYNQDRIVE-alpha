import {
  PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS,
  PLATFORM_OPS_DI_S4_EXPECTED_RULE_COUNT,
  computeS4MonitoringHealth,
  computeS4ProcessingState,
  isMetricsFresh,
  listS4MonitoringGaps,
  type S4MonitoringEvidence,
} from './platform-ops-di-s4.status';

function baseEvidence(overrides: Partial<S4MonitoringEvidence> = {}): S4MonitoringEvidence {
  return {
    prometheusAvailable: true,
    alertmanagerAvailable: true,
    globalKillReadable: true,
    metricsFresh: true,
    refreshError: false,
    rulesLoadedCount: PLATFORM_OPS_DI_S4_EXPECTED_RULE_COUNT,
    expectedRuleCount: PLATFORM_OPS_DI_S4_EXPECTED_RULE_COUNT,
    ruleHealthErrCount: 0,
    schedulerLeaderCount: 1,
    expectedReplicas: PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS,
    schedulerReplicasObserved: ['a', 'b'],
    dimoBudgetReplicasObserved: ['a', 'b'],
    dimoBudgetDisabledOnReplica: false,
    controlPlaneReadable: true,
    s4FiringCriticalCount: 0,
    s4FiringWarningCount: 0,
    ...overrides,
  };
}

describe('platform-ops-di-s4.status', () => {
  describe('computeS4ProcessingState', () => {
    it('keeps GLOBAL_KILL visible as DISABLED processing when monitoring fails', () => {
      expect(
        computeS4ProcessingState({
          masterEnabled: true,
          globalKillState: 'KILLED',
          shadowPlaneEngaged: false,
        }),
      ).toBe('DISABLED');
    });

    it('uses UNKNOWN for unreadable kill — never silently KILLED', () => {
      expect(
        computeS4ProcessingState({
          masterEnabled: true,
          globalKillState: 'UNKNOWN',
          shadowPlaneEngaged: null,
        }),
      ).toBe('UNKNOWN');
    });

    it('classifies healthy active S4', () => {
      expect(
        computeS4ProcessingState({
          masterEnabled: true,
          globalKillState: 'NOT_KILLED',
          shadowPlaneEngaged: true,
        }),
      ).toBe('ACTIVE');
    });

    it('classifies healthy inactive S4 (dormant)', () => {
      expect(
        computeS4ProcessingState({
          masterEnabled: true,
          globalKillState: 'KILLED',
          shadowPlaneEngaged: false,
        }),
      ).toBe('DISABLED');
    });
  });

  describe('computeS4MonitoringHealth', () => {
    it('never returns HEALTHY when metrics freshness is unknown', () => {
      expect(computeS4MonitoringHealth(baseEvidence({ metricsFresh: null }))).toBe('UNKNOWN');
    });

    it('never returns HEALTHY when Prometheus is unavailable', () => {
      expect(computeS4MonitoringHealth(baseEvidence({ prometheusAvailable: false }))).toBe('UNKNOWN');
    });

    it('returns HEALTHY for healthy active S4 with full mandatory evidence', () => {
      expect(computeS4MonitoringHealth(baseEvidence())).toBe('HEALTHY');
    });

    it('returns HEALTHY for healthy inactive S4 (GLOBAL_KILL) when monitoring stack is complete', () => {
      expect(computeS4MonitoringHealth(baseEvidence())).toBe('HEALTHY');
    });

    it('returns WARNING when 14/15 rules loaded', () => {
      expect(
        computeS4MonitoringHealth(
          baseEvidence({ rulesLoadedCount: 14, expectedRuleCount: 15 }),
        ),
      ).toBe('WARNING');
    });

    it('returns UNKNOWN when no rules loaded', () => {
      expect(computeS4MonitoringHealth(baseEvidence({ rulesLoadedCount: 0 }))).toBe('UNKNOWN');
    });

    it('returns CRITICAL on S4 critical alerts only (IAM excluded from counts)', () => {
      expect(
        computeS4MonitoringHealth(baseEvidence({ s4FiringCriticalCount: 1 })),
      ).toBe('CRITICAL');
      expect(
        computeS4MonitoringHealth(baseEvidence({ s4FiringCriticalCount: 0 })),
      ).toBe('HEALTHY');
    });

    it('returns CRITICAL on refresh error and invalid leader count', () => {
      expect(computeS4MonitoringHealth(baseEvidence({ refreshError: true }))).toBe('CRITICAL');
      expect(computeS4MonitoringHealth(baseEvidence({ schedulerLeaderCount: 2 }))).toBe('CRITICAL');
    });

    it('returns WARNING when one replica is absent', () => {
      expect(
        computeS4MonitoringHealth(
          baseEvidence({
            schedulerReplicasObserved: ['a'],
            dimoBudgetReplicasObserved: ['a', 'b'],
          }),
        ),
      ).toBe('WARNING');
    });

    it('returns CRITICAL when DIMO budget disabled on a replica', () => {
      expect(
        computeS4MonitoringHealth(baseEvidence({ dimoBudgetDisabledOnReplica: true })),
      ).toBe('CRITICAL');
    });

    it('returns WARNING when Alertmanager unavailable', () => {
      expect(computeS4MonitoringHealth(baseEvidence({ alertmanagerAvailable: false }))).toBe('WARNING');
    });

    it('returns UNKNOWN when global kill unreadable', () => {
      expect(computeS4MonitoringHealth(baseEvidence({ globalKillReadable: false }))).toBe('UNKNOWN');
    });

    it('returns CRITICAL when GLOBAL_KILL=KILLED and monitoring has refresh error', () => {
      expect(
        computeS4MonitoringHealth(
          baseEvidence({ refreshError: true }),
        ),
      ).toBe('CRITICAL');
    });
  });

  describe('isMetricsFresh', () => {
    it('detects stale operational metrics', () => {
      const now = 1_700_000_000;
      expect(isMetricsFresh(now - 60, false, 180, now)).toBe(true);
      expect(isMetricsFresh(now - 400, false, 180, now)).toBe(false);
      expect(isMetricsFresh(null, null, 180, now)).toBe(null);
      expect(isMetricsFresh(now, true, 180, now)).toBe(false);
    });
  });

  describe('listS4MonitoringGaps', () => {
    it('lists missing rule and replica gaps', () => {
      const gaps = listS4MonitoringGaps(
        baseEvidence({
          rulesLoadedCount: 14,
          schedulerReplicasObserved: ['a'],
        }),
      );
      expect(gaps.some((g) => g.startsWith('prometheus_rules_incomplete'))).toBe(true);
      expect(gaps).toContain('scheduler_replica_missing_b');
    });
  });
});
