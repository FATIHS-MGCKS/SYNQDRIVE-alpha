import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
import {
  VoiceBillingPeriodRepository,
  VoiceUsageEventRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceBillingController } from './voice-billing.controller';
import { VoiceBillingAdminController } from './voice-billing-admin.controller';
import { VoiceBillingService } from './voice-billing.service';
import { VoiceSubscriptionService } from './voice-subscription.service';
import { VoiceUsageLedgerService } from './voice-usage-ledger.service';

@Module({
  imports: [PrismaModule, SharedGuardsModule],
  controllers: [VoiceBillingController, VoiceBillingAdminController],
  providers: [
    VoiceBillingService,
    VoiceSubscriptionService,
    VoiceUsageLedgerService,
    VoiceSubscriptionRepository,
    VoiceUsageEventRepository,
    VoiceBillingPeriodRepository,
  ],
  exports: [VoiceBillingService, VoiceSubscriptionService, VoiceUsageLedgerService],
})
export class VoiceBillingModule {}
