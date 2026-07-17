import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isVoiceMcpGatewayEnabled,
} from '@modules/voice-mcp-gateway/voice-mcp-gateway.config';
import { isVoiceWebhookIngestionEnabled } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.config';

export type VoiceSecretCheck = {
  key: string;
  configured: boolean;
  required: boolean;
};

@Injectable()
export class VoiceSecretsStartupService implements OnModuleInit {
  private readonly logger = new Logger(VoiceSecretsStartupService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const checks = this.evaluate(process.env);
    const missingRequired = checks.filter((check) => check.required && !check.configured);

    for (const check of checks) {
      this.logger.log(
        `Voice secret check ${check.key}: ${check.configured ? 'configured' : check.required ? 'MISSING' : 'optional/not-set'}`,
      );
    }

    if (missingRequired.length > 0) {
      const keys = missingRequired.map((check) => check.key).join(', ');
      throw new Error(`Voice AI production secrets missing: ${keys}`);
    }
  }

  evaluate(env: NodeJS.ProcessEnv = process.env): VoiceSecretCheck[] {
    const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';
    const mcpEnabled = isVoiceMcpGatewayEnabled(env);
    const webhookEnabled = isVoiceWebhookIngestionEnabled(env);

    const checks: VoiceSecretCheck[] = [
      {
        key: 'ELEVENLABS_API_KEY',
        configured: Boolean(env.ELEVENLABS_API_KEY?.trim()),
        required: isProd,
      },
      {
        key: 'ELEVENLABS_WEBHOOK_SECRET',
        configured: Boolean(env.ELEVENLABS_WEBHOOK_SECRET?.trim()),
        required: isProd && webhookEnabled,
      },
      {
        key: 'TWILIO_AUTH_TOKEN',
        configured: Boolean(env.TWILIO_AUTH_TOKEN?.trim()),
        required: isProd && webhookEnabled,
      },
      {
        key: 'VOICE_MCP_TOKEN_SECRET',
        configured: Boolean(env.VOICE_MCP_TOKEN_SECRET?.trim()),
        required: isProd && mcpEnabled,
      },
    ];

    if (isProd && mcpEnabled && !env.VOICE_MCP_TOKEN_SECRET?.trim()) {
      checks.find((check) => check.key === 'VOICE_MCP_TOKEN_SECRET')!.configured = false;
    }

    return checks;
  }
}
