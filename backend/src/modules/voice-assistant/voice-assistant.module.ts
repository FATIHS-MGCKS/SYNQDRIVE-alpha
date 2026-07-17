import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { TwilioModule } from '@modules/twilio/twilio.module';
import { ElevenLabsService } from './elevenlabs.service';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceAssistantController, VoiceAssistantAdminController } from './voice-assistant.controller';

@Module({
  imports: [PrismaModule, ConfigModule, TwilioModule],
  controllers: [VoiceAssistantController, VoiceAssistantAdminController],
  providers: [VoiceAssistantService, ElevenLabsService],
  exports: [VoiceAssistantService],
})
export class VoiceAssistantModule {}
