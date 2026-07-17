import { Injectable } from '@nestjs/common';
import { VoiceProtectionOverrideScope } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceProtectionAuditService } from './voice-protection-audit.service';
import { VOICE_PROTECTION_REASON_CODES } from './voice-protection-reason-codes';

@Injectable()
export class VoiceProtectionOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: VoiceProtectionAuditService,
  ) {}

  async listActive(organizationId: string, now = new Date()) {
    return this.prisma.voiceProtectionOverride.findMany({
      where: {
        organizationId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  hasActiveOverride(
    overrides: Array<{ scope: VoiceProtectionOverrideScope; targetRef: string | null }>,
    scope: VoiceProtectionOverrideScope,
    targetRef?: string | null,
  ): boolean {
    return overrides.some((row) => {
      if (row.scope === 'ALL_LIMITS') {
        return true;
      }
      if (row.scope !== scope) {
        return false;
      }
      if (!targetRef || !row.targetRef) {
        return true;
      }
      return row.targetRef === targetRef;
    });
  }

  async createOverride(params: {
    organizationId: string;
    scope: VoiceProtectionOverrideScope;
    targetRef?: string | null;
    reason: string;
    createdByUserId: string;
    expiresAt: Date;
  }) {
    const row = await this.prisma.voiceProtectionOverride.create({
      data: {
        organizationId: params.organizationId,
        scope: params.scope,
        targetRef: params.targetRef ?? null,
        reason: params.reason,
        createdByUserId: params.createdByUserId,
        expiresAt: params.expiresAt,
      },
    });

    await this.audit.record({
      organizationId: params.organizationId,
      action: 'OVERRIDE_CREATED',
      reasonCode: VOICE_PROTECTION_REASON_CODES.MONTHLY_BUDGET_GRACE,
      message: params.reason,
      actorUserId: params.createdByUserId,
      metadata: { scope: params.scope, targetRef: params.targetRef ?? null, expiresAt: params.expiresAt.toISOString() },
    });

    return row;
  }

  async revokeOverride(params: {
    organizationId: string;
    overrideId: string;
    actorUserId: string;
    reason?: string;
  }) {
    const row = await this.prisma.voiceProtectionOverride.findFirst({
      where: { id: params.overrideId, organizationId: params.organizationId, revokedAt: null },
    });
    if (!row) {
      return null;
    }

    const updated = await this.prisma.voiceProtectionOverride.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      organizationId: params.organizationId,
      action: 'OVERRIDE_REVOKED',
      reasonCode: 'override_revoked',
      message: params.reason ?? 'Override revoked',
      actorUserId: params.actorUserId,
      metadata: { overrideId: row.id },
    });

    return updated;
  }
}
