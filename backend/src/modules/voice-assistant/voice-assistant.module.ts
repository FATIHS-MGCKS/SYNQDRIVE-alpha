import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { ElevenLabsService } from './elevenlabs.service';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceAssistantController, VoiceAssistantAdminController } from './voice-assistant.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [VoiceAssistantController, VoiceAssistantAdminController],
  providers: [VoiceAssistantService, ElevenLabsService],
  exports: [VoiceAssistantService],
})
export class VoiceAssistantModule {}
