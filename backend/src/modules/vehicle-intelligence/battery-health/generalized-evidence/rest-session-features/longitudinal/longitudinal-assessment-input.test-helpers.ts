import {
  canonicalFeatureInputUtf8,
  computeFeatureInputDigestFromSnapshot,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import { aggregateD4InspectionOverlay } from './longitudinal-integrity-inspection.aggregate';
import type { D4InspectionOutcome } from './longitudinal-integrity-inspection.types';
import type { D4SourceIntegrityBatchContext } from './longitudinal-integrity-inspection.source-integrity';
import {
  buildD4TestBatchContext,
  buildD4TestProjection,
  buildMatchingFeatureRowForObservation,
  buildProfileTestInventoryItem,
} from './longitudinal-integrity-inspection.test-helpers';
import type { M3_3E_RevisionIdentityV1 } from './longitudinal-assessment-input.types';
import {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type { LongitudinalScientificProfileProjectionV1 } from './longitudinal-profile-scientific-projection';
import type { LongitudinalInputSessionInventoryItem } from './longitudinal-input.types';
import { buildMinimalLongitudinalInputSummary } from './longitudinal-input.test-fixtures';
import { buildD4SessionVersionKey } from './longitudinal-integrity-inspection.source-integrity';
import type { RestSessionFeatureRevisionIntegrityAggregate } from '../rest-session-feature-inspection.repository.types';
import { PROFILE_TEST_ORG, PROFILE_TEST_VEHICLE } from './longitudinal-profile.test-fixtures';

function deterministicInputDigestForObservation(
  obs: LongitudinalScientificProfileProjectionV1['observations'][0],
): { digest: string; inputSummary: Record<string, unknown> } {
  const summary = buildMinimalLongitudinalInputSummary({
    organizationId: PROFILE_TEST_ORG,
    vehicleId: PROFILE_TEST_VEHICLE,
    restSessionId: obs.restSessionId,
    anchorResolutionStatus: obs.anchorResolutionStatus,
    contextCompleteness: obs.chargeContextCompleteness,
    temperatureC: obs.temperatureC,
    temperatureSource: obs.temperatureSource ?? 'UNKNOWN',
    inputContractVersion: obs.versionTuple.inputContractVersion,
  });
  const session = summary.session as Record<string, unknown>;
  session.anchorAt = obs.anchorAt;
  session.openedAt = obs.anchorAt;
  session.endedAt = obs.anchorAt;
  const raw = summary.chargeOpportunityRaw as Record<string, unknown>;
  raw.chargeContextEndAt = obs.anchorAt;
  const digest = computeFeatureInputDigestFromSnapshot(summary as never);
  return { digest, inputSummary: summary };
}

export function computeRevisionIdentityForProjection(
  projection: LongitudinalScientificProfileProjectionV1,
  revisionId: string,
): M3_3E_RevisionIdentityV1 {
  const canonicalProfileFingerprint = sha256HexLowercaseUtf8(
    canonicalFeatureInputUtf8(projection),
  );
  return {
    organizationId: projection.organizationId,
    vehicleId: projection.vehicleId,
    revisionId,
    canonicalProfileFingerprint,
    longitudinalProfileContractVersion: REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
    profilePolicyVersion: REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
  };
}

export function buildE1D4OkOutcome(input: {
  projection: LongitudinalScientificProfileProjectionV1;
  revisionIdentity: M3_3E_RevisionIdentityV1;
  batchContext?: D4SourceIntegrityBatchContext;
  selfIntegrityFailed?: boolean;
  inspectionGeneratedAt?: string;
}): D4InspectionOutcome {
  const inspection = aggregateD4InspectionOverlay({
    projection: input.projection,
    revisionId: input.revisionIdentity.revisionId,
    canonicalProfileFingerprint: input.revisionIdentity.canonicalProfileFingerprint,
    inspectionGeneratedAt: input.inspectionGeneratedAt ?? '2026-09-25T10:00:00.000Z',
    selfIntegrityFailed: input.selfIntegrityFailed ?? false,
    selfIntegrityReasons: input.selfIntegrityFailed ? ['PROFILE_FINGERPRINT_MISMATCH'] : [],
    batchContext: input.batchContext ?? buildD4TestBatchContext(),
  });
  return { status: 'OK', inspection };
}

/** Two DEFAULT sessions, both ELIGIBLE — deterministic golden fingerprint vector. */
export function buildE1GoldenConsumptionFixture(): {
  scientificProfile: LongitudinalScientificProfileProjectionV1;
  revisionIdentity: M3_3E_RevisionIdentityV1;
  d4Outcome: D4InspectionOutcome;
} {
  return buildE1OkFromSessions(
    [
      buildProfileTestInventoryItem({
        restSessionId: 'e1-golden-s1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
      buildProfileTestInventoryItem({
        restSessionId: 'e1-golden-s2',
        anchorAt: '2026-01-02T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ],
    'e1-golden-rev',
  );
}

export function buildE1SingleEligibleFixture(): {
  scientificProfile: LongitudinalScientificProfileProjectionV1;
  revisionIdentity: M3_3E_RevisionIdentityV1;
  d4Outcome: D4InspectionOutcome;
} {
  return buildE1OkFromSessions(
    [
      buildProfileTestInventoryItem({
        restSessionId: 's1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        inclusionMode: 'DEFAULT',
      }),
    ],
    'rev-1',
  );
}

export function buildE1OkFromSessions(
  sessions: LongitudinalInputSessionInventoryItem[],
  revisionId = 'rev-e1-test',
): {
  scientificProfile: LongitudinalScientificProfileProjectionV1;
  revisionIdentity: M3_3E_RevisionIdentityV1;
  d4Outcome: D4InspectionOutcome;
} {
  let projection = buildD4TestProjection(sessions);
  const sourceRowsById = new Map<string, ReturnType<typeof buildMatchingFeatureRowForObservation>>();
  const aggregatesBySessionKey = new Map<string, RestSessionFeatureRevisionIntegrityAggregate>();
  const totalRowsBySessionKey = new Map<string, number>();
  const latestRowsBySessionKey = new Map<string, ReturnType<typeof buildMatchingFeatureRowForObservation>[]>();
  const digestBySessionId = new Map<string, string>();

  const registerObservation = (obs: (typeof projection.observations)[0]) => {
    const { digest: stableDigest, inputSummary } = deterministicInputDigestForObservation(obs);
    const row = buildMatchingFeatureRowForObservation(obs, {
      inputDigest: stableDigest,
      inputSummary: inputSummary as never,
    });
    sourceRowsById.set(row.id, row);
    digestBySessionId.set(obs.restSessionId, stableDigest);
    const sessionKey = buildD4SessionVersionKey({
      restSessionId: obs.restSessionId,
      featureModelVersion: obs.versionTuple.featureModelVersion,
      retentionPolicyVersion: obs.versionTuple.retentionPolicyVersion,
      chargeOpportunityPolicyVersion: obs.versionTuple.chargeOpportunityPolicyVersion,
    });
    aggregatesBySessionKey.set(sessionKey, {
      totalRows: 1,
      incrementalRows: 0,
      finalRows: 1,
      validRows: 1,
      invalidatedRows: 0,
      latestSemanticRevision: obs.canonical.semanticRevision,
      positiveRevisionRowCount: 1,
      distinctPositiveRevisionCount: 1,
      minPositiveSemanticRevision: obs.canonical.semanticRevision,
      maxPositiveSemanticRevision: obs.canonical.semanticRevision,
      nonPositiveRevisionRowCount: 0,
    });
    totalRowsBySessionKey.set(sessionKey, 1);
    latestRowsBySessionKey.set(sessionKey, [row]);
  };

  for (const obs of projection.observations) {
    registerObservation(obs);
  }
  for (const obs of projection.provisionalObservations) {
    registerObservation(obs);
  }

  projection = {
    ...projection,
    observations: projection.observations.map((obs) => ({
      ...obs,
      canonical: {
        ...obs.canonical,
        inputDigest: digestBySessionId.get(obs.restSessionId) ?? obs.canonical.inputDigest,
      },
    })),
    provisionalObservations: projection.provisionalObservations.map((obs) => ({
      ...obs,
      canonical: {
        ...obs.canonical,
        inputDigest: digestBySessionId.get(obs.restSessionId) ?? obs.canonical.inputDigest,
      },
    })),
  };

  const batchContext = buildD4TestBatchContext({
    sourceRowsById,
    aggregatesBySessionKey,
    totalRowsBySessionKey,
    latestRowsBySessionKey,
  });
  const revisionIdentity = computeRevisionIdentityForProjection(projection, revisionId);
  const d4Outcome = buildE1D4OkOutcome({ projection, revisionIdentity, batchContext });
  return { scientificProfile: projection, revisionIdentity, d4Outcome };
}

export { buildD4TestProjection, buildProfileTestInventoryItem, buildD4TestBatchContext };
