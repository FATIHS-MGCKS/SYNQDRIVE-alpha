import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import axios from 'axios';
import { HighMobilityHealthAppAuthService } from '@modules/high-mobility/high-mobility-health-app-auth.service';
import { HighMobilityAppConfigService } from '@modules/high-mobility/high-mobility-app-config.service';
import type { OrganizationProviderLiveChannelResult } from './organization-offboarding-provider-live.types';

const HM_TERMINAL_CLEARANCE = new Set(['REVOKED', 'CANCELED', 'REJECTED', 'DRAFT']);
const HM_REVOKE_ATTEMPT = new Set(['APPROVED', 'CLEARANCE_PENDING', 'REVOKING']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      where: { organizationId },
      select: { id: true, vin: true, clearanceStatus: true },
    });

    if (vehicles.length === 0) {
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
        operations.push({ hmVehicleId: row.id, vin: row.vin, action: 'SKIP_TERMINAL', status });
        continue;
      }

      if (!HM_REVOKE_ATTEMPT.has(status)) {
        operations.push({ hmVehicleId: row.id, vin: row.vin, action: 'SKIP_UNSUPPORTED_STATUS', status });
        anyPending = true;
        continue;
      }

      const revoke = await this.revokeVinWithRetry(baseUrl, row.vin, headers, timeout);
      operations.push({ hmVehicleId: row.id, vin: row.vin, action: 'DELETE_CLEARANCE', ...revoke });

      if (revoke.outcome === 'FAILED') {
        anyFailed = true;
      } else if (revoke.outcome === 'PENDING') {
        anyPending = true;
      }

      const providerStatus = revoke.httpStatus === 409 ? 'CANCELED' : revoke.normalizedStatus;
      if (providerStatus) {
        await this.prisma.highMobilityVehicle.update({
          where: { id: row.id },
          data: { clearanceStatus: providerStatus as never },
        });
      }
    }

    const outcome = anyFailed
      ? 'FAILED'
      : anyPending
        ? 'NOT_AVAILABLE'
        : 'CONFIRMED';

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
        const providerStatus = String(raw?.status ?? 'revoking').toLowerCase();
        return {
          outcome: providerStatus === 'revoked' || providerStatus === 'canceled' ? 'CONFIRMED' : 'PENDING',
          httpStatus: res.status,
          normalizedStatus: providerStatus === 'revoked' ? 'REVOKED' : 'REVOKING',
          providerResponse: raw,
          attempt,
        };
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
        const httpStatus = ax.response?.status;

        if (httpStatus === 409) {
          return {
            outcome: 'CONFIRMED',
            httpStatus,
            normalizedStatus: 'CANCELED',
            providerResponse: ax.response?.data,
            attempt,
            idempotent: true,
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
}