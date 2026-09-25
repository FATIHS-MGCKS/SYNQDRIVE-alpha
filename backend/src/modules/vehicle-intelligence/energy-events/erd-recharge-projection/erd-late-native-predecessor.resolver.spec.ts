import {
  classifyE3SupersededFallbackPredecessors,
  ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION,
  validateE3PersistedSupersessionMetadata,
} from './erd-late-native-predecessor.resolver';

describe('erd-late-native-predecessor.resolver', () => {
  const native = {
    source: 'DIMO_RECHARGE_SEGMENT',
    segmentFingerprint: 'native-fp',
  } as Pick<HvChargeSession, 'source' | 'segmentFingerprint'>;

  it('requires persisted E3 supersession metadata', () => {
    expect(
      validateE3PersistedSupersessionMetadata(
        { supersededBySegmentFingerprint: 'native-fp' },
        'native-fp',
      ),
    ).toBe('invalid');
    expect(
      validateE3PersistedSupersessionMetadata(
        {
          supersededBySegmentFingerprint: 'native-fp',
          supersededAt: '2026-01-01T00:00:00.000Z',
          erdMatchVersion: 1,
          erdMatchReason: 'same_physical_episode',
        },
        'native-fp',
      ),
    ).toBe('valid');
  });

  it('classifies one authoritative predecessor', () => {
    const fallback = {
      source: 'TELEMETRY_POLL_FALLBACK',
      metadata: {
        supersededBySegmentFingerprint: 'native-fp',
        supersededAt: '2026-01-01T00:00:00.000Z',
        erdMatchVersion: 1,
        erdMatchReason: 'same',
      },
    } as never;
    expect(
      classifyE3SupersededFallbackPredecessors({
        nativeSession: native,
        fallbackSessions: [fallback],
      }).kind,
    ).toBe(ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.ONE_AUTHORITATIVE_PREDECESSOR);
  });

  it('fails closed on ambiguous predecessors', () => {
    const meta = {
      supersededBySegmentFingerprint: 'native-fp',
      supersededAt: '2026-01-01T00:00:00.000Z',
      erdMatchVersion: 1,
      erdMatchReason: 'same',
    };
    const result = classifyE3SupersededFallbackPredecessors({
      nativeSession: native,
      fallbackSessions: [
        { source: 'TELEMETRY_POLL_FALLBACK', metadata: meta } as never,
        { source: 'TELEMETRY_POLL_FALLBACK', metadata: meta } as never,
      ],
    });
    expect(result.kind).toBe(ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.AMBIGUOUS_PREDECESSOR);
  });
});
