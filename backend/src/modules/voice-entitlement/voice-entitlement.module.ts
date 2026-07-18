import { Module } from '@nestjs/common';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { PrismaModule } from '@shared/database/prisma.module';
import { VoiceEntitlementGuard } from './voice-entitlement.guard';
import { VoiceEntitlementService } from './voice-entitlement.service';

@Module({
  imports: [PrismaModule],
  providers: [VoiceEntitlementService, VoiceEntitlementGuard, VoiceSubscriptionRepository],
  exports: [VoiceEntitlementService, VoiceEntitlementGuard],
})
export class VoiceEntitlementModule {}
