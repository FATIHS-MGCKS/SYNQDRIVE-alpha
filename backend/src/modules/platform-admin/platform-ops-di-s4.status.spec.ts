import {
  computePlatformOpsDiS4OperationalMode,
  computePlatformOpsDiS4OperationalStatus,
  isMetricsFresh,
} from './platform-ops-di-s4.status';

describe('platform-ops-di-s4.status', () => {
  it('never returns HEALTHY when metrics freshness is unknown', () => {
    expect(
      computePlatformOpsDiS4OperationalStatus({
        masterEnabled: true,
        globalKillState: 'NOT_KILLED',
        prometheusAvailable: true,
        metricsFresh: null,
        refreshError: false,
        s4FiringCriticalCount: 0,
        s4FiringWarningCount: 0,
        ruleHealthErrCount: 0,
        schedulerLeaderCount: 1,
        shadowPlaneEngaged: true,
      }),
    ).toBe('UNKNOWN');
  });

  it('returns DISABLED when GLOBAL kill is active', () => {
    expect(
      computePlatformOpsDiS4OperationalStatus({
        masterEnabled: true,
        globalKillState: 'KILLED',
        prometheusAvailable: true,
        metricsFresh: true,
        refreshError: false,
        s4FiringCriticalCount: 0,
        s4FiringWarningCount: 0,
        ruleHealthErrCount: 0,
        schedulerLeaderCount: 1,
        shadowPlaneEngaged: false,
      }),
    ).toBe('DISABLED');
  });

  it('elevates to CRITICAL on S4 critical alerts even when otherwise healthy', () => {
    expect(
      computePlatformOpsDiS4OperationalStatus({
        masterEnabled: true,
        globalKillState: 'NOT_KILLED',
        prometheusAvailable: true,
        metricsFresh: true,
        refreshError: false,
        s4FiringCriticalCount: 1,
        s4FiringWarningCount: 0,
        ruleHealthErrCount: 0,
        schedulerLeaderCount: 1,
        shadowPlaneEngaged: true,
      }),
    ).toBe('CRITICAL');
  });

  it('returns HEALTHY only with fresh metrics and single leader', () => {
    expect(
      computePlatformOpsDiS4OperationalStatus({
        masterEnabled: true,
        globalKillState: 'NOT_KILLED',
        prometheusAvailable: true,
        metricsFresh: true,
        refreshError: false,
        s4FiringCriticalCount: 0,
        s4FiringWarningCount: 0,
        ruleHealthErrCount: 0,
        schedulerLeaderCount: 1,
        shadowPlaneEngaged: true,
      }),
    ).toBe('HEALTHY');
  });

  it('classifies operational mode paused vs active', () => {
    expect(
      computePlatformOpsDiS4OperationalMode({
        masterEnabled: true,
        globalKillState: 'KILLED',
        shadowPlaneEngaged: false,
      }),
    ).toBe('paused');
    expect(
      computePlatformOpsDiS4OperationalMode({
        masterEnabled: true,
        globalKillState: 'NOT_KILLED',
        shadowPlaneEngaged: true,
      }),
    ).toBe('active');
  });

  it('detects stale operational metrics', () => {
    const now = 1_700_000_000;
    expect(isMetricsFresh(now - 60, false, 180, now)).toBe(true);
    expect(isMetricsFresh(now - 400, false, 180, now)).toBe(false);
    expect(isMetricsFresh(null, null, 180, now)).toBe(null);
    expect(isMetricsFresh(now, true, 180, now)).toBe(false);
  });
});
