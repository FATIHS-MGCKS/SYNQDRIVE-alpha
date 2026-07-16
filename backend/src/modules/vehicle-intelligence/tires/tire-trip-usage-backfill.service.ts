import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { TripBackfillAuditResult } from './tire-trip-usage-backfill-audit';
import {
  buildBackfillApplyAuditEntry,
  planTripUsageBackfillApply,
  validateTripUsageBackfillApplyRequest,
  type TripUsageBackfillApplyPlan,
  type TripUsageBackfillApplyRequest,
  type TripUsageBackfillApplyResult,
} from './tire-trip-usage-backfill-apply';
import { assertSafeTireTripUsageBackfillApplyTarget } from './tire-trip-usage-backfill-apply.safety';
import { TireTripUsageLedgerReconciliationService } from './tire-trip-usage-ledger-reconciliation.service';
import { TireHealthService } from './tire-health.service';
import { TireTripUsageService } from './tire-trip-usage.service';

export interface TireTripUsageBackfillRunOptions {
  request: TripUsageBackfillApplyRequest;
  auditTrips: TripBackfillAuditResult[];
  actualGitRef?: string;
  allowRemote?: boolean;
  allowProd?: boolean;
}

@Injectable()
export class TireTripUsageBackfillService {
  private readonly logger = new Logger(TireTripUsageBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tireTripUsageService: TireTripUsageService,
    private readonly reconciliationService: TireTripUsageLedgerReconciliationService,
    private readonly tireHealthService: TireHealthService,
  ) {}

  async run(options: TireTripUsageBackfillRunOptions): Promise<{
    plan: TripUsageBackfillApplyPlan;
    result: TripUsageBackfillApplyResult;
  }> {
    validateTripUsageBackfillApplyRequest(options.request, {
      actualGitRef: options.actualGitRef,
    });

    if (options.request.apply) {
      assertSafeTireTripUsageBackfillApplyTarget({
        allowRemote: options.allowRemote,
        allowProd: options.allowProd,
      });
    }

    const alreadyAppliedFingerprints = await this.loadExistingLedgerFingerprints(
      options.auditTrips.map((t) => t.tripId),
    );

    const plan = planTripUsageBackfillApply({
      auditTrips: options.auditTrips,
      request: options.request,
      alreadyAppliedFingerprints,
    });

    if (!options.request.apply) {
      return {
        plan,
        result: {
          dryRun: true,
          applied: 0,
          unchanged: 0,
          skipped: plan.skipped.length,
          manualReviewCount: plan.manualReview.length,
          failed: 0,
          auditLog: [],
          reconciledSetupIds: [],
          recalculatedVehicleIds: [],
          errors: [],
        },
      };
    }

    const result = await this.executeApply(plan, options.request);
    return { plan, result };
  }

  /** Test hook: plan without DB fingerprint load. */
  planFromAuditTrips(
    auditTrips: TripBackfillAuditResult[],
    request: TripUsageBackfillApplyRequest,
    ctx?: { alreadyAppliedFingerprints?: Set<string> },
  ): TripUsageBackfillApplyPlan {
    validateTripUsageBackfillApplyRequest(request);
    return planTripUsageBackfillApply({
      auditTrips,
      request,
      alreadyAppliedFingerprints: ctx?.alreadyAppliedFingerprints,
    });
  }

  private async loadExistingLedgerFingerprints(tripIds: string[]): Promise<Set<string>> {
    if (tripIds.length === 0) return new Set();
    const rows = await this.prisma.tireTripUsageLedger.findMany({
      where: { tripId: { in: tripIds }, invalidatedAt: null },
      select: { tripId: true, tireSetupId: true, sourceFingerprint: true },
    });
    return new Set(rows.map((r) => `${r.tripId}:${r.tireSetupId}:${r.sourceFingerprint}`));
  }

