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
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const PRIVILEGED_VEHICLES_PAGE_QUERY = `
  query OrgOffboardingPrivilegedVehiclesPage($clientId: Address!, $after: String!) {
    vehicles(first: 100, after: $after, filterBy: { privileged: $clientId }) {
      nodes { tokenId }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const MAX_PRIVILEGED_PAGES = 200;

/**
 * DIMO org offboarding live path — verification only.
 *
 * Verified capability: Identity GraphQL `vehicles(filterBy: { privileged })` (read, paginated).
 * No verified programmatic owner-side privilege revocation API is wired in this repository.
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

    const missingTokenLinks = orgTokens.filter(
      (v) => v.dimoVehicle && (v.dimoVehicle.tokenId == null || !Number.isFinite(v.dimoVehicle.tokenId)),
    );
    if (missingTokenLinks.length > 0) {
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_MISSING_VERIFIABLE_IDENTITY',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'DIMO',
          operations: [{ action: 'ORG_DIMO_LINKS', missingTokenIdCount: missingTokenLinks.length }],
          summary: { vehicleIds: missingTokenLinks.map((v) => v.id) },
        },
      };
    }

    const tokenIds = [
      ...new Set(
        orgTokens
          .map((v) => v.dimoVehicle?.tokenId)
          .filter((t): t is number => typeof t === 'number' && Number.isFinite(t)),
      ),
    ];

    if (tokenIds.length === 0 && orgTokens.length === 0) {
      const historicalDimoConsent = await this.prisma.vehicleProviderConsent.count({
        where: { organizationId, provider: 'DIMO' },
      });
      const everHadDimoVehicleLink =
        (await this.prisma.vehicle.count({
          where: { organizationId, dimoVehicleId: { not: null } },
        })) > 0;
      if (historicalDimoConsent > 0 || everHadDimoVehicleLink) {
        return {
          outcome: 'REVIEW_REQUIRED',
          detailCode: 'DIMO_HISTORICAL_DEPENDENCY_UNVERIFIED',
          providerEvidence: {
            attemptedAt,
            organizationId,
            provider: 'DIMO',
            operations: [],
            summary: { historicalDimoConsent, everHadDimoVehicleLink },
          },
        };
      }
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
    let paginationEvidence: Record<string, unknown>;
    try {
      const fetched = await this.fetchAllPrivilegedTokenIds();
      privilegedTokenIds = fetched.tokenIds;
      paginationEvidence = fetched.evidence;
      operations.push({ action: 'IDENTITY_PRIVILEGED_QUERY', ...paginationEvidence });
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
          verificationMode: 'IDENTITY_PRIVILEGED_READ_PAGINATED',
          ...paginationEvidence,
        },
      },
    };
  }

  private async fetchAllPrivilegedTokenIds(): Promise<{
    tokenIds: Set<number>;
    evidence: Record<string, unknown>;
  }> {
    const graphqlUrl = `${this.dimo.apiUrl.replace(/\/$/, '')}/query`;
    const tokenIds = new Set<number>();
    let hasNextPage = true;
    let cursor: string | null = null;
    let pages = 0;
    let nodesRead = 0;
    let incompleteNodes = 0;

    type GqlResponse = {
      data?: {
        vehicles?: {
          nodes: Array<{ tokenId?: number }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        };
      };
      errors?: Array<{ message: string }>;
    };
    type GqlVariables = { clientId: string; after?: string };

    while (hasNextPage) {
      pages += 1;
      if (pages > MAX_PRIVILEGED_PAGES) {
        throw new Error('DIMO_PRIVILEGED_PAGINATION_LIMIT_EXCEEDED');
      }

      const query: string = cursor ? PRIVILEGED_VEHICLES_PAGE_QUERY : PRIVILEGED_VEHICLES_QUERY;
      const variables: GqlVariables = cursor
        ? { clientId: this.dimo.clientId, after: cursor }
        : { clientId: this.dimo.clientId };

      const res = await axios.post<GqlResponse>(graphqlUrl, { query, variables }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: this.dimo.requestTimeoutMs,
      });

      if (res.data.errors?.length) {
        throw new Error(res.data.errors.map((e) => e.message).join('; '));
      }

      const vehiclesPage = res.data?.data?.vehicles;
      if (!vehiclesPage) {
        throw new Error('DIMO_PRIVILEGED_RESPONSE_INCOMPLETE');
      }

      for (const node of vehiclesPage.nodes ?? []) {
        nodesRead += 1;
        if (typeof node.tokenId !== 'number' || !Number.isFinite(node.tokenId)) {
          incompleteNodes += 1;
          continue;
        }
        tokenIds.add(node.tokenId);
      }

      if (incompleteNodes > 0) {
        throw new Error('DIMO_PRIVILEGED_NODE_MISSING_TOKEN_ID');
      }

      const pageInfo = vehiclesPage.pageInfo;
      hasNextPage = Boolean(pageInfo?.hasNextPage);
      const endCursor = pageInfo?.endCursor ?? null;

      if (hasNextPage && (!endCursor || endCursor.length === 0)) {
        throw new Error('DIMO_PRIVILEGED_PAGINATION_CURSOR_MISSING');
      }

      cursor = endCursor;
    }

    return {
      tokenIds,
      evidence: {
        privilegedCount: tokenIds.size,
        pagesTraversed: pages,
        nodesRead,
        paginationComplete: true,
      },
    };
  }
}