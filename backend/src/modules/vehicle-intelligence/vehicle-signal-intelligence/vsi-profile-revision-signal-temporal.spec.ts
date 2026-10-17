import {
  assessVsiProfileRevisionSignalTemporalState,
  VsiProfileRevisionSignalTemporalState,
} from './vsi-profile-revision-signal-temporal';

describe('assessVsiProfileRevisionSignalTemporalState', () => {
  const decisionMs = new Date('2026-10-11T00:00:00.000Z').getTime();

  it('returns NOT_APPLICABLE for non-observed empirical states', () => {
    expect(
      assessVsiProfileRevisionSignalTemporalState({
        empiricalObservation: 'NEVER_OBSERVED',
        lastSourceTimestamp: null,
        lastValidObservationAt: null,
        decisionAtMs: decisionMs,
      }),
    ).toBe(VsiProfileRevisionSignalTemporalState.NOT_APPLICABLE);
  });

  it('returns MISSING_TEMPORAL_PROVENANCE for OBSERVED without timestamps', () => {
    expect(
      assessVsiProfileRevisionSignalTemporalState({
        empiricalObservation: 'OBSERVED',
        lastSourceTimestamp: null,
        lastValidObservationAt: null,
        decisionAtMs: decisionMs,
      }),
    ).toBe(VsiProfileRevisionSignalTemporalState.MISSING_TEMPORAL_PROVENANCE);
  });

  it('returns FUTURE_SIGNAL_EVIDENCE when source timestamp is after decision', () => {
    expect(
      assessVsiProfileRevisionSignalTemporalState({
        empiricalObservation: 'OBSERVED',
        lastSourceTimestamp: '2026-10-12T00:00:00.000Z',
        lastValidObservationAt: null,
        decisionAtMs: decisionMs,
      }),
    ).toBe(VsiProfileRevisionSignalTemporalState.FUTURE_SIGNAL_EVIDENCE);
  });

  it('returns VALID_PAST_SIGNAL_EVIDENCE when timestamps precede decision', () => {
    expect(
      assessVsiProfileRevisionSignalTemporalState({
        empiricalObservation: 'OBSERVED_STALE',
        lastSourceTimestamp: '2026-10-10T12:00:00.000Z',
        lastValidObservationAt: null,
        decisionAtMs: decisionMs,
      }),
    ).toBe(VsiProfileRevisionSignalTemporalState.VALID_PAST_SIGNAL_EVIDENCE);
  });
});
