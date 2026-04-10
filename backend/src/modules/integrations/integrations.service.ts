import { Injectable, NotFoundException } from '@nestjs/common';
import { Integration, OrganizationIntegration, IntegrationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const INTEGRATION_TYPE_LABELS: Record<string, string> = {
  DIMO: 'DIMO',
  STRIPE: 'Stripe',
  WOOCOMMERCE: 'WooCommerce',
  SHOPIFY: 'Shopify',
};

const SCOPE_LABELS: Record<string, string> = {
  PLATFORM: 'Platform',
  ORGANIZATION: 'Organization',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Connected',
  INACTIVE: 'Disconnected',
  ERROR: 'Error',
};

function maskCredential(value: string): string {
  if (!value || value.length <= 8) return '••••••••';
  return '••••••••' + value.slice(-8);
}

function computeSyncStatus(
  status: IntegrationStatus,
  lastSyncAt: Date | null,
): 'Synced' | 'Pending' | 'Failed' {
  if (status === 'ERROR') return 'Failed';
  if (status === 'ACTIVE' && lastSyncAt) return 'Synced';
  return 'Pending';
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const integrations = await this.prisma.integration.findMany({
      include: {
        orgIntegrations: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
      orderBy: [{ scope: 'asc' }, { type: 'asc' }],
    });

    return integrations.map((i) => ({
      id: i.id,
      type: INTEGRATION_TYPE_LABELS[i.type] ?? i.type,
      name: i.name,
      description: i.description ?? '',
      scope: SCOPE_LABELS[i.scope] ?? i.scope,
      status: STATUS_LABELS['ACTIVE'] ?? 'Connected',
      connectedOrgsCount: i.orgIntegrations.length,
    }));
  }

  async findByOrganization(orgId: string) {
    const orgIntegrations = await this.prisma.organizationIntegration.findMany({
      where: { organizationId: orgId },
      include: { integration: true },
      orderBy: { createdAt: 'desc' },
    });

    return orgIntegrations.map((oi) => {
      const creds = (oi.credentials ?? {}) as Record<string, unknown>;
      const apiKeyRaw = typeof creds.apiKey === 'string' ? creds.apiKey : '';

      return {
        id: oi.id,
        name: oi.integration.name,
        status: STATUS_LABELS[oi.status] ?? oi.status,
        apiKey: maskCredential(apiKeyRaw),
        lastSync: oi.lastSyncAt ? oi.lastSyncAt.toISOString() : '',
        syncStatus: computeSyncStatus(oi.status, oi.lastSyncAt),
      };
    });
  }

  async getIntegrationStats() {
    const [total, connected, errored] = await Promise.all([
      this.prisma.organizationIntegration.count(),
      this.prisma.organizationIntegration.count({ where: { status: 'ACTIVE' } }),
      this.prisma.organizationIntegration.count({ where: { status: 'ERROR' } }),
    ]);

    return { total, connected, error: errored };
  }

  async updateSyncStatus(orgIntegrationId: string, lastSyncAt: Date): Promise<OrganizationIntegration> {
    const existing = await this.prisma.organizationIntegration.findUnique({
      where: { id: orgIntegrationId },
    });
    if (!existing) {
      throw new NotFoundException('Organization integration not found');
    }

    return this.prisma.organizationIntegration.update({
      where: { id: orgIntegrationId },
      data: { lastSyncAt },
    });
  }

  async connect(
    orgId: string,
    integrationId: string,
    credentials: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<OrganizationIntegration> {
    await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    await this.prisma.integration.findUniqueOrThrow({ where: { id: integrationId } });

    return this.prisma.organizationIntegration.upsert({
      where: {
        organizationId_integrationId: { organizationId: orgId, integrationId },
      },
      create: {
        organizationId: orgId,
        integrationId,
        credentials: credentials as object,
        configJson: (config ?? {}) as object,
        status: 'ACTIVE' as IntegrationStatus,
        connectedAt: new Date(),
      },
      update: {
        credentials: credentials as object,
        configJson: (config ?? {}) as object,
        status: 'ACTIVE' as IntegrationStatus,
        connectedAt: new Date(),
        disconnectedAt: null,
        errorMessage: null,
      },
    });
  }

  async disconnect(orgId: string, integrationId: string): Promise<OrganizationIntegration> {
    const existing = await this.prisma.organizationIntegration.findUnique({
      where: {
        organizationId_integrationId: { organizationId: orgId, integrationId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Organization integration not found');
    }
    return this.prisma.organizationIntegration.update({
      where: { id: existing.id },
      data: {
        status: 'INACTIVE' as IntegrationStatus,
        disconnectedAt: new Date(),
      },
    });
  }

  async updateStatus(
    orgIntegrationId: string,
    status: IntegrationStatus,
    errorMessage?: string,
  ): Promise<OrganizationIntegration> {
    return this.prisma.organizationIntegration.update({
      where: { id: orgIntegrationId },
      data: {
        status,
        errorMessage: errorMessage ?? null,
        ...(status === 'INACTIVE' && { disconnectedAt: new Date() }),
      },
    });
  }
}
