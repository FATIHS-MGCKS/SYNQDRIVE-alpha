import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { VehicleBatteryReferenceCapacity } from '@prisma/client';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import {
  evaluateReferenceCapacityCreate,
  evaluateReferenceCapacityVerify,
  isAssessmentCompatibleCapacityType,
  REFERENCE_CAPACITY_CHANGE_ACTIONS,
  resolveInitialVerificationStatus,
} from './vehicle-battery-reference-capacity.policy';
import type {
  CreateVehicleBatteryReferenceCapacityDto,
  UpdateVehicleBatteryReferenceCapacityNotesDto,
  VerifyVehicleBatteryReferenceCapacityDto,
} from './dto/vehicle-battery-reference-capacity.dto';
import { VehicleBatteryReferenceCapacityRepository } from './vehicle-battery-reference-capacity.repository';
import { BatteryTaskService } from '../battery-task.service';

export interface VehicleBatteryReferenceCapacityDto {
  id: string;
  organizationId: string;
  vehicleId: string;
  capacityKwh: number;
  capacityType: BatteryReferenceCapacityType;
  source: BatteryReferenceCapacitySource;
  verificationStatus: ReferenceCapacityVerificationStatus;
  verifiedByUserId: string | null;
  verifiedAt: string | null;
  documentId: string | null;
  serviceEventId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  supersededById: string | null;
  notes: string | null;
  createdAt: string;
  assessmentCompatible: boolean;
}

@Injectable()
export class VehicleBatteryReferenceCapacityService {
  private readonly logger = new Logger(VehicleBatteryReferenceCapacityService.name);

  constructor(
    private readonly repository: VehicleBatteryReferenceCapacityRepository,
    @Optional() private readonly batteryTasks?: BatteryTaskService,
  ) {}

