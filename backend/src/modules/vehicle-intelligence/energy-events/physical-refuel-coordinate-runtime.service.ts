import { Injectable, Logger } from '@nestjs/common';
import type { VehicleEnergyEvent } from '@prisma/client';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import {
  derivePhysicalRefuelCoordinate,
  PHYSICAL_REFUEL_COORDINATE_SELECTOR_VERSION,
  PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2,
} from '../fuel-stations/enrichment/physical-refuel-coordinate.selector';
import {
  COORDINATE_PROVIDER_ERROR,
  COORDINATE_ROUTE_UNAVAILABLE,
} from './physical-refuel-coordinate-retry.policy';
import { computeRouteEvidenceFingerprint } from './physical-refuel-route-evidence.util';

export const PHYSICAL_REFUEL_COORDINATE_SOURCE_V2 = 'physical_refuel_forecourt_dwell_v2';

export interface PhysicalRefuelCoordinateRuntimeResult {
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  selectorVersion: string;
  status: string;
  routeEvidenceFingerprint: string | null;
}

@Injectable()
export class PhysicalRefuelCoordinateRuntimeService {
  private readonly logger = new Logger(PhysicalRefuelCoordinateRuntimeService.name);

  constructor(private readonly dimoSegments: DimoSegmentsService) {}

  async resolveCoordinateForEvent(
    event: VehicleEnergyEvent,
    tokenId: number,
    requestContext: { organizationId: string; vehicleId: string; tokenId: number },
  ): Promise<PhysicalRefuelCoordinateRuntimeResult> {
    const fuelRiseOnsetAt = event.fuelLevelRiseStart?.toISOString();
    if (!fuelRiseOnsetAt) {
      return unavailableResult('MISSING_FUEL_RISE_ONSET');
    }

    const lookbackStart = new Date(event.fuelLevelRiseStart!);
    lookbackStart.setMinutes(lookbackStart.getMinutes() - 35);
    const routeEnd = new Date(event.endTime);
    const routeOutcome = await this.dimoSegments.fetchRouteEnrichmentOutcome(
      tokenId,
      lookbackStart,
      routeEnd,
      requestContext,
    );

    if (routeOutcome.status === 'UNAVAILABLE') {
      this.logger.debug(
        JSON.stringify({
          event: 'physical_refuel_route_unavailable',
          energyEventId: event.id,
          reason: routeOutcome.reason ?? 'unavailable',
        }),
      );
      return unavailableResult(COORDINATE_ROUTE_UNAVAILABLE);
    }

    if (routeOutcome.status === 'FAILED') {
      this.logger.debug(
        JSON.stringify({
          event: 'physical_refuel_route_provider_error',
          energyEventId: event.id,
          reason: routeOutcome.reason ?? 'provider_error',
        }),
      );
      return unavailableResult(COORDINATE_PROVIDER_ERROR);
    }

    const routeEvidenceFingerprint =
      routeOutcome.status === 'SUCCESS'
        ? computeRouteEvidenceFingerprint(routeOutcome.points)
        : null;

    const result = derivePhysicalRefuelCoordinate({
      routeSamples: routeOutcome.points.map((p) => ({
        timestamp: p.timestamp,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
      })),
      fuelRiseOnsetAt,
      eventStartAt: event.startTime.toISOString(),
      policyVersion: PHYSICAL_REFUEL_FORECOURT_DWELL_MEDOID_V2,
    });

    if (result.status !== 'SELECTED' || !result.coordinate) {
      this.logger.debug(
        JSON.stringify({
          event: 'physical_refuel_coordinate_v2_unavailable',
          energyEventId: event.id,
          status: result.status,
          rejectionReasons: result.provenance.rejectionReasons,
        }),
      );
      return {
        ...unavailableResult(result.status),
        routeEvidenceFingerprint,
      };
    }

    return {
      latitude: result.coordinate.latitude,
      longitude: result.coordinate.longitude,
      source: PHYSICAL_REFUEL_COORDINATE_SOURCE_V2,
      selectorVersion: PHYSICAL_REFUEL_COORDINATE_SELECTOR_VERSION,
      status: result.status,
      routeEvidenceFingerprint,
    };
  }
}

function unavailableResult(status: string): PhysicalRefuelCoordinateRuntimeResult {
  return {
    latitude: null,
    longitude: null,
    source: null,
    selectorVersion: PHYSICAL_REFUEL_COORDINATE_SELECTOR_VERSION,
    status,
    routeEvidenceFingerprint: null,
  };
}
