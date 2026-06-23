import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  WhatsAppParsedWebhook,
  WhatsAppProviderInterface,
  WhatsAppProviderRuntimeConfig,
  WhatsAppProviderSendResult,
  WhatsAppSendMetadata,
} from './whatsapp-provider.interface';
import { WhatsAppProviderNotConfiguredException } from '../utils/whatsapp-errors';

/**
 * Meta WhatsApp Cloud API provider.
 *
 * STUB behaviour: when access token or phoneNumberId is missing, all outbound
 * operations throw WHATSAPP_PROVIDER_NOT_CONFIGURED — never silent success.
 *
 * Credentials are resolved server-side only (env or per-org env suffix).
 */
@Injectable()
export class MetaWhatsAppCloudProvider implements WhatsAppProviderInterface {
  readonly providerName = 'meta_cloud_api';
  readonly isStub = false;
  private readonly logger = new Logger(MetaWhatsAppCloudProvider.name);

  isConfigured(config: WhatsAppProviderRuntimeConfig): boolean {
    return Boolean(config.accessToken && config.phoneNumberId);
  }

  private ensureConfigured(config: WhatsAppProviderRuntimeConfig): void {
    if (!this.isConfigured(config)) {
      throw new WhatsAppProviderNotConfiguredException(
        'Meta WhatsApp Cloud API credentials are missing. Configure phoneNumberId and access token on the server.',
      );
    }
  }

  private graphUrl(config: WhatsAppProviderRuntimeConfig, path: string): string {
    return `https://graph.facebook.com/${config.metaApiVersion}/${path}`;
  }

  async sendTextMessage(
    config: WhatsAppProviderRuntimeConfig,
    toPhoneNumber: string,
    body: string,
    _metadata: WhatsAppSendMetadata,
  ): Promise<WhatsAppProviderSendResult> {
    this.ensureConfigured(config);
    const to = toPhoneNumber.replace(/\D/g, '');

    try {
      const res = await fetch(this.graphUrl(config, `${config.phoneNumberId}/messages`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      });

      const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
      if (!res.ok) {
        return {
          providerMessageId: '',
          status: 'FAILED',
          failureReason: json.error?.message ?? `HTTP ${res.status}`,
        };
      }

      const providerMessageId = json.messages?.[0]?.id ?? '';
      return { providerMessageId, status: providerMessageId ? 'SENT' : 'FAILED' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown provider error';
      this.logger.error(`Meta sendTextMessage failed: ${message}`);
      return { providerMessageId: '', status: 'FAILED', failureReason: message };
    }
  }

  async sendTemplateMessage(
    config: WhatsAppProviderRuntimeConfig,
    toPhoneNumber: string,
    templateName: string,
    language: string,
    variables: Record<string, string>,
    _metadata: WhatsAppSendMetadata,
  ): Promise<WhatsAppProviderSendResult> {
    this.ensureConfigured(config);
    const to = toPhoneNumber.replace(/\D/g, '');
    const components =
      Object.keys(variables).length > 0
        ? [
            {
              type: 'body',
              parameters: Object.values(variables).map((v) => ({
                type: 'text',
                text: v,
              })),
            },
          ]
        : undefined;

    try {
      const res = await fetch(this.graphUrl(config, `${config.phoneNumberId}/messages`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            ...(components ? { components } : {}),
          },
        }),
      });

      const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
      if (!res.ok) {
        return {
          providerMessageId: '',
          status: 'FAILED',
          failureReason: json.error?.message ?? `HTTP ${res.status}`,
        };
      }

      const providerMessageId = json.messages?.[0]?.id ?? '';
      return { providerMessageId, status: providerMessageId ? 'SENT' : 'FAILED' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown provider error';
      return { providerMessageId: '', status: 'FAILED', failureReason: message };
    }
  }

  async markRead(config: WhatsAppProviderRuntimeConfig, providerMessageId: string): Promise<void> {
    this.ensureConfigured(config);
    await fetch(this.graphUrl(config, `${config.phoneNumberId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: providerMessageId,
      }),
    });
  }

  verifyWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    config: WhatsAppProviderRuntimeConfig,
  ): string | null {
    if (mode === 'subscribe' && token && challenge && config.webhookVerifyToken) {
      if (token === config.webhookVerifyToken) return challenge;
    }
    return null;
  }

  parseWebhook(
    payload: unknown,
    _headers: Record<string, string | string[] | undefined>,
  ): WhatsAppParsedWebhook {
    const body = payload as {
      object?: string;
      entry?: Array<{
        id?: string;
        changes?: Array<{
          field?: string;
          value?: {
            metadata?: { phone_number_id?: string; display_phone_number?: string };
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              type?: string;
              text?: { body?: string };
            }>;
            statuses?: Array<{
              id: string;
              status: string;
              timestamp: string;
              errors?: Array<{ title?: string; message?: string }>;
            }>;
          };
        }>;
      }>;
    };

    const entries: WhatsAppParsedWebhook['entries'] = [];
    let phoneNumberId: string | undefined;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;
        phoneNumberId = value.metadata?.phone_number_id ?? phoneNumberId;

        for (const msg of value.messages ?? []) {
          if (msg.type !== 'text' || !msg.text?.body) continue;
          entries.push({
            externalEventId: `msg:${msg.id}`,
            eventType: 'messages',
            inboundMessage: {
              providerMessageId: msg.id,
              fromPhone: msg.from,
              body: msg.text.body,
              timestamp: new Date(Number(msg.timestamp) * 1000),
            },
          });
        }

        for (const st of value.statuses ?? []) {
          const mapped = this.mapDeliveryStatus(st.status);
          if (!mapped) continue;
          entries.push({
            externalEventId: `status:${st.id}:${st.status}:${st.timestamp}`,
            eventType: 'statuses',
            statusUpdate: {
              providerMessageId: st.id,
              status: mapped,
              timestamp: new Date(Number(st.timestamp) * 1000),
              failureReason: st.errors?.[0]?.message ?? st.errors?.[0]?.title,
            },
          });
        }
      }
    }

    return { phoneNumberId, entries };
  }

  private mapDeliveryStatus(status: string): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | null {
    switch (status) {
      case 'sent':
        return 'SENT';
      case 'delivered':
        return 'DELIVERED';
      case 'read':
        return 'READ';
      case 'failed':
        return 'FAILED';
      default:
        return null;
    }
  }

  validateSignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    config: WhatsAppProviderRuntimeConfig,
  ): boolean {
    if (!config.appSecret) {
      return process.env.NODE_ENV !== 'production';
    }

    const signature = headers['x-hub-signature-256'];
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) return false;

    const expected =
      'sha256=' + crypto.createHmac('sha256', config.appSecret).update(rawBody).digest('hex');

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(sig);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  async healthCheck(config: WhatsAppProviderRuntimeConfig): Promise<{ ok: boolean; detail?: string }> {
    if (!this.isConfigured(config)) {
      return { ok: false, detail: 'NOT_CONFIGURED' };
    }
    try {
      const res = await fetch(this.graphUrl(config, config.phoneNumberId!), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      return { ok: res.ok, detail: res.ok ? 'CONNECTED' : `HTTP_${res.status}` };
    } catch (err: unknown) {
      return { ok: false, detail: err instanceof Error ? err.message : 'ERROR' };
    }
  }
}
