import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { VoiceAssistantService } from './voice-assistant.service';

@Controller('organizations/:orgId/voice-assistant')
@UseGuards(RolesGuard)
export class VoiceAssistantController {
  private readonly logger = new Logger(VoiceAssistantController.name);

  constructor(private readonly service: VoiceAssistantService) {}

  @Get()
  async get(@Param('orgId') orgId: string) {
    return this.service.getOrCreate(orgId);
  }

  @Patch()
  async update(@Param('orgId') orgId: string, @Body() body: any) {
    return this.service.update(orgId, body);
  }

  @Post('activate')
  async activate(@Param('orgId') orgId: string) {
    return this.service.activate(orgId);
  }

  @Post('deactivate')
  async deactivate(@Param('orgId') orgId: string) {
    return this.service.deactivate(orgId);
  }

  @Get('readiness')
  async readiness(@Param('orgId') orgId: string) {
    return this.service.getReadiness(orgId);
  }

  @Get('voices')
  async voices() {
    return this.service.listVoices();
  }

  @Post('test-session')
  async testSession(@Param('orgId') orgId: string) {
    return this.service.getTestSession(orgId);
  }

  @Get('conversations')
  async conversations(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getConversations(orgId, limit ? parseInt(limit, 10) : 50);
  }

  @Post('conversations/sync')
  async syncConversations(@Param('orgId') orgId: string) {
    return this.service.syncConversations(orgId);
  }
}

@Controller('admin/voice-assistant')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VoiceAssistantAdminController {
  constructor(private readonly service: VoiceAssistantService) {}

  @Get('overview')
  async overview() {
    return this.service.getAdminOverview();
  }

  @Get('organizations/:orgId')
  async orgDetail(@Param('orgId') orgId: string) {
    const assistant = await this.service.get(orgId);
    if (!assistant) return { exists: false };
    const readiness = await this.service.getReadiness(orgId);
    const conversations = await this.service.getConversations(orgId, 10);
    return { exists: true, assistant, readiness, recentConversations: conversations };
  }
}
