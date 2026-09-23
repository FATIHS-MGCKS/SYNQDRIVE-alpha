import { Injectable } from '@nestjs/common';
import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
} from '@prisma/client';
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
  analyzeSemanticRevisionIntegrity,
  verifyPersistedFeatureRowDigest,
} from './rest-session-feature-shadow-inspection.integrity';
import type {
  RestSessionFeatureShadowCanonicalSelectionStatus,
  RestSessionFeatureShadowInspectionInput,
  RestSessionFeatureShadowInspectionOutcome,
  RestSessionFeatureShadowInspectionOverallStatus,
  RestSessionFeatureShadowInspectionV1,
} from './rest-session-feature-shadow-inspection.types';
import { mapFeatureRowToInspectionRevision } from './rest-session-feature-shadow-inspection.types';

/**
 * M3.3C C5A — read-only shadow rest-session feature inspection (no writes).
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
    const allRows = await repository.listFeatureRowsForSession({
      organizationId: input.organizationId,
      restSessionId: input.restSessionId,
    });

    const includeRaw = input.includeRaw === true;
    const totalRows = allRows.length;
    const revisionsTruncated = totalRows > REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS;
    const boundedRows = revisionsTruncated
      ? allRows.slice(0, REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS)
      : allRows;

    let digestMismatchCount = 0;
    const revisions = boundedRows.map((row) => {
      const digestValid = verifyPersistedFeatureRowDigest(row);
      if (!digestValid) digestMismatchCount += 1;
      return mapFeatureRowToInspectionRevision(row, digestValid, includeRaw);
    });

    const revisionNumbers = allRows.map((r) => r.semanticRevision);
    const { semanticRevisionGapCount, duplicateSemanticRevisionCount } =
      analyzeSemanticRevisionIntegrity(revisionNumbers);

    const canonicalRow = selectCanonicalRestSessionFeatureShadowRow({
      sessionStatus: session.sessionStatus,
      endReason: session.endReason,
      rows: allRows,
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
        latestSemanticRevision:
          allRows.length > 0
            ? Math.max(...allRows.map((r) => r.semanticRevision))
            : null,
        incrementalRows: allRows.filter(
          (r) => r.computationPhase === BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        ).length,
        finalRows: allRows.filter(
          (r) => r.computationPhase === BatteryRestSessionFeatureComputationPhase.FINAL,
        ).length,
        validRows: allRows.filter(
          (r) => r.sessionTrust === BatteryRestSessionFeatureSessionTrust.VALID,
        ).length,
        invalidatedRows: allRows.filter(
          (r) => r.sessionTrust === BatteryRestSessionFeatureSessionTrust.INVALIDATED,
        ).length,
        canonicalFeatureRowId: canonicalRow?.id ?? null,
        canonicalSemanticRevision: canonicalRow?.semanticRevision ?? null,
        revisionsTruncated,
      },
      canonicalFeature,
      revisions,
      integrity: {
        digestMismatchCount,
        semanticRevisionGapCount,
        duplicateSemanticRevisionCount,
        canonicalSelectionStatus,
        overallStatus,
      },
    };

    return { status: 'OK', inspection };
  }
}
