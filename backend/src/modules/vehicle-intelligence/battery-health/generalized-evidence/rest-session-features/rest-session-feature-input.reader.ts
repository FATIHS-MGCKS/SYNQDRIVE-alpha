import type { Prisma } from '@prisma/client';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionEndReason,
  BatteryRestSessionStatus,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { ChargeOpportunityRawFeaturesV1 } from './charge-opportunity.types';
import {
  RestSessionChargeContextReader,
  type RestSessionChargeContextReadInput,
} from './rest-session-charge-context.reader';
import {
  buildRestSessionFeatureInputSessionV1,
  dateToUtcIsoString,
} from './rest-session-feature-input-snapshot.builder';
import {
  mapRestSessionComputationPhase,
  mapRestSessionFeatureTrust,
} from './rest-session-feature-session.policy';
import type { RestSessionRetentionAnchorCandidateRow } from './rest-session-retention-anchor.policy';
import { resolveCanonicalRestSessionRetentionAnchor } from './rest-session-retention-anchor.policy';
import type { RestSessionRetentionCandidateInput } from './rest-session-retention.types';
import { selectRestSessionRetentionEligiblePoints } from './rest-session-retention-eligibility.policy';

export type RestSessionFeatureInputDbClient = Pick<
  PrismaService,
  | 'batteryRestSession'
  | 'batteryGeneralizedEvidenceObservation'
  | 'vehicleTrip'
  | '$executeRaw'
>;

export type RestSessionFeatureInputLoadInput = RestSessionChargeContextReadInput;

export type RestSessionFeatureInputLoadResult =
  | { status: 'SESSION_NOT_FOUND' }
  | {
      status: 'OK';
      sessionStatus: BatteryRestSessionStatus;
      endReason: BatteryRestSessionEndReason | null;
      sessionBlock: ReturnType<typeof buildRestSessionFeatureInputSessionV1>;
      retentionCandidates: RestSessionRetentionCandidateInput[];
      retentionMetadataByObservationId: Map<
        string,
        {
          sourceMeasurementId: string;
          evidenceClass: string;
          evidenceConfidence: string;
          stateAlignmentClass: string;
          providerObservationAt: string | null;
          nominalRestIntervalIndex: number | null;
        }
      >;
      eligibleRetentionPoints: ReturnType<typeof selectRestSessionRetentionEligiblePoints>;
      anchorResolution: ReturnType<typeof resolveCanonicalRestSessionRetentionAnchor>;
      chargeOpportunityRaw: ChargeOpportunityRawFeaturesV1;
    };

export class RestSessionFeatureInputReader {
  private readonly chargeReader: RestSessionChargeContextReader;

  constructor(private readonly db: RestSessionFeatureInputDbClient) {
    this.chargeReader = new RestSessionChargeContextReader(db);
  }

