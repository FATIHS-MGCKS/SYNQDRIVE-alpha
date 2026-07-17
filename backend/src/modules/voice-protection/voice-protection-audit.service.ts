import { Injectable } from '@nestjs/common';
import { Prisma, VoiceProtectionAuditAction } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { VoiceProtectionReasonCode } from './voice-protection-reason-codes';

@Injectable()
export class VoiceProtectionAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    organizationId: string;
    action: VoiceProtectionAuditAction;
    reasonCode: VoiceProtectionReasonCode | string;
    message?: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
  }) {
    return this.prisma.voiceProtectionAuditEvent.create({
      data: {
        organizationId: params.organizationId,
        action: params.action,
        reasonCode: params.reasonCode,
        message: params.message ?? null,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        actorUserId: params.actorUserId ?? null,
      },
    });
  }

  listByOrganization(organizationId: string, limit = 50) {
    return this.prisma.voiceProtectionAuditEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
