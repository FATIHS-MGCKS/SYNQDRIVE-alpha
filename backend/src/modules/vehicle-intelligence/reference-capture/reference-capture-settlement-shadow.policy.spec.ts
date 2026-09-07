import {
  buildFixedIntervalProbesForPhase,
  buildScheduleIdempotencyKey,
  computeActualAgeMs,
  computeScheduleDriftMs,
  EXP021_MANDATORY_AGES_MS,
  EXP021_PRIMARY_PROBE_DURATION_MS,
  validatePhaseDurationForProbes,
} from './reference-capture-settlement-shadow.policy';

describe('reference-capture-settlement-shadow.policy', () => {
  const phaseStart = Date.parse('2026-09-07T10:00:00.000Z');

  it('requires prospective probe intervals fully inside phase', () => {
    const validation = validatePhaseDurationForProbes({
      phaseStartedAtMs: phaseStart,
      phaseEndedAtMs: phaseStart + 5 * 60_000,
      probeDurationMs: EXP021_PRIMARY_PROBE_DURATION_MS,
      stabilizationMs: 120_000,
    });
    expect(validation.insufficientPhaseDurationDetected).toBe(false);
    expect(validation.probeA.fits).toBe(true);
    expect(validation.probeB.fits).toBe(true);
  });

  it('detects insufficient phase duration without silent truncation', () => {
    const validation = validatePhaseDurationForProbes({
      phaseStartedAtMs: phaseStart,
      phaseEndedAtMs: phaseStart + 150_000,
      probeDurationMs: EXP021_PRIMARY_PROBE_DURATION_MS,
      stabilizationMs: 120_000,
    });
    expect(validation.insufficientPhaseDurationDetected).toBe(true);
    const { probes } = buildFixedIntervalProbesForPhase({
      phasePollIntervalMs: 60_000,
      phaseStartedAtMs: phaseStart,
      phaseEndedAtMs: phaseStart + 150_000,
    });
    expect(probes).toHaveLength(0);
  });

  it('plans 8 probes × 6 ages = 48 fixed-interval observations across cadence phases', () => {
    const phaseDurationMs = 8 * 60_000;
    let totalProbes = 0;
    for (const poll of [60_000, 30_000, 20_000, 10_000]) {
      const { probes } = buildFixedIntervalProbesForPhase({
        phasePollIntervalMs: poll,
        phaseStartedAtMs: phaseStart,
        phaseEndedAtMs: phaseStart + phaseDurationMs,
      });
      expect(probes).toHaveLength(2);
      totalProbes += probes.length;
      for (const probe of probes) {
        expect(probe.queryFromMs).toBe(probe.sourceIntervalStartMs);
        expect(probe.queryToMs).toBe(probe.sourceIntervalEndMs);
        expect(probe.sourceIntervalEndMs - probe.sourceIntervalStartMs).toBe(
          EXP021_PRIMARY_PROBE_DURATION_MS,
        );
      }
    }
    expect(totalProbes).toBe(8);
    expect(totalProbes * EXP021_MANDATORY_AGES_MS.length).toBe(48);
  });

  it('builds stable idempotency keys', () => {
    const key = buildScheduleIdempotencyKey({
      experimentId: 'exp-021-abc',
      probeId: 'SP-60-A',
      scheduledAgeMs: 60_000,
    });
    expect(key).toBe('exp-021-abc|SP-60-A|60000');
  });

  it('records actual age and drift separately', () => {
    const sourceEnd = Date.parse('2026-09-07T10:01:00.000Z');
    const requestStarted = sourceEnd + 67_400;
    const actualAgeMs = computeActualAgeMs(requestStarted, sourceEnd);
    expect(actualAgeMs).toBe(67_400);
    expect(computeScheduleDriftMs(actualAgeMs, 60_000)).toBe(7_400);
  });
});
