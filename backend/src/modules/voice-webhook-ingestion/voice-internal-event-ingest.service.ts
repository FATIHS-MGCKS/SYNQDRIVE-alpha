import { Injectable } from '@nestjs/common';
import { VoiceWebhookIngestService } from './voice-webhook-ingest.service';
import { VOICE_WEBHOOK_EVENT_TYPES } from './voice-webhook-ingestion.constants';

@Injectable()
export class VoiceInternalEventIngestService {
  constructor(private readonly ingest: VoiceWebhookIngestService) {}

  async recordMcpToolExecution(params: {
    organizationId: string;
    voiceConversationId: string;
    toolExecutionId: string;
    toolName: string;
    status: string;
  }): Promise<void> {
    await this.ingest.ingestMcpToolExecutionEvent({
      organizationId: params.organizationId,
      externalEventId: `${params.toolExecutionId}:mcp-tool`,
      payload: {
        voiceConversationId: params.voiceConversationId,
        toolExecutionId: params.toolExecutionId,
        toolName: params.toolName,
        status: params.status,
        source: VOICE_WEBHOOK_EVENT_TYPES.MCP_TOOL_EXECUTION,
      },
    });
  }

  async recordConversationLifecycle(params: {
    organizationId: string;
    voiceConversationId: string;
    lifecycleState: string;
    reason?: string;
  }): Promise<void> {
    await this.ingest.ingestInternalConversationEvent({
      organizationId: params.organizationId,
      externalEventId: `${params.voiceConversationId}:lifecycle:${params.lifecycleState}:${Date.now()}`,
      payload: {
        voiceConversationId: params.voiceConversationId,
        lifecycleState: params.lifecycleState,
        reason: params.reason ?? null,
        source: VOICE_WEBHOOK_EVENT_TYPES.INTERNAL_CONVERSATION,
      },
    });
  }
}
