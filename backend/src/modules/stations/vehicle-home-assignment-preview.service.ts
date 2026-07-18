import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  HOME_ASSIGNMENT_PREVIEW_MAX_BATCH,
  type HomeAssignmentPreviewProposal,
  type HomeAssignmentPreviewResult,
} from './vehicle-home-assignment-preview.types';
import {
  dedupeHomeAssignmentProposals,
  evaluateHomeAssignmentPreviewItem,
  summarizeHomeAssignmentPreviewItems,
} from './vehicle-home-assignment-preview.util';

@Injectable()
export class VehicleHomeAssignmentPreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async previewHomeAssignment(
    organizationId: string,
    contextStationId: string,
    proposals: HomeAssignmentPreviewProposal[],
  ): Promise<HomeAssignmentPreviewResult> {
    if (proposals.length > HOME_ASSIGNMENT_PREVIEW_MAX_BATCH) {
      throw new BadRequestException({
        message: `Home assignment preview supports at most ${HOME_ASSIGNMENT_PREVIEW_MAX_BATCH} vehicles per request. Split the payload into chunks.`,
        code: 'HOME_ASSIGNMENT_PREVIEW_BATCH_TOO_LARGE',
        limit: HOME_ASSIGNMENT_PREVIEW_MAX_BATCH,
        requested: proposals.length,
      });
    }

    const contextStation = await this.prisma.station.findFirst({
      where: { id: contextStationId, organizationId },
      select: { id: true, name: true },
    });
    if (!contextStation) {
      throw new NotFoundException(`Station ${contextStationId} not found`);
    }

    const { proposals: dedupedProposals, duplicateVehicleIdsIgnored } =
      dedupeHomeAssignmentProposals(proposals);
    const vehicleIds = dedupedProposals.map((proposal) => proposal.vehicleId);

    const vehicles = vehicleIds.length
      ? await this.prisma.vehicle.findMany({
          where: { organizationId, id: { in: vehicleIds } },
          select: {
            id: true,
            licensePlate: true,
            make: true,
            model: true,
            homeStationId: true,
            currentStationId: true,
            expectedStationId: true,
            status: true,
          },
        })
      : [];

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const stationIds = new Set<string>([contextStationId]);

    for (const vehicle of vehicles) {
      if (vehicle.homeStationId) stationIds.add(vehicle.homeStationId);
      if (vehicle.currentStationId) stationIds.add(vehicle.currentStationId);
      if (vehicle.expectedStationId) stationIds.add(vehicle.expectedStationId);
    }
    for (const proposal of dedupedProposals) {
      if (proposal.desiredHomeStationId) {
        stationIds.add(proposal.desiredHomeStationId);
      }
    }

    const stations = stationIds.size
      ? await this.prisma.station.findMany({
          where: { organizationId, id: { in: [...stationIds] } },
          select: { id: true, name: true, status: true },
        })
      : [];
    const stationById = new Map(stations.map((station) => [station.id, station]));

    const items = dedupedProposals.map((proposal) =>
      evaluateHomeAssignmentPreviewItem({
        contextStationId,
        proposal,
        vehicle: vehicleById.get(proposal.vehicleId) ?? null,
        stations: stationById,
      }),
    );

    return {
      organizationId,
      contextStationId,
      contextStationName: contextStation.name,
      summary: summarizeHomeAssignmentPreviewItems(
        contextStationId,
        items,
        proposals.length,
        dedupedProposals.length,
      ),
      batch: {
        limit: HOME_ASSIGNMENT_PREVIEW_MAX_BATCH,
        requested: proposals.length,
        evaluated: dedupedProposals.length,
        truncated: false,
        duplicateVehicleIdsIgnored,
      },
      items,
    };
  }
}
