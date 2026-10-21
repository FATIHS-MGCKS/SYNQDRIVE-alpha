import type { VsiProfileRevisionAsOfAuthority } from './vsi-profile-revision-as-of.types';

export const VsiApdsP5b1OfflineReplayProfileMode = {
  /** Mutable `vehicle_signal_capability_profile` — diagnostic CURRENT_PROFILE_REVIEW bias. */
  LEGACY_MUTABLE_PROFILE: 'LEGACY_MUTABLE_PROFILE',
  /** P5-H1 `resolveRevisionAsOf` immutable revision selection at decision time. */
  HISTORY_AS_OF: 'HISTORY_AS_OF',
} as const;

export type VsiApdsP5b1OfflineReplayProfileMode =
  (typeof VsiApdsP5b1OfflineReplayProfileMode)[keyof typeof VsiApdsP5b1OfflineReplayProfileMode];

export type VsiApdsP5b2HistoricalRevisionEvidenceV1 = {
  authority: VsiProfileRevisionAsOfAuthority;
  limitations: string[];
  commitVisibilityProven: boolean;
};

/** Scientific counters for HISTORY_AS_OF offline replay (research-only). */
export type VsiApdsP5b2HistoricalScientificMetricsV1 = {
  totalDecisions: number;
  uniqueLinkAttributed: number;
  priorRevisionFound: number;
  noPriorRevision: number;
  temporalAuthorityUnproven: number;
  commitVisibilityUnproven: number;
  verifiedDecisionTimeEvidence: number;
  currentProfileOnly: number;
  correlationNotAssessable: number;
  errorCount: number;
};
