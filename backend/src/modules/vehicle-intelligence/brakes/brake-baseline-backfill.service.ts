import { Injectable, Logger } from '@nestjs/common';
import { BrakeComponentInstallationAnchorSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildBackfillApplyAuditEntry,
  buildBrakeBaselineApplyAuditRows,
  buildBrakeBaselineBackfillIdempotencyKey,
  buildComponentIdempotencyFingerprint,
  componentTypeFromBaseline,
  planBrakeBaselineBackfillApply,
  scopeForBaselineComponent,
  validateBrakeBaselineBackfillApplyRequest,
  type BrakeBaselineApplyAuditRow,
  type BrakeBaselineBackfillApplyPlan,
  type BrakeBaselineBackfillApplyRequest,
  type BrakeBaselineBackfillApplyResult,
  type BrakeBaselineBackfillPlanItem,
} from './brake-baseline-backfill-apply';
import { assertSafeBrakeBaselineBackfillApplyTarget } from './brake-baseline-backfill-apply.safety';
import type { VehicleBrakeBaselineAuditInput } from './brake-baseline-candidate-audit';
import { BrakeComponentLifecycleService } from './brake-component-lifecycle.service';
import { BrakeHealthService } from './brake-health.service';
import { thicknessFieldForComponent } from './brake-component-lifecycle.scope';

export interface BrakeBaselineBackfillRunOptions {
  request: BrakeBaselineBackfillApplyRequest;
  auditInputs: VehicleBrakeBaselineAuditInput[];
  auditSalt?: string;
  actualGitRef?: string;
  allowRemote?: boolean;
  allowProd?: boolean;
}

@Injectable()
export class BrakeBaselineBackfillService {
  private readonly logger = new Logger(BrakeBaselineBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: BrakeComponentLifecycleService,
    private readonly brakeHealth: BrakeHealthService,
  ) {}

  async run(options: BrakeBaselineBackfillRunOptions): Promise<{
    plan: BrakeBaselineBackfillApplyPlan;
    result: BrakeBaselineBackfillApplyResult;
    auditRows: BrakeBaselineApplyAuditRow[];
  }> {
    validateBrakeBaselineBackfillApplyRequest(options.request, {
      actualGitRef: options.actualGitRef,
    });

    if (options.request.apply) {
      assertSafeBrakeBaselineBackfillApplyTarget({
        allowRemote: options.allowRemote,
        allowProd: options.allowProd,
      });
    }

    const auditSalt = options.auditSalt ?? 'brake-baseline-backfill';
    const auditRows = buildBrakeBaselineApplyAuditRows(options.auditInputs, auditSalt);

    const scopedVehicleIds = [
      ...new Set(
        auditRows
          .filter((row) => {
            if (options.request.organizationId && row.organizationId !== options.request.organizationId) {
              return false;
            }
            if (options.request.vehicleId && row.vehicleId !== options.request.vehicleId) {
              return false;
            }
            if (
              options.request.components?.length &&
              !options.request.components.includes(row.component)
            ) {
              return false;
            }
            return true;
          })
          .map((row) => row.vehicleId),
      ),
    ];

    const alreadyAppliedFingerprints = await this.loadAlreadyAppliedFingerprints(scopedVehicleIds);
    const existingInstallationFingerprints = await this.loadExistingInstallationFingerprints(
      scopedVehicleIds,
    );

    const plan = planBrakeBaselineBackfillApply({
      auditRows,
      request: options.request,
      alreadyAppliedFingerprints,
      existingInstallationFingerprints,
    });

    if (!options.request.apply) {
      return {
        plan,
        auditRows,
        result: {
          dryRun: true,
          applied: 0,
          unchanged: 0,
          skipped: plan.skipped.length,
          manualReviewCount: plan.manualReview.length,
          failed: 0,
          auditLog: [],
          recalculatedVehicleIds: [],
          errors: [],
        },
      };
    }

    const result = await this.executeApply(plan, options.request);
    return { plan, result, auditRows };
  }

  /** Test hook: plan without DB fingerprint load. */
  planFromAuditInputs(
    auditInputs: VehicleBrakeBaselineAuditInput[],
    request: BrakeBaselineBackfillApplyRequest,
    ctx?: {
      auditSalt?: string;
      alreadyAppliedFingerprints?: Set<string>;
      existingInstallationFingerprints?: Set<string>;
    },
  ): { plan: BrakeBaselineBackfillApplyPlan; auditRows: BrakeBaselineApplyAuditRow[] } {
    validateBrakeBaselineBackfillApplyRequest(request);
    const auditRows = buildBrakeBaselineApplyAuditRows(
      auditInputs,
      ctx?.auditSalt ?? 'brake-baseline-backfill',
    );
    const plan = planBrakeBaselineBackfillApply({
      auditRows,
      request,
      alreadyAppliedFingerprints: ctx?.alreadyAppliedFingerprints,
      existingInstallationFingerprints: ctx?.existingInstallationFingerprints,
    });
    return { plan, auditRows };
  }

