import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VehicleStationTransferStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { StationDomainAuditService } from '../audit/station-domain-audit.service';
import { StationsV2ConfigService } from '../stations-v2-config.service';

export type CreateStationTransferInput = {
  orgId: string;
  vehicleId: string;
  fromStationId: string;
  toStationId: string;
  actorUserId?: string | null;
};

@Injectable()
export class StationTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
    private readonly stationsV2Config: StationsV2ConfigService,
    private readonly stationDomainAudit: StationDomainAuditService,
  ) {}

  async createTransfer(input: CreateStationTransferInput) {
    const flags = this.stationsV2Config.resolve(input.orgId);
    if (!flags.stationTransfersEnabled) {
      throw new BadRequestException({
        code: 'STATION_TRANSFERS_DISABLED',
        message: 'Station transfers are not enabled for this organization.',
      });
    }

    if (input.fromStationId === input.toStationId) {
      throw new BadRequestException({
        code: 'STATION_TRANSFER_SAME_STATION',
        message: 'Source and destination station must differ.',
      });
    }

    const access = await this.stationAccess.resolve(input.actorUserId ?? undefined, input.orgId);
    this.stationAccess.assertStationReadable(access, input.fromStationId);
    this.stationAccess.assertStationReadable(access, input.toStationId);

    const [vehicle, fromStation, toStation] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.orgId },
        select: { id: true, homeStationId: true },
      }),
      this.prisma.station.findFirst({
        where: { id: input.fromStationId, organizationId: input.orgId },
        select: { id: true },
      }),
      this.prisma.station.findFirst({
        where: { id: input.toStationId, organizationId: input.orgId },
        select: { id: true },
      }),
    ]);

    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (!fromStation || !toStation) throw new NotFoundException('Station not found');
    if (vehicle.homeStationId !== input.fromStationId) {
      throw new BadRequestException({
        code: 'STATION_TRANSFER_HOME_MISMATCH',
        message: 'Vehicle home station does not match transfer source.',
      });
    }

    const transfer = await this.prisma.vehicleStationTransfer.create({
      data: {
        organizationId: input.orgId,
        vehicleId: input.vehicleId,
        fromStationId: input.fromStationId,
        toStationId: input.toStationId,
        status: VehicleStationTransferStatus.PLANNED,
      },
    });

    this.stationDomainAudit.record(
      input.orgId,
      input.actorUserId ?? undefined,
      'TRANSFER_PLANNED',
      input.fromStationId,
      { transferId: transfer.id, vehicleId: input.vehicleId, toStationId: input.toStationId },
    );

    return transfer;
  }

  async listTransfers(
    orgId: string,
    userId: string | undefined,
    stationId?: string,
    status?: VehicleStationTransferStatus,
  ) {
    const access = await this.stationAccess.resolve(userId, orgId);
    const where: Prisma.VehicleStationTransferWhereInput = {
      organizationId: orgId,
      ...(status ? { status } : {}),
    };

    if (stationId) {
      this.stationAccess.assertStationReadable(access, stationId);
      where.OR = [{ fromStationId: stationId }, { toStationId: stationId }];
    } else if (!access.bypassScope && access.allowedStationIds) {
      const ids = access.allowedStationIds;
      where.OR = [{ fromStationId: { in: ids } }, { toStationId: { in: ids } }];
    }

    return this.prisma.vehicleStationTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateTransferStatus(
    orgId: string,
    transferId: string,
    status: VehicleStationTransferStatus,
    userId?: string,
  ) {
    const transfer = await this.prisma.vehicleStationTransfer.findFirst({
      where: { id: transferId, organizationId: orgId },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    const access = await this.stationAccess.resolve(userId, orgId);
    if (transfer.fromStationId) {
      this.stationAccess.assertStationReadable(access, transfer.fromStationId);
    }
    this.stationAccess.assertStationReadable(access, transfer.toStationId);

    const allowed: Record<VehicleStationTransferStatus, VehicleStationTransferStatus[]> = {
      [VehicleStationTransferStatus.PLANNED]: [
        VehicleStationTransferStatus.IN_TRANSIT,
        VehicleStationTransferStatus.CANCELLED,
      ],
      [VehicleStationTransferStatus.IN_TRANSIT]: [
        VehicleStationTransferStatus.ARRIVED,
        VehicleStationTransferStatus.CANCELLED,
      ],
      [VehicleStationTransferStatus.ARRIVED]: [],
      [VehicleStationTransferStatus.CANCELLED]: [],
    };

    if (!allowed[transfer.status]?.includes(status)) {
      throw new BadRequestException({
        code: 'STATION_TRANSFER_INVALID_TRANSITION',
        message: `Cannot transition from ${transfer.status} to ${status}.`,
      });
    }

    const data: Prisma.VehicleStationTransferUpdateInput = { status };
    if (status === VehicleStationTransferStatus.ARRIVED) {
      data.arrivedAt = new Date();
      await this.prisma.vehicle.updateMany({
        where: { id: transfer.vehicleId, organizationId: orgId },
        data: {
          homeStationId: transfer.toStationId,
          currentStationId: transfer.toStationId,
          currentStationSource: 'TRANSFER_ARRIVED',
          currentStationConfirmedAt: new Date(),
        },
      });
      this.stationDomainAudit.record(
        orgId,
        userId,
        'TRANSFER_ARRIVED',
        transfer.toStationId,
        { transferId, vehicleId: transfer.vehicleId },
      );
    }
    if (status === VehicleStationTransferStatus.CANCELLED) {
      data.cancelledAt = new Date();
      this.stationDomainAudit.record(
        orgId,
        userId,
        'TRANSFER_CANCELLED',
        transfer.fromStationId ?? transfer.toStationId,
        { transferId, vehicleId: transfer.vehicleId },
      );
    }

    return this.prisma.vehicleStationTransfer.update({
      where: { id: transferId },
      data,
    });
  }
}
