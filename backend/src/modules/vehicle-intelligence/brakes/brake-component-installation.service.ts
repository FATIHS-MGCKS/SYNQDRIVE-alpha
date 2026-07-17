import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import {
  defaultMinimumThicknessMm,
  isActiveBrakeComponentInstallation,
  isPrismaActiveComponentConflict,
  sortInstallationsByHistory,
  validateBrakeComponentInstallation,
  validateEvidenceReference,
  validateReferenceSpecReference,
  validateServiceEventReference,
} from './brake-component-installation.invariants';

export interface InstallBrakeComponentInput {
  organizationId: string;
  vehicleId: string;
  componentType: BrakeComponentInstallationType;
  installedAt: Date;
  installedOdometerKm?: number | null;
  anchorThicknessMm?: number | null;
  anchorSource?: BrakeComponentInstallationAnchorSource | null;
  anchorMeasuredAt?: Date | null;
  nominalThicknessMm?: number | null;
  minimumThicknessMm?: number | null;
  referenceSpecId?: string | null;
  serviceEventId?: string | null;
  sourceEvidenceId?: string | null;
  status?: BrakeComponentInstallationStatus;
  supersedeActive?: boolean;
  allowOdometerReset?: boolean;
}

export interface CloseBrakeComponentInstallationInput {
  organizationId: string;
  vehicleId: string;
  installationId: string;
  removedAt: Date;
  removedOdometerKm?: number | null;
  status: 'REMOVED' | 'RETIRED';
  allowOdometerReset?: boolean;
}

@Injectable()
export class BrakeComponentInstallationService {
  constructor(private readonly prisma: PrismaService) {}

  async listVehicleInstallations(vehicleId: string, organizationId?: string) {
    await this.assertVehicle(vehicleId, organizationId);
    const rows = await this.prisma.brakeComponentInstallation.findMany({
      where: { vehicleId },
      orderBy: [{ componentType: 'asc' }, { installedAt: 'asc' }],
    });
    return sortInstallationsByHistory(rows);
  }

  async listActiveInstallations(vehicleId: string, organizationId?: string) {
    const rows = await this.listVehicleInstallations(vehicleId, organizationId);
    return rows.filter(isActiveBrakeComponentInstallation);
  }

