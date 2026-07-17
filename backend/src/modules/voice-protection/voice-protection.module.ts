import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { VoiceBillingModule } from '@modules/voice-billing/voice-billing.module';
import { VoiceBudgetPolicyRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceAbuseDetectionService } from './voice-abuse-detection.service';
import { VoiceBudgetEnforcementService } from './voice-budget-enforcement.service';
import { VoiceBudgetWarningService } from './voice-budget-warning.service';
import { VoiceConcurrentCallReservationService } from './voice-concurrent-call.reservation.service';
import { VoiceProtectionAuditService } from './voice-protection-audit.service';
import { VoiceProtectionOverrideService } from './voice-protection-override.service';
import { VoiceProtectionController, VoiceProtectionAdminController } from './voice-protection.controller';

@Module({
  imports: [PrismaModule, RedisModule, SharedGuardsModule, ActivityLogModule, VoiceBillingModule],
  controllers: [VoiceProtectionController, VoiceProtectionAdminController],
  providers: [
    VoiceBudgetEnforcementService,
    VoiceBudgetWarningService,
    VoiceAbuseDetectionService,
    VoiceConcurrentCallReservationService,
    VoiceProtectionAuditService,
    VoiceProtectionOverrideService,
    VoiceBudgetPolicyRepository,
    VoiceSubscriptionRepository,
  ],
  exports: [
    VoiceBudgetEnforcementService,
    VoiceBudgetWarningService,
    VoiceAbuseDetectionService,
    VoiceConcurrentCallReservationService,
    VoiceProtectionAuditService,
    VoiceProtectionOverrideService,
  ],
})
export class VoiceProtectionModule {}