  private async loadAlreadyAppliedFingerprints(vehicleIds: string[]): Promise<Set<string>> {
    if (vehicleIds.length === 0) return new Set();
    const markerPrefix = 'brake-baseline-backfill:';
    const events = await this.prisma.vehicleServiceEvent.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        eventType: 'BRAKE_SERVICE',
        notes: { contains: markerPrefix },
      },
      select: { notes: true },
    });
    const fingerprints = new Set<string>();
    for (const event of events) {
      const match = event.notes?.match(/brake-baseline-backfill:([a-f0-9]{16})/);
      if (match?.[1]) fingerprints.add(match[1]);
    }
    return fingerprints;
  }

  private async loadExistingInstallationFingerprints(vehicleIds: string[]): Promise<Set<string>> {
    if (vehicleIds.length === 0) return new Set();
    const rows = await this.prisma.brakeComponentInstallation.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        status: 'ACTIVE',
        removedAt: null,
      },
      select: {
        vehicleId: true,
        componentType: true,
        anchorThicknessMm: true,
        installedAt: true,
        installedOdometerKm: true,
        anchorSource: true,
        serviceEventId: true,
        sourceEvidenceId: true,
      },
    });

    const fingerprints = new Set<string>();
    for (const row of rows) {
      if (row.anchorThicknessMm == null) continue;
      const candidateClass =
        row.anchorSource === BrakeComponentInstallationAnchorSource.MEASURED
          ? 'EXACT_MEASURED'
          : row.anchorSource === BrakeComponentInstallationAnchorSource.DOCUMENTED_REPLACEMENT
            ? 'CONFIRMED_REPLACEMENT'
            : 'HIGH_CONFIDENCE_DOCUMENTED';
      fingerprints.add(
        buildComponentIdempotencyFingerprint({
          vehicleId: row.vehicleId,
          component: row.componentType as BrakeBaselineApplyAuditRow['component'],
          candidateClass,
          thicknessMm: row.anchorThicknessMm,
          timestamp: row.installedAt.toISOString(),
          odometerKm: row.installedOdometerKm,
          source: null,
          rawRefId: row.sourceEvidenceId ?? row.serviceEventId,
        }),
      );
    }
    return fingerprints;
  }

  private async executeApply(
    plan: BrakeBaselineBackfillApplyPlan,
    request: BrakeBaselineBackfillApplyRequest,
  ): Promise<BrakeBaselineBackfillApplyResult> {
    const auditLog: BrakeBaselineBackfillApplyResult['auditLog'] = [];
    const errors: string[] = [];
    let applied = 0;
    let unchanged = 0;
    let failed = 0;
    const affectedVehicleIds = new Set<string>();

    for (const item of plan.autoApplicable) {
      try {
        const outcome = await this.applyPlanItem(item, request);
        if (outcome.idempotentReplay) {
          unchanged += 1;
          auditLog.push(
            buildBackfillApplyAuditEntry({
              vehicleId: item.vehicleId,
              organizationId: item.organizationId,
              component: item.component,
              action: 'SKIP_IDEMPOTENT',
              operator: request.operator,
              reason: request.reason,
              lifecycleOperation: item.lifecycleOperation ?? undefined,
              installationId: outcome.installationIds[0],
              serviceEventId: outcome.serviceEventId ?? undefined,
            }),
          );
          continue;
        }

        applied += 1;
        affectedVehicleIds.add(item.vehicleId);
        auditLog.push(
          buildBackfillApplyAuditEntry({
            vehicleId: item.vehicleId,
            organizationId: item.organizationId,
            component: item.component,
            action: 'APPLY_BASELINE',
            operator: request.operator,
            reason: request.reason,
            lifecycleOperation: item.lifecycleOperation ?? undefined,
            installationId: outcome.installationIds[0],
            serviceEventId: outcome.serviceEventId ?? undefined,
            details: {
              candidateClass: item.candidateClass,
              thicknessMm: item.thicknessMm,
              odometerKm: item.odometerKm,
              anchorSource: outcome.anchorSource,
            },
          }),
        );
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${item.vehicleId}:${item.component}:${message}`);
        auditLog.push(
          buildBackfillApplyAuditEntry({
            vehicleId: item.vehicleId,
            organizationId: item.organizationId,
            component: item.component,
            action: 'FAILED',
            operator: request.operator,
            reason: request.reason,
            details: { error: message },
          }),
        );
        this.logger.warn(
          `Brake baseline backfill failed for ${item.vehicleId}/${item.component}: ${message}`,
        );
      }
    }

    const recalculatedVehicleIds: string[] = [];
    if (request.recalculate && affectedVehicleIds.size > 0) {
      const max = request.recalculateMaxVehicles ?? 10;
      const vehicles = [...affectedVehicleIds].slice(0, max);
      for (const vehicleId of vehicles) {
        try {
          await this.brakeHealth.recalculate(vehicleId);
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
      recalculatedVehicleIds,
      errors,
    };
  }

  private async applyPlanItem(
    item: BrakeBaselineBackfillPlanItem,
    request: BrakeBaselineBackfillApplyRequest,
  ) {
    if (!item.organizationId) {
      throw new Error('organization_required_for_apply');
    }
    if (item.thicknessMm == null || item.timestamp == null || item.odometerKm == null) {
      throw new Error('missing_anchor_fields');
    }

    const componentType = componentTypeFromBaseline(item.component);
    const thicknessField = thicknessFieldForComponent(componentType);
    const thickness = { [thicknessField]: item.thicknessMm };
    const idempotencyKey = buildBrakeBaselineBackfillIdempotencyKey(item.idempotencyFingerprint);
    const baseCommand = {
      organizationId: item.organizationId,
      vehicleId: item.vehicleId,
      serviceDate: item.timestamp,
      odometerKm: item.odometerKm,
      scope: scopeForBaselineComponent(item.component),
      idempotencyKey,
      notes: `${request.reason} [${idempotencyKey}]`,
    };

    if (item.lifecycleOperation === 'register_measured') {
      const result = await this.lifecycle.registerMeasuredBaseline({
        ...baseCommand,
        thickness,
      });
      return { ...result, anchorSource: 'MEASURED' };
    }

    const result = await this.lifecycle.registerDocumentedReplacement({
      ...baseCommand,
      nominalThicknessMm: item.thicknessMm,
      thickness,
    });
    return { ...result, anchorSource: 'DOCUMENTED_REPLACEMENT' };
  }
}
