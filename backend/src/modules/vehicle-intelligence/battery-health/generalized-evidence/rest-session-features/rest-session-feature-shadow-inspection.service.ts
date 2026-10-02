import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { computeDigestVerificationAccounting } from './rest-session-feature-shadow-inspection.digest';
import { deriveSemanticRevisionIntegrityFromAggregate } from './rest-session-feature-shadow-inspection.integrity';
import {
  loadRestSessionFeatureInspectionReadSnapshot,
  type RestSessionFeatureInspectionSnapshotHooks,
} from './rest-session-feature-shadow-inspection.snapshot';
import type {
  RestSessionFeatureShadowCanonicalSelectionStatus,
  RestSessionFeatureShadowInspectionInput,
  RestSessionFeatureShadowInspectionOutcome,
  RestSessionFeatureShadowInspectionOverallStatus,
  RestSessionFeatureShadowInspectionV1,
} from './rest-session-feature-shadow-inspection.types';

/**
 * M3.3C C5A — read-only shadow rest-session feature inspection (no writes).
 * C5A.1 — bounded DB reads.
 * C5A.2 — repeatable-read snapshot + canonical digest accounting.
 */
@Injectable()
export class RestSessionFeatureShadowInspectionService {
  private snapshotHooks: RestSessionFeatureInspectionSnapshotHooks | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Integration tests only — deterministic barrier inside repeatable-read snapshot. */
  setSnapshotHooksForTests(hooks: RestSessionFeatureInspectionSnapshotHooks | null): void {
    this.snapshotHooks = hooks;
  }

  async inspectSession(
    input: RestSessionFeatureShadowInspectionInput,
  ): Promise<RestSessionFeatureShadowInspectionOutcome> {
    const includeRaw = input.includeRaw === true;
    const hooks = this.snapshotHooks ?? undefined;

    const snapshot = await this.prisma.$transaction(
      async (tx) =>
        loadRestSessionFeatureInspectionReadSnapshot(
          tx as unknown as PrismaService,
          {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            restSessionId: input.restSessionId,
          },
          hooks,
        ),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    if (!snapshot) {
      return { status: 'SESSION_NOT_FOUND' };
    }

    const { session, totalRows, aggregate, latestRows, canonicalCandidates } = snapshot;
    const revisionsTruncated = totalRows > REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS;
    const countAggregateConsistent = totalRows === aggregate.totalRows;

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

    const digestAccounting = computeDigestVerificationAccounting({
      totalRows,
      latestRows,
      canonicalRow,
      includeRaw,
    });

    let overallStatus: RestSessionFeatureShadowInspectionOverallStatus;
    if (totalRows === 0) {
      overallStatus = 'NO_FEATURE_ROWS';
    } else if (
      !countAggregateConsistent ||
      digestAccounting.digestMismatchCount > 0 ||
      semanticRevisionGapCount > 0 ||
      duplicateSemanticRevisionCount > 0 ||
      canonicalSelectionStatus === 'CANONICAL_NOT_RESOLVABLE'
    ) {
      overallStatus = 'INTEGRITY_WARNING';
    } else if (digestAccounting.digestRowsUnchecked > 0) {
      overallStatus = 'INTEGRITY_PARTIAL';
    } else {
      overallStatus = 'OK';
    }

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
      canonicalFeature: digestAccounting.canonicalFeature,
      revisions: digestAccounting.revisions,
      integrity: {
        digestMismatchCount: digestAccounting.digestMismatchCount,
        digestRowsChecked: digestAccounting.digestRowsChecked,
        digestRowsUnchecked: digestAccounting.digestRowsUnchecked,
        digestVerificationScope: digestAccounting.digestVerificationScope,
        semanticRevisionGapCount,
        duplicateSemanticRevisionCount,
        canonicalSelectionStatus,
        countAggregateConsistent,
        overallStatus,
      },
    };

    return { status: 'OK', inspection };
  }
}
