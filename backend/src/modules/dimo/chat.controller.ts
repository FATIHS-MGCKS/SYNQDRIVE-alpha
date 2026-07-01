import { Controller, Get, Post, Delete, Param, Body, Query, Res, UseGuards, Logger } from '@nestjs/common';
import { Response } from 'express';
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
    @Body() body: { content: string; locale?: string },
  ) {
    if (!body.content?.trim()) {
      return {
        role: 'assistant',
        content: 'Please enter a message to get started.',
        createdAt: new Date().toISOString(),
      };
    }

    try {
      return await this.chatService.sendMessage(orgId, body.content.trim(), body.locale);
    } catch (err: any) {
      this.logger.error(`[Chat] Unhandled error in sendMessage for org ${orgId}: ${err.message}`, err.stack);
      return {
        role: 'assistant',
        content: "I'm sorry, something unexpected happened while processing your request. Please try again in a moment.",
        createdAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Streaming variant of sendMessage. Returns Server-Sent Events so the agent
   * can do long-running work (tool calls / telemetry lookups) without hitting
   * the upstream gateway 504 that the synchronous DIMO /message endpoint returns.
   * Events: `status`, `progress`, `result`, `error`.
   */
  @Post('message/stream')
  async streamMessage(
    @Param('orgId') orgId: string,
    @Body() body: { content: string; locale?: string },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const closed = { value: false };
    res.on('close', () => { closed.value = true; });

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
      await this.chatService.streamMessage(orgId, body.content.trim(), send, () => closed.value, body.locale);
    } catch (err: any) {
      this.logger.error(`[Chat] Unhandled error in streamMessage for org ${orgId}: ${err.message}`, err.stack);
      send('error', {
        message: "I'm sorry, something unexpected happened while processing your request. Please try again in a moment.",
      });
    }

    if (!closed.value) res.end();
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
