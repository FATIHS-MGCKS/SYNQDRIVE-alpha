import { Injectable } from '@nestjs/common';
import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
  Prisma,
  type VehicleMotionPhysicsReference,
  type VehicleMotionPhysicsReferenceChange,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { MotionPhysicsReferenceChangeAction } from './motion-physics-reference.domain';
import type { MotionPhysicsIdentityFingerprint } from './motion-physics-reference.domain';
import { resolveMotionPhysicsAuditActorUserId } from './motion-physics-audit.util';

export interface CreateMotionPhysicsReferenceInput {
  organizationId: string;
  vehicleId: string;
  identityFingerprintJson: MotionPhysicsIdentityFingerprint;
  curbMassKg?: number | null;
  systemMotorPowerKw?: number | null;
  systemPowerDefinition?: string | null;
  accel0To100S?: number | null;
  variantAssumption?: string | null;
  evidenceTier: MotionPhysicsEvidenceTier;
  source: MotionPhysicsReferenceSource;
  documentExtractionId?: string | null;
  notes?: string | null;
  supersedeActiveId?: string | null;
}

export interface MotionPhysicsReferenceAuditEntry {
  referenceId?: string | null;
  action: MotionPhysicsReferenceChangeAction;
  previousTier?: MotionPhysicsEvidenceTier | null;
  newTier?: MotionPhysicsEvidenceTier | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class VehicleMotionPhysicsReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveForVehicle(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<VehicleMotionPhysicsReference | null> {
    return this.prisma.vehicleMotionPhysicsReference.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        isActive: true,
        supersededById: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  listHistory(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
  }): Promise<VehicleMotionPhysicsReference[]> {
    return this.prisma.vehicleMotionPhysicsReference.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: { effectiveFrom: 'desc' },
      take: input.limit ?? 20,
    });
  }

  listAuditTrail(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
  }): Promise<VehicleMotionPhysicsReferenceChange[]> {
    return this.prisma.vehicleMotionPhysicsReferenceChange.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: { changedAt: 'desc' },
      take: input.limit ?? 50,
    });
  }

  async createWithSupersedeAndAudit(
    input: CreateMotionPhysicsReferenceInput,
    auditEntries: MotionPhysicsReferenceAuditEntry[],
  ): Promise<VehicleMotionPhysicsReference> {
    return this.prisma.$transaction(async (tx) => {
      if (input.supersedeActiveId) {
        const active = await tx.vehicleMotionPhysicsReference.findFirst({
          where: {
            id: input.supersedeActiveId,
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            isActive: true,
            supersededById: null,
          },
        });
        if (active) {
          await tx.vehicleMotionPhysicsReference.update({
            where: { id: active.id },
            data: { isActive: false, effectiveTo: new Date() },
          });
        }
      }

      const created = await tx.vehicleMotionPhysicsReference.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          identityFingerprintJson: input.identityFingerprintJson as object,
          curbMassKg: input.curbMassKg ?? null,
          systemMotorPowerKw: input.systemMotorPowerKw ?? null,
          systemPowerDefinition: input.systemPowerDefinition ?? null,
          accel0To100S: input.accel0To100S ?? null,
          variantAssumption: input.variantAssumption ?? null,
          evidenceTier: input.evidenceTier,
          source: input.source,
          documentExtractionId: input.documentExtractionId ?? null,
          notes: input.notes ?? null,
          isActive: true,
        },
      });

      if (input.supersedeActiveId) {
        await tx.vehicleMotionPhysicsReference.update({
          where: { id: input.supersedeActiveId },
          data: { supersededById: created.id },
        });
      }

      for (const entry of auditEntries) {
        const actorUserId = await resolveMotionPhysicsAuditActorUserId(tx, entry.actorUserId);
        await tx.vehicleMotionPhysicsReferenceChange.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            referenceId: entry.referenceId ?? created.id,
            action: entry.action,
            previousTier: entry.previousTier ?? null,
            newTier: entry.newTier ?? null,
            actorUserId,
            metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
      }

      return created;
    });
  }

  async appendChange(input: {
    organizationId: string;
    vehicleId: string;
    referenceId?: string | null;
    action: MotionPhysicsReferenceChangeAction;
    previousTier?: MotionPhysicsEvidenceTier | null;
    newTier?: MotionPhysicsEvidenceTier | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<VehicleMotionPhysicsReferenceChange> {
    const actorUserId = await resolveMotionPhysicsAuditActorUserId(
      this.prisma,
      input.actorUserId,
    );
    return this.prisma.vehicleMotionPhysicsReferenceChange.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        referenceId: input.referenceId ?? null,
        action: input.action,
        previousTier: input.previousTier ?? null,
        newTier: input.newTier ?? null,
        actorUserId,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  updateTier(input: {
    id: string;
    evidenceTier: MotionPhysicsEvidenceTier;
    source?: MotionPhysicsReferenceSource;
    systemPowerDefinition?: string | null;
    verifiedByUserId?: string | null;
    verifiedAt?: Date | null;
    documentExtractionId?: string | null;
    notes?: string | null;
  }): Promise<VehicleMotionPhysicsReference> {
    return this.prisma.vehicleMotionPhysicsReference.update({
      where: { id: input.id },
      data: {
        evidenceTier: input.evidenceTier,
        source: input.source,
        systemPowerDefinition: input.systemPowerDefinition ?? undefined,
        verifiedByUserId: input.verifiedByUserId,
        verifiedAt: input.verifiedAt,
        documentExtractionId: input.documentExtractionId,
        notes: input.notes ?? undefined,
      },
    });
  }
}
