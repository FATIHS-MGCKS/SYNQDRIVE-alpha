/**
 * Epistemic semantics for telematics interruption (OBD unplug episode) state.
 *
 * Interruption lifecycle (episodes) is separate from physical-device evidence.
 * `openUnpluggedEpisode === false` must NOT be conflated with "no interruption exists"
 * when episode scope was not queried, physical unplug evidence exists without materialized
 * episode, or episode processing authority is not trustworthy.
 */
import { PhysicalDeviceState } from '../vehicles/connectivity/domain/connectivity-domain.types';

export type InterruptionKnowledge =
  | 'known_none'
  | 'active'
  | 'unknown'
  | 'not_applicable';

export type InterruptionKnowledgeReason =
  | 'episode_active'
  | 'episode_authoritative_no_open'
  | 'physical_evidence_without_episode'
  | 'episode_scope_not_queried'
  | 'episode_authority_unreliable'
  | 'not_applicable_non_lte_r1'
  | 'not_applicable_not_dimo_linked';

export interface InterruptionKnowledgeState {
  knowledge: InterruptionKnowledge;
  reason: InterruptionKnowledgeReason;
}

export function deriveInterruptionKnowledge(input: {
  lteR1Capable: boolean;
  dimoLinked: boolean;
  /** True when episode table was queried (persistedOpenEpisode is defined, including null). */
  usePersistedEpisodeScope: boolean;
  /**
   * True only when the caller trusts episode persistence/processing enough to treat
   * "no OPEN row" as authoritative negative knowledge.
   */
  episodeEvidenceReliable: boolean;
  openUnpluggedEpisode: boolean;
  /** Physical device state from canonical evidence ordering — not historical event counts. */
  physicalDeviceState: (typeof PhysicalDeviceState)[keyof typeof PhysicalDeviceState];
}): InterruptionKnowledgeState {
  if (!input.dimoLinked) {
    return { knowledge: 'not_applicable', reason: 'not_applicable_not_dimo_linked' };
  }
  if (!input.lteR1Capable) {
    return { knowledge: 'not_applicable', reason: 'not_applicable_non_lte_r1' };
  }

  if (input.openUnpluggedEpisode) {
    return { knowledge: 'active', reason: 'episode_active' };
  }

  if (!input.usePersistedEpisodeScope) {
    return { knowledge: 'unknown', reason: 'episode_scope_not_queried' };
  }

  if (input.physicalDeviceState === PhysicalDeviceState.UNPLUGGED_CONFIRMED) {
    return { knowledge: 'unknown', reason: 'physical_evidence_without_episode' };
  }

  if (!input.episodeEvidenceReliable) {
    return { knowledge: 'unknown', reason: 'episode_authority_unreliable' };
  }

  return { knowledge: 'known_none', reason: 'episode_authoritative_no_open' };
}
