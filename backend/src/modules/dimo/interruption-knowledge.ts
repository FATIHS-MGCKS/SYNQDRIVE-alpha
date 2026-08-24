/**
 * Epistemic semantics for telematics interruption (OBD unplug episode) state.
 *
 * `openUnpluggedEpisode === false` must NOT be conflated with "no interruption exists"
 * when physical evidence (snapshot OBD unplugged, persisted unplug events without a
 * materialized OPEN episode) indicates uncertainty.
 */

export type InterruptionKnowledge = 'known_none' | 'active' | 'unknown';

export type InterruptionKnowledgeReason =
  | 'episode_active'
  | 'episode_authoritative_no_open'
  | 'physical_evidence_without_episode'
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
  openUnpluggedEpisode: boolean;
  hasUnplugEvents: boolean;
  obdSnapshotUnplugged: boolean;
}): InterruptionKnowledgeState {
  if (!input.dimoLinked) {
    return { knowledge: 'unknown', reason: 'not_applicable_not_dimo_linked' };
  }
  if (!input.lteR1Capable) {
    return { knowledge: 'unknown', reason: 'not_applicable_non_lte_r1' };
  }

  if (input.openUnpluggedEpisode) {
    return { knowledge: 'active', reason: 'episode_active' };
  }

  if (!input.usePersistedEpisodeScope) {
    return { knowledge: 'known_none', reason: 'episode_authoritative_no_open' };
  }

  if (input.hasUnplugEvents || input.obdSnapshotUnplugged) {
    return { knowledge: 'unknown', reason: 'physical_evidence_without_episode' };
  }

  return { knowledge: 'known_none', reason: 'episode_authoritative_no_open' };
}
