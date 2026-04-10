import { Controller, Get, Post, Put, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { WhatsAppService } from './whatsapp.service';

@Controller('organizations/:orgId/whatsapp')
@UseGuards(RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get('config')
  async getConfig(@Param('orgId') orgId: string) {
    return this.whatsAppService.getConfig(orgId);
  }

  @Put('config')
  async updateConfig(@Param('orgId') orgId: string, @Body() body: any) {
    return this.whatsAppService.updateConfig(orgId, body);
  }

  @Post('connect')
  async connect(@Param('orgId') orgId: string, @Body() body: { phoneNumber: string; businessName?: string; connectedByName?: string }) {
    return this.whatsAppService.connect(orgId, body);
  }

  @Post('disconnect')
  async disconnect(@Param('orgId') orgId: string) {
    return this.whatsAppService.disconnect(orgId);
  }

  @Get('conversations')
  async getConversations(@Param('orgId') orgId: string) {
    return this.whatsAppService.getConversations(orgId);
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(@Param('orgId') orgId: string, @Param('conversationId') conversationId: string) {
    return this.whatsAppService.getMessages(orgId, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  async sendMessage(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string; senderName?: string },
  ) {
    if (!body.content?.trim()) return { error: 'Message content is required' };
    return this.whatsAppService.sendMessage(orgId, conversationId, body.content.trim(), body.senderName);
  }

  @Post('conversations/:conversationId/ai-suggestion')
  async getAiSuggestion(@Param('orgId') orgId: string, @Param('conversationId') conversationId: string) {
    return this.whatsAppService.getAiSuggestion(orgId, conversationId);
  }

  @Post('conversations/:conversationId/ai-reply')
  async sendAiReply(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string },
  ) {
    if (!body.content?.trim()) return { error: 'Content is required' };
    return this.whatsAppService.sendAiReply(orgId, conversationId, body.content.trim());
  }

  @Post('simulate-incoming')
  async simulateIncoming(@Param('orgId') orgId: string, @Body() body: { contactPhone: string; contactName?: string; content: string }) {
    if (!body.contactPhone || !body.content) return { error: 'contactPhone and content are required' };
    return this.whatsAppService.simulateIncoming(orgId, body);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.whatsAppService.getStats(orgId);
  }
}
