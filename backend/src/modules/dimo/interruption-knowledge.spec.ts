import { deriveInterruptionKnowledge } from './interruption-knowledge';

describe('deriveInterruptionKnowledge', () => {
  const base = {
    lteR1Capable: true,
    dimoLinked: true,
    usePersistedEpisodeScope: true,
    openUnpluggedEpisode: false,
    hasUnplugEvents: false,
    obdSnapshotUnplugged: false,
  };

  it('returns active when an open episode exists', () => {
    expect(
      deriveInterruptionKnowledge({ ...base, openUnpluggedEpisode: true }).knowledge,
    ).toBe('active');
  });

  it('returns known_none when episode scope is authoritative and no physical evidence conflicts', () => {
    expect(deriveInterruptionKnowledge(base).knowledge).toBe('known_none');
  });

  it('returns unknown when unplug events exist without a materialized open episode (Test C)', () => {
    expect(
      deriveInterruptionKnowledge({
        ...base,
        hasUnplugEvents: true,
      }).knowledge,
    ).toBe('unknown');
  });

  it('returns unknown when OBD snapshot is unplugged without open episode (Test C)', () => {
    expect(
      deriveInterruptionKnowledge({
        ...base,
        obdSnapshotUnplugged: true,
      }).knowledge,
    ).toBe('unknown');
  });

  it('does not conflate null open episode with known_none when physical evidence exists', () => {
    const result = deriveInterruptionKnowledge({
      ...base,
      hasUnplugEvents: true,
      obdSnapshotUnplugged: true,
    });
    expect(result.knowledge).toBe('unknown');
    expect(result.reason).toBe('physical_evidence_without_episode');
  });

  it('returns unknown for non-DIMO-linked vehicles', () => {
    expect(
      deriveInterruptionKnowledge({ ...base, dimoLinked: false }).reason,
    ).toBe('not_applicable_not_dimo_linked');
  });
});
