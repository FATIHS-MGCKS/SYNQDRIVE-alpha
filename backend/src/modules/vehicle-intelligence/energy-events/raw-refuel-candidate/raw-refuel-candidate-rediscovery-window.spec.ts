import { RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS } from './raw-refuel-candidate.constants';
import { computeRawRefuelCandidateRediscoveryWindow } from './raw-refuel-candidate-rediscovery-window';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

const LOOKBACK_MS = RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS;

function expectEvidenceLocalWindow(
  window: ReturnType<typeof computeRawRefuelCandidateRediscoveryWindow>,
  earliestEvidence: Date,
  latestEvidence: Date,
): void {
  expect(window.start.getTime()).toBe(earliestEvidence.getTime() - LOOKBACK_MS);
  expect(window.end.getTime()).toBe(latestEvidence.getTime() + LOOKBACK_MS);
}

describe('raw-refuel-candidate-rediscovery-window', () => {
  it('CASE A: evidence-local window when serviceNow is close to evidence', () => {
    const serviceNow = new Date('2026-09-06T10:30:00.000Z');
    const observation = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
      scanWindowStart: new Date('2026-09-06T08:30:00.000Z'),
      scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
    });
    const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);

    expectEvidenceLocalWindow(
      window,
      new Date('2026-09-06T08:30:00.000Z'),
      new Date('2026-09-06T12:00:00.000Z'),
    );
    expect(window.end.getTime()).not.toBe(serviceNow.getTime() + LOOKBACK_MS);
  });

  it('CASE B: delayed telemetry 24h — window stays evidence-local, not stretched to serviceNow', () => {
    const serviceNow = new Date('2026-09-06T10:00:00.000Z');
    const observation = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-05T10:00:00.000Z'),
      riseEndAt: new Date('2026-09-05T10:04:00.000Z'),
      physicalEvidenceStart: new Date('2026-09-05T09:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-05T10:04:00.000Z'),
      scanWindowStart: new Date('2026-09-05T08:30:00.000Z'),
      scanWindowEnd: new Date('2026-09-05T12:00:00.000Z'),
    });
    const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);

    expectEvidenceLocalWindow(
      window,
      new Date('2026-09-05T08:30:00.000Z'),
      new Date('2026-09-05T12:00:00.000Z'),
    );
    expect(window.end.getTime()).not.toBe(serviceNow.getTime() + LOOKBACK_MS);
    expect(window.end.getTime()).toBeLessThan(serviceNow.getTime());
    expect(window.end.getTime()).toBe(
      new Date('2026-09-05T12:00:00.000Z').getTime() + LOOKBACK_MS,
    );
  });

  it('CASE C: delayed telemetry 6d — window stays evidence-local, not stretched to serviceNow', () => {
    const serviceNow = new Date('2026-09-12T10:00:00.000Z');
    const observation = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: new Date('2026-09-06T10:00:00.000Z'),
      riseEndAt: new Date('2026-09-06T10:04:00.000Z'),
      physicalEvidenceStart: new Date('2026-09-06T09:50:00.000Z'),
      physicalEvidenceEnd: new Date('2026-09-06T10:04:00.000Z'),
      scanWindowStart: new Date('2026-09-06T08:30:00.000Z'),
      scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
    });
    const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);

    expectEvidenceLocalWindow(
      window,
      new Date('2026-09-06T08:30:00.000Z'),
      new Date('2026-09-06T12:00:00.000Z'),
    );
    expect(window.end.getTime()).not.toBe(serviceNow.getTime() + LOOKBACK_MS);
    expect(window.end.getTime()).toBeLessThan(serviceNow.getTime());
    expect(window.end.getTime()).toBe(
      new Date('2026-09-06T12:00:00.000Z').getTime() + LOOKBACK_MS,
    );
  });

  it('CASE D: no evidence timestamps — serviceNow ± lookback fallback', () => {
    const serviceNow = new Date('2026-09-06T10:00:00.000Z');
    const observation = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: null,
      riseEndAt: null,
      physicalEvidenceStart: null,
      physicalEvidenceEnd: null,
      scanWindowStart: null,
      scanWindowEnd: null,
    });
    const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);

    expectEvidenceLocalWindow(window, serviceNow, serviceNow);
  });

  it('CASE E: multi-hour scan window anchors earliest scan start and latest scan end', () => {
    const serviceNow = new Date('2026-09-12T10:00:00.000Z');
    const scanWindowStart = new Date('2026-09-06T08:00:00.000Z');
    const scanWindowEnd = new Date('2026-09-06T14:00:00.000Z');
    const observation = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      riseOnsetAt: null,
      riseEndAt: null,
      physicalEvidenceStart: null,
      physicalEvidenceEnd: null,
      scanWindowStart,
      scanWindowEnd,
    });
    const window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow);

    expectEvidenceLocalWindow(window, scanWindowStart, scanWindowEnd);
    expect(window.end.getTime()).not.toBe(serviceNow.getTime() + LOOKBACK_MS);
  });
});
