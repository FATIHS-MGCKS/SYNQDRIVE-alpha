import { VoiceMetricsService } from './voice-metrics.service';
import { TripMetricsService } from './trip-metrics.service';

describe('VoiceMetricsService', () => {
  it('registers low-cardinality voice metrics without tenant labels', async () => {
    const tripMetrics = new TripMetricsService();
    const metrics = new VoiceMetricsService(tripMetrics);

    metrics.webhookIngest.inc({ provider: 'TWILIO', result: 'accepted' });
    metrics.protectionBlocks.inc({ reason_code: 'MONTHLY_BUDGET_EXCEEDED' });
    metrics.mcpErrors.inc({ error_code: 'RateLimited' });

    const serialized = await tripMetrics.registry.metrics();
    expect(serialized).toContain('synqdrive_voice_webhook_ingest_total');
    expect(serialized).toContain('synqdrive_voice_protection_blocks_total');
    expect(serialized).not.toContain('organizationId');
  });
});
