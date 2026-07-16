import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryV2RetentionAggregateService } from './battery-v2-retention-aggregate.service';
import {
  isQualifiedBatteryEvidence,
  isShadowOnlyBatteryEvidence,
  measurementRetentionDays,
  retentionCutoff,
  utcDayKey,
  type BatteryV2RetentionDaysConfig,
  type BatteryV2RetentionPhaseResult,
  type BatteryV2RetentionReport,
  type BatteryV2RetentionRunOptions,
} from './battery-v2-retention.types';
import { recordBatteryRetentionRun } from '../observability/battery-v2-prometheus.metrics';

interface BatchContext {
  dryRun: boolean;
  batchSize: number;
  maxBatches: number;
}

@Injectable()
export class BatteryV2RetentionService implements OnModuleInit {
  private readonly logger = new Logger(BatteryV2RetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aggregates: BatteryV2RetentionAggregateService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('batteryV2Retention.enabled', false);
    const dryRun = this.config.get<boolean>('batteryV2Retention.dryRun', true);
    const days = this.config.get<BatteryV2RetentionDaysConfig>('batteryV2Retention.days');
    this.logger.log(
      `Battery V2 retention ${enabled ? 'ENABLED' : 'DISABLED'} — dryRun=${dryRun} — no run on deploy`,
    );
    if (days) {
      const active = Object.entries(days)
        .filter(([, value]) => Number(value) > 0)
        .map(([key, value]) => `${key}=${value}d`);
      this.logger.log(
        `Battery V2 retention windows: ${active.length ? active.join(', ') : '(all disabled)'}`,
      );
    }
  }

  async runOnce(options: BatteryV2RetentionRunOptions = {}): Promise<BatteryV2RetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const enabled = this.config.get<boolean>('batteryV2Retention.enabled', false);

    if (!enabled) {
      this.logger.debug(`Battery V2 retention disabled — skipping ${trigger} run.`);
      return this.emptyReport(trigger, true, startedAtMs);
    }

