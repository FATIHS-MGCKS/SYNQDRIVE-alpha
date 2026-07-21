import { Controller, Get, Post, Delete, Param, Body, Query, Res, UseGuards, Logger } from '@nestjs/common';
import { Response } from 'express';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { ChatService } from './chat.service';

@Controller('organizations/:orgId/chat')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Get('agent')
  @RequirePermission('ai-assistant', 'read')
  async getAgent(@Param('orgId') orgId: string) {
    return this.chatService.getAgentInfo(orgId);
  }

  @Post('agent')
  @RequirePermission('ai-assistant', 'write')
  async ensureAgent(@Param('orgId') orgId: string) {
    return this.chatService.ensureAgent(orgId);
  }

  @Post('message')
  @RequirePermission('ai-assistant', 'write')
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Chat] Unhandled error in sendMessage for org ${orgId}: ${message}`);
      return {
        role: 'assistant',
        content:
          "I'm sorry, something unexpected happened while processing your request. Please try again in a moment.",
        createdAt: new Date().toISOString(),
      };
    }
  }

  @Post('message/stream')
  @RequirePermission('ai-assistant', 'write')
  async streamMessage(
    @Param('orgId') orgId: string,
    @Body() body: { content: string },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const closed = { value: false };
    res.on('close', () => {
      closed.value = true;
    });

    const send = (event: string, data: unknown) => {
      if (!closed.value) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!body.content?.trim()) {
      send('result', {
        role: 'assistant',
        content: 'Please enter a message to get started.',
        createdAt: new Date().toISOString(),
      });
      if (!closed.value) res.end();
      return;
    }

    try {
      await this.chatService.streamMessage(orgId, body.content.trim(), send, () => closed.value);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Chat] Unhandled error in streamMessage for org ${orgId}: ${message}`);
      send('error', {
        message:
          "I'm sorry, something unexpected happened while processing your request. Please try again in a moment.",
      });
    }

    if (!closed.value) res.end();
  }

  @Get('history')
  @RequirePermission('ai-assistant', 'read')
  async getHistory(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getHistory(orgId, limit ? parseInt(limit, 10) : 100, before);
  }

  @Delete('history')
  @RequirePermission('ai-assistant', 'write')
  async clearHistory(@Param('orgId') orgId: string) {
    return this.chatService.clearHistory(orgId);
  }
}