  private async executeApply(
    plan: TripUsageBackfillApplyPlan,
    request: TripUsageBackfillApplyRequest,
  ): Promise<TripUsageBackfillApplyResult> {
    const auditLog: TripUsageBackfillApplyResult['auditLog'] = [];
    const errors: string[] = [];
    let applied = 0;
    let unchanged = 0;
    let failed = 0;
    const affectedSetupIds = new Set<string>();
    const affectedVehicleIds = new Set<string>();

    for (const item of plan.autoApplicable) {
      try {
        const processResult = await this.tireTripUsageService.processCanonicalTripFinalization(
          item.tripId,
          { trigger: 'historical_backfill' },
        );

        if (processResult.attributionStatus === 'UNCHANGED') {
          unchanged += 1;
          auditLog.push(
            buildBackfillApplyAuditEntry({
              tripId: item.tripId,
              vehicleId: item.vehicleId,
              tireSetupId: item.tireSetupId,
              action: 'SKIP_IDEMPOTENT',
              operator: request.operator,
              reason: request.reason,
              attributionStatus: processResult.attributionStatus,
              ledgerAction: processResult.ledgerAction,
            }),
          );
          continue;
        }

        if (processResult.attributionStatus === 'APPLIED') {
          applied += 1;
          if (processResult.tireSetupId) {
            affectedSetupIds.add(processResult.tireSetupId);
          }
          affectedVehicleIds.add(item.vehicleId);
          auditLog.push(
            buildBackfillApplyAuditEntry({
              tripId: item.tripId,
              vehicleId: item.vehicleId,
              tireSetupId: processResult.tireSetupId ?? item.tireSetupId,
              action: 'APPLY_LEDGER',
              operator: request.operator,
              reason: request.reason,
              attributionStatus: processResult.attributionStatus,
              ledgerAction: processResult.ledgerAction,
              details: { sourceFingerprint: processResult.sourceFingerprint },
            }),
          );
          continue;
        }

        failed += 1;
        errors.push(
          `${item.tripId}:unexpected_status_${processResult.attributionStatus}`,
        );
        auditLog.push(
          buildBackfillApplyAuditEntry({
            tripId: item.tripId,
            vehicleId: item.vehicleId,
            tireSetupId: item.tireSetupId,
            action: 'FAILED',
            operator: request.operator,
            reason: request.reason,
            attributionStatus: processResult.attributionStatus,
            details: { reason: processResult.reason },
          }),
        );
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${item.tripId}:${message}`);
        auditLog.push(
          buildBackfillApplyAuditEntry({
            tripId: item.tripId,
            vehicleId: item.vehicleId,
            tireSetupId: item.tireSetupId,
            action: 'FAILED',
            operator: request.operator,
            reason: request.reason,
            details: { error: message },
          }),
        );
        this.logger.warn(`Backfill apply failed for trip ${item.tripId}: ${message}`);
      }
    }

    const reconciledSetupIds: string[] = [];
    if (affectedSetupIds.size > 0) {
      const reconcileResult = await this.reconciliationService.repairSetupAggregates(
        [...affectedSetupIds],
        { operator: request.operator, reason: `${request.reason}:post_backfill_reconcile` },
      );
      reconciledSetupIds.push(
        ...reconcileResult.auditLog
          .filter((e) => e.action === 'REPAIR')
          .map((e) => e.setupId),
      );
      errors.push(...reconcileResult.errors);
    }

    const recalculatedVehicleIds: string[] = [];
    if (request.recalculate && affectedVehicleIds.size > 0) {
      const max = request.recalculateMaxSetups ?? 10;
      const vehicles = [...affectedVehicleIds].slice(0, max);
      for (const vehicleId of vehicles) {
        try {
          await this.tireHealthService.recalculate(vehicleId);
          recalculatedVehicleIds.push(vehicleId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`recalc:${vehicleId}:${message}`);
        }
      }
    }

    return {
      dryRun: false,
      applied,
      unchanged,
      skipped: plan.skipped.length,
      manualReviewCount: plan.manualReview.length,
      failed,
      auditLog,
      reconciledSetupIds,
      recalculatedVehicleIds,
      errors,
    };
  }
}
