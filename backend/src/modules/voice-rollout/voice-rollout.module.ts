import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { VoiceEntitlementModule } from '@modules/voice-entitlement/voice-entitlement.module';
import { VoiceProtectionModule } from '@modules/voice-protection/voice-protection.module';
import { VoiceRolloutRepository } from './voice-rollout.repository';
import { VoiceRolloutService } from './voice-rollout.service';

@Module({
  imports: [PrismaModule, VoiceEntitlementModule, VoiceProtectionModule],
  providers: [VoiceRolloutRepository, VoiceRolloutService],
  exports: [VoiceRolloutService, VoiceRolloutRepository],
})
export class VoiceRolloutModule {}
