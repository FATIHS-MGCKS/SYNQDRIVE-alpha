import { classifyMotionState } from '../reference-capture-exp-021-motion.lib';

export type Exp021MaturationShadowActivityCohort =
  | 'ACTIVE_MOTION'
  | 'ACTIVE_IDLE'
  | 'UNKNOWN_ACTIVITY';

export type Exp021MaturationShadowActivityClassification = {
  class: Exp021MaturationShadowActivityCohort;
  source: string;
  geometryMs: number;
};

/** Independent movement authority input — never derived from historical query under test. */
export type Exp021MaturationShadowActivityAuthority = {
  speedKmh?: number | null;
  speedSignalFresh?: boolean;
  vehicleTelemetryFresh?: boolean;
};

/** Geometry-specific independent movement authority — never derived from historical DIMO query. */
export type Exp021MaturationShadowActivityAuthorityByGeometry = Partial<
  Record<60_000 | 90_000, Exp021MaturationShadowActivityAuthority>
>;

const ACTIVITY_CLASSIFICATION_SOURCE = 'exp021_motion_authority_v1';
const PARKED_SPEED_KMH = 3;
const MOVEMENT_SPEED_KMH = 10;

/**
 * Geometry-specific activity classification.
 * Signal lane must not change classification for the same geometry.
 */
export function classifyActivityForGeometry(
  geometryMs: number,
  authority: Exp021MaturationShadowActivityAuthority,
): Exp021MaturationShadowActivityClassification {
  const motion = classifyMotionState(
    {
      speedKmh: authority.speedKmh ?? null,
      speedSignalFresh: authority.speedSignalFresh ?? false,
    },
    PARKED_SPEED_KMH,
    MOVEMENT_SPEED_KMH,
  );

  if (motion === 'MOVING') {
    return {
      class: 'ACTIVE_MOTION',
      source: ACTIVITY_CLASSIFICATION_SOURCE,
      geometryMs,
    };
  }

  if (motion === 'PARKED_CANDIDATE' && authority.vehicleTelemetryFresh) {
    return {
      class: 'ACTIVE_IDLE',
      source: ACTIVITY_CLASSIFICATION_SOURCE,
      geometryMs,
    };
  }

  return {
    class: 'UNKNOWN_ACTIVITY',
    source: ACTIVITY_CLASSIFICATION_SOURCE,
    geometryMs,
  };
}