  async getActive(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleBatteryReferenceCapacityDto | null> {
    const row = await this.repository.findActiveForVehicle({
      organizationId,
      vehicleId,
    });
    return row ? this.toDto(row) : null;
  }

  async listHistory(organizationId: string, vehicleId: string) {
    const rows = await this.repository.listHistory({ organizationId, vehicleId });
    return rows.map((row) => this.toDto(row));
  }

  async listAuditTrail(organizationId: string, vehicleId: string) {
    return this.repository.listAuditTrail({ organizationId, vehicleId });
  }

  async create(
    organizationId: string,
    vehicleId: string,
    body: CreateVehicleBatteryReferenceCapacityDto,
    actorUserId?: string,
  ): Promise<VehicleBatteryReferenceCapacityDto> {
    const policy = evaluateReferenceCapacityCreate(body);
    if (!policy.ok) {
      throw new BadRequestException({
        message: 'Reference capacity validation failed',
        reasonCodes: policy.reasonCodes,
      });
    }

    const active = await this.repository.findActiveForVehicle({
      organizationId,
      vehicleId,
    });

    const verificationStatus = resolveInitialVerificationStatus();
    const created = await this.repository.createWithSupersede({
      organizationId,
      vehicleId,
      capacityKwh: body.capacityKwh,
      capacityType: body.capacityType,
      source: body.source,
      verificationStatus,
      documentId: body.documentId ?? null,
      serviceEventId: body.serviceEventId ?? null,
      notes: body.notes ?? null,
      supersedeActiveId: active?.id ?? null,
    });

    if (active) {
      await this.repository.appendChange({
        organizationId,
        vehicleId,
        referenceCapacityId: active.id,
        action: REFERENCE_CAPACITY_CHANGE_ACTIONS.SUPERSEDED,
        previousStatus: active.verificationStatus,
        newStatus: active.verificationStatus,
        actorUserId: actorUserId ?? null,
        metadata: {
          supersededById: created.id,
          previousCapacityKwh: active.capacityKwh,
        },
      });
    }

    await this.repository.appendChange({
      organizationId,
      vehicleId,
      referenceCapacityId: created.id,
      action: REFERENCE_CAPACITY_CHANGE_ACTIONS.CREATED,
      newStatus: verificationStatus,
      actorUserId: actorUserId ?? null,
      metadata: {
        capacityKwh: created.capacityKwh,
        capacityType: created.capacityType,
        source: created.source,
        documentId: created.documentId,
        serviceEventId: created.serviceEventId,
      },
    });

    return this.toDto(created);
  }

  async verify(
    organizationId: string,
    vehicleId: string,
    referenceCapacityId: string,
    body: VerifyVehicleBatteryReferenceCapacityDto,
    actorUserId: string,
  ): Promise<VehicleBatteryReferenceCapacityDto> {
    const row = await this.repository.findActiveForVehicle({
      organizationId,
      vehicleId,
    });

    if (!row || row.id !== referenceCapacityId) {
      throw new NotFoundException('Active reference capacity not found');
    }

    const policy = evaluateReferenceCapacityVerify({
      isActive: row.isActive,
      verificationStatus: row.verificationStatus,
      source: row.source as BatteryReferenceCapacitySource,
      documentId: row.documentId,
      serviceEventId: row.serviceEventId,
    });

    if (!policy.ok) {
      throw new BadRequestException({
        message: 'Reference capacity verification failed',
        reasonCodes: policy.reasonCodes,
      });
    }

    const verifiedAt = new Date();
    const updated = await this.repository.updateVerified({
      id: row.id,
      verifiedByUserId: actorUserId,
      verifiedAt,
      notes: body.notes ?? row.notes,
    });

    await this.repository.appendChange({
      organizationId,
      vehicleId,
      referenceCapacityId: row.id,
      action: REFERENCE_CAPACITY_CHANGE_ACTIONS.VERIFIED,
      previousStatus: row.verificationStatus,
      newStatus: ReferenceCapacityVerificationStatus.VERIFIED,
      actorUserId,
      metadata: {
        verifiedAt: verifiedAt.toISOString(),
      },
    });

    await this.batteryTasks
      ?.onReferenceCapacityVerified(organizationId, vehicleId, row.id)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Reference capacity task sync failed vehicle=${vehicleId} reference=${row.id}: ${message}`,
        );
      });

    return this.toDto(updated);
  }

  async updateNotes(
    organizationId: string,
    vehicleId: string,
    referenceCapacityId: string,
    body: UpdateVehicleBatteryReferenceCapacityNotesDto,
    actorUserId?: string,
  ): Promise<VehicleBatteryReferenceCapacityDto> {
    const row = await this.repository.findActiveForVehicle({
      organizationId,
      vehicleId,
    });

    if (!row || row.id !== referenceCapacityId) {
      throw new NotFoundException('Active reference capacity not found');
    }

    const updated = await this.repository.updateNotes({
      id: row.id,
      notes: body.notes,
    });

    await this.repository.appendChange({
      organizationId,
      vehicleId,
      referenceCapacityId: row.id,
      action: REFERENCE_CAPACITY_CHANGE_ACTIONS.NOTES_UPDATED,
      previousStatus: row.verificationStatus,
      newStatus: row.verificationStatus,
      actorUserId: actorUserId ?? null,
      metadata: { notes: body.notes },
    });

    return this.toDto(updated);
  }

  private toDto(row: VehicleBatteryReferenceCapacity): VehicleBatteryReferenceCapacityDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      capacityKwh: row.capacityKwh,
      capacityType: row.capacityType as BatteryReferenceCapacityType,
      source: row.source as BatteryReferenceCapacitySource,
      verificationStatus: row.verificationStatus,
      verifiedByUserId: row.verifiedByUserId,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      documentId: row.documentId,
      serviceEventId: row.serviceEventId,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      isActive: row.isActive,
      supersededById: row.supersededById,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      assessmentCompatible: isAssessmentCompatibleCapacityType(
        row.capacityType as BatteryReferenceCapacityType,
      ),
    };
  }
}
