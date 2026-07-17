import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryMeasurementType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { BatteryAssessmentService } from '../battery-assessment.service';
import { BatteryMeasurementService } from '../battery-measurement.service';
import { BatteryPublicationService } from '../battery-publication.service';
import { buildLvRestWindowPolicyContext } from '../lv-rest-window/lv-rest-window.policy';
import {
  buildSnapshotRestBackfillIdempotencyKey,
  classifySnapshotRestBackfillBatch,
} from './battery-snapshot-rest-backfill.policy';
import {
  BATTERY_SNAPSHOT_REST_BACKFILL_VERSION,
  DEFAULT_BATTERY_SNAPSHOT_REST_BACKFILL_DAYS,
  type SnapshotRestBackfillApplyResult,
  type SnapshotRestBackfillCandidate,
  type SnapshotRestBackfillPlan,
  type SnapshotRestBackfillPlanItem,
  type SnapshotRestBackfillRunOptions,
} from './battery-snapshot-rest-backfill.types';

@Injectable()
export class BatterySnapshotRestBackfillService {
  private readonly logger = new Logger(BatterySnapshotRestBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyProfiles: BatteryPolicyProfileService,
    private readonly measurements: BatteryMeasurementService,
    private readonly assessment: BatteryAssessmentService,
    private readonly publication: BatteryPublicationService,
  ) {}

  async run(options: SnapshotRestBackfillRunOptions): Promise<{
    plan: SnapshotRestBackfillPlan;
    result: SnapshotRestBackfillApplyResult;
  }> {
    const lookbackDays =
      options.days ?? DEFAULT_BATTERY_SNAPSHOT_REST_BACKFILL_DAYS;
    const to = new Date();
    const from = new Date(to.getTime() - lookbackDays * 24 * 60 * 60_000);
    const apply = options.apply === true;
    const pageSize = Math.min(Math.max(options.batchSize ?? 500, 1), 5000);

    const candidates = await this.loadAllCandidates({
      from,
      to,
      organizationId: options.organizationId,
      vehicleId: options.vehicleId,
      pageSize,
    });

    const plan = await this.buildPlan({
      candidates,
      from,
      to,
      lookbackDays,
      dryRun: !apply,
      organizationId: options.organizationId,
      vehicleId: options.vehicleId,
    });

    if (!apply) {
      return {
        plan,
        result: {
          dryRun: true,
          measurementsCreated: 0,
          measurementsSkipped: plan.skippedExisting + plan.skippedIneligible,
          measurementsFailed: 0,
          assessmentsReplayed: 0,
          assessmentsSkipped: 0,
          publicationsReplayed: 0,
          publicationsSkipped: 0,
          errors: [],
          vehicleResults: [],
        },
      };
    }

    const result = await this.applyPlan(plan, options);
    return { plan, result };
  }

  private async loadAllCandidates(input: {
    from: Date;
    to: Date;
    organizationId?: string;
    vehicleId?: string;
    pageSize: number;
  }): Promise<SnapshotRestBackfillCandidate[]> {
    const all: SnapshotRestBackfillCandidate[] = [];
    let cursorId: string | undefined;

    for (;;) {
      const page = await this.loadCandidatesPage({
        ...input,
        cursorId,
      });
      if (page.length === 0) break;
      all.push(...page);
      if (page.length < input.pageSize) break;
      cursorId = page[page.length - 1].snapshotId;
    }

    return all;
  }