    if (this.running) {
      this.logger.warn('Battery V2 retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, this.resolveDryRun(options), startedAtMs);
    }

    this.running = true;
    const dryRun = this.resolveDryRun(options);
    const batchSize = this.config.get<number>('batteryV2Retention.batchSize', 1000);
    const maxBatches = this.config.get<number>('batteryV2Retention.maxBatchesPerPhase', 200);
    const days = this.config.get<BatteryV2RetentionDaysConfig>('batteryV2Retention.days')!;
    const ctx: BatchContext = { dryRun, batchSize, maxBatches };
    const phases: BatteryV2RetentionPhaseResult[] = [];

    try {
      phases.push(await this.phasePrepareAggregates(ctx, days));
      phases.push(await this.phasePruneShadowEvidence(ctx, days));
      phases.push(await this.phasePruneHvCapacityObservations(ctx, days));
      phases.push(await this.phasePruneMeasurements(ctx, days));
      phases.push(await this.phasePruneHvChargeSessions(ctx, days));
      phases.push(await this.phasePruneMeasurementSessions(ctx, days));
      phases.push(await this.phasePruneSupersededAssessments(ctx, days));
      phases.push(await this.phasePruneLvProviderSnapshots(ctx, days));
      phases.push(await this.phasePruneHvProviderSnapshots(ctx, days));
      phases.push(await this.phasePruneCapabilityChanges(ctx, days));
      phases.push(await this.phasePruneDeadLetters(ctx, days));

      const totals = phases.reduce(
        (acc, phase) => ({
          aggregated: acc.aggregated + phase.aggregated,
          deleted: acc.deleted + phase.deleted,
          skipped: acc.skipped + phase.skipped,
        }),
        { aggregated: 0, deleted: 0, skipped: 0 },
      );

      const report: BatteryV2RetentionReport = {
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        phases,
        totals,
      };

      if (this.metrics) {
        recordBatteryRetentionRun(this.metrics, {
          dryRun,
          deleted: totals.deleted,
          aggregated: totals.aggregated,
        });
      }

      this.logger.log(
        `Battery V2 retention ${trigger} complete — dryRun=${dryRun} aggregated=${totals.aggregated} deleted=${totals.deleted} skipped=${totals.skipped} in ${report.durationMs}ms`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }

  private resolveDryRun(options: BatteryV2RetentionRunOptions): boolean {
    if (options.dryRunOverride != null) return options.dryRunOverride;
    return this.config.get<boolean>('batteryV2Retention.dryRun', true);
  }

  private emptyReport(
    trigger: BatteryV2RetentionReport['trigger'],
    dryRun: boolean,
    startedAtMs: number,
  ): BatteryV2RetentionReport {
    return {
      trigger,
      dryRun,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      phases: [],
      totals: { aggregated: 0, deleted: 0, skipped: 0 },
    };
  }

  private async phasePrepareAggregates(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prepare_aggregates';
    let aggregated = 0;
    let skipped = 0;
    let scanned = 0;

    for (const scope of [BatteryEvidenceScope.LV, BatteryEvidenceScope.HV]) {
      const retentionDays = measurementRetentionDays(scope, days);
      const cutoff = retentionCutoff(retentionDays);
      if (!cutoff) continue;

      const candidates = await this.prisma.batteryMeasurement.findMany({
        where: {
          scope,
          observedAt: { lt: cutoff },
          sessionId: { not: null },
        },
        select: { id: true, sessionId: true },
        take: ctx.batchSize,
        orderBy: { observedAt: 'asc' },
      });
      scanned += candidates.length;

      const sessionIds = [...new Set(candidates.map((row) => row.sessionId!).filter(Boolean))];
      const sessionResult = await this.aggregates.ensureSessionAggregates({
        sessionIds,
        dryRun: ctx.dryRun,
      });
      aggregated += sessionResult.aggregated;
      skipped += sessionResult.skipped;

      const dailyResult = await this.aggregates.ensureDailyAggregatesForMeasurements({
        measurementIds: candidates.map((row) => row.id),
        dryRun: ctx.dryRun,
      });
      aggregated += dailyResult.aggregated;
      skipped += dailyResult.skipped;
    }

    return { phase, scanned, aggregated, deleted: 0, skipped, dryRun: ctx.dryRun };
  }

  private async phasePruneShadowEvidence(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prune_shadow_evidence';
    const cutoff = retentionCutoff(days.evidenceShadowOnly);
    if (!cutoff) {
      return { phase, scanned: 0, aggregated: 0, deleted: 0, skipped: 0, dryRun: ctx.dryRun };
    }

    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (let batch = 0; batch < ctx.maxBatches; batch++) {
      const rows = await this.prisma.batteryEvidence.findMany({
        where: { observedAt: { lt: cutoff } },
        select: {
          id: true,
          sourceType: true,
          documentExtractionId: true,
          serviceEventId: true,
          quality: true,
          measurementId: true,
        },
        take: ctx.batchSize,
        orderBy: { observedAt: 'asc' },
      });
      if (rows.length === 0) break;
      scanned += rows.length;

      const deletableIds: string[] = [];
      for (const row of rows) {
        if (
          days.qualifiedEvidence === 0 &&
          isQualifiedBatteryEvidence(row)
        ) {
          skipped += 1;
          continue;
        }
        if (!isShadowOnlyBatteryEvidence(row)) {
          skipped += 1;
          continue;
        }
        if (row.measurementId) {
          const measurement = await this.prisma.batteryMeasurement.findUnique({
            where: { id: row.measurementId },
            select: { id: true },
          });
          if (measurement) {
            skipped += 1;
            continue;
          }
        }
        deletableIds.push(row.id);
      }

      if (deletableIds.length > 0) {
        if (!ctx.dryRun) {
          const res = await this.prisma.batteryEvidence.deleteMany({
            where: { id: { in: deletableIds } },
          });
          deleted += res.count;
        } else {
          deleted += deletableIds.length;
        }
      }

      if (rows.length < ctx.batchSize) break;
    }

    return { phase, scanned, aggregated: 0, deleted, skipped, dryRun: ctx.dryRun };
  }

  private async phasePruneHvCapacityObservations(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prune_hv_capacity_observations';
    const cutoff = retentionCutoff(days.hvCapacityObservations);
    if (!cutoff) {
      return { phase, scanned: 0, aggregated: 0, deleted: 0, skipped: 0, dryRun: ctx.dryRun };
    }

    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (let batch = 0; batch < ctx.maxBatches; batch++) {
      const rows = await this.prisma.hvCapacityObservation.findMany({
        where: { observedAt: { lt: cutoff } },
        select: { id: true, assessmentId: true },
        take: ctx.batchSize,
        orderBy: { observedAt: 'asc' },
      });
      if (rows.length === 0) break;
      scanned += rows.length;

      const deletableIds: string[] = [];
      for (const row of rows) {
        if (row.assessmentId) {
          const assessment = await this.prisma.batteryAssessment.findUnique({
            where: { id: row.assessmentId },
            select: { id: true, supersededById: true },
          });
          if (assessment && !assessment.supersededById) {
            skipped += 1;
            continue;
          }
        }
        deletableIds.push(row.id);
      }

      if (deletableIds.length > 0) {
        if (!ctx.dryRun) {
          const res = await this.prisma.hvCapacityObservation.deleteMany({
            where: { id: { in: deletableIds } },
          });
          deleted += res.count;
        } else {
          deleted += deletableIds.length;
        }
      }

      if (rows.length < ctx.batchSize) break;
    }

    return { phase, scanned, aggregated: 0, deleted, skipped, dryRun: ctx.dryRun };
  }

  private async phasePruneMeasurements(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prune_measurements';
    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (const scope of [BatteryEvidenceScope.LV, BatteryEvidenceScope.HV]) {
      const cutoff = retentionCutoff(measurementRetentionDays(scope, days));
      if (!cutoff) continue;

      for (let batch = 0; batch < ctx.maxBatches; batch++) {
        const rows = await this.prisma.batteryMeasurement.findMany({
          where: { scope, observedAt: { lt: cutoff } },
          select: {
            id: true,
            vehicleId: true,
            sessionId: true,
            scope: true,
            observedAt: true,
            supersededById: true,
          },
          take: ctx.batchSize,
          orderBy: { observedAt: 'asc' },
        });
        if (rows.length === 0) break;
        scanned += rows.length;

        const deletableIds: string[] = [];
        for (const row of rows) {
          if (await this.isMeasurementReferenced(row.id)) {
            skipped += 1;
            continue;
          }

          const superseding = await this.prisma.batteryMeasurement.count({
            where: { supersededById: row.id },
          });
          if (superseding > 0) {
            skipped += 1;
            continue;
          }

          if (row.sessionId) {
            const hasAggregate = await this.aggregates.sessionHasAggregate(
              row.sessionId,
              row.vehicleId,
            );
            if (!hasAggregate) {
              skipped += 1;
              continue;
            }
          } else {
            const hasDaily = await this.aggregates.dailyHasAggregate(
              row.vehicleId,
              row.scope,
              utcDayKey(row.observedAt),
            );
            if (!hasDaily) {
              skipped += 1;
              continue;
            }
          }

          deletableIds.push(row.id);
        }

        if (deletableIds.length > 0) {
          if (!ctx.dryRun) {
            const res = await this.prisma.batteryMeasurement.deleteMany({
              where: { id: { in: deletableIds } },
            });
            deleted += res.count;
          } else {
            deleted += deletableIds.length;
          }
        }

        if (rows.length < ctx.batchSize) break;
      }
    }

    return { phase, scanned, aggregated: 0, deleted, skipped, dryRun: ctx.dryRun };
  }

  private async isMeasurementReferenced(measurementId: string): Promise<boolean> {
    const evidence = await this.prisma.batteryEvidence.findFirst({
      where: { measurementId },
      select: {
        id: true,
        sourceType: true,
        documentExtractionId: true,
        serviceEventId: true,
      },
    });
    if (!evidence) return false;
    return isQualifiedBatteryEvidence(evidence);
  }

  private async phasePruneHvChargeSessions(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prune_hv_charge_sessions';
    const cutoff = retentionCutoff(days.hvChargeSessions);
    if (!cutoff) {
      return { phase, scanned: 0, aggregated: 0, deleted: 0, skipped: 0, dryRun: ctx.dryRun };
    }

    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (let batch = 0; batch < ctx.maxBatches; batch++) {
      const rows = await this.prisma.hvChargeSession.findMany({
        where: { startAt: { lt: cutoff } },
        select: { id: true },
        take: ctx.batchSize,
        orderBy: { startAt: 'asc' },
      });
      if (rows.length === 0) break;
      scanned += rows.length;

      const deletableIds: string[] = [];
      for (const row of rows) {
        const observationCount = await this.prisma.hvCapacityObservation.count({
          where: { chargeSessionId: row.id },
        });
        if (observationCount > 0) {
          skipped += 1;
          continue;
        }
        deletableIds.push(row.id);
      }

      if (deletableIds.length > 0) {
        if (!ctx.dryRun) {
          const res = await this.prisma.hvChargeSession.deleteMany({
            where: { id: { in: deletableIds } },
          });
          deleted += res.count;
        } else {
          deleted += deletableIds.length;
        }
      }

      if (rows.length < ctx.batchSize) break;
    }

    return { phase, scanned, aggregated: 0, deleted, skipped, dryRun: ctx.dryRun };
  }

  private async phasePruneMeasurementSessions(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prune_measurement_sessions';
    const cutoff = retentionCutoff(days.measurementSessions);
    if (!cutoff) {
      return { phase, scanned: 0, aggregated: 0, deleted: 0, skipped: 0, dryRun: ctx.dryRun };
    }

    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (let batch = 0; batch < ctx.maxBatches; batch++) {
      const rows = await this.prisma.batteryMeasurementSession.findMany({
        where: { startedAt: { lt: cutoff } },
        select: { id: true, vehicleId: true },
        take: ctx.batchSize,
        orderBy: { startedAt: 'asc' },
      });
      if (rows.length === 0) break;
      scanned += rows.length;

      const deletableIds: string[] = [];
      for (const row of rows) {
        const measurementCount = await this.prisma.batteryMeasurement.count({
          where: { sessionId: row.id },
        });
        if (measurementCount > 0) {
          skipped += 1;
          continue;
        }
        const hasAggregate = await this.aggregates.sessionHasAggregate(row.id, row.vehicleId);
        if (!hasAggregate) {
          skipped += 1;
          continue;
        }
        deletableIds.push(row.id);
      }

      if (deletableIds.length > 0) {
        if (!ctx.dryRun) {
          const res = await this.prisma.batteryMeasurementSession.deleteMany({
            where: { id: { in: deletableIds } },
          });
          deleted += res.count;
        } else {
          deleted += deletableIds.length;
        }
      }

      if (rows.length < ctx.batchSize) break;
    }

    return { phase, scanned, aggregated: 0, deleted, skipped, dryRun: ctx.dryRun };
  }

  private async phasePruneSupersededAssessments(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    const phase = 'prune_superseded_assessments';
    const cutoff = retentionCutoff(days.assessmentsDetail);
    if (!cutoff) {
      return { phase, scanned: 0, aggregated: 0, deleted: 0, skipped: 0, dryRun: ctx.dryRun };
    }

    let deleted = 0;
    let skipped = 0;
    let scanned = 0;

    for (let batch = 0; batch < ctx.maxBatches; batch++) {
      const rows = await this.prisma.batteryAssessment.findMany({
        where: {
          computedAt: { lt: cutoff },
          supersededById: { not: null },
        },
        select: { id: true },
        take: ctx.batchSize,
        orderBy: { computedAt: 'asc' },
      });
      if (rows.length === 0) break;
      scanned += rows.length;

      const deletableIds: string[] = [];
      for (const row of rows) {
        const publicationCount = await this.prisma.batteryPublication.count({
          where: { assessmentId: row.id },
        });
        if (publicationCount > 0) {
          skipped += 1;
          continue;
        }
        deletableIds.push(row.id);
      }

      if (deletableIds.length > 0) {
        if (!ctx.dryRun) {
          const res = await this.prisma.batteryAssessment.deleteMany({
            where: { id: { in: deletableIds } },
          });
          deleted += res.count;
        } else {
          deleted += deletableIds.length;
        }
      }

      if (rows.length < ctx.batchSize) break;
    }

    return { phase, scanned, aggregated: 0, deleted, skipped, dryRun: ctx.dryRun };
  }

  private async phasePruneLvProviderSnapshots(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    return this.pruneSimpleTable({
      phase: 'prune_lv_provider_snapshots',
      ctx,
      cutoff: retentionCutoff(days.lvProviderSnapshots),
      fetchIds: async (take) => {
        const rows = await this.prisma.batteryHealthSnapshot.findMany({
          where: { recordedAt: { lt: retentionCutoff(days.lvProviderSnapshots)! } },
          select: { id: true },
          take,
          orderBy: { recordedAt: 'asc' },
        });
        return rows.map((row) => row.id);
      },
      deleteIds: async (ids) =>
        this.prisma.batteryHealthSnapshot.deleteMany({ where: { id: { in: ids } } }),
    });
  }

  private async phasePruneHvProviderSnapshots(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    return this.pruneSimpleTable({
      phase: 'prune_hv_provider_snapshots',
      ctx,
      cutoff: retentionCutoff(days.hvProviderSnapshots),
      fetchIds: async (take) => {
        const rows = await this.prisma.hvBatteryHealthSnapshot.findMany({
          where: { recordedAt: { lt: retentionCutoff(days.hvProviderSnapshots)! } },
          select: { id: true },
          take,
          orderBy: { recordedAt: 'asc' },
        });
        return rows.map((row) => row.id);
      },
      deleteIds: async (ids) =>
        this.prisma.hvBatteryHealthSnapshot.deleteMany({ where: { id: { in: ids } } }),
    });
  }

  private async phasePruneCapabilityChanges(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    return this.pruneSimpleTable({
      phase: 'prune_capability_changes',
      ctx,
      cutoff: retentionCutoff(days.capabilityChanges),
      fetchIds: async (take) => {
        const rows = await this.prisma.vehicleBatteryCapabilityChange.findMany({
          where: { changedAt: { lt: retentionCutoff(days.capabilityChanges)! } },
          select: { id: true },
          take,
          orderBy: { changedAt: 'asc' },
        });
        return rows.map((row) => row.id);
      },
      deleteIds: async (ids) =>
        this.prisma.vehicleBatteryCapabilityChange.deleteMany({ where: { id: { in: ids } } }),
    });
  }

  private async phasePruneDeadLetters(
    ctx: BatchContext,
    days: BatteryV2RetentionDaysConfig,
  ): Promise<BatteryV2RetentionPhaseResult> {
    return this.pruneSimpleTable({
      phase: 'prune_dead_letters',
      ctx,
      cutoff: retentionCutoff(days.deadLetters),
      fetchIds: async (take) => {
        const rows = await this.prisma.batteryV2JobDeadLetter.findMany({
          where: { failedAt: { lt: retentionCutoff(days.deadLetters)! } },
          select: { id: true },
          take,
          orderBy: { failedAt: 'asc' },
        });
        return rows.map((row) => row.id);
      },
      deleteIds: async (ids) =>
        this.prisma.batteryV2JobDeadLetter.deleteMany({ where: { id: { in: ids } } }),
    });
  }

  private async pruneSimpleTable(input: {
    phase: string;
    ctx: BatchContext;
    cutoff: Date | null;
    fetchIds: (take: number) => Promise<string[]>;
    deleteIds: (ids: string[]) => Promise<Prisma.BatchPayload>;
  }): Promise<BatteryV2RetentionPhaseResult> {
    if (!input.cutoff) {
      return {
        phase: input.phase,
        scanned: 0,
        aggregated: 0,
        deleted: 0,
        skipped: 0,
        dryRun: input.ctx.dryRun,
      };
    }

    let deleted = 0;
    let scanned = 0;
    for (let batch = 0; batch < input.ctx.maxBatches; batch++) {
      const ids = await input.fetchIds(input.ctx.batchSize);
      if (ids.length === 0) break;
      scanned += ids.length;
      if (!input.ctx.dryRun) {
        const res = await input.deleteIds(ids);
        deleted += res.count;
      } else {
        deleted += ids.length;
      }
      if (ids.length < input.ctx.batchSize) break;
    }

    return {
      phase: input.phase,
      scanned,
      aggregated: 0,
      deleted,
      skipped: 0,
      dryRun: input.ctx.dryRun,
    };
  }
}
