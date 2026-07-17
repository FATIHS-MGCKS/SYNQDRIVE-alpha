import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementSession,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DriveProfileResolverService } from '../drive-profile/drive-profile-resolver.service';
import { LvBatteryChemistryResolverService } from '../lv-battery-chemistry/lv-battery-chemistry-resolver.service';
import {
  resolveBatteryMeasurementSessionScope,
  type BatteryMeasurementSessionType as BatteryMeasurementSessionTypeDomain,
} from './battery-v2-domain';
import { sanitizeBatteryMeasurementSessionMetadata } from './battery-measurement-session.metadata';
import {
  BatteryMeasurementSessionRepository,
  ListBatteryMeasurementSessionsFilter,
} from './battery-measurement-session.repository';

export interface CreateBatteryMeasurementSessionCommand {
  organizationId: string;
  vehicleId: string;
  type: BatteryMeasurementSessionType;
  startedAt: Date;
  idempotencyKey: string;
  scope?: BatteryEvidenceScope;
  status?: BatteryMeasurementSessionStatus;
  driveProfile?: BatteryDriveProfile;
  chemistry?: BatteryChemistry;
  targetAt?: Date | null;
  endedAt?: Date | null;
  quality?: BatteryMeasurementQuality;
  providerSource?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  tripId?: string | null;
  metadata?: Prisma.InputJsonValue | Record<string, unknown> | null;
  modelVersion?: number;
}

@Injectable()
export class BatteryMeasurementSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: BatteryMeasurementSessionRepository,
    private readonly driveProfileResolver: DriveProfileResolverService,
    private readonly lvBatteryChemistryResolver: LvBatteryChemistryResolverService,
  ) {}

  async create(
    command: CreateBatteryMeasurementSessionCommand,
  ): Promise<BatteryMeasurementSession> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: command.vehicleId,
        organizationId: command.organizationId,
      },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException(
        'Vehicle not found for organization scope',
      );
    }

    if (command.tripId) {
      const trip = await this.prisma.vehicleTrip.findFirst({
        where: {
          id: command.tripId,
          vehicleId: command.vehicleId,
        },
        select: { id: true },
      });
      if (!trip) {
        throw new BadRequestException(
          'tripId does not belong to the scoped vehicle',
        );
      }
    }

    const idempotencyKey = command.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const scope =
      command.scope ??
      resolveBatteryMeasurementSessionScope(
        command.type as BatteryMeasurementSessionTypeDomain,
      );

    const driveProfile =
      command.driveProfile ??
      (await this.driveProfileResolver.resolveForVehicle(command.vehicleId))
        .profile;

    const chemistry =
      command.chemistry ??
      (await this.lvBatteryChemistryResolver.resolveForVehicle(command.vehicleId))
        .chemistry;

    return this.repository.createIdempotent({
      organizationId: command.organizationId,
      vehicleId: command.vehicleId,
      scope,
      type: command.type,
      status: command.status,
      driveProfile,
      chemistry,
      startedAt: command.startedAt,
      targetAt: command.targetAt,
      endedAt: command.endedAt,
      quality: command.quality,
      providerSource: command.providerSource,
      sourceEntityType: command.sourceEntityType,
      sourceEntityId: command.sourceEntityId,
      tripId: command.tripId,
      idempotencyKey,
      metadata: sanitizeBatteryMeasurementSessionMetadata(command.metadata),
      modelVersion: command.modelVersion,
    });
  }

  getById(
    organizationId: string,
    sessionId: string,
  ): Promise<BatteryMeasurementSession | null> {
    return this.repository.findByIdForOrganization(organizationId, sessionId);
  }

  list(
    filter: ListBatteryMeasurementSessionsFilter,
  ): Promise<BatteryMeasurementSession[]> {
    return this.repository.listForOrganization(filter);
  }
}
