import { Controller, Get } from '@nestjs/common';
import { LlmGatewayService } from './llm/llm-gateway.service';

@Controller('ai')
export class AiHealthController {
  constructor(private readonly llm: LlmGatewayService) {}

  @Get('health')
  health() {
    return {
      configured: this.llm.isConfigured(),
      provider: this.llm.configuredProvider,
      activeProviderId: this.llm.isConfigured() ? this.llm.activeProviderId : null,
      streamingEnabled: this.llm.isStreamingEnabled(),
    };
  }
}
