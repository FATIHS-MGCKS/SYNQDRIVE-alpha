import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from './trip-metrics.service';

/**
 * Low-cardinality Prometheus metrics for Voice AI platform operations.
 * Labels never include organizationId, phone numbers, or conversation IDs.
 */
@Injectable()
export class VoiceMetricsService implements OnModuleInit {
  readonly webhookIngest: Counter<string>;
  readonly webhookSignatureInvalid: Counter<string>;
  readonly webhookProcessing: Counter<string>;
  readonly webhookDlq: Counter<string>;
  readonly webhookLagSeconds: Histogram<string>;
  readonly mcpToolCalls: Counter<string>;
  readonly mcpErrors: Counter<string>;
  readonly mcpRateLimited: Counter<string>;
  readonly protectionBlocks: Counter<string>;
  readonly callLifecycle: Counter<string>;
  readonly providerErrors: Counter<string>;
  readonly provisioningFailures: Counter<string>;
  readonly transferFailures: Counter<string>;
  readonly usageRecorded: Counter<string>;
  readonly webhookBacklog: Gauge<string>;
  readonly webhookDlqGauge: Gauge<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.webhookIngest = new Counter({
      name: 'synqdrive_voice_webhook_ingest_total',
      help: 'Voice webhook ingest outcomes',
      labelNames: ['provider', 'result'],
      registers: [register],
    });

    this.webhookSignatureInvalid = new Counter({
      name: 'synqdrive_voice_webhook_signature_invalid_total',
      help: 'Voice webhook signature validation failures',
      labelNames: ['provider'],
      registers: [register],
    });

    this.webhookProcessing = new Counter({
      name: 'synqdrive_voice_webhook_processing_total',
      help: 'Voice webhook queue processing outcomes',
      labelNames: ['event_type', 'outcome'],
      registers: [register],
    });

    this.webhookDlq = new Counter({
      name: 'synqdrive_voice_webhook_dlq_total',
      help: 'Voice webhook events moved to dead letter',
      labelNames: ['error_class'],
      registers: [register],
    });

    this.webhookLagSeconds = new Histogram({
      name: 'synqdrive_voice_webhook_lag_seconds',
      help: 'Delay between webhook receive and processing completion',
      labelNames: ['provider'],
      buckets: [0.25, 0.5, 1, 2, 5, 15, 60, 300],
      registers: [register],
    });

    this.mcpToolCalls = new Counter({
      name: 'synqdrive_voice_mcp_tool_calls_total',
      help: 'Voice MCP tool invocations',
      labelNames: ['tool', 'risk_class', 'outcome'],
      registers: [register],
    });

    this.mcpErrors = new Counter({
      name: 'synqdrive_voice_mcp_errors_total',
      help: 'Voice MCP protocol errors',
      labelNames: ['error_code'],
      registers: [register],
    });

    this.mcpRateLimited = new Counter({
      name: 'synqdrive_voice_mcp_rate_limited_total',
      help: 'Voice MCP rate limit or replay rejections',
      labelNames: ['reason'],
      registers: [register],
    });

    this.protectionBlocks = new Counter({
      name: 'synqdrive_voice_protection_blocks_total',
      help: 'Voice budget/abuse protection blocks',
      labelNames: ['reason_code'],
      registers: [register],
    });

    this.callLifecycle = new Counter({
      name: 'synqdrive_voice_call_lifecycle_total',
      help: 'Voice conversation lifecycle transitions',
      labelNames: ['outcome', 'direction'],
      registers: [register],
    });

    this.providerErrors = new Counter({
      name: 'synqdrive_voice_provider_errors_total',
      help: 'Voice provider integration errors',
      labelNames: ['provider', 'operation'],
      registers: [register],
    });

    this.provisioningFailures = new Counter({
      name: 'synqdrive_voice_provisioning_failures_total',
      help: 'Voice provisioning job failures',
      labelNames: ['job_type', 'step'],
      registers: [register],
    });

    this.transferFailures = new Counter({
      name: 'synqdrive_voice_transfer_failures_total',
      help: 'Voice call transfer failures',
      labelNames: ['reason'],
      registers: [register],
    });

    this.usageRecorded = new Counter({
      name: 'synqdrive_voice_usage_recorded_total',
      help: 'Voice usage ledger recordings',
      labelNames: ['direction'],
      registers: [register],
    });

    this.webhookBacklog = new Gauge({
      name: 'synqdrive_voice_webhook_backlog',
      help: 'Voice webhook processing backlog by status',
      labelNames: ['status'],
      registers: [register],
    });

    this.webhookDlqGauge = new Gauge({
      name: 'synqdrive_voice_webhook_dlq_count',
      help: 'Voice webhook dead-letter event count (24h window)',
      registers: [register],
    });
  }

  onModuleInit(): void {
    // Metrics registered in constructor via shared registry.
  }

  observeWebhookLag(provider: string, receivedAt: Date, processedAt: Date): void {
    const lagSeconds = Math.max(0, (processedAt.getTime() - receivedAt.getTime()) / 1000);
    this.webhookLagSeconds.observe({ provider }, lagSeconds);
  }
}
