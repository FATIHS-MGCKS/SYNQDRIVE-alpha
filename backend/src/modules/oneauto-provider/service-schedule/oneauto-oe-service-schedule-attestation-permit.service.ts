import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OneAutoExecutionAuthorizationMode,
  OneAutoOeServiceScheduleAttestationPermitStatus,
  OneAutoProviderJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeVin } from '../client/oneauto-vin.util';
import { assertOneAutoPositiveOrgBudgetWhenEnabled } from '../oneauto-execution-budget-guard.util';
import { resolveEffectiveOrgDailyBudgetMinor } from '../oneauto-org-budget-test-allowance.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './oneauto-service-schedule-eu.types';
import { loadOneAutoOeServiceScheduleAttestationCanaryFromEnv } from './oneauto-oe-service-schedule-attestation-canary.config';
import {
  assertAttestationCanaryFeatureConfigured,
  assertAttestationRequestScope,
  resolveAttestationPricingSourceVersion,
} from './oneauto-oe-service-schedule-attestation-guards.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_SKU } from './oneauto-oe-service-schedule-attestation-canary.constants';

type RuntimeCfg = {
  enabled?: boolean;
  indicativePriceMinorBySku?: Record<string, number>;
  orgDailyBudgetMinor?: number;
  e1ServiceHistoryTestOrgIds?: string[];
  e1ServiceHistoryTestOrgBudgetCapMinor?: number;
};

export type ArmAttestationPermitInput = {
  organizationId: string;
  vehicleId: string;
  masterAdminUserId: string;
  configuredPriceMinor: number;
  maxAuthorizedSpendMinor: number;
  pricingSourceVersion: string;
  ownerSpendAcknowledged: boolean;
  accountPricingAcknowledged: boolean;
};

export type ExecuteAttestationCanaryInput = {
  organizationId: string;
  vehicleId: string;
  masterAdminUserId: string;
  idempotencyKey: string;
  confirmedPriceMinor: number;
  pricingSourceVersion: string;
  quoteIssuedAt: string;
  acknowledgeIndicativeNotGuaranteed: boolean;
  ownerSpendAcknowledged: boolean;
};

@Injectable()
export class OneAutoOeServiceScheduleAttestationPermitService {
  private readonly logger = new Logger(OneAutoOeServiceScheduleAttestationPermitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getCanaryStatus() {
    const cfg = loadOneAutoOeServiceScheduleAttestationCanaryFromEnv();
    return {
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_SKU,
      enabled: cfg.enabled,
      targetConfigured: Boolean(cfg.targetOrganizationId && cfg.targetVehicleId && cfg.targetVin),
      accountPricingVerified: cfg.accountPricingVerified,
      ownerAuthorized: cfg.ownerAuthorized,
      pricingSourceVersion: resolveAttestationPricingSourceVersion(),
      generalExecutionVerified: false,
    };
  }

  async armPermit(input: ArmAttestationPermitInput) {
    const cfg = loadOneAutoOeServiceScheduleAttestationCanaryFromEnv();
    assertAttestationCanaryFeatureConfigured(cfg);

    if (!input.ownerSpendAcknowledged || !input.accountPricingAcknowledged) {
      throw Object.assign(new Error('Owner and account pricing acknowledgements required'), {
        code: 'ONEAUTO_ATTESTATION_ACK_REQUIRED',
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { vin: true },
    });
    if (!vehicle) {
      throw Object.assign(new Error('Vehicle not found'), { code: 'ONEAUTO_CROSS_TENANT' });
    }

    assertAttestationRequestScope({
      cfg,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      vehicleVin: vehicle.vin,
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
    });

    const runtimeCfg = this.runtimeCfg();
    if (runtimeCfg.enabled !== true) {
      throw Object.assign(new Error('One Auto provider disabled'), { code: 'ONEAUTO_DISABLED' });
    }
    try {
      assertOneAutoPositiveOrgBudgetWhenEnabled(runtimeCfg);
    } catch {
      throw Object.assign(new Error('Budget not configured'), { code: 'ONEAUTO_BUDGET_NOT_CONFIGURED' });
    }

    const indicative =
      runtimeCfg.indicativePriceMinorBySku?.[ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU] ?? null;
    if (indicative == null || indicative <= 0) {
      throw Object.assign(new Error('Configured indicative price missing'), {
        code: 'ONEAUTO_ATTESTATION_PRICE_NOT_CONFIGURED',
      });
    }
    if (input.configuredPriceMinor !== indicative) {
      throw Object.assign(new Error('Configured price mismatch'), { code: 'ONEAUTO_PRICE_MISMATCH' });
    }
    if (input.pricingSourceVersion !== resolveAttestationPricingSourceVersion()) {
      throw Object.assign(new Error('Pricing source version mismatch'), { code: 'ONEAUTO_PRICE_MISMATCH' });
    }
    if (input.maxAuthorizedSpendMinor < indicative) {
      throw Object.assign(new Error('Max authorized spend below configured price'), {
        code: 'ONEAUTO_ATTESTATION_SPEND_CAP_TOO_LOW',
      });
    }

    await this.assertBudgetHeadroom(input.organizationId, input.maxAuthorizedSpendMinor);

    const vinSnapshot = normalizeVin(vehicle.vin)!;
    const now = new Date();

    const existing = await this.prisma.oneAutoOeServiceScheduleAttestationPermit.findUnique({
      where: {
        organizationId_serviceSku: {
          organizationId: input.organizationId,
          serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
        },
      },
    });

    if (existing?.status === OneAutoOeServiceScheduleAttestationPermitStatus.CONSUMED) {
      throw Object.assign(new Error('Attestation permit already consumed'), {
        code: 'ONEAUTO_ATTESTATION_PERMIT_CONSUMED',
      });
    }
    if (existing?.status === OneAutoOeServiceScheduleAttestationPermitStatus.BLOCKED) {
      throw Object.assign(new Error('Attestation permit blocked'), {
        code: 'ONEAUTO_ATTESTATION_PERMIT_BLOCKED',
        blockedReason: existing.blockedReason,
      });
    }
    if (existing?.status === OneAutoOeServiceScheduleAttestationPermitStatus.READY) {
      return this.toPermitDto(existing);
    }

    const permit = await this.prisma.oneAutoOeServiceScheduleAttestationPermit.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
        vinSnapshot,
        status: OneAutoOeServiceScheduleAttestationPermitStatus.READY,
        ownerAuthorizedByUserId: input.masterAdminUserId,
        ownerAuthorizedAt: now,
        accountPricingAcknowledgedAt: now,
        maxAuthorizedSpendMinor: input.maxAuthorizedSpendMinor,
        configuredPriceMinor: indicative,
        pricingSourceVersion: resolveAttestationPricingSourceVersion(),
        currency: 'EUR',
      },
    });