  private async loadCandidatesPage(input: {
    from: Date;
    to: Date;
    organizationId?: string;
    vehicleId?: string;
    pageSize: number;
    cursorId?: string;
  }): Promise<SnapshotRestBackfillCandidate[]> {
    const rows = await this.prisma.batteryHealthSnapshot.findMany({
      where: {
        recordedAt: { gte: input.from, lte: input.to },
        restingVoltage: { not: null },
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
        ...(input.organizationId
          ? { vehicle: { organizationId: input.organizationId } }
          : {}),
        ...(input.cursorId ? { id: { gt: input.cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.pageSize,
      select: {
        id: true,
        vehicleId: true,
        voltageV: true,
        restingVoltage: true,
        engineRunning: true,
        temperatureC: true,
        recordedAt: true,
        createdAt: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    return rows.map((row) => ({
      snapshotId: row.id,
      vehicleId: row.vehicleId,
      organizationId: row.vehicle.organizationId,
      observedAt: row.recordedAt,
      voltageV: row.voltageV,
      restingVoltage: row.restingVoltage,
      engineRunning: row.engineRunning,
      temperatureC: row.temperatureC,
      createdAt: row.createdAt,
    }));
  }

  private async buildPlan(input: {
    candidates: SnapshotRestBackfillCandidate[];
    from: Date;
    to: Date;
    lookbackDays: number;
    dryRun: boolean;
    organizationId?: string;
    vehicleId?: string;
  }): Promise<SnapshotRestBackfillPlan> {
    const byVehicle = new Map<string, SnapshotRestBackfillCandidate[]>();
    for (const candidate of input.candidates) {
      const list = byVehicle.get(candidate.vehicleId) ?? [];
      list.push(candidate);
      byVehicle.set(candidate.vehicleId, list);
    }

    const items: SnapshotRestBackfillPlanItem[] = [];
    const byQuality: Record<string, number> = {};
    const affectedVehicleIds = new Set<string>();

    for (const [, vehicleCandidates] of byVehicle) {
      const policyProfile = buildLvRestWindowPolicyContext(
        await this.policyProfiles.resolveForVehicle(vehicleCandidates[0].vehicleId),
      );
      const classified = classifySnapshotRestBackfillBatch({
        candidates: vehicleCandidates,
        policy: {
          maxRestingVoltage: policyProfile.maxRestingVoltage,
          wakeVoltageThreshold: policyProfile.wakeVoltageThreshold,
        },
      });

      for (const candidate of vehicleCandidates) {
        const classification = classified.get(candidate.snapshotId);
        if (!classification) continue;

        byQuality[classification.quality] =
          (byQuality[classification.quality] ?? 0) + 1;

        const idempotencyKey = buildSnapshotRestBackfillIdempotencyKey(
          candidate.snapshotId,
        );

        if (classification.skipped) {
          items.push({
            snapshotId: candidate.snapshotId,
            vehicleId: candidate.vehicleId,
            organizationId: candidate.organizationId,
            observedAt: candidate.observedAt.toISOString(),
            voltage: classification.voltage,
            quality: classification.quality,
            reasonCode: classification.reasonCode,
            reasonLabel: classification.reasonLabel,
            evidenceEligible: classification.evidenceEligible,
            idempotencyKey,
            action: 'SKIP_INELIGIBLE',
            skipReason: classification.skipReason,
          });
          continue;
        }

        const existing = await this.prisma.batteryMeasurement.findUnique({
          where: {
            organizationId_vehicleId_idempotencyKey: {
              organizationId: candidate.organizationId,
              vehicleId: candidate.vehicleId,
              idempotencyKey,
            },
          },
          select: { id: true },
        });

        if (existing) {
          items.push({
            snapshotId: candidate.snapshotId,
            vehicleId: candidate.vehicleId,
            organizationId: candidate.organizationId,
            observedAt: candidate.observedAt.toISOString(),
            voltage: classification.voltage,
            quality: classification.quality,
            reasonCode: classification.reasonCode,
            reasonLabel: classification.reasonLabel,
            evidenceEligible: classification.evidenceEligible,
            idempotencyKey,
            action: 'SKIP_EXISTS',
            skipReason: 'idempotency_exists',
          });
          continue;
        }

        affectedVehicleIds.add(candidate.vehicleId);
        items.push({
          snapshotId: candidate.snapshotId,
          vehicleId: candidate.vehicleId,
          organizationId: candidate.organizationId,
          observedAt: candidate.observedAt.toISOString(),
          voltage: classification.voltage,
          quality: classification.quality,
          reasonCode: classification.reasonCode,
          reasonLabel: classification.reasonLabel,
          evidenceEligible: classification.evidenceEligible,
          idempotencyKey,
          action: 'CREATE',
        });
      }
    }

    return {
      version: BATTERY_SNAPSHOT_REST_BACKFILL_VERSION,
      dryRun: input.dryRun,
      lookbackDays: input.lookbackDays,
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      candidatesScanned: input.candidates.length,
      plannedCreates: items.filter((row) => row.action === 'CREATE').length,
      skippedExisting: items.filter((row) => row.action === 'SKIP_EXISTS').length,
      skippedIneligible: items.filter((row) => row.action === 'SKIP_INELIGIBLE')
        .length,
      byQuality,
      affectedVehicleIds: [...affectedVehicleIds],
      items,
    };
  }

  private async applyPlan(
    plan: SnapshotRestBackfillPlan,
    options: SnapshotRestBackfillRunOptions,
  ): Promise<SnapshotRestBackfillApplyResult> {
    const errors: string[] = [];
    let measurementsCreated = 0;
    let measurementsSkipped = 0;
    let measurementsFailed = 0;
    const vehicleResults: SnapshotRestBackfillApplyResult['vehicleResults'] = [];
    const vehiclesTouched = new Map<
      string,
      { organizationId: string; created: number }
    >();

    for (const item of plan.items) {
      if (item.action !== 'CREATE') {
        measurementsSkipped += 1;
        continue;
      }

      try {
        await this.measurements.create({
          organizationId: item.organizationId,
          vehicleId: item.vehicleId,
          type: BatteryMeasurementType.REST_60M,
          quality: item.quality,
          observedAt: new Date(item.observedAt),
          numericValue: item.voltage,
          unit: 'V',
          scope: BatteryEvidenceScope.LV,
          providerTimestamp: new Date(item.observedAt),
          providerSource: 'DIMO',
          signalName: 'lowVoltageBatteryCurrentVoltage',
          receivedAt: new Date(item.observedAt),
          idempotencyKey: item.idempotencyKey,
          provenance: {
            selectionMethod: 'historical_snapshot_backfill',
            sourceSnapshotId: item.snapshotId,
            backfillVersion: plan.version,
            qualityReasonCode: item.reasonCode,
            qualityReasonLabel: item.reasonLabel,
            evidenceEligible: item.evidenceEligible,
            publicationEligible: false,
            providerTimestamp: item.observedAt,
            receivedAt: item.observedAt,
            operator: options.operator ?? null,
            reason: options.reason ?? null,
          },
          context: {
            backfillVersion: plan.version,
            sourceSnapshotId: item.snapshotId,
            qualityReasonCode: item.reasonCode,
            qualityReasonLabel: item.reasonLabel,
            historicalBackfill: true,
          },
        });
        measurementsCreated += 1;
        const entry = vehiclesTouched.get(item.vehicleId) ?? {
          organizationId: item.organizationId,
          created: 0,
        };
        entry.created += 1;
        vehiclesTouched.set(item.vehicleId, entry);
      } catch (err) {
        measurementsFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${item.snapshotId}:${message}`);
        this.logger.warn(
          `Snapshot rest backfill failed snapshot=${item.snapshotId}: ${message}`,
        );
      }
    }

    let assessmentsReplayed = 0;
    let assessmentsSkipped = 0;
    let publicationsReplayed = 0;
    let publicationsSkipped = 0;

    const replayAssessment = options.replayAssessment !== false;
    const enablePublicationReplay = options.enablePublicationReplay === true;

    if (enablePublicationReplay) {
      process.env.BATTERY_V2_PUBLICATION_ENABLED = 'true';
    }

    for (const [vehicleId, meta] of vehiclesTouched) {
      let assessmentOk = false;
      let assessmentIds: string[] = [];
      let publicationPersisted = false;
      let publicationMaturity: string | undefined;

      if (replayAssessment) {
        try {
          const assessmentResult = await this.assessment.recomputeLvEstimatedHealth({
            organizationId: meta.organizationId,
            vehicleId,
            shadowMode: false,
          });
          assessmentOk = assessmentResult.ok;
          assessmentIds = assessmentResult.persistedAssessmentIds;
          if (assessmentResult.ok) {
            assessmentsReplayed += 1;
          } else {
            assessmentsSkipped += 1;
          }

          if (
            enablePublicationReplay &&
            assessmentResult.ok &&
            assessmentResult.persistedAssessmentIds.length > 0
          ) {
            const latestAssessmentId =
              assessmentResult.persistedAssessmentIds[
                assessmentResult.persistedAssessmentIds.length - 1
              ];
            const pubResult = await this.publication.updateLvPublication({
              organizationId: meta.organizationId,
              vehicleId,
              assessmentId: latestAssessmentId,
            });
            publicationPersisted = pubResult.persistedPublicationId != null;
            publicationMaturity = pubResult.decision.maturity;
            if (publicationPersisted) {
              publicationsReplayed += 1;
            } else {
              publicationsSkipped += 1;
            }
          }
        } catch (err) {
          assessmentsSkipped += 1;
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${vehicleId}:assessment:${message}`);
        }
      }

      vehicleResults.push({
        vehicleId,
        organizationId: meta.organizationId,
        measurementsCreated: meta.created,
        assessmentOk,
        assessmentIds,
        publicationPersisted,
        publicationMaturity,
      });
    }

    return {
      dryRun: false,
      measurementsCreated,
      measurementsSkipped,
      measurementsFailed,
      assessmentsReplayed,
      assessmentsSkipped,
      publicationsReplayed,
      publicationsSkipped,
      errors,
      vehicleResults,
    };
  }
}
