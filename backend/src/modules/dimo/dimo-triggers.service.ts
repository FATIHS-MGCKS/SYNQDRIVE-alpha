import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios from 'axios';
import { DimoAuthService } from './dimo-auth.service';
import dimoConfig from '@config/dimo.config';

interface WebhookDefinition {
  id?: string;
  name: string;
  url: string;
  events: string[];
}

@Injectable()
export class DimoTriggersService {
  private readonly logger = new Logger(DimoTriggersService.name);
  private readonly triggersApiUrl: string;

  constructor(
    @Inject(dimoConfig.KEY) private readonly conf: ConfigType<typeof dimoConfig>,
    private readonly auth: DimoAuthService,
  ) {
    const env = (this.conf as any).dimoEnv ?? 'production';
    this.triggersApiUrl = env === 'dev'
      ? 'https://vehicle-triggers-api.dev.dimo.zone'
      : 'https://vehicle-triggers-api.dimo.zone';
    this.logger.log(`Vehicle Triggers API: ${this.triggersApiUrl}`);
  }

  async listWebhooks(): Promise<any[]> {
    try {
      const jwt = await this.auth.getDeveloperJwt();
      const res = await axios.get(`${this.triggersApiUrl}/v1/webhooks`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      return res.data?.webhooks ?? res.data ?? [];
    } catch (err: any) {
      this.logger.warn(`List webhooks failed: ${err.message}`);
      return [];
    }
  }

  async createWebhook(name: string, callbackUrl: string): Promise<any> {
    try {
      const jwt = await this.auth.getDeveloperJwt();
      const res = await axios.post(
        `${this.triggersApiUrl}/v1/webhooks`,
        {
          name,
          url: callbackUrl,
        },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      this.logger.log(`Created webhook: ${name} -> ${callbackUrl}`);
      return res.data;
    } catch (err: any) {
      this.logger.warn(`Create webhook failed: ${err.message}`);
      return null;
    }
  }

  async getAvailableSignalNames(): Promise<string[]> {
    try {
      const jwt = await this.auth.getDeveloperJwt();
      const res = await axios.get(`${this.triggersApiUrl}/v1/webhooks/signals`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      return res.data?.signals ?? res.data ?? [];
    } catch (err: any) {
      this.logger.warn(`Get signal names failed: ${err.message}`);
      return [];
    }
  }

  async subscribeVehicle(webhookId: string, tokenId: number, signals: string[]): Promise<any> {
    try {
      const jwt = await this.auth.getDeveloperJwt();
      const res = await axios.post(
        `${this.triggersApiUrl}/v1/webhooks/${webhookId}/vehicles/${tokenId}`,
        { signals },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      this.logger.log(`Subscribed vehicle ${tokenId} to webhook ${webhookId} for signals: ${signals.join(', ')}`);
      return res.data;
    } catch (err: any) {
      this.logger.warn(`Subscribe vehicle failed for tokenId=${tokenId}: ${err.message}`);
      return null;
    }
  }

  async ensureWebhookRegistered(callbackUrl: string): Promise<string | null> {
    const existing = await this.listWebhooks();
    const found = existing.find((w: any) => w.url === callbackUrl || w.name === 'synqdrive-events');
    if (found) {
      this.logger.log(`Webhook already registered: id=${found.id}`);
      return found.id;
    }

    const created = await this.createWebhook('synqdrive-events', callbackUrl);
    return created?.id ?? null;
  }

  async registerDtcTrigger(webhookId: string, tokenId: number): Promise<void> {
    await this.subscribeVehicle(webhookId, tokenId, ['obdDTCList']);
  }

  async registerAllTriggersForVehicle(webhookId: string, tokenId: number): Promise<void> {
    await this.subscribeVehicle(webhookId, tokenId, [
      'obdDTCList',
      'speed',
      'isIgnitionOn',
    ]);
    this.logger.log(`All triggers registered for tokenId=${tokenId}`);
  }
}
