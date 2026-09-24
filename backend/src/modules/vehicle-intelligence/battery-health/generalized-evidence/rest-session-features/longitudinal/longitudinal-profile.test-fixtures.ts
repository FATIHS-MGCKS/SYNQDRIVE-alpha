import { LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS, REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION } from './longitudinal-input.constants';
import type {
  LongitudinalInputInclusionMode,
  LongitudinalInputReadResultV1,
  LongitudinalInputSessionInventoryItem,
  LongitudinalInputVersionTuple,
} from './longitudinal-input.types';

const ORG = '11111111-1111-1111-1111-111111111111';
const VEHICLE = '22222222-2222-2222-2222-222222222222';

const DEFAULT_VERSION: LongitudinalInputVersionTuple = {
  featureModelVersion: 'fm-v1',
  retentionPolicyVersion: 'ret-v1',
  chargeOpportunityPolicyVersion: 'chg-v1',
  inputContractVersion: 'M3_3C_FEATURE_INPUT_V1',
  inputContractResolution: 'RESOLVED',
};

export function buildProfileTestInventoryItem(input: {
  restSessionId: string;
  anchorAt: string;
  inclusionMode: LongitudinalInputInclusionMode;
  exclusionReasons?: LongitudinalInputSessionInventoryItem['quality']['exclusionReasons'];
  version?: LongitudinalInputVersionTuple | null;
  includePayload?: boolean;
}): LongitudinalInputSessionInventoryItem {
  const includePayload =
    input.includePayload ??
    (input.inclusionMode === 'DEFAULT' || input.inclusionMode === 'PROVISIONAL');

  const version =
    input.version !== undefined
      ? input.version
      : includePayload
        ? DEFAULT_VERSION
        : null;

  return {
    organizationId: ORG,
    vehicleId: VEHICLE,
    restSessionId: input.restSessionId,
    session: {
      anchorAt: input.anchorAt,
      sessionStatus: 'ENDED',
      endReason: null,
      openedAt: input.anchorAt,
      endedAt: input.anchorAt,
    },
    canonical: includePayload
      ? {
          canonicalFeatureRowId: `row-${input.restSessionId}`,
          semanticRevision: 1,
          computationPhase: 'FINAL',
          sessionTrust: 'VALID',
          inputDigest: `digest-${input.restSessionId}`,
        }
      : null,
    version,
    features: includePayload
      ? {
          shutdownToFirstRestDeltaMv: null,
          robustRestSlopeMvPerHour: null,
          minimumRestVoltageMv: 12000,
          maximumRestVoltageMv: 12100,
          medianRestVoltageMv: 12050,
          restVoltageVarianceMv2: null,
          numberOfValidRestPoints: 2,
          maxActualRestAgeMs: 1000,
          maxInterObservationGapMs: 500,
          observationSpanMs: 100,
          missingRungCount: 0,
          chargeOpportunityClass: 'UNKNOWN',
        }
      : null,
    snapshot: includePayload
      ? {
          anchorResolutionStatus: 'SELECTED',
          chargeContextCompleteness: [],
          temperatureC: null,
          temperatureSource: 'UNKNOWN',
        }
      : null,
    quality: {
      inclusionMode: input.inclusionMode,
      exclusionReasons: input.exclusionReasons ?? [],
      perSessionInspectionStatus: 'NOT_EVALUATED',
    },
  };
}

export function buildProfileTestInventory(
  sessions: LongitudinalInputSessionInventoryItem[],
  window?: Partial<
    Pick<LongitudinalInputReadResultV1, 'requestedSessionLimit' | 'appliedSessionLimit'>
  >,
): LongitudinalInputReadResultV1 {
  const applied = window?.appliedSessionLimit ?? Math.max(sessions.length, 10);
  const requested = window?.requestedSessionLimit ?? applied;
  return {
    longitudinalInputContractVersion: REST_SESSION_LONGITUDINAL_INPUT_CONTRACT_VERSION,
    organizationId: ORG,
    vehicleId: VEHICLE,
    dbSafetyMaxSessions: LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
    requestedSessionLimit: requested,
    appliedSessionLimit: applied,
    sessions,
  };
}

export function versionTuple(overrides: Partial<LongitudinalInputVersionTuple>): LongitudinalInputVersionTuple {
  return { ...DEFAULT_VERSION, ...overrides };
}

export const PROFILE_TEST_ORG = ORG;
export const PROFILE_TEST_VEHICLE = VEHICLE;
export const PROFILE_TEST_GENERATED_AT = '2026-09-24T12:00:00.000Z';
