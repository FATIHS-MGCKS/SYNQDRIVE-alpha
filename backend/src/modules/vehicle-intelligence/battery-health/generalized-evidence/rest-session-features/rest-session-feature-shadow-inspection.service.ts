import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_FEATURE_SHADOW_INSPECTION_CONTRACT_VERSION,
  REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from './rest-session-feature.constants';
import { selectCanonicalRestSessionFeatureShadowRow } from './rest-session-feature-canonical-row.policy';
import { RestSessionFeatureRepository } from './rest-session-feature.repository';
import {
  deriveSemanticRevisionIntegrityFromAggregate,
  verifyPersistedFeatureRowDigest,
} from './rest-session-feature-shadow-inspection.integrity';
import type {
  RestSessionFeatureShadowCanonicalSelectionStatus,
  RestSessionFeatureShadowDigestVerificationScope,
  RestSessionFeatureShadowInspectionInput,
  RestSessionFeatureShadowInspectionOutcome,
  RestSessionFeatureShadowInspectionOverallStatus,
  RestSessionFeatureShadowInspectionV1,
} from './rest-session-feature-shadow-inspection.types';
import { mapFeatureRowToInspectionRevision } from './rest-session-feature-shadow-inspection.types';

/**
 * M3.3C C5A — read-only shadow rest-session feature inspection (no writes).
 * C5A.1 — bounded DB reads (latest-N window, COUNT, revision aggregate, canonical candidates).
 */
@Injectable()
export class RestSessionFeatureShadowInspectionService {
  constructor(private readonly prisma: PrismaService) {}

  async inspectSession(
    input: RestSessionFeatureShadowInspectionInput,
  ): Promise<RestSessionFeatureShadowInspectionOutcome> {
    const session = await this.prisma.batteryRestSession.findFirst({
      where: {
        id: input.restSessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
    });
    if (!session) {
      return { status: 'SESSION_NOT_FOUND' };
    }

    const repository = new RestSessionFeatureRepository(this.prisma);
    const scope = {
      organizationId: input.organizationId,
      restSessionId: input.restSessionId,
    };

    const [totalRows, aggregate, latestRows, canonicalCandidates] = await Promise.all([
      repository.countFeatureRowsForSession(scope),
      repository.readRevisionIntegrityAggregate(scope),
      repository.listLatestFeatureRowsForSession({
        ...scope,
        limit: REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS,
      }),
      repository.listCanonicalCandidateRows(scope),
    ]);

    const includeRaw = input.includeRaw === true;
    const revisionsTruncated = totalRows > REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS;

    const digestRowsChecked = latestRows.length;
    const digestRowsUnchecked = Math.max(0, totalRows - digestRowsChecked);
    let digestVerificationScope: RestSessionFeatureShadowDigestVerificationScope;
    if (totalRows === 0) {
      digestVerificationScope = 'FULL';
    } else if (digestRowsUnchecked === 0) {
      digestVerificationScope = 'FULL';
    } else {
      digestVerificationScope = 'BOUNDED_LATEST_WINDOW';
    }

    let digestMismatchCount = 0;
    const revisions = latestRows.map((row) => {
      const digestValid = verifyPersistedFeatureRowDigest(row);
      if (!digestValid) digestMismatchCount += 1;
      return mapFeatureRowToInspectionRevision(row, digestValid, includeRaw);
    });

    const { semanticRevisionGapCount, duplicateSemanticRevisionCount } =
      deriveSemanticRevisionIntegrityFromAggregate(aggregate);

    const canonicalRow = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: session.sessionStatus,
      endReason: session.endReason,
      rows: canonicalCandidates,
    });

    let canonicalSelectionStatus: RestSessionFeatureShadowCanonicalSelectionStatus;
    if (totalRows === 0) {
      canonicalSelectionStatus = 'NO_FEATURE_ROWS';
    } else if (canonicalRow) {
      canonicalSelectionStatus = 'CANONICAL_SELECTED';
    } else {
      canonicalSelectionStatus = 'CANONICAL_NOT_RESOLVABLE';
    }

    let overallStatus: RestSessionFeatureShadowInspectionOverallStatus;
    if (totalRows === 0) {
      overallStatus = 'NO_FEATURE_ROWS';
    } else if (
      digestMismatchCount > 0 ||
      semanticRevisionGapCount > 0 ||
      duplicateSemanticRevisionCount > 0 ||
      canonicalSelectionStatus === 'CANONICAL_NOT_RESOLVABLE'
    ) {
      overallStatus = 'INTEGRITY_WARNING';
    } else if (digestRowsUnchecked > 0) {
      overallStatus = 'INTEGRITY_PARTIAL';
    } else {
      overallStatus = 'OK';
    }

    const canonicalFeature = canonicalRow
      ? mapFeatureRowToInspectionRevision(
          canonicalRow,
          verifyPersistedFeatureRowDigest(canonicalRow),
          includeRaw,
        )
      : null;

    const inspection: RestSessionFeatureShadowInspectionV1 = {
      inspectionContractVersion: REST_SESSION_FEATURE_SHADOW_INSPECTION_CONTRACT_VERSION,
      versionTuple: {
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
        chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
        inputContractVersion: REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION,
      },
      session: {
        id: session.id,
        organizationId: session.organizationId,
        vehicleId: session.vehicleId,
        anchorType: session.anchorType,
        anchorAt: session.anchorAt.toISOString(),
        sessionStatus: session.sessionStatus,
        candidateTripId: session.candidateTripId,
        confirmedTripId: session.confirmedTripId,
        openedAt: session.openedAt.toISOString(),
        confirmedAt: session.confirmedAt?.toISOString() ?? null,
        endedAt: session.endedAt?.toISOString() ?? null,
        endReason: session.endReason,
        restObservationCount: session.restObservationCount,
        validRestObservationCount: session.validRestObservationCount,
      },
      featureSummary: {
        totalRows,
        latestSemanticRevision: aggregate.latestSemanticRevision,
        incrementalRows: aggregate.incrementalRows,
        finalRows: aggregate.finalRows,
        validRows: aggregate.validRows,
        invalidatedRows: aggregate.invalidatedRows,
        canonicalFeatureRowId: canonicalRow?.id ?? null,
        canonicalSemanticRevision: canonicalRow?.semanticRevision ?? null,
        revisionsTruncated,
      },
      canonicalFeature,
      revisions,
      integrity: {
        digestMismatchCount,
        digestRowsChecked,
        digestRowsUnchecked,
        digestVerificationScope,
        semanticRevisionGapCount,
        duplicateSemanticRevisionCount,
        canonicalSelectionStatus,
        overallStatus,
      },
    };

    return { status: 'OK', inspection };
  }
}
