import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireVoiceEntitlement } from '@modules/voice-entitlement/require-voice-entitlement.decorator';
import { VoiceEntitlementGuard } from '@modules/voice-entitlement/voice-entitlement.guard';
import { VoiceBudgetPolicyRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceBudgetEnforcementService } from './voice-budget-enforcement.service';
import { VoiceBudgetWarningService } from './voice-budget-warning.service';
import { VoiceProtectionAuditService } from './voice-protection-audit.service';

@Controller('organizations/:orgId/voice-assistant/protection')
@UseGuards(OrgScopingGuard, RolesGuard, VoiceEntitlementGuard)
@Roles('ORG_ADMIN', 'SUB_ADMIN')
export class VoiceProtectionController {
  constructor(
    private readonly enforcement: VoiceBudgetEnforcementService,
    private readonly warnings: VoiceBudgetWarningService,
    private readonly audit: VoiceProtectionAuditService,
    private readonly budgetPolicies: VoiceBudgetPolicyRepository,
  ) {}

  @Get('status')
  @RequireVoiceEntitlement('protection.read')
  async status(@Param('orgId') orgId: string) {
    const [snapshot, forecast, policy] = await Promise.all([
      this.enforcement.getEnforcementSnapshot(orgId),
      this.warnings.getPeriodForecast(orgId),
      this.budgetPolicies.findByOrganization(orgId),
    ]);
    return { snapshot, forecast, policy };
  }

  @Get('audit')
  @RequireVoiceEntitlement('protection.read')
  auditTrail(@Param('orgId') orgId: string) {
    return this.audit.listByOrganization(orgId);
  }

  @Patch('budget-policy')
  @RequireVoiceEntitlement('protection.write')
  async updateBudgetPolicy(
    @Param('orgId') orgId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { user?: { id?: string } },
  ) {
    const policy = await this.budgetPolicies.upsert({
      organizationId: orgId,
      monthlyBudgetCents: typeof body.monthlyBudgetCents === 'number' ? body.monthlyBudgetCents : undefined,
      dailyLimitCents: typeof body.dailyLimitCents === 'number' ? body.dailyLimitCents : undefined,
      dailyOutboundMinutesLimit:
        typeof body.dailyOutboundMinutesLimit === 'number' ? body.dailyOutboundMinutesLimit : undefined,
      maxConversationDurationSeconds:
        typeof body.maxConversationDurationSeconds === 'number'
          ? body.maxConversationDurationSeconds
          : undefined,
      maxConcurrentCalls: typeof body.maxConcurrentCalls === 'number' ? body.maxConcurrentCalls : undefined,
      maxRepeatsPerDestination:
        typeof body.maxRepeatsPerDestination === 'number' ? body.maxRepeatsPerDestination : undefined,
      destinationCooldownSeconds:
        typeof body.destinationCooldownSeconds === 'number' ? body.destinationCooldownSeconds : undefined,
      destinationRegionPolicy:
        body.destinationRegionPolicy === 'DE_ONLY' ||
        body.destinationRegionPolicy === 'DE_EEA' ||
        body.destinationRegionPolicy === 'CUSTOM'
          ? body.destinationRegionPolicy
          : undefined,
      allowedCountries: Array.isArray(body.allowedCountries)
        ? body.allowedCountries.filter((v): v is string => typeof v === 'string')
        : undefined,
      hardLimitGraceMinutes:
        typeof body.hardLimitGraceMinutes === 'number' ? body.hardLimitGraceMinutes : undefined,
      overflowBehavior:
        body.overflowBehavior === 'WARN' ||
        body.overflowBehavior === 'HARD_STOP' ||
        body.overflowBehavior === 'ALLOW_OVERAGE'
          ? body.overflowBehavior
          : undefined,
    });

    await this.audit.record({
      organizationId: orgId,
      action: 'BUDGET_POLICY_UPDATED',
      reasonCode: 'budget_policy_updated',
      actorUserId: req.user?.id,
      metadata: { policyId: policy.id },
    });

    return policy;
  }
}

import { VoiceProtectionOverrideService } from './voice-protection-override.service';

@Controller('admin/voice-assistant/protection')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VoiceProtectionAdminController {
  constructor(
    private readonly enforcement: VoiceBudgetEnforcementService,
    private readonly warnings: VoiceBudgetWarningService,
    private readonly audit: VoiceProtectionAuditService,
    private readonly overrides: VoiceProtectionOverrideService,
  ) {}

  @Get('organizations/:orgId')
  async orgStatus(@Param('orgId') orgId: string) {
    const [snapshot, forecast, auditTrail] = await Promise.all([
      this.enforcement.getEnforcementSnapshot(orgId),
      this.warnings.getPeriodForecast(orgId),
      this.audit.listByOrganization(orgId, 100),
    ]);
    return { snapshot, forecast, auditTrail };
  }

  @Post('organizations/:orgId/overrides')
  async createOverride(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      scope: string;
      targetRef?: string;
      reason: string;
      expiresAt: string;
    },
    @Req() req: { user?: { id?: string } },
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('Authenticated user required.');
    }
    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('expiresAt must be a valid ISO date.');
    }
    const scope = body.scope as import('@prisma/client').VoiceProtectionOverrideScope;
    return this.overrides.createOverride({
      organizationId: orgId,
      scope,
      targetRef: body.targetRef ?? null,
      reason: body.reason,
      createdByUserId: req.user.id,
      expiresAt,
    });
  }
}
