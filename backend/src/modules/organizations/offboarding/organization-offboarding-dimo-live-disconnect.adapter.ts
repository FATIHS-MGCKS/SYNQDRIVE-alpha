import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { Inject } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import axios from 'axios';
import type { OrganizationProviderLiveChannelResult } from './organization-offboarding-provider-live.types';

const PRIVILEGED_VEHICLES_QUERY = `
  query OrgOffboardingPrivilegedVehicles($clientId: Address!) {
  vehicles(first: 100, filterBy: { privileged: $clientId }) {
      nodes { tokenId }
    }
  }
`;

/**
 * DIMO org offboarding live path — verification only.
 *
 * Verified capability: Identity GraphQL `vehicles(filterBy: { privileged })` (read).
 * No verified programmatic owner-side privilege revocation API is wired in this repository;
 * external confirmation requires org vehicles' tokenIds to be absent from the developer privileged cohort
 * after local quiesce (consent revoke + exclusive connection projection).
 */
@Injectable()
export class OrganizationOffboardingDimoLiveDisconnectAdapter {
  private readonly logger = new Logger(OrganizationOffboardingDimoLiveDisconnectAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(dimoConfig.KEY) private readonly dimo: ConfigType<typeof dimoConfig>,
  ) {}

  async verifyOrganizationDisconnect(organizationId: string): Promise<OrganizationProviderLiveChannelResult> {
    const attemptedAt = new Date().toISOString();
    const operations: Array<Record<string, unknown>> = [];

    if (!this.dimo.clientId?.trim()) {
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_EXTERNAL_VERIFY_CREDENTIALS_MISSING',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'DIMO',
          operations,
          summary: { configured: false },
        },
      };
    }

    const orgTokens = await this.prisma.vehicle.findMany({
      where: { organizationId, dimoVehicleId: { not: null } },
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true, connectionStatus: true, externalId: true } },
      },
    });

    const tokenIds = [
      ...new Set(
        orgTokens
          .map((v) => v.dimoVehicle?.tokenId)
          .filter((t): t is number => typeof t === 'number' && Number.isFinite(t)),
      ),
    ];

    if (tokenIds.length === 0 && orgTokens.length === 0) {
      return {
        outcome: 'NO_DEPENDENCY',
        detailCode: null,
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'DIMO',
          operations: [],
          summary: { orgDimoVehicleLinks: 0 },
        },
      };
    }

    let privilegedTokenIds: Set<number>;
    try {
      privilegedTokenIds = await this.fetchPrivilegedTokenIds();
      operations.push({
        action: 'IDENTITY_PRIVILEGED_QUERY',
        privilegedCount: privilegedTokenIds.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`DIMO Identity privileged query failed: ${message}`);
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_EXTERNAL_VERIFY_IDENTITY_UNAVAILABLE',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'DIMO',
          operations: [{ action: 'IDENTITY_PRIVILEGED_QUERY', error: message }],
          summary: { orgTokenIds: tokenIds },
        },
      };
    }

    const stillPrivileged = tokenIds.filter((id) => privilegedTokenIds.has(id));
    operations.push({
      action: 'COMPARE_ORG_TOKENS',
      orgTokenIds: tokenIds,
      stillPrivileged,
    });

    if (stillPrivileged.length > 0) {
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'DIMO',
          operations,
          summary: {
            stillPrivileged,
            note: 'Owner must revoke DIMO developer privilege; no live revoke API wired',
          },
        },
      };
    }

    const connectedCount = orgTokens.filter((v) => v.dimoVehicle?.connectionStatus === 'CONNECTED').length;
    if (connectedCount > 0) {
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_LOCAL_CONNECTION_STILL_CONNECTED',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'DIMO',
          operations,
          summary: { connectedCount },
        },
      };
    }

    return {
      outcome: 'CONFIRMED',
      detailCode: null,
      providerEvidence: {
        attemptedAt,
        organizationId,
        provider: 'DIMO',
        operations,
        summary: {
          orgTokenIds: tokenIds,
          privilegedStillActive: false,
          verificationMode: 'IDENTITY_PRIVILEGED_READ',
        },
      },
    };
  }

  private async fetchPrivilegedTokenIds(): Promise<Set<number>> {
    const graphqlUrl = `${this.dimo.apiUrl.replace(/\/$/, '')}/query`;
    const res = await axios.post<{
      data?: { vehicles?: { nodes: Array<{ tokenId?: number }> } };
      errors?: Array<{ message: string }>;
    }>(
      graphqlUrl,
      { query: PRIVILEGED_VEHICLES_QUERY, variables: { clientId: this.dimo.clientId } },
      { headers: { 'Content-Type': 'application/json' }, timeout: this.dimo.requestTimeoutMs },
    );

    if (res.data.errors?.length) {
      throw new Error(res.data.errors.map((e) => e.message).join('; '));
    }

    const nodes = res.data.data?.vehicles?.nodes ?? [];
    return new Set(
      nodes
        .map((n) => n.tokenId)
        .filter((t): t is number => typeof t === 'number' && Number.isFinite(t)),
    );
  }
}