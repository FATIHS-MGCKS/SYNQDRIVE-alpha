import {
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  type BatteryRestSessionFeature,
} from '@prisma/client';
import { computeFeatureInputDigestFromSnapshot } from '../feature-input-canonical.serializer';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import type { RestSessionFeatureRevisionIntegrityAggregate } from '../rest-session-feature-inspection.repository.types';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';
import type { D4SourceIntegrityBatchContext } from './longitudinal-integrity-inspection.source-integrity';
import { buildD4SessionVersionKey } from './longitudinal-integrity-inspection.source-integrity';
import { assembleLongitudinalProfileV1 } from './longitudinal-profile.assembler';
import { buildLongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import type { LongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import type { LongitudinalInputSessionInventoryItem } from './longitudinal-input.types';
import type { LongitudinalProfileObservationV1 } from './longitudinal-profile.types';
import {
  buildProfileTestInventory,
  buildProfileTestInventoryItem,
  PROFILE_TEST_GENERATED_AT,
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
} from './longitudinal-profile.test-fixtures';

export function buildD4TestProjection(
  sessions: LongitudinalInputSessionInventoryItem[],
): LongitudinalScientificProfileProjectionV1 {
  const assembled = assembleLongitudinalProfileV1({
    inventory: buildProfileTestInventory(sessions),
    profileGeneratedAt: PROFILE_TEST_GENERATED_AT,
  });
  if (assembled.status !== 'OK') {
    throw new Error(`assemble failed: ${assembled.reason}`);
  }
  return buildLongitudinalScientificProfileProjectionV1(assembled.profile);
}

export function buildD4TestBatchContext(
  overrides: Partial<D4SourceIntegrityBatchContext> = {},
): D4SourceIntegrityBatchContext {
  return {
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    revisionCreatedAt: new Date('2026-09-24T12:00:00.000Z'),
    selfIntegrityFailed: false,
    sourceRowsById: new Map<string, BatteryRestSessionFeature>(),
    aggregatesBySessionKey: new Map<string, RestSessionFeatureRevisionIntegrityAggregate>(),
    totalRowsBySessionKey: new Map<string, number>(),
    latestRowsBySessionKey: new Map<string, BatteryRestSessionFeature[]>(),
    ...overrides,
  };
}

function observationFromProjection(
  projection: LongitudinalScientificProfileProjectionV1,
  restSessionId: string,
): LongitudinalProfileObservationV1 {
  const obs =
    projection.observations.find((o) => o.restSessionId === restSessionId) ??
    projection.provisionalObservations.find((o) => o.restSessionId === restSessionId);
  if (!obs) throw new Error(`observation ${restSessionId} not found`);
  return obs;
}

export function buildMatchingFeatureRowForObservation(
  observation: LongitudinalProfileObservationV1,
  overrides: Partial<BatteryRestSessionFeature> = {},
): BatteryRestSessionFeature {
  const inputSummary = buildMinimalLongitudinalInputSummary({
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    restSessionId: observation.restSessionId,
    anchorResolutionStatus: observation.anchorResolutionStatus,
    contextCompleteness: observation.chargeContextCompleteness,
    temperatureC: observation.temperatureC,
    temperatureSource: observation.temperatureSource ?? 'UNKNOWN',
    inputContractVersion: observation.versionTuple.inputContractVersion,
  });
  const inputDigest = computeFeatureInputDigestFromSnapshot(
    inputSummary as never,
  );
  const f = observation.features;
  return {
    id: observation.canonical.canonicalFeatureRowId,
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    restSessionId: observation.restSessionId,
    featureModelVersion: observation.versionTuple.featureModelVersion,
    retentionPolicyVersion: observation.versionTuple.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: observation.versionTuple.chargeOpportunityPolicyVersion,
    semanticRevision: observation.canonical.semanticRevision,
    inputDigest,
    inputSummary: inputSummary as BatteryRestSessionFeature['inputSummary'],
    computationPhase: observation.canonical.computationPhase as BatteryRestSessionFeatureComputationPhase,
    sessionTrust: observation.canonical.sessionTrust as BatteryRestSessionFeatureSessionTrust,
    chargeOpportunityClass:
      f.chargeOpportunityClass as BatteryRestSessionChargeOpportunityClass,
    chargeOpportunityRaw: null,
    shutdownToFirstRestDeltaMv: f.shutdownToFirstRestDeltaMv,
    robustRestSlopeMvPerHour: f.robustRestSlopeMvPerHour,
    minimumRestVoltageMv: f.minimumRestVoltageMv,
    maximumRestVoltageMv: f.maximumRestVoltageMv,
    medianRestVoltageMv: f.medianRestVoltageMv,
    restVoltageVarianceMv2: f.restVoltageVarianceMv2,
    numberOfValidRestPoints: f.numberOfValidRestPoints,
    maxActualRestAgeMs: f.maxActualRestAgeMs,
    maxInterObservationGapMs: f.maxInterObservationGapMs,
    observationSpanMs: f.observationSpanMs,
    missingRungCount: f.missingRungCount,
    pairwiseRestDeltas: null,
    computedAt: new Date('2026-09-24T11:00:00.000Z'),
    createdAt: new Date('2026-09-24T11:00:00.000Z'),
    ...overrides,
  } as BatteryRestSessionFeature;
}

export function buildVerifiableSourceContextForSession(
  restSessionId: string,
  sessions: LongitudinalInputSessionInventoryItem[] = [
    buildProfileTestInventoryItem({
      restSessionId,
      anchorAt: '2026-01-01T10:00:00.000Z',
      inclusionMode: 'DEFAULT',
    }),
  ],
): {
  projection: LongitudinalScientificProfileProjectionV1;
  row: BatteryRestSessionFeature;
  batchContext: D4SourceIntegrityBatchContext;
} {
  let projection = buildD4TestProjection(sessions);
  const observation = observationFromProjection(projection, restSessionId);
  const row = buildMatchingFeatureRowForObservation(observation);
  projection = {
    ...projection,
    observations: projection.observations.map((item) =>
      item.restSessionId === restSessionId
        ? {
            ...item,
            canonical: {
              ...item.canonical,
              inputDigest: row.inputDigest,
            },
          }
        : item,
    ),
    provisionalObservations: projection.provisionalObservations.map((item) =>
      item.restSessionId === restSessionId
        ? {
            ...item,
            canonical: {
              ...item.canonical,
              inputDigest: row.inputDigest,
            },
          }
        : item,
    ),
  };
  const sessionKey = buildD4SessionVersionKey({
    restSessionId: observation.restSessionId,
    featureModelVersion: observation.versionTuple.featureModelVersion,
    retentionPolicyVersion: observation.versionTuple.retentionPolicyVersion,
    chargeOpportunityPolicyVersion: observation.versionTuple.chargeOpportunityPolicyVersion,
  });
  const aggregate: RestSessionFeatureRevisionIntegrityAggregate = {
    totalRows: 1,
    incrementalRows: 0,
    finalRows: 1,
    validRows: 1,
    invalidatedRows: 0,
    latestSemanticRevision: observation.canonical.semanticRevision,
    positiveRevisionRowCount: 1,
    distinctPositiveRevisionCount: 1,
    minPositiveSemanticRevision: observation.canonical.semanticRevision,
    maxPositiveSemanticRevision: observation.canonical.semanticRevision,
    nonPositiveRevisionRowCount: 0,
  };
  const batchContext = buildD4TestBatchContext({
    sourceRowsById: new Map([[row.id, row]]),
    aggregatesBySessionKey: new Map([[sessionKey, aggregate]]),
    totalRowsBySessionKey: new Map([[sessionKey, 1]]),
    latestRowsBySessionKey: new Map([[sessionKey, [row]]]),
  });
  return { projection, row, batchContext };
}

export function defaultSingleSessionInventory(): LongitudinalInputSessionInventoryItem[] {
  return [
    buildProfileTestInventoryItem({
      restSessionId: 's1',
      anchorAt: '2026-01-01T10:00:00.000Z',
      inclusionMode: 'DEFAULT',
    }),
  ];
}

export {
  PROFILE_TEST_ORG,
  PROFILE_TEST_VEHICLE,
  PROFILE_TEST_GENERATED_AT,
  buildProfileTestInventoryItem,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
};