  private assertInstallationInvariants(input: Parameters<typeof validateBrakeComponentInstallation>[0]) {
    try {
      validateBrakeComponentInstallation(input);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'invalid_brake_component_installation',
      );
    }
  }

  async installComponent(input: InstallBrakeComponentInput) {
    const vehicle = await this.assertVehicle(input.vehicleId, input.organizationId);
    await this.assertReferences(input);

    const status = input.status ?? BrakeComponentInstallationStatus.ACTIVE;
    const existingActive =
      status === BrakeComponentInstallationStatus.ACTIVE
        ? await this.prisma.brakeComponentInstallation.findFirst({
            where: {
              vehicleId: input.vehicleId,
              componentType: input.componentType,
              status: BrakeComponentInstallationStatus.ACTIVE,
              removedAt: null,
            },
          })
        : null;

    if (existingActive && !input.supersedeActive) {
      throw new ConflictException(
        `Active ${input.componentType} installation already exists for vehicle ${input.vehicleId}`,
      );
    }

    this.assertInstallationInvariants({
      organizationId: input.organizationId,
      vehicleOrganizationId: vehicle.organizationId,
      componentType: input.componentType,
      installedAt: input.installedAt,
      installedOdometerKm: input.installedOdometerKm ?? null,
      status,
      serviceEventId: input.serviceEventId,
      sourceEvidenceId: input.sourceEvidenceId,
      referenceSpecId: input.referenceSpecId,
      existingActive: existingActive && !input.supersedeActive ? existingActive : null,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (existingActive && input.supersedeActive) {
          await tx.brakeComponentInstallation.update({
            where: { id: existingActive.id },
            data: {
              status: BrakeComponentInstallationStatus.REMOVED,
              removedAt: input.installedAt,
              removedOdometerKm: input.installedOdometerKm ?? null,
            },
          });
        }

        return tx.brakeComponentInstallation.create({
          data: {
            organizationId: vehicle.organizationId,
            vehicleId: input.vehicleId,
            componentType: input.componentType,
            installedAt: input.installedAt,
            installedOdometerKm: input.installedOdometerKm ?? null,
            status,
            anchorThicknessMm: input.anchorThicknessMm ?? null,
            anchorSource: input.anchorSource ?? null,
            anchorMeasuredAt: input.anchorMeasuredAt ?? null,
            nominalThicknessMm: input.nominalThicknessMm ?? null,
            minimumThicknessMm:
              input.minimumThicknessMm ?? defaultMinimumThicknessMm(input.componentType),
            referenceSpecId: input.referenceSpecId ?? null,
            serviceEventId: input.serviceEventId ?? null,
            sourceEvidenceId: input.sourceEvidenceId ?? null,
            modelVersionAtInstallation: BRAKE_HEALTH_CONFIG.MODEL_VERSION,
          },
        });
      });
    } catch (error) {
      if (isPrismaActiveComponentConflict(error)) {
        throw new ConflictException(
          `Active ${input.componentType} installation already exists for vehicle ${input.vehicleId}`,
        );
      }
      throw error;
    }
  }

  async closeInstallation(input: CloseBrakeComponentInstallationInput) {
    const vehicle = await this.assertVehicle(input.vehicleId, input.organizationId);
    const current = await this.prisma.brakeComponentInstallation.findFirst({
      where: {
        id: input.installationId,
        vehicleId: input.vehicleId,
        organizationId: vehicle.organizationId,
      },
    });
    if (!current) {
      throw new NotFoundException(`Brake component installation ${input.installationId} not found`);
    }

    this.assertInstallationInvariants({
      organizationId: input.organizationId,
      vehicleOrganizationId: vehicle.organizationId,
      componentType: current.componentType,
      installedAt: current.installedAt,
      installedOdometerKm: current.installedOdometerKm,
      removedAt: input.removedAt,
      removedOdometerKm: input.removedOdometerKm ?? null,
      status: input.status,
      allowOdometerReset: input.allowOdometerReset,
    });

    return this.prisma.brakeComponentInstallation.update({
      where: { id: current.id },
      data: {
        status: input.status,
        removedAt: input.removedAt,
        removedOdometerKm: input.removedOdometerKm ?? null,
      },
    });
  }

  async markUnknownHistory(organizationId: string, vehicleId: string, installationId: string) {
    const vehicle = await this.assertVehicle(vehicleId, organizationId);
    const current = await this.prisma.brakeComponentInstallation.findFirst({
      where: { id: installationId, vehicleId, organizationId: vehicle.organizationId },
    });
    if (!current) {
      throw new NotFoundException(`Brake component installation ${installationId} not found`);
    }
    return this.prisma.brakeComponentInstallation.update({
      where: { id: current.id },
      data: { status: BrakeComponentInstallationStatus.UNKNOWN_HISTORY },
    });
  }

  private async assertVehicle(vehicleId: string, organizationId?: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      throw new BadRequestException(
        organizationId
          ? `Vehicle ${vehicleId} not found in organization ${organizationId}`
          : `Vehicle ${vehicleId} not found`,
      );
    }
    return vehicle;
  }

  private async assertReferences(input: InstallBrakeComponentInput) {
    if (input.serviceEventId) {
      const event = await this.prisma.vehicleServiceEvent.findUnique({
        where: { id: input.serviceEventId },
        select: { vehicleId: true },
      });
      if (!event) throw new BadRequestException(`Service event ${input.serviceEventId} not found`);
      validateServiceEventReference(input.vehicleId, event.vehicleId);
    }

    if (input.sourceEvidenceId) {
      const evidence = await this.prisma.brakeEvidence.findUnique({
        where: { id: input.sourceEvidenceId },
        select: { vehicleId: true },
      });
      if (!evidence) {
        throw new BadRequestException(`Brake evidence ${input.sourceEvidenceId} not found`);
      }
      validateEvidenceReference(input.vehicleId, evidence.vehicleId);
    }

    if (input.referenceSpecId) {
      const spec = await this.prisma.vehicleBrakeReferenceSpec.findUnique({
        where: { id: input.referenceSpecId },
        select: { vehicleId: true },
      });
      if (!spec) {
        throw new BadRequestException(`Brake reference spec ${input.referenceSpecId} not found`);
      }
      validateReferenceSpecReference(input.vehicleId, spec.vehicleId);
    }
  }
}

export type BrakeComponentInstallationCreateData =
  Prisma.BrakeComponentInstallationUncheckedCreateInput;
