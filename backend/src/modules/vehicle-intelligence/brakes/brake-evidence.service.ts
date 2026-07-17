import { Injectable, Optional } from '@nestjs/common';
import {
  BrakeAxle,
  BrakeComponentStatus,
  BrakeEvidenceConfidence,
  BrakeEvidenceConfirmationStatus,
  BrakeEvidenceFreshnessStatus,
  BrakeEvidenceSource,
  BrakeWheelPosition,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';
import {
  aggregateActiveSafetySignals,
  buildEvidenceDedupeKey,
  computeImmediateReplacementExpiresAt,
  computeProviderWarningExpiresAt,
  defaultConfirmationStatusForSource,
  isActiveEvidence,
  isMmGroundTruth,
  MM_GROUND_TRUTH_SOURCES,
  resolveEffectiveFreshness,
  stripUntrustedMm,
  rawMmCountsAsSignal,
  type AggregatedSafetySignals,
  type EvidenceDedupeInput,
} from './brake-evidence.domain';

export interface BrakeEvidenceWriteInput {
  organizationId?: string | null;
  vehicleId: string;
  source: BrakeEvidenceSource;
  axle?: BrakeAxle;
  wheelPosition?: BrakeWheelPosition | null;
  measuredPadMm?: number | null;
  measuredDiscMm?: number | null;
  discCondition?: BrakeComponentStatus | null;
  brakeFluidStatus?: BrakeComponentStatus | null;
  immediateReplacement?: boolean | null;
  dtcSeverity?: string | null;
  dtcCode?: string | null;
  dtcActive?: boolean | null;
  vehicleDtcEventId?: string | null;
  mileageAtMeasurementKm?: number | null;
  measuredAt?: Date | null;
  sourceTimestamp?: Date | null;
  confidence?: BrakeEvidenceConfidence;
  notes?: string | null;
  documentExtractionId?: string | null;
  serviceEventId?: string | null;
  createdById?: string | null;
  externalSourceId?: string | null;
  dedupeKey?: string | null;
  active?: boolean;
  confirmationStatus?: BrakeEvidenceConfirmationStatus;
  confirmedBy?: string | null;
  confirmedAt?: Date | null;
  freshnessStatus?: BrakeEvidenceFreshnessStatus;
  expiresAt?: Date | null;
  resolvedAt?: Date | null;
}

@Injectable()
export class BrakeEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly recalcOrchestrator?: BrakeRecalculationOrchestratorService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
  ) {}

  private normalizeMm(v: number | null | undefined): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    return Math.round(v * 100) / 100;
  }

  private async resolveOrganizationId(
    vehicleId: string,
    organizationId?: string | null,
  ): Promise<string | null> {
    if (organizationId) return organizationId;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? null;
  }

  private observationTimestamp(input: BrakeEvidenceWriteInput): Date {
    return input.sourceTimestamp ?? input.measuredAt ?? new Date();
  }

  private buildDedupeInput(
    input: BrakeEvidenceWriteInput,
    organizationId: string,
    observedAt: Date,
    measuredPadMm: number | null,
    measuredDiscMm: number | null,
  ): EvidenceDedupeInput {
    return {
      organizationId,
      vehicleId: input.vehicleId,
      source: input.source,
      axle: input.axle ?? BrakeAxle.UNKNOWN,
      wheelPosition: input.wheelPosition ?? null,
      externalSourceId: input.externalSourceId ?? input.dtcCode ?? input.documentExtractionId ?? null,
      measuredPadMm,
      measuredDiscMm,
      discCondition: input.discCondition ?? null,
      brakeFluidStatus: input.brakeFluidStatus ?? null,
      immediateReplacement: input.immediateReplacement ?? null,
      dtcSeverity: input.dtcSeverity ?? null,
      dtcCode: input.dtcCode ?? null,
      sourceTimestamp: observedAt,
      serviceEventId: input.serviceEventId ?? null,
    };
  }

  private resolveLifecycleFields(
    input: BrakeEvidenceWriteInput,
    observedAt: Date,
    confirmationStatus: BrakeEvidenceConfirmationStatus,
  ): {
    active: boolean;
    firstObservedAt: Date;
    lastObservedAt: Date;
    sourceTimestamp: Date;
    freshnessStatus: BrakeEvidenceFreshnessStatus;
    expiresAt: Date | null;
    resolvedAt: Date | null;
    confirmationStatus: BrakeEvidenceConfirmationStatus;
  } {
    const now = new Date();
    let expiresAt = input.expiresAt ?? null;
    if (input.immediateReplacement === true && !expiresAt) {
      expiresAt = computeImmediateReplacementExpiresAt(observedAt, now);
    } else if (input.source === BrakeEvidenceSource.PROVIDER_WARNING && !expiresAt) {
      expiresAt = computeProviderWarningExpiresAt(observedAt, now);
    }

    return {
      active: input.active ?? (input.resolvedAt == null && input.dtcActive !== false),
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      sourceTimestamp: observedAt,
      freshnessStatus: input.freshnessStatus ?? BrakeEvidenceFreshnessStatus.FRESH,
      expiresAt,
      resolvedAt: input.resolvedAt ?? null,
      confirmationStatus,
    };
  }

  private toPersistableData(
    input: BrakeEvidenceWriteInput,
    organizationId: string,
  ): Prisma.BrakeEvidenceUncheckedCreateInput | null {
    const confirmationStatus =
      input.confirmationStatus ?? defaultConfirmationStatusForSource(input.source);
    const rawPadMm = this.normalizeMm(input.measuredPadMm);
    const rawDiscMm = this.normalizeMm(input.measuredDiscMm);
    const hasSignal =
      rawMmCountsAsSignal(input.source, rawPadMm, rawDiscMm) ||
      input.discCondition != null ||
      input.brakeFluidStatus != null ||
      input.immediateReplacement === true ||
      (typeof input.dtcSeverity === 'string' && input.dtcSeverity.trim().length > 0);

    if (!hasSignal) return null;

    const stripped = stripUntrustedMm(input.source, confirmationStatus, {
      measuredPadMm: rawPadMm,
      measuredDiscMm: rawDiscMm,
    });
    const measuredPadMm = stripped.measuredPadMm;
    const measuredDiscMm = stripped.measuredDiscMm;

    const observedAt = this.observationTimestamp(input);
    const lifecycle = this.resolveLifecycleFields(input, observedAt, confirmationStatus);
    const dedupeKey =
      input.dedupeKey ??
      buildEvidenceDedupeKey(
        this.buildDedupeInput(input, organizationId, observedAt, measuredPadMm, measuredDiscMm),
      );

    return {
      organizationId,
      vehicleId: input.vehicleId,
      source: input.source,
      axle: input.axle ?? BrakeAxle.UNKNOWN,
      wheelPosition: input.wheelPosition ?? null,
      measuredPadMm,
      measuredDiscMm,
      discCondition: input.discCondition ?? null,
      brakeFluidStatus: input.brakeFluidStatus ?? null,
      immediateReplacement: input.immediateReplacement ?? null,
      dtcSeverity: input.dtcSeverity ?? null,
      dtcCode: input.dtcCode ?? null,
      dtcActive: input.dtcActive ?? null,
      vehicleDtcEventId: input.vehicleDtcEventId ?? null,
      mileageAtMeasurementKm:
        typeof input.mileageAtMeasurementKm === 'number' &&
        Number.isFinite(input.mileageAtMeasurementKm)
          ? Math.round(input.mileageAtMeasurementKm)
          : null,
      measuredAt: input.measuredAt ?? observedAt,
      confidence: input.confidence ?? BrakeEvidenceConfidence.UNKNOWN,
      notes: input.notes ?? null,
      documentExtractionId: input.documentExtractionId ?? null,
      serviceEventId: input.serviceEventId ?? null,
      createdById: input.createdById ?? null,
      externalSourceId: input.externalSourceId ?? input.dtcCode ?? null,
      dedupeKey,
      active: lifecycle.active,
      firstObservedAt: lifecycle.firstObservedAt,
      lastObservedAt: lifecycle.lastObservedAt,
      sourceTimestamp: lifecycle.sourceTimestamp,
      freshnessStatus: lifecycle.freshnessStatus,
      confirmationStatus: lifecycle.confirmationStatus,
      confirmedBy: input.confirmedBy ?? null,
      confirmedAt: input.confirmedAt ?? null,
      expiresAt: lifecycle.expiresAt,
      resolvedAt: lifecycle.resolvedAt,
    };
  }

  private async enqueueRecalculation(
    vehicleId: string,
    evidenceId: string,
    trigger: 'measurement' | 'evidence' | 'dtc',
    hasMeasurement: boolean,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.brakeEvidence.update({
      where: { id: evidenceId },
      data: { recalculationEnqueuedAt: now },
    });
    await this.recalcOrchestrator?.enqueue({
      vehicleId,
      trigger: hasMeasurement ? 'measurement' : trigger,
    });
  }

  /** Write evidence with revision-safe dedupe. Returns null when input has no signal. */
  async record(input: BrakeEvidenceWriteInput) {
    const organizationId = await this.resolveOrganizationId(input.vehicleId, input.organizationId);
    if (!organizationId) return null;

    const data = this.toPersistableData(input, organizationId);
    if (!data) return null;

    const existing = data.dedupeKey
      ? await this.prisma.brakeEvidence.findFirst({
          where: {
            organizationId,
            vehicleId: input.vehicleId,
            dedupeKey: data.dedupeKey,
            active: true,
            supersededByEvidenceId: null,
          },
          orderBy: [{ lastObservedAt: 'desc' }, { createdAt: 'desc' }],
        })
      : null;

    let row;
    if (existing) {
      const observedAt = this.observationTimestamp(input);
      row = await this.prisma.brakeEvidence.update({
        where: { id: existing.id },
        data: {
          ...data,
          firstObservedAt: existing.firstObservedAt ?? data.firstObservedAt,
          lastObservedAt: observedAt,
          sourceTimestamp: observedAt,
          freshnessStatus:
            input.freshnessStatus ??
            resolveEffectiveFreshness({ ...existing, ...data, lastObservedAt: observedAt }),
        },
      });
      this.observability?.recordEvidence({
        action: 'duplicate_prevented',
        source: String(row.source),
        category: row.source === BrakeEvidenceSource.DTC_SIGNAL ? 'safety' : 'wear',
      });
    } else {
      row = await this.prisma.brakeEvidence.create({ data });
      this.observability?.recordEvidence({
        action: 'created',
        source: String(row.source),
        category: row.source === BrakeEvidenceSource.DTC_SIGNAL ? 'safety' : 'wear',
      });
    }

    const hasMeasurement = row.measuredPadMm != null || row.measuredDiscMm != null;
    if (hasMeasurement) {
      this.observability?.recordMeasurement(String(row.source));
    }
    const trigger =
      row.source === BrakeEvidenceSource.DTC_SIGNAL
        ? 'dtc'
        : hasMeasurement
          ? 'measurement'
          : 'evidence';
    await this.enqueueRecalculation(input.vehicleId, row.id, trigger, hasMeasurement);
    return row;
  }

  /** Bulk-write evidence rows with dedupe semantics per row. */
  async recordMany(inputs: BrakeEvidenceWriteInput[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) return { count: 0 };
    let count = 0;
    for (const input of inputs) {
      const row = await this.record(input);
      if (row) count += 1;
    }
    return { count };
  }

  /** Confirm previously unconfirmed AI/OCR evidence and enable mm ground truth. */
  async confirmEvidence(args: {
    evidenceId: string;
    confirmedBy: string;
    confirmedAt?: Date;
  }) {
    const existing = await this.prisma.brakeEvidence.findUnique({
      where: { id: args.evidenceId },
    });
    if (!existing) return null;
    if (existing.confirmationStatus === BrakeEvidenceConfirmationStatus.CONFIRMED) {
      return existing;
    }

    const confirmedAt = args.confirmedAt ?? new Date();
    const row = await this.prisma.brakeEvidence.update({
      where: { id: args.evidenceId },
      data: {
        source:
          existing.source === BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED
            ? BrakeEvidenceSource.AI_UPLOAD_CONFIRMED
            : existing.source,
        confirmationStatus: BrakeEvidenceConfirmationStatus.CONFIRMED,
        confirmedBy: args.confirmedBy,
        confirmedAt,
        lastObservedAt: confirmedAt,
      },
    });

    await this.enqueueRecalculation(
      row.vehicleId,
      row.id,
      'evidence',
      row.measuredPadMm != null || row.measuredDiscMm != null,
    );
    return row;
  }

  /** Mark evidence as superseded by a newer canonical row. */
  async supersedeEvidence(evidenceId: string, supersededByEvidenceId: string) {
    return this.prisma.brakeEvidence.update({
      where: { id: evidenceId },
      data: {
        active: false,
        supersededByEvidenceId,
        lastObservedAt: new Date(),
      },
    });
  }

  /** Most recent evidence row, optionally filtered by source / axle. */
  async getLatest(
    vehicleId: string,
    params: { source?: BrakeEvidenceSource; axle?: BrakeAxle } = {},
  ) {
    return this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        supersededByEvidenceId: null,
        ...(params.source ? { source: params.source } : {}),
        ...(params.axle ? { axle: params.axle } : {}),
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Latest row with trusted mm ground truth for an axle. */
  async getLatestMeasurement(vehicleId: string, axle?: BrakeAxle) {
    const rows = await this.prisma.brakeEvidence.findMany({
      where: {
        vehicleId,
        supersededByEvidenceId: null,
        ...(axle ? { axle: { in: [axle, BrakeAxle.UNKNOWN] } } : {}),
        source: { in: Array.from(MM_GROUND_TRUTH_SOURCES) },
        OR: [{ measuredPadMm: { not: null } }, { measuredDiscMm: { not: null } }],
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });

    return rows.find((row) => isMmGroundTruth(row)) ?? null;
  }

  /**
   * Aggregate all active safety signals (highest severity + full reason list).
   * Replaces the legacy single-row `getLatestSafetySignal` lookup.
   */
  async getActiveSafetySignals(vehicleId: string): Promise<AggregatedSafetySignals> {
    const rows = await this.prisma.brakeEvidence.findMany({
      where: {
        vehicleId,
        supersededByEvidenceId: null,
      },
      orderBy: [{ lastObservedAt: 'desc' }, { measuredAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return aggregateActiveSafetySignals(rows);
  }

  /**
   * @deprecated Use `getActiveSafetySignals()` for full active safety evaluation.
   * Returns the highest-severity active signal row for backward compatibility.
   */
  async getLatestSafetySignal(vehicleId: string) {
    const aggregated = await this.getActiveSafetySignals(vehicleId);
    if (aggregated.signals.length === 0) return null;

    const top = [...aggregated.signals].sort(
      (a, b) =>
        ({ critical: 3, warning: 2, info: 1 }[b.severity] -
          { critical: 3, warning: 2, info: 1 }[a.severity]),
    )[0];

    if (!top?.evidenceId) return null;
    return this.prisma.brakeEvidence.findUnique({ where: { id: top.evidenceId } });
  }

  async listRecent(vehicleId: string, take = 50) {
    return this.prisma.brakeEvidence.findMany({
      where: { vehicleId, supersededByEvidenceId: null },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }

  /** Active, non-superseded evidence rows for health consumers. */
  async listActive(vehicleId: string, take = 50) {
    const rows = await this.listRecent(vehicleId, take);
    return rows.filter((row) => isActiveEvidence(row));
  }
}
