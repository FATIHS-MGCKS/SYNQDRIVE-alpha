import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Station, StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { SELECTABLE_STATION_STATUSES } from './station.types';

export type BookingStationInput = {
  pickupStationId?: string | null;
  returnStationId?: string | null;
  actualPickupStationId?: string | null;
  actualReturnStationId?: string | null;
  pickupAddressOverride?: string | null;
  returnAddressOverride?: string | null;
  isOneWayRental?: boolean;
  stationTransferFeeCents?: number | null;
};

@Injectable()
export class StationValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async getStationForOrg(organizationId: string, stationId: string): Promise<Station> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
    });
    if (!station) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }
    return station;
  }

  assertStationSelectable(station: Station, purpose: 'pickup' | 'return' | 'assign'): void {
    if (station.status === 'ARCHIVED') {
      throw new BadRequestException(
        `Station "${station.name}" is archived and cannot be selected`,
      );
    }
    if (!SELECTABLE_STATION_STATUSES.includes(station.status)) {
      throw new BadRequestException(
        `Station "${station.name}" is not active`,
      );
    }
    if (purpose === 'pickup' && !station.pickupEnabled) {
      throw new BadRequestException(
        `Station "${station.name}" does not allow pickups`,
      );
    }
    if (purpose === 'return' && !station.returnEnabled) {
      throw new BadRequestException(
        `Station "${station.name}" does not allow returns`,
      );
    }
  }

  computeIsOneWayRental(
    pickupStationId: string | null | undefined,
    returnStationId: string | null | undefined,
  ): boolean {
    if (!pickupStationId || !returnStationId) return false;
    return pickupStationId !== returnStationId;
  }

  async validateBookingStations(
    organizationId: string,
    input: BookingStationInput,
  ): Promise<{
    isOneWayRental: boolean;
    pickupStationId: string | null;
    returnStationId: string | null;
  }> {
    const pickupStationId = input.pickupStationId ?? null;
    const returnStationId = input.returnStationId ?? null;

    if (pickupStationId) {
      const pickup = await this.getStationForOrg(organizationId, pickupStationId);
      this.assertStationSelectable(pickup, 'pickup');
    }
    if (returnStationId) {
      const ret = await this.getStationForOrg(organizationId, returnStationId);
      this.assertStationSelectable(ret, 'return');
    }
    if (input.actualPickupStationId) {
      const actual = await this.getStationForOrg(organizationId, input.actualPickupStationId);
      if (actual.status === 'ARCHIVED') {
        throw new BadRequestException('Actual pickup station is archived');
      }
    }
    if (input.actualReturnStationId) {
      const actual = await this.getStationForOrg(organizationId, input.actualReturnStationId);
      if (actual.status === 'ARCHIVED') {
        throw new BadRequestException('Actual return station is archived');
      }
    }

    const isOneWayRental = this.computeIsOneWayRental(pickupStationId, returnStationId);
    if (
      input.isOneWayRental !== undefined &&
      input.isOneWayRental !== isOneWayRental &&
      pickupStationId &&
      returnStationId
    ) {
      throw new BadRequestException(
        'isOneWayRental does not match pickup/return station selection',
      );
    }

    return { isOneWayRental, pickupStationId, returnStationId };
  }

  async assertHandoverStation(
    organizationId: string,
    stationId: string,
    purpose: 'pickup' | 'return',
  ): Promise<void> {
    const station = await this.getStationForOrg(organizationId, stationId);
    this.assertStationSelectable(station, purpose);
  }

  async assertVehicleStationAssignment(
    organizationId: string,
    vehicleId: string,
    stationId: string,
    purpose: 'home' | 'current' | 'expected' = 'home',
  ): Promise<void> {
    const [vehicle, station] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { id: true },
      }),
      this.prisma.station.findFirst({
        where: { id: stationId, organizationId },
        select: { id: true, status: true, name: true },
      }),
    ]);
    if (!vehicle) {
      throw new BadRequestException('Vehicle does not belong to this organization');
    }
    if (!station) {
      throw new BadRequestException('Station does not belong to this organization');
    }
    if (purpose !== 'expected' && station.status === 'ARCHIVED') {
      throw new BadRequestException(
        `Station "${station.name}" is archived and cannot be assigned`,
      );
    }
    if (purpose === 'home' || purpose === 'current') {
      if (!SELECTABLE_STATION_STATUSES.includes(station.status as StationStatus)) {
        throw new BadRequestException(
          `Station "${station.name}" is not active and cannot be assigned`,
        );
      }
    }
  }

  async assertStationsSameOrg(
    organizationId: string,
    stationIds: Array<string | null | undefined>,
  ): Promise<void> {
    const ids = [...new Set(stationIds.filter(Boolean) as string[])];
    if (!ids.length) return;
    const count = await this.prisma.station.count({
      where: { organizationId, id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BadRequestException('One or more stations do not belong to this organization');
    }
  }
}
