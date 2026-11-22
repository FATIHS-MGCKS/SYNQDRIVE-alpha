import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import axios from 'axios';
import { HighMobilityHealthAppAuthService } from '@modules/high-mobility/high-mobility-health-app-auth.service';
import { HighMobilityAppConfigService } from '@modules/high-mobility/high-mobility-app-config.service';
import type { OrganizationProviderLiveChannelResult } from './organization-offboarding-provider-live.types';

const HM_TERMINAL_CLEARANCE = new Set(['REVOKED', 'CANCELED', 'REJECTED', 'DRAFT']);
const HM_REVOKE_ATTEMPT = new Set(['APPROVED', 'CLEARANCE_PENDING', 'REVOKING']);
const HM_PROVIDER_CONFIRMED = new Set(['revoked', 'canceled']);
const HM_PROVIDER_PENDING = new Set(['revoking', 'canceling', 'pending']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerStatusLower(raw: Record<string, unknown> | undefined): string {
  return String(raw?.status ?? '').toLowerCase().trim();
}

function mapProviderToInternalClearance(providerStatus: string): 'REVOKED' | 'CANCELED' | 'REVOKING' | 'CLEARANCE_PENDING' | null {
  if (providerStatus === 'revoked') return 'REVOKED';
  if (providerStatus === 'canceled') return 'CANCELED';
  if (providerStatus === 'revoking' || providerStatus === 'canceling') return 'REVOKING';
  if (providerStatus === 'pending') return 'CLEARANCE_PENDING';
  return null;
}

@Injectable()
export class OrganizationOffboardingHmLiveDisconnectAdapter {
  private readonly logger = new Logger(OrganizationOffboardingHmLiveDisconnectAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: HighMobilityHealthAppAuthService,
    private readonly hmConfig: HighMobilityAppConfigService,
  ) {}

  async disconnectOrganization(organizationId: string): Promise<OrganizationProviderLiveChannelResult> {
    const attemptedAt = new Date().toISOString();
    const operations: Array<Record<string, unknown>> = [];

    if (!this.auth.isConfigured()) {
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'HM_EXTERNAL_REVOKE_CREDENTIALS_MISSING',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'HIGH_MOBILITY',
          operations,
          summary: { configured: false },
        },
      };
    }

    const vehicles = await this.prisma.highMobilityVehicle.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, vin: true, clearanceStatus: true },
    });

    if (vehicles.length === 0) {
      const historicalLinks = await this.prisma.vehicleDataSourceLink.count({
        where: { sourceType: 'HIGH_MOBILITY', vehicle: { organizationId } },
      });
      if (historicalLinks > 0) {
        return {
          outcome: 'REVIEW_REQUIRED',
          detailCode: 'HM_HISTORICAL_LINK_WITHOUT_HM_ROW',
          providerEvidence: {
            attemptedAt,
            organizationId,
            provider: 'HIGH_MOBILITY',
            operations: [],
            summary: { historicalDataSourceLinks: historicalLinks },
          },
        };
      }
      return {
        outcome: 'NO_DEPENDENCY',
        detailCode: null,
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'HIGH_MOBILITY',
          operations: [],
          summary: { hmVehicleCount: 0 },
        },
      };
    }

    const baseUrl = this.hmConfig.healthApp.apiBaseUrl;
    const timeout = this.hmConfig.healthApp.requestTimeoutMs;
    const headers = await this.auth.authHeaders();
    if (!headers) {
      return {
        outcome: 'NOT_AVAILABLE',
        detailCode: 'HM_EXTERNAL_REVOKE_AUTH_UNAVAILABLE',
        providerEvidence: {
          attemptedAt,
          organizationId,
          provider: 'HIGH_MOBILITY',
          operations,
          summary: { hmVehicleCount: vehicles.length },
        },
      };
    }

    let anyFailed = false;
    let anyPending = false;

    for (const row of vehicles) {
      const status = String(row.clearanceStatus);
      if (HM_TERMINAL_CLEARANCE.has(status)) {
        const verified = await this.fetchProviderStatus(baseUrl, row.vin, headers, timeout);
        operations.push({
          hmVehicleId: row.id,
          vin: row.vin,
          action: 'VERIFY_TERMINAL_LOCAL',
          localStatus: status,
          ...verified,
        });
        if (verified.outcome === 'CONFIRMED') {
          continue;
        }
        if (verified.outcome === 'PENDING') {
          anyPending = true;
          continue;
        }
        anyFailed = true;
        continue;
      }

      if (!HM_REVOKE_ATTEMPT.has(status)) {
        operations.push({ hmVehicleId: row.id, vin: row.vin, action: 'SKIP_UNSUPPORTED_STATUS', status });
        anyPending = true;
        continue;
      }

      const crossTenant = await this.vinBlockedByOtherTenant(organizationId, row.vin);
      if (crossTenant) {
        operations.push({
          hmVehicleId: row.id,
          vin: row.vin,
          action: 'BLOCK_CROSS_TENANT_VIN',
          blocker: crossTenant,
        });
        anyFailed = true;
        continue;
      }

      const revoke = await this.revokeVinWithRetry(baseUrl, row.vin, headers, timeout);
      operations.push({ hmVehicleId: row.id, vin: row.vin, action: 'DELETE_CLEARANCE', ...revoke });

      if (revoke.outcome === 'FAILED') {
        anyFailed = true;
      } else if (revoke.outcome === 'PENDING') {
        anyPending = true;
      }

      const internalStatus = revoke.normalizedStatus as string | undefined;
      if (internalStatus && (revoke.outcome === 'CONFIRMED' || revoke.outcome === 'PENDING')) {
        await this.prisma.highMobilityVehicle.update({
          where: { id: row.id },
          data: { clearanceStatus: internalStatus as never },
        });
      }
    }

    const outcome = anyFailed ? 'FAILED' : anyPending ? 'NOT_AVAILABLE' : 'CONFIRMED';

    return {
      outcome,
      detailCode:
        outcome === 'CONFIRMED'
          ? null
          : outcome === 'FAILED'
            ? 'HM_EXTERNAL_REVOKE_FAILED'
            : 'HM_EXTERNAL_REVOKE_PENDING',
      providerEvidence: {
        attemptedAt,
        organizationId,
        provider: 'HIGH_MOBILITY',
        operations,
        summary: {
          hmVehicleCount: vehicles.length,
          anyFailed,
          anyPending,
        },
      },
    };
  }

  private async vinBlockedByOtherTenant(
    organizationId: string,
    vin: string,
  ): Promise<string | null> {
    const rows = await this.prisma.highMobilityVehicle.findMany({
      where: { vin, isActive: true },
      select: { organizationId: true, clearanceStatus: true, synqdriveVehicleId: true },
    });

    for (const row of rows) {
      let ownerOrgId = row.organizationId;
      if (!ownerOrgId && row.synqdriveVehicleId) {
        const vehicle = await this.prisma.vehicle.findUnique({
          where: { id: row.synqdriveVehicleId },
          select: { organizationId: true },
        });
        ownerOrgId = vehicle?.organizationId ?? null;
      }
      if (!ownerOrgId || ownerOrgId === organizationId) {
        continue;
      }
      if (!HM_TERMINAL_CLEARANCE.has(String(row.clearanceStatus))) {
        return `HM_VIN_SHARED_ORG_${ownerOrgId}`;
      }
    }
    return null;
  }

  private async fetchProviderStatus(
    baseUrl: string,
    vin: string,
    headers: Record<string, string>,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    try {
      const res = await axios.get(`${baseUrl}/v1/fleets/vehicles/${encodeURIComponent(vin)}`, {
        headers,
        timeout,
      });
      const raw = res.data as Record<string, unknown>;
      const providerStatus = providerStatusLower(raw);
      if (HM_PROVIDER_CONFIRMED.has(providerStatus)) {
        return {
          outcome: 'CONFIRMED',
          httpStatus: res.status,
          providerStatus,
          providerResponse: raw,
          normalizedStatus: providerStatus === 'revoked' ? 'REVOKED' : 'CANCELED',
        };
      }
      if (HM_PROVIDER_PENDING.has(providerStatus)) {
        return {
          outcome: 'PENDING',
          httpStatus: res.status,
          providerStatus,
          providerResponse: raw,
          normalizedStatus: mapProviderToInternalClearance(providerStatus),
        };
      }
      return {
        outcome: 'PENDING',
        httpStatus: res.status,
        providerStatus,
        providerResponse: raw,
        note: 'UNEXPECTED_PROVIDER_STATUS',
      };
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
      const httpStatus = ax.response?.status;
      if (httpStatus === 404) {
        return {
          outcome: 'NOT_AVAILABLE',
          httpStatus,
          error: 'HM_GET_404_UNVERIFIED',
          detail: '404 does not confirm revoked state without prior DELETE evidence',
        };
      }
      return {
        outcome: 'NOT_AVAILABLE',
        httpStatus: httpStatus ?? null,
        error: ax.message ?? 'unknown',
      };
    }
  }

  private async revokeVinWithRetry(
    baseUrl: string,
    vin: string,
    headers: Record<string, string>,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await axios.delete(`${baseUrl}/v1/fleets/vehicles/${encodeURIComponent(vin)}`, {
          headers,
          timeout,
        });
        const raw = res.data as Record<string, unknown>;
        const providerStatus = providerStatusLower(raw);
        const confirmed = await this.confirmPostRevokeStatus(
          baseUrl,
          vin,
          headers,
          timeout,
          providerStatus,
        );
        return { ...confirmed, httpStatus: res.status, deleteResponse: raw, attempt };
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
        const httpStatus = ax.response?.status;

        if (httpStatus === 409) {
          const body = (ax.response?.data ?? {}) as Record<string, unknown>;
          const providerStatus = providerStatusLower(body);

          if (HM_PROVIDER_CONFIRMED.has(providerStatus)) {
            const verified = await this.fetchProviderStatus(baseUrl, vin, headers, timeout);
            return {
              ...verified,
              httpStatus,
              conflict409: true,
              conflictKind: 'already_revoked',
              attempt,
            };
          }

          if (providerStatus === 'approved' || providerStatus === 'pending') {
            return {
              outcome: 'FAILED',
              httpStatus,
              conflict409: true,
              conflictKind: 'transition_conflict',
              providerStatus,
              attempt,
            };
          }

          if (HM_PROVIDER_PENDING.has(providerStatus)) {
            const verified = await this.fetchProviderStatus(baseUrl, vin, headers, timeout);
            return {
              ...verified,
              httpStatus,
              conflict409: true,
              conflictKind: 'in_flight_revocation',
              attempt,
            };
          }

          const verified = await this.fetchProviderStatus(baseUrl, vin, headers, timeout);
          return {
            ...verified,
            httpStatus,
            conflict409: true,
            conflictKind: 'unknown_409',
            body,
            attempt,
          };
        }

        if (httpStatus && httpStatus >= 500 && attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }

        this.logger.warn(`HM org offboarding revoke failed vin=${vin} status=${httpStatus}: ${ax.message}`);
        return {
          outcome: 'FAILED',
          httpStatus: httpStatus ?? null,
          error: ax.message ?? 'unknown',
          attempt,
        };
      }
    }

    return { outcome: 'FAILED', attempt: maxAttempts };
  }

  private async confirmPostRevokeStatus(
    baseUrl: string,
    vin: string,
    headers: Record<string, string>,
    timeout: number,
    deleteProviderStatus: string,
  ): Promise<Record<string, unknown>> {
    if (HM_PROVIDER_CONFIRMED.has(deleteProviderStatus)) {
      const verified = await this.fetchProviderStatus(baseUrl, vin, headers, timeout);
      return verified.outcome === 'CONFIRMED'
        ? verified
        : {
            outcome: 'PENDING',
            deleteProviderStatus,
            verified,
          };
    }
    if (HM_PROVIDER_PENDING.has(deleteProviderStatus)) {
      const verified = await this.fetchProviderStatus(baseUrl, vin, headers, timeout);
      return {
        outcome: verified.outcome === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
        deleteProviderStatus,
        normalizedStatus: verified.normalizedStatus ?? 'REVOKING',
        verified,
      };
    }
    const verified = await this.fetchProviderStatus(baseUrl, vin, headers, timeout);
    return verified;
  }
}