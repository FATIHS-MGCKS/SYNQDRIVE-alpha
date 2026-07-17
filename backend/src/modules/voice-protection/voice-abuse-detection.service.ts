import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceConcurrentCallReservationService } from './voice-concurrent-call.reservation.service';
import { VOICE_PROTECTION_DEFAULTS } from './voice-protection-limits.config';
import { VOICE_PROTECTION_REASON_CODES } from './voice-protection-reason-codes';
import { resolveCountryFromE164 } from './voice-destination-policy.util';

export type AbuseSignal = {
  code: string;
  reasonCode: string;
  message: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class VoiceAbuseDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly concurrent: VoiceConcurrentCallReservationService,
  ) {}

  async detectSignals(params: {
    organizationId: string;
    conversationId?: string;
    destinationE164?: string | null;
    durationSeconds?: number | null;
    outcomeFailed?: boolean;
    estimatedCostCents?: number;
  }): Promise<AbuseSignal[]> {
    const signals: AbuseSignal[] = [];
    const since10m = new Date(Date.now() - VOICE_PROTECTION_DEFAULTS.abuseShortCallWindowSeconds * 1000);
    const since15m = new Date(Date.now() - VOICE_PROTECTION_DEFAULTS.abuseFailedTargetWindowSeconds * 1000);

    const recentConversations = await this.prisma.voiceConversation.findMany({
      where: {
        organizationId: params.organizationId,
        startedAt: { gte: since10m },
      },
      select: {
        id: true,
        durationSeconds: true,
        outcome: true,
        callerNumber: true,
        metadata: true,
      },
      take: 50,
      orderBy: { startedAt: 'desc' },
    });

    const shortCalls = recentConversations.filter(
      (row) => (row.durationSeconds ?? 0) > 0 &&
        (row.durationSeconds ?? 0) <= VOICE_PROTECTION_DEFAULTS.abuseShortCallSeconds,
    );
    if (shortCalls.length >= VOICE_PROTECTION_DEFAULTS.abuseShortCallBurstCount) {
      signals.push({
        code: 'short_call_burst',
        reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_SHORT_CALL_BURST,
        message: 'Unusually high number of very short calls detected.',
        metadata: { count: shortCalls.length, windowSeconds: VOICE_PROTECTION_DEFAULTS.abuseShortCallWindowSeconds },
      });
    }

    if (params.outcomeFailed && params.destinationE164) {
      const failedRecent = recentConversations.filter((row) => row.outcome === 'FAILED');
      if (failedRecent.length >= VOICE_PROTECTION_DEFAULTS.abuseFailedTargetBurstCount) {
        signals.push({
          code: 'failed_target_burst',
          reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_FAILED_TARGET_BURST,
          message: 'Repeated failed call attempts detected.',
          metadata: { count: failedRecent.length },
        });
      }
    }

    if (params.estimatedCostCents && params.estimatedCostCents >= VOICE_PROTECTION_DEFAULTS.abuseInternationalCostCents) {
      const country = params.destinationE164 ? resolveCountryFromE164(params.destinationE164) : null;
      if (country && country !== 'DE') {
        signals.push({
          code: 'international_cost',
          reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_INTERNATIONAL_COST,
          message: 'High estimated international call cost.',
          metadata: { country, estimatedCostCents: params.estimatedCostCents },
        });
      }
    }

    const activeConcurrent = await this.concurrent.countActive(params.organizationId);
    if (activeConcurrent >= 3) {
      signals.push({
        code: 'parallel_spike',
        reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_PARALLEL_SPIKE,
        message: 'Parallel call spike detected.',
        metadata: { activeConcurrent },
      });
    }

    const loopCandidates = recentConversations.filter((row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      return meta?.forwardingLoopSuspected === true;
    });
    if (loopCandidates.length > 0) {
      signals.push({
        code: 'forwarding_loop',
        reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_FORWARDING_LOOP,
        message: 'Possible call forwarding loop detected.',
      });
    }

    if (
      typeof params.durationSeconds === 'number' &&
      params.durationSeconds >= VOICE_PROTECTION_DEFAULTS.abuseLongCallSeconds
    ) {
      signals.push({
        code: 'long_call',
        reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_LONG_CALL,
        message: 'Unusually long conversation detected.',
        metadata: { durationSeconds: params.durationSeconds },
      });
    }

    // Failed outcomes in last 15m (broader than single destination)
    const failedCount = await this.prisma.voiceConversation.count({
      where: {
        organizationId: params.organizationId,
        outcome: 'FAILED',
        startedAt: { gte: since15m },
      },
    });
    if (failedCount >= VOICE_PROTECTION_DEFAULTS.abuseFailedTargetBurstCount && !signals.some((s) => s.code === 'failed_target_burst')) {
      signals.push({
        code: 'failed_target_burst',
        reasonCode: VOICE_PROTECTION_REASON_CODES.ABUSE_FAILED_TARGET_BURST,
        message: 'Repeated failed call attempts detected.',
        metadata: { count: failedCount },
      });
    }

    return signals;
  }
}
