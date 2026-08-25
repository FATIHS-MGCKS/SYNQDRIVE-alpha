import { deriveInterruptionKnowledge } from './interruption-knowledge';
import { PhysicalDeviceState } from '../vehicles/connectivity/domain/connectivity-domain.types';

describe('deriveInterruptionKnowledge', () => {
  const base = {
    lteR1Capable: true,
    dimoLinked: true,
    usePersistedEpisodeScope: true,
    episodeEvidenceReliable: true,
    openUnpluggedEpisode: false,
    physicalDeviceState: PhysicalDeviceState.PLUGGED_INFERRED,
  };

  it('returns active when an open episode exists', () => {
    expect(
      deriveInterruptionKnowledge({ ...base, openUnpluggedEpisode: true }).knowledge,
    ).toBe('active');
  });

  it('Test O — returns known_none when episode scope is authoritative, reliable, and no physical unplug evidence', () => {
    expect(deriveInterruptionKnowledge(base).knowledge).toBe('known_none');
    expect(deriveInterruptionKnowledge(base).reason).toBe('episode_authoritative_no_open');
  });

  it('Test I — episode scope not queried must not return known_none', () => {
    const result = deriveInterruptionKnowledge({
      ...base,
      usePersistedEpisodeScope: false,
    });
    expect(result.knowledge).toBe('unknown');
    expect(result.reason).toBe('episode_scope_not_queried');
    expect(result.knowledge).not.toBe('known_none');
  });

  it('Test P — episode scope queried but authority unreliable => unknown', () => {
    const result = deriveInterruptionKnowledge({
      ...base,
      episodeEvidenceReliable: false,
    });
    expect(result.knowledge).toBe('unknown');
    expect(result.reason).toBe('episode_authority_unreliable');
    expect(result.knowledge).not.toBe('known_none');
  });

  it('Test J / Q — unplug physical evidence without episode yields unknown interruption', () => {
    const result = deriveInterruptionKnowledge({
      ...base,
      physicalDeviceState: PhysicalDeviceState.UNPLUGGED_CONFIRMED,
    });
    expect(result.knowledge).toBe('unknown');
    expect(result.reason).toBe('physical_evidence_without_episode');
  });

  it('returns not_applicable for non-DIMO-linked vehicles', () => {
    expect(
      deriveInterruptionKnowledge({ ...base, dimoLinked: false }).knowledge,
    ).toBe('not_applicable');
  });

  it('returns not_applicable for non-LTE_R1 hardware', () => {
    expect(
      deriveInterruptionKnowledge({ ...base, lteR1Capable: false }).knowledge,
    ).toBe('not_applicable');
  });
});
