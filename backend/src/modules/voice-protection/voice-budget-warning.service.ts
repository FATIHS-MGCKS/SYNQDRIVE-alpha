import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { VoiceBillingService } from '@modules/voice-billing/voice-billing.service';
import { currentBillingPeriodBounds } from '@modules/voice-billing/voice-billing-period.util';
import { VoiceProtectionAuditService } from './voice-protection-audit.service';
import { VOICE_BUDGET_WARN_THRESHOLDS_PCT } from './voice-budget-enforcement.service';
import { VOICE_PROTECTION_REASON_CODES } from './voice-protection-reason-codes';

@Injectable()
export class VoiceBudgetWarningService {
  private readonly logger = new Logger(VoiceBudgetWarningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: VoiceBillingService,
    private readonly audit: VoiceProtectionAuditService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async evaluateThresholds(organizationId: string): Promise<{ warnedPct: number[] }> {
    const usage = await this.billing.getOrganizationUsage(organizationId);
    const { periodStart, periodEnd } = currentBillingPeriodBounds();

    const included = usage.includedMinutes;
    if (included <= 0) {
      return { warnedPct: [] };
    }

    const consumedPct = Math.round((usage.consumedMinutes / included) * 100);
    const fired: number[] = [];

    for (const threshold of VOICE_BUDGET_WARN_THRESHOLDS_PCT) {
      if (consumedPct < threshold) {
        continue;
      }

      try {
        await this.prisma.voiceBudgetWarningState.create({
          data: {
            organizationId,
            periodStart,
            warnedPct: threshold,
          },
        });
        fired.push(threshold);

        await this.audit.record({
          organizationId,
          action: 'BUDGET_WARNING',
          reasonCode: VOICE_PROTECTION_REASON_CODES.MONTHLY_BUDGET_GRACE,
          message: `Voice usage reached ${threshold}% of included minutes.`,
          metadata: {
            thresholdPct: threshold,
            consumedMinutes: usage.consumedMinutes,
            includedMinutes: included,
            remainingIncludedMinutes: usage.remainingIncludedMinutes,
          },
        });

        await this.notifyOrgAdmins(organizationId, threshold, usage.remainingIncludedMinutes);
      } catch {
        // unique constraint — already warned for this threshold
      }
    }

    if (fired.length > 0) {
      await this.evaluateMasterAdminAnomaly(organizationId, usage.consumedMinutes, included);
    }

    return { warnedPct: fired };
  }

  async getPeriodForecast(organizationId: string) {
    const forecast = await this.billing.getForecast(organizationId);
    const usage = await this.billing.getOrganizationUsage(organizationId);
    const { periodStart, periodEnd } = currentBillingPeriodBounds();
    const now = Date.now();
    const elapsedMs = now - new Date(periodStart).getTime();
    const totalMs = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
    const progressPct = totalMs > 0 ? Math.min(100, Math.round((elapsedMs / totalMs) * 100)) : 0;

    const projectedMinutes =
      progressPct > 0
        ? Math.round((usage.consumedMinutes / progressPct) * 100)
        : usage.consumedMinutes;

    return {
      organizationId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      progressPct,
      consumedMinutes: usage.consumedMinutes,
      includedMinutes: usage.includedMinutes,
      projectedMinutesAtPeriodEnd: projectedMinutes,
      projectedOverageMinutes: Math.max(0, projectedMinutes - usage.includedMinutes),
      projectedRevenueCents: forecast.projectedRevenueCents,
    };
  }

  private async notifyOrgAdmins(
    organizationId: string,
    thresholdPct: number,
    remainingMinutes: number,
  ) {
    const admins = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        role: { in: ['ORG_ADMIN', 'SUB_ADMIN'] },
      },
      select: { userId: true },
      take: 20,
    });

    const description = `Voice AI usage reached ${thresholdPct}% of included minutes (${remainingMinutes} minutes remaining).`;

    for (const admin of admins) {
      try {
        await this.activityLog.log({
          organizationId,
          userId: admin.userId,
          action: 'SEND',
          entity: 'ORGANIZATION',
          entityId: organizationId,
          description,
          metaJson: {
            auditAction: 'VOICE_BUDGET_WARNING',
            thresholdPct,
            remainingMinutes,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to log voice budget warning for admin ${admin.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async evaluateMasterAdminAnomaly(
    organizationId: string,
    consumedMinutes: number,
    includedMinutes: number,
  ) {
    if (consumedMinutes <= includedMinutes * 1.5) {
      return;
    }

    await this.audit.record({
      organizationId,
      action: 'BUDGET_WARNING',
      reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_INTERNATIONAL_COST,
      message: 'Unusual voice cost trajectory flagged for Master Admin review.',
      metadata: { consumedMinutes, includedMinutes, masterAdminFlag: true },
    });
  }
}
