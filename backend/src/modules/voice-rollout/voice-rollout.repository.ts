import { Injectable } from '@nestjs/common';
import { Prisma, VoiceRolloutAuditAction, VoiceRolloutStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class VoiceRolloutRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrganization(organizationId: string) {
    return this.prisma.voiceOrganizationRollout.findUnique({
      where: { organizationId },
    });
  }

  upsertStatus(params: {
    organizationId: string;
    status: VoiceRolloutStatus;
    reason: string;
    actorUserId?: string | null;
  }) {
    return this.prisma.voiceOrganizationRollout.upsert({
      where: { organizationId: params.organizationId },
      create: {
        organizationId: params.organizationId,
        status: params.status,
        lastReason: params.reason,
        updatedByUserId: params.actorUserId ?? null,
      },
      update: {
        status: params.status,
        lastReason: params.reason,
        updatedByUserId: params.actorUserId ?? null,
      },
    });
  }

  findAuditByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.voiceRolloutAuditEvent.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  recordAudit(params: {
    organizationId: string;
    action: VoiceRolloutAuditAction;
    previousStatus?: VoiceRolloutStatus | null;
    newStatus?: VoiceRolloutStatus | null;
    reason: string;
    actorUserId?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.voiceRolloutAuditEvent.create({
      data: {
        organizationId: params.organizationId,
        action: params.action,
        previousStatus: params.previousStatus ?? null,
        newStatus: params.newStatus ?? null,
        reason: params.reason,
        actorUserId: params.actorUserId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  listAuditByOrganization(organizationId: string, limit = 50) {
    return this.prisma.voiceRolloutAuditEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