  async loadForComputation(
    input: RestSessionFeatureInputLoadInput,
  ): Promise<RestSessionFeatureInputLoadResult> {
    const sessionRow = await this.db.batteryRestSession.findFirst({
      where: {
        id: input.restSessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        anchorType: true,
        anchorAt: true,
        candidateTripId: true,
        confirmedTripId: true,
        sessionStatus: true,
        openedAt: true,
        confirmedAt: true,
        endedAt: true,
        endReason: true,
      },
    });

    if (!sessionRow) {
      return { status: 'SESSION_NOT_FOUND' };
    }

    const chargeRead = await this.chargeReader.readChargeOpportunityRawFeatures(input);
    if (chargeRead.status !== 'OK') {
      return { status: 'SESSION_NOT_FOUND' };
    }

    const geRows = await this.db.batteryGeneralizedEvidenceObservation.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        restSessionId: input.restSessionId,
        evidenceClass: { not: BatteryGeneralizedEvidenceClass.STALE_REPLAY },
      },
      select: {
        id: true,
        sourceMeasurementId: true,
        restSessionId: true,
        evidenceClass: true,
        evidenceConfidence: true,
        stateAlignmentClass: true,
        actualRestAgeMs: true,
        voltage: true,
        voltageObservedAt: true,
        providerTimestampSource: true,
        providerObservationAt: true,
        nominalRestIntervalIndex: true,
      },
      orderBy: [{ id: 'asc' }],
    });

    const retentionCandidates: RestSessionRetentionCandidateInput[] = geRows.map((row) => ({
      observationId: row.id,
      restSessionId: row.restSessionId ?? input.restSessionId,
      evidenceClass: row.evidenceClass,
      stateAlignmentClass: row.stateAlignmentClass,
      actualRestAgeMs: row.actualRestAgeMs,
      voltageV: row.voltage,
      providerObservationAt: row.providerObservationAt,
      nominalRestIntervalIndex: row.nominalRestIntervalIndex,
    }));

    const retentionMetadataByObservationId = new Map<
      string,
      {
        sourceMeasurementId: string;
        evidenceClass: string;
        evidenceConfidence: string;
        stateAlignmentClass: string;
        providerObservationAt: string | null;
        nominalRestIntervalIndex: number | null;
      }
    >();
    for (const row of geRows) {
      retentionMetadataByObservationId.set(row.id, {
        sourceMeasurementId: row.sourceMeasurementId,
        evidenceClass: row.evidenceClass,
        evidenceConfidence: row.evidenceConfidence,
        stateAlignmentClass: row.stateAlignmentClass,
        providerObservationAt: row.providerObservationAt
          ? dateToUtcIsoString(row.providerObservationAt)
          : null,
        nominalRestIntervalIndex: row.nominalRestIntervalIndex,
      });
    }

    const anchorCandidates: RestSessionRetentionAnchorCandidateRow[] = geRows.map((row) => ({
      observationId: row.id,
      sourceMeasurementId: row.sourceMeasurementId,
      restSessionId: row.restSessionId ?? input.restSessionId,
      evidenceClass: row.evidenceClass,
      evidenceConfidence: row.evidenceConfidence,
      actualRestAgeMs: row.actualRestAgeMs,
      voltage: row.voltage,
      voltageObservedAt: row.voltageObservedAt,
      providerTimestampSource: row.providerTimestampSource,
    }));

    const eligibleRetentionPoints = selectRestSessionRetentionEligiblePoints({
      restSessionId: input.restSessionId,
      candidates: retentionCandidates,
    });

    const anchorResolution = resolveCanonicalRestSessionRetentionAnchor({
      restSessionId: input.restSessionId,
      anchorAt: sessionRow.anchorAt,
      candidates: anchorCandidates,
    });

    const computationPhase = mapRestSessionComputationPhase(sessionRow.sessionStatus);
    const sessionTrust = mapRestSessionFeatureTrust({
      sessionStatus: sessionRow.sessionStatus,
      endReason: sessionRow.endReason,
    });

    const sessionBlock = buildRestSessionFeatureInputSessionV1({
      anchorType: sessionRow.anchorType,
      anchorAt: sessionRow.anchorAt,
      candidateTripId: sessionRow.candidateTripId,
      confirmedTripId: sessionRow.confirmedTripId,
      sessionStatus: sessionRow.sessionStatus,
      computationPhase,
      sessionTrust,
      openedAt: sessionRow.openedAt,
      confirmedAt: sessionRow.confirmedAt,
      endedAt: sessionRow.endedAt,
      endReason: sessionRow.endReason,
    });

    return {
      status: 'OK',
      sessionStatus: sessionRow.sessionStatus,
      endReason: sessionRow.endReason,
      sessionBlock,
      retentionCandidates,
      retentionMetadataByObservationId,
      eligibleRetentionPoints,
      anchorResolution,
      chargeOpportunityRaw: chargeRead.features,
    };
  }
}

export async function lockBatteryRestSessionForFeatureComputation(
  tx: Pick<PrismaService, '$executeRaw'>,
  input: RestSessionFeatureInputLoadInput,
): Promise<void> {
  await tx.$executeRaw`
    SELECT id FROM battery_rest_sessions
    WHERE id = ${input.restSessionId}
      AND organization_id = ${input.organizationId}
      AND vehicle_id = ${input.vehicleId}
    FOR UPDATE
  `;
}

export type RestSessionFeatureInputReaderTx = RestSessionFeatureInputDbClient;

export function createRestSessionFeatureInputReaderForTx(
  tx: RestSessionFeatureInputReaderTx,
): RestSessionFeatureInputReader {
  return new RestSessionFeatureInputReader(tx);
}
