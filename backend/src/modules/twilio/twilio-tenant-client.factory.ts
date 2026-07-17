import { Injectable, Logger } from '@nestjs/common';
import {
  VoiceControlPlaneProvider,
  VoiceProviderAccountStatus,
  VoiceProviderAccountType,
} from '@prisma/client';
import type { Twilio } from 'twilio';
import { createTwilioClient, TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TwilioInvalidConfigurationError,
  TwilioRegionMismatchError,
  TwilioResourceNotFoundError,
  TwilioTenantIsolationViolationError,
} from './errors/twilio-provider.errors';
import { SecretRefResolver } from './secrets/secret-ref.resolver';

const TENANT_CLIENT_CACHE_TTL_MS = 60_000;

type TenantClientCacheEntry = {
  client: Twilio;
  secretRef: string;
  providerAccountId: string;
  expiresAt: number;
};

@Injectable()
export class TwilioTenantClientFactory {
  private readonly logger = new Logger(TwilioTenantClientFactory.name);
  private readonly cache = new Map<string, TenantClientCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretResolver: SecretRefResolver,
  ) {}

  async isConfiguredForOrganization(organizationId: string): Promise<boolean> {
    const account = await this.findTenantAccount(organizationId);
    return Boolean(account?.secretRef?.trim());
  }

  async getClientForOrganization(organizationId: string): Promise<Twilio> {
    const account = await this.loadTenantAccountOrThrow(organizationId);
    this.assertTenantRegion(account.region, account.edge);

    const secretRef = account.secretRef?.trim();
    if (!secretRef) {
      throw new TwilioInvalidConfigurationError(
        'Twilio subaccount secret reference is missing for organization.',
      );
    }

    const cached = this.cache.get(organizationId);
    const now = Date.now();
    if (
      cached &&
      cached.secretRef === secretRef &&
      cached.providerAccountId === account.id &&
      cached.expiresAt > now
    ) {
      return cached.client;
    }

    const credentials = await this.secretResolver.resolveTwilioSubaccountCredentials(secretRef);
    const client = createTwilioClient({
      accountSid: credentials.accountSid,
      apiKeySid: credentials.apiKeySid,
      apiKeySecret: credentials.apiKeySecret,
      region: TWILIO_DEFAULT_REGION,
      edge: TWILIO_DEFAULT_EDGE,
    });

    if (!client) {
      throw new TwilioInvalidConfigurationError('Twilio tenant credentials are incomplete.');
    }

    this.cache.set(organizationId, {
      client,
      secretRef,
      providerAccountId: account.id,
      expiresAt: now + TENANT_CLIENT_CACHE_TTL_MS,
    });

    return client;
  }

  invalidateOrganization(organizationId: string): void {
    this.cache.delete(organizationId);
  }

  resetCacheForTests(): void {
    this.cache.clear();
  }

  private async findTenantAccount(organizationId: string) {
    return this.prisma.voiceProviderAccount.findFirst({
      where: {
        organizationId,
        provider: VoiceControlPlaneProvider.TWILIO,
        accountType: VoiceProviderAccountType.SUBACCOUNT,
        archivedAt: null,
        status: {
          in: [
            VoiceProviderAccountStatus.ACTIVE,
            VoiceProviderAccountStatus.PENDING,
            VoiceProviderAccountStatus.DEGRADED,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async loadTenantAccountOrThrow(organizationId: string) {
    const account = await this.findTenantAccount(organizationId);
    if (!account) {
      throw new TwilioResourceNotFoundError(
        'No Twilio subaccount is configured for this organization.',
      );
    }
    if (account.organizationId !== organizationId) {
      throw new TwilioTenantIsolationViolationError();
    }
    return account;
  }

  private assertTenantRegion(region: string | null | undefined, edge: string | null | undefined): void {
    const normalizedRegion = region?.trim().toLowerCase() ?? TWILIO_DEFAULT_REGION;
    const normalizedEdge = edge?.trim().toLowerCase() ?? TWILIO_DEFAULT_EDGE;
    if (normalizedRegion !== TWILIO_DEFAULT_REGION || normalizedEdge !== TWILIO_DEFAULT_EDGE) {
      throw new TwilioRegionMismatchError(
        `Twilio subaccount must use region ${TWILIO_DEFAULT_REGION} and edge ${TWILIO_DEFAULT_EDGE}.`,
      );
    }
  }

  logProviderFailure(organizationId: string, operation: string, err: unknown): void {
    const message = err instanceof Error ? err.message : 'unknown';
    this.logger.warn(
      `Twilio tenant operation failed org=${organizationId} op=${operation} err=${message.replace(/apiKeySecret=\S+/gi, 'apiKeySecret=[REDACTED]')}`,
    );
  }
}
