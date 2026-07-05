import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  shouldRunIceEventContextEnrichment,
  type EngineContextVehicleInput,
} from '../vehicle-intelligence/event-context/engine-context.guards';
import { DEFAULT_RPM_THRESHOLD } from './rpm-webhook-candidate.service';
import {
  buildTripRpmCandidatesResponse,
  mapRpmWebhookCandidate,
  type TripRpmCandidatesResponse,
  type VehicleRpmWebhookSummary,
} from './rpm-candidate-read-model';

@Injectable()
export class RpmWebhookQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getTripCandidates(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<TripRpmCandidatesResponse> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicleId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        vehicle: { select: { organizationId: true } },
      },
    });
    if (!trip || trip.vehicle.organizationId !== organizationId) {
      return { candidates: [], count: 0 };
    }

    const end = trip.endTime ?? new Date();
    const rows = await this.prisma.rpmWebhookCandidate.findMany({
      where: {
        organizationId,
        vehicleId,
        observedAt: { gte: trip.startTime, lte: end },
      },
      orderBy: { observedAt: 'asc' },
    });

    return buildTripRpmCandidatesResponse(rows);
  }

  async getVehicleSummary(
    organizationId: string,
    vehicleId: string,
    opts?: { limit?: number },
  ): Promise<VehicleRpmWebhookSummary> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        hardwareType: true,
        fuelType: true,
        dimoVehicleId: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const vehicleInput: EngineContextVehicleInput = {
      hardwareType: vehicle.hardwareType,
      fuelType: vehicle.fuelType,
    };
    const lteR1IceCapable = shouldRunIceEventContextEnrichment(vehicleInput);

    const now = Date.now();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since24h = new Date(now - 24 * 60 * 60 * 1000);

    const rows = await this.prisma.rpmWebhookCandidate.findMany({
      where: { organizationId, vehicleId, observedAt: { gte: since7d } },
      orderBy: { observedAt: 'desc' },
      take: opts?.limit ?? 50,
    });

    const count7d = rows.length;
    const count24h = rows.filter((r) => r.observedAt >= since24h).length;
    const maxObservedRpm7d =
      rows.length > 0 ? Math.max(...rows.map((r) => r.observedValue)) : null;

    let webhookConfigured: VehicleRpmWebhookSummary['webhookConfigured'] = 'unknown';
    if (count7d > 0) webhookConfigured = 'active';
    else if (vehicle.dimoVehicleId != null && lteR1IceCapable) webhookConfigured = 'not_configured';

    return {
      lteR1IceCapable,
      webhookConfigured,
      count24h,
      count7d,
      lastObservedAt: rows[0]?.observedAt.toISOString() ?? null,
      maxObservedRpm7d,
      thresholdDefault: DEFAULT_RPM_THRESHOLD,
      recentCandidates: rows.map(mapRpmWebhookCandidate),
    };
  }
}
