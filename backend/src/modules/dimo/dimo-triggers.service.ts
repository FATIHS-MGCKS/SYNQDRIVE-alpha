import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios from 'axios';
import { DimoAuthService } from './dimo-auth.service';
import dimoConfig from '@config/dimo.config';
import { isBlockedEngineWebhookSignal } from './dimo-webhook-payload.util';

/**
 * DIMO Vehicle Triggers API client (ops/helpers only).
 * Webhook registration and vehicle subscriptions are configured manually in the
 * DIMO Developer Console — SynqDrive does not auto-bootstrap webhooks on startup.
 */
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
    const result = await this.listWebhooksDetailed();
    return result.webhooks;
  }

  async listWebhooksDetailed(): Promise<{
    webhooks: any[];
    error: { code: string; message: string } | null;
  }> {
    try {
      const jwt = await this.auth.getDeveloperJwt();
      const res = await axios.get(`${this.triggersApiUrl}/v1/webhooks`, {
        headers: { Authorization: `Bearer ${jwt}` },
        timeout: this.conf.requestTimeoutMs,
      });
      const webhooks = res.data?.webhooks ?? res.data ?? [];
      return { webhooks: Array.isArray(webhooks) ? webhooks : [], error: null };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.warn(`List webhooks failed: ${message}`);
      return {
        webhooks: [],
        error: { code: 'DIMO_API_UNAVAILABLE', message },
      };
    }
  }

  async getVehicleWebhookSubscriptions(tokenId: number): Promise<{
    subscriptions: unknown;
    error: { code: string; message: string } | null;
  }> {
    try {
      const jwt = await this.auth.getDeveloperJwt();
      const contract = this.conf.vehicleNftContractAddress;
      const subject = `did:erc721:137:${contract}:${tokenId}`;
      const res = await axios.get(`${this.triggersApiUrl}/v1/webhooks/vehicles/${subject}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        timeout: this.conf.requestTimeoutMs,
      });
      return { subscriptions: res.data, error: null };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.warn(`List vehicle webhook subscriptions failed for tokenId=${tokenId}: ${message}`);
      return {
        subscriptions: null,
        error: { code: 'DIMO_API_UNAVAILABLE', message },
      };
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
    const allowedSignals = signals.filter((s) => !isBlockedEngineWebhookSignal(s));
    if (allowedSignals.length === 0) {
      this.logger.warn(
        `Subscribe vehicle skipped for tokenId=${tokenId}: no allowed signals (RPM/engine blocked)`,
      );
      return null;
    }
    if (allowedSignals.length < signals.length) {
      const blocked = signals.filter((s) => isBlockedEngineWebhookSignal(s));
      this.logger.warn(
        `Filtered blocked engine/RPM signals for tokenId=${tokenId}: ${blocked.join(', ')}`,
      );
    }

    try {
      const jwt = await this.auth.getDeveloperJwt();
      const res = await axios.post(
        `${this.triggersApiUrl}/v1/webhooks/${webhookId}/vehicles/${tokenId}`,
        { signals: allowedSignals },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      this.logger.log(
        `Subscribed vehicle ${tokenId} to webhook ${webhookId} for signals: ${allowedSignals.join(', ')}`,
      );
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

  /** Subscribe a vehicle to OBD plug/unplug state changes (connectivity/tamper). */
  async registerDeviceConnectionTrigger(webhookId: string, tokenId: number): Promise<void> {
    await this.subscribeVehicle(webhookId, tokenId, ['obdIsPluggedIn']);
  }

  async registerAllTriggersForVehicle(webhookId: string, tokenId: number): Promise<void> {
    await this.subscribeVehicle(webhookId, tokenId, [
      'obdDTCList',
      'speed',
      'isIgnitionOn',
      'obdIsPluggedIn',
    ]);
    this.logger.log(`All triggers registered for tokenId=${tokenId}`);
  }
}
