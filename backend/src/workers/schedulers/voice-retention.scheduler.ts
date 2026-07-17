import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { VoiceRetentionService } from '@modules/voice-assistant/security/voice-retention.service';

@Injectable()
export class VoiceRetentionScheduler {
  private readonly logger = new Logger(VoiceRetentionScheduler.name);
  private running = false;

  constructor(
    private readonly retention: VoiceRetentionService,
    private readonly config: ConfigService,
  ) {}

  @Cron('15 4 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.config.get<boolean>('voice.retention.enabled', true)) {
      return;
    }
    await this.runOnce('cron');
  }

  async runOnce(trigger: 'cron' | 'manual' = 'manual') {
    if (this.running) {
      this.logger.warn('Voice retention run already in progress — skipping.');
      return [];
    }
    this.running = true;
    try {
      const results = await this.retention.purgeAllOrganizations();
      this.logger.log(
        `Voice retention ${trigger} complete — ${results.length} org(s) purged.`,
      );
      return results;
    } finally {
      this.running = false;
    }
  }
}
