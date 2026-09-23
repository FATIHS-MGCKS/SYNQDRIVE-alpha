import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { resolveChargeOpportunityWindow } from './charge-opportunity-window.policy';
import type {
  ChargeOpportunityGeObservationInput,
  ChargeOpportunityReadResult,
  ChargeOpportunityRestSessionSnapshot,
  ChargeOpportunityTripSnapshot,
} from './charge-opportunity.types';
import { computeChargeOpportunityRawFeaturesV1 } from './rest-session-charge-opportunity.policy';

export type RestSessionChargeContextReadInput = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
};

/**
 * M3.3C C2 read-only charge context reader — zero writes.
 * Requires explicit tenant scope (organizationId + vehicleId + restSessionId).
 */
export class RestSessionChargeContextReader {
  constructor(private readonly prisma: PrismaService) {}

  async readChargeOpportunityRawFeatures(
    input: RestSessionChargeContextReadInput,
  ): Promise<ChargeOpportunityReadResult> {
    const sessionRow = await this.prisma.batteryRestSession.findFirst({
      where: {
        id: input.restSessionId,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        anchorAt: true,
        confirmedTripId: true,
        candidateTripId: true,
      },
    });

    if (!sessionRow) {
      return { status: 'SESSION_NOT_FOUND' };
    }

    const session: ChargeOpportunityRestSessionSnapshot = sessionRow;

    const [confirmedTrip, candidateTrip] = await Promise.all([
      session.confirmedTripId
        ? this.loadTripSnapshot(session.confirmedTripId)
        : Promise.resolve(null),
      session.candidateTripId
        ? this.loadTripSnapshot(session.candidateTripId)
        : Promise.resolve(null),
    ]);

    const window = resolveChargeOpportunityWindow({
      session,
      confirmedTrip,
      candidateTrip,
    });

    let observations: ChargeOpportunityGeObservationInput[] = [];
    if (
      window.windowSource !== 'NONE' &&
      window.chargeContextStartAt != null
    ) {
      const rows = await this.prisma.batteryGeneralizedEvidenceObservation.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          evidenceClass: { not: BatteryGeneralizedEvidenceClass.STALE_REPLAY },
          OR: [
            {
              voltageObservedAt: {
                gte: window.chargeContextStartAt,
                lt: window.chargeContextEndAt,
              },
            },
            {
              stateObservedAt: {
                gte: window.chargeContextStartAt,
                lt: window.chargeContextEndAt,
              },
            },
          ],
        },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          tripId: true,
          evidenceClass: true,
          voltage: true,
          voltageObservedAt: true,
          providerTimestampSource: true,
          engineRunning: true,
          stateObservedAt: true,
          stateTimestampSource: true,
          stateAlignmentClass: true,
          isLvCharging: true,
          isHvCharging: true,
        },
        orderBy: [{ id: 'asc' }],
      });
      observations = rows.map((row) => ({
        ...row,
        evidenceClass: row.evidenceClass as string,
        stateAlignmentClass: row.stateAlignmentClass as string,
        providerTimestampSource: row.providerTimestampSource,
      }));
    }

    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: session.id,
      window,
      observations,
    });

    return { status: 'OK', features };
  }

  private async loadTripSnapshot(tripId: string): Promise<ChargeOpportunityTripSnapshot | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        tripStatus: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        outsideTemperatureStartC: true,
      },
    });
    if (!trip) return null;
    return {
      ...trip,
      tripStatus: trip.tripStatus as string,
    };
  }
}
