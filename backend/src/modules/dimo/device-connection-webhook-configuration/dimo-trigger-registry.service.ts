import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import dimoConfig from '@config/dimo.config';
import { DimoTriggersService } from '../dimo-triggers.service';
import {
  classifyDimoTriggerWebhook,
  normalizeUrl,
} from './dimo-trigger-webhook.classifier';
import type { NormalizedDimoTriggerWebhook } from './device-connection-webhook-configuration.types';
import {
  DEVICE_CONNECTION_TRIGGER_REGISTRY_CACHE_TTL_MS,
  DEVICE_CONNECTION_TRIGGER_REGISTRY_SCOPE,
} from './device-connection-webhook-configuration.policy';

export interface TriggerRegistrySnapshot {
  webhooks: NormalizedDimoTriggerWebhook[];
  callbackUrl: string | null;
  syncedAt: Date;
  expiresAt: Date;
  source: 'DIMO_TRIGGER_API' | 'REGISTRY_CACHE';
  syncError: string | null;
}

@Injectable()
export class DimoTriggerRegistryService {
  private readonly logger = new Logger(DimoTriggerRegistryService.name);
  private inFlightSync: Promise<TriggerRegistrySnapshot> | null = null;

  constructor(
    @Inject(dimoConfig.KEY) private readonly conf: ConfigType<typeof dimoConfig>,
    private readonly prisma: PrismaService,
    private readonly triggers: DimoTriggersService,
  ) {}

  resolveCallbackUrl(): string {
    const base = (this.conf.webhookBaseUrl ?? '').trim().replace(/\/+$/, '');
    return `${base}/api/v1/webhooks/dimo`;
  }

  async getRegistrySnapshot(opts?: { forceRefresh?: boolean }): Promise<TriggerRegistrySnapshot> {
    const callbackUrl = this.resolveCallbackUrl();
    if (!opts?.forceRefresh) {
      const cached = await this.readCache();
      if (cached && cached.expiresAt.getTime() > Date.now()) {
        return cached;
      }
    }

    if (!this.inFlightSync) {
      this.inFlightSync = this.syncFromDimo(callbackUrl).finally(() => {
        this.inFlightSync = null;
      });
    }
    return this.inFlightSync;
  }

  private async readCache(): Promise<TriggerRegistrySnapshot | null> {
    const row = await this.prisma.deviceConnectionTriggerRegistryCache.findUnique({
      where: { scopeKey: DEVICE_CONNECTION_TRIGGER_REGISTRY_SCOPE },
    });
    if (!row) return null;

    const webhooks = this.parseWebhooksJson(row.webhooksJson, row.callbackUrl);
    return {
      webhooks,
      callbackUrl: row.callbackUrl,
      syncedAt: row.syncedAt,
      expiresAt: row.expiresAt,
      source: 'REGISTRY_CACHE',
      syncError: row.syncError,
    };
  }

  private async syncFromDimo(callbackUrl: string): Promise<TriggerRegistrySnapshot> {
    const stale = await this.readCache();
    const { webhooks: raw, error } = await this.triggers.listWebhooksDetailed();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEVICE_CONNECTION_TRIGGER_REGISTRY_CACHE_TTL_MS);

    if (error) {
      if (stale && stale.expiresAt.getTime() > now.getTime() - DEVICE_CONNECTION_TRIGGER_REGISTRY_CACHE_TTL_MS) {
        this.logger.warn(`DIMO trigger sync failed — serving stale cache: ${error.message}`);
        return {
          ...stale,
          syncError: error.message,
          source: 'REGISTRY_CACHE',
        };
      }

      await this.writeCache({
        callbackUrl,
        webhooks: [],
        syncedAt: now,
        expiresAt,
        syncError: error.message,
      });

      return {
        webhooks: [],
        callbackUrl,
        syncedAt: now,
        expiresAt,
        source: 'DIMO_TRIGGER_API',
        syncError: error.message,
      };
    }

    const webhooks = raw.map((w) =>
      classifyDimoTriggerWebhook(w as Record<string, unknown>, callbackUrl),
    );

    await this.writeCache({
      callbackUrl,
      webhooks,
      syncedAt: now,
      expiresAt,
      syncError: null,
    });

    return {
      webhooks,
      callbackUrl,
      syncedAt: now,
      expiresAt,
      source: 'DIMO_TRIGGER_API',
      syncError: null,
    };
  }

  private async writeCache(input: {
    callbackUrl: string;
    webhooks: NormalizedDimoTriggerWebhook[];
    syncedAt: Date;
    expiresAt: Date;
    syncError: string | null;
  }): Promise<void> {
    await this.prisma.deviceConnectionTriggerRegistryCache.upsert({
      where: { scopeKey: DEVICE_CONNECTION_TRIGGER_REGISTRY_SCOPE },
      create: {
        scopeKey: DEVICE_CONNECTION_TRIGGER_REGISTRY_SCOPE,
        callbackUrl: input.callbackUrl,
        webhooksJson: input.webhooks as unknown as Prisma.InputJsonValue,
        syncedAt: input.syncedAt,
        expiresAt: input.expiresAt,
        syncError: input.syncError,
      },
      update: {
        callbackUrl: input.callbackUrl,
        webhooksJson: input.webhooks as unknown as Prisma.InputJsonValue,
        syncedAt: input.syncedAt,
        expiresAt: input.expiresAt,
        syncError: input.syncError,
      },
    });
  }

  private parseWebhooksJson(
    json: Prisma.JsonValue,
    callbackUrl: string | null,
  ): NormalizedDimoTriggerWebhook[] {
    if (!Array.isArray(json)) return [];
    return json.map((entry) =>
      classifyDimoTriggerWebhook(entry as Record<string, unknown>, callbackUrl),
    );
  }
}

export function callbackUrlsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  return normalizeUrl(a) === normalizeUrl(b);
}
