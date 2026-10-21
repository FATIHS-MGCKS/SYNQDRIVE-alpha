import { VsiApdsP5b1OperatorScopeError } from './vsi-apds-p5b1-operator-scope';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';

export function parseVsiP5b2ReplayProfileMode(
  raw: string | undefined,
): (typeof VsiApdsP5b1OfflineReplayProfileMode)[keyof typeof VsiApdsP5b1OfflineReplayProfileMode] {
  if (raw == null || raw.trim() === '') {
    return VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE;
  }
  const trimmed = raw.trim();
  if (trimmed === VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF) {
    return VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF;
  }
  if (trimmed === VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE) {
    return VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE;
  }
  throw new VsiApdsP5b1OperatorScopeError(
    'REPLAY_PROFILE_MODE_INVALID',
    `VSI_P5B2_REPLAY_PROFILE_MODE must be ${VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE} or ${VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF} (got "${trimmed}")`,
  );
}
