import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ChatService } from './chat.service';

@Controller('organizations/:orgId/chat')
@UseGuards(RolesGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Get('agent')
  async getAgent(@Param('orgId') orgId: string) {
    return this.chatService.getAgentInfo(orgId);
  }

  @Post('agent')
  async ensureAgent(@Param('orgId') orgId: string) {
    return this.chatService.ensureAgent(orgId);
  }

  @Post('message')
  async sendMessage(
    @Param('orgId') orgId: string,
    @Body() body: { content: string },
  ) {
    if (!body.content?.trim()) {
      return {
        role: 'assistant',
        content: 'Please enter a message to get started.',
        createdAt: new Date().toISOString(),
      };
    }

    try {
      return await this.chatService.sendMessage(orgId, body.content.trim());
    } catch (err: any) {
      this.logger.error(`[Chat] Unhandled error in sendMessage for org ${orgId}: ${err.message}`, err.stack);
      return {
        role: 'assistant',
        content: "I'm sorry, something unexpected happened while processing your request. Please try again in a moment.",
        createdAt: new Date().toISOString(),
      };
    }
  }

  @Get('history')
  async getHistory(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getHistory(
      orgId,
      limit ? parseInt(limit, 10) : 100,
      before,
    );
  }

  @Delete('history')
  async clearHistory(@Param('orgId') orgId: string) {
    return this.chatService.clearHistory(orgId);
  }
}
