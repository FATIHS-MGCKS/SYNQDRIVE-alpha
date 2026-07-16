import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryMeasurement,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DriveProfileResolverService } from '../drive-profile/drive-profile-resolver.service';
import { guardLvMeasurementQualityForProfile } from '../drive-profile/drive-profile-resolver';
import { type BatteryMeasurementType as BatteryMeasurementTypeDomain } from './battery-v2-domain';
import { sanitizeBatteryMeasurementJson } from './battery-measurement-json';
import {
  hasUsableBatteryMeasurementNumericValue,
  hasUsableBatteryMeasurementTextValue,
  isBatteryMeasurementValueAllowed,
} from './battery-measurement-value';
import {
  BatteryMeasurementRepository,
  ListBatteryMeasurementsFilter,
} from './battery-measurement.repository';

export interface CreateBatteryMeasurementCommand {
  organizationId: string;
  vehicleId: string;
  type: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
  observedAt: Date;
  idempotencyKey: string;
  sessionId?: string | null;
  scope?: BatteryEvidenceScope;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
  receivedAt?: Date;
  providerTimestamp?: Date | null;
  providerSource?: string | null;
  signalName?: string | null;
  context?: Prisma.InputJsonValue | Record<string, unknown> | null;
  provenance?: Prisma.InputJsonValue | Record<string, unknown> | null;
}

@Injectable()
export class BatteryMeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: BatteryMeasurementRepository,
    private readonly driveProfileResolver: DriveProfileResolverService,
  ) {}

  async create(
    command: CreateBatteryMeasurementCommand,
  ): Promise<BatteryMeasurement> {
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

    const idempotencyKey = command.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const numericValue = hasUsableBatteryMeasurementNumericValue(
      command.numericValue,
    )
      ? command.numericValue
      : null;
    const textValue = hasUsableBatteryMeasurementTextValue(command.textValue)
      ? command.textValue.trim()
      : null;

    if (
      !isBatteryMeasurementValueAllowed({
        numericValue,
        textValue,
        quality: command.quality,
      })
    ) {
      throw new BadRequestException(
        'Measurement requires numericValue or textValue unless quality is MISSED or PROVIDER_ERROR',
      );
    }

    if (command.sessionId) {
      const session = await this.prisma.batteryMeasurementSession.findFirst({
        where: {
          id: command.sessionId,
          organizationId: command.organizationId,
          vehicleId: command.vehicleId,
        },
        select: { id: true },
      });
      if (!session) {
        throw new BadRequestException(
          'sessionId does not belong to the scoped vehicle and organization',
        );
      }
    }

    const scope =
      command.scope ??
      resolveBatteryMeasurementScope(command.type as BatteryMeasurementTypeDomain);

    const resolvedProfile = await this.driveProfileResolver.resolveForVehicle(
      command.vehicleId,
    );
    const quality = guardLvMeasurementQualityForProfile({
      profile: resolvedProfile.profile,
      measurementType: command.type as BatteryMeasurementTypeDomain,
      quality: command.quality,
    });

    return this.repository.createIdempotent({
      organizationId: command.organizationId,
      vehicleId: command.vehicleId,
      sessionId: command.sessionId,
      scope,
      type: command.type,
      numericValue,
      textValue,
      unit: command.unit?.trim() || null,
      quality,
      observedAt: command.observedAt,
      receivedAt: command.receivedAt,
      providerTimestamp: command.providerTimestamp,
      providerSource: command.providerSource,
      signalName: command.signalName,
      context: sanitizeBatteryMeasurementJson(command.context),
      provenance: sanitizeBatteryMeasurementJson(command.provenance),
      idempotencyKey,
    });
  }

  getById(
    organizationId: string,
    measurementId: string,
  ): Promise<BatteryMeasurement | null> {
    return this.repository.findByIdForOrganization(
      organizationId,
      measurementId,
    );
  }

  list(
    filter: ListBatteryMeasurementsFilter,
  ): Promise<BatteryMeasurement[]> {
    return this.repository.listForOrganization(filter);
  }
}

/** Maps measurement type to LV/HV scope for indexing and downstream gates. */
export function resolveBatteryMeasurementScope(
  type: BatteryMeasurementTypeDomain,
): BatteryEvidenceScope {
  switch (type) {
    case 'LIVE_HV_SOC':
    case 'LIVE_HV_RANGE':
    case 'LIVE_HV_CURRENT_ENERGY':
    case 'LIVE_HV_CHARGING_POWER':
    case 'PROVIDER_HV_SOH':
    case 'WORKSHOP_HV_SOH':
    case 'DOCUMENT_HV_SOH':
    case 'CHARGE_SESSION_CAPACITY':
    case 'DISCHARGE_SESSION_CAPACITY':
      return 'HV';
    default:
      return 'LV';
  }
}