    this.logger.warn(
      `OneAuto attestation permit armed id=${permit.id} org=${input.organizationId} vehicle=${input.vehicleId}`,
    );
    return this.toPermitDto(permit);
  }

  async claimPermitAndCreateJob(
    input: ExecuteAttestationCanaryInput,
    deps: {
      quoteIssuedAtMs: number;
      quoteTtlMs: number;
      jobTtlMs: number;
      expiresAt: Date;
      vinSnapshot: string;
      now: Date;
    },
  ) {
    const cfg = loadOneAutoOeServiceScheduleAttestationCanaryFromEnv();
    assertAttestationCanaryFeatureConfigured(cfg);

    if (!input.ownerSpendAcknowledged || !input.acknowledgeIndicativeNotGuaranteed) {
      throw Object.assign(new Error('Acknowledgements required'), { code: 'ONEAUTO_COST_CONFIRMATION_REQUIRED' });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { vin: true },
    });
    if (!vehicle) {
      throw Object.assign(new Error('Vehicle not found'), { code: 'ONEAUTO_CROSS_TENANT' });
    }

    assertAttestationRequestScope({
      cfg,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      vehicleVin: vehicle.vin,
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
    });

    if (Date.now() - deps.quoteIssuedAtMs > deps.quoteTtlMs) {
      throw Object.assign(new Error('Quote expired'), { code: 'ONEAUTO_QUOTE_EXPIRED' });
    }

    const permit = await this.prisma.oneAutoOeServiceScheduleAttestationPermit.findUnique({
      where: {
        organizationId_serviceSku: {
          organizationId: input.organizationId,
          serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
        },
      },
    });

    if (!permit || permit.status !== OneAutoOeServiceScheduleAttestationPermitStatus.READY) {
      throw Object.assign(new Error('Attestation permit not ready'), {
        code: 'ONEAUTO_ATTESTATION_PERMIT_NOT_READY',
      });
    }
    if (permit.configuredPriceMinor !== input.confirmedPriceMinor) {
      throw Object.assign(new Error('Price mismatch'), { code: 'ONEAUTO_PRICE_MISMATCH' });
    }
    if (permit.pricingSourceVersion !== input.pricingSourceVersion) {
      throw Object.assign(new Error('Pricing version mismatch'), { code: 'ONEAUTO_PRICE_MISMATCH' });
    }
    if (normalizeVin(permit.vinSnapshot) !== deps.vinSnapshot) {
      throw Object.assign(new Error('VIN binding mismatch'), { code: 'ONEAUTO_BINDING_MISMATCH' });
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.oneAutoOeServiceScheduleAttestationPermit.updateMany({
        where: {
          id: permit.id,
          status: OneAutoOeServiceScheduleAttestationPermitStatus.READY,
        },
        data: {
          status: OneAutoOeServiceScheduleAttestationPermitStatus.CONSUMED,
        },
      });
      if (claim.count !== 1) {
        throw Object.assign(new Error('Permit claim failed'), { code: 'ONEAUTO_ATTESTATION_PERMIT_NOT_READY' });
      }

      await this.assertBudgetAllowsTx(tx, input.organizationId, input.confirmedPriceMinor);

      const job = await tx.oneAutoProviderJob.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          vinSnapshot: deps.vinSnapshot,
          serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
          status: OneAutoProviderJobStatus.CREATED,
          idempotencyKey: input.idempotencyKey.trim(),
          estimatedPriceMinor: input.confirmedPriceMinor,
          currency: 'EUR',
          pricingSourceVersion: input.pricingSourceVersion,
          costConfirmedAt: deps.now,
          costConfirmedByUserId: input.masterAdminUserId,
          initiatingMasterAdminUserId: input.masterAdminUserId,
          confirmedPriceMinor: input.confirmedPriceMinor,
          budgetReservedMinor: input.confirmedPriceMinor,
          quoteIssuedAt: new Date(deps.quoteIssuedAtMs),
          actualChargeKnown: false,
          expiresAt: deps.expiresAt,
          executionAuthorizationMode: OneAutoExecutionAuthorizationMode.ATTESTATION_CANARY,
          attestationPermitId: permit.id,
        },
      });

      return job;
    });
  }

  async markPermitBlockedForJob(jobId: string, reason: string): Promise<void> {
    const job = await this.prisma.oneAutoProviderJob.findUnique({
      where: { id: jobId },
      select: { attestationPermitId: true, executionAuthorizationMode: true },
    });
    if (
      !job ||
      job.executionAuthorizationMode !== OneAutoExecutionAuthorizationMode.ATTESTATION_CANARY ||
      !job.attestationPermitId
    ) {
      return;
    }
    await this.prisma.oneAutoOeServiceScheduleAttestationPermit.updateMany({
      where: { id: job.attestationPermitId },
      data: {
        blockedReason: reason.slice(0, 500),
      },
    });
  }

  private runtimeCfg(): RuntimeCfg {
    return this.config.get<RuntimeCfg>('oneautoProvider') ?? {};
  }

  private async assertBudgetHeadroom(orgId: string, additionalMinor: number): Promise<void> {
    await this.assertBudgetAllowsTx(this.prisma, orgId, additionalMinor);
  }

  private async assertBudgetAllowsTx(
    tx: Prisma.TransactionClient | PrismaService,
    orgId: string,
    additionalMinor: number,
  ) {
    const cap = resolveEffectiveOrgDailyBudgetMinor({
      organizationId: orgId,
      serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      cfg: this.runtimeCfg(),
    });
    if (cap <= 0) {
      throw Object.assign(new Error('Budget cap not positive'), { code: 'ONEAUTO_BUDGET_NOT_CONFIGURED' });
    }
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const agg = await tx.oneAutoProviderJob.aggregate({
      where: {
        organizationId: orgId,
        costConfirmedAt: { gte: startOfDay },
        status: {
          in: [
            OneAutoProviderJobStatus.CREATED,
            OneAutoProviderJobStatus.QUEUED,
            OneAutoProviderJobStatus.RUNNING,
            OneAutoProviderJobStatus.AWAITING_PROVIDER,
            OneAutoProviderJobStatus.SUCCEEDED,
            OneAutoProviderJobStatus.EXPIRED,
            OneAutoProviderJobStatus.FAILED,
          ],
        },
      },
      _sum: { budgetReservedMinor: true },
    });
    const spent = agg._sum.budgetReservedMinor ?? 0;
    if (spent + additionalMinor > cap) {
      throw Object.assign(new Error('Budget exceeded'), { code: 'ONEAUTO_BUDGET_EXCEEDED' });
    }
  }

  private toPermitDto(permit: {
    id: string;
    organizationId: string;
    vehicleId: string;
    serviceSku: string;
    vinSnapshot: string;
    status: OneAutoOeServiceScheduleAttestationPermitStatus;
    maxAuthorizedSpendMinor: number;
    configuredPriceMinor: number;
    pricingSourceVersion: string;
    currency: string;
    blockedReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: permit.id,
      organizationId: permit.organizationId,
      vehicleId: permit.vehicleId,
      serviceSku: permit.serviceSku,
      vinSnapshot: permit.vinSnapshot,
      status: permit.status,
      maxAuthorizedSpendMinor: permit.maxAuthorizedSpendMinor,
      configuredPriceMinor: permit.configuredPriceMinor,
      pricingSourceVersion: permit.pricingSourceVersion,
      currency: permit.currency,
      blockedReason: permit.blockedReason,
      createdAt: permit.createdAt.toISOString(),
      updatedAt: permit.updatedAt.toISOString(),
    };
  }
}
