import { Injectable } from '@nestjs/common';
import {
  BrakeAxle,
  BrakeComponentStatus,
  BrakeEvidenceConfidence,
  BrakeEvidenceSource,
  BrakeWheelPosition,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface BrakeEvidenceWriteInput {
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
  mileageAtMeasurementKm?: number | null;
  measuredAt?: Date | null;
  confidence?: BrakeEvidenceConfidence;
  notes?: string | null;
  documentExtractionId?: string | null;
  serviceEventId?: string | null;
  createdById?: string | null;
}

/** Sources that are allowed to carry a real measured wheel/axle mm value. */
const MM_TRUSTED_SOURCES: ReadonlySet<BrakeEvidenceSource> = new Set([
  BrakeEvidenceSource.MANUAL_MEASUREMENT,
  BrakeEvidenceSource.WORKSHOP_REPORT,
  BrakeEvidenceSource.AI_UPLOAD,
  BrakeEvidenceSource.SERVICE_INVOICE,
  BrakeEvidenceSource.INSPECTION_PROTOCOL,
  BrakeEvidenceSource.BRAKE_WEAR_SENSOR,
]);

@Injectable()
export class BrakeEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeMm(v: number | null | undefined): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    return Math.round(v * 100) / 100;
  }

  private toCreateData(
    input: BrakeEvidenceWriteInput,
  ): Prisma.BrakeEvidenceUncheckedCreateInput | null {
    // Telemetry/estimation sources must NEVER invent wheel mm. Strip any mm
    // value that did not come from a trusted (measured/documented/sensor) source.
    const mmAllowed = MM_TRUSTED_SOURCES.has(input.source);
    const measuredPadMm = mmAllowed ? this.normalizeMm(input.measuredPadMm) : null;
    const measuredDiscMm = mmAllowed ? this.normalizeMm(input.measuredDiscMm) : null;

    const hasSignal =
      measuredPadMm != null ||
      measuredDiscMm != null ||
      input.discCondition != null ||
      input.brakeFluidStatus != null ||
      input.immediateReplacement === true ||
      (typeof input.dtcSeverity === 'string' && input.dtcSeverity.trim().length > 0);

    // A row with no meaningful signal is not worth persisting.
    if (!hasSignal) return null;

    return {
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
      mileageAtMeasurementKm:
        typeof input.mileageAtMeasurementKm === 'number' &&
        Number.isFinite(input.mileageAtMeasurementKm)
          ? Math.round(input.mileageAtMeasurementKm)
          : null,
      measuredAt: input.measuredAt ?? new Date(),
      confidence: input.confidence ?? BrakeEvidenceConfidence.UNKNOWN,
      notes: input.notes ?? null,
      documentExtractionId: input.documentExtractionId ?? null,
      serviceEventId: input.serviceEventId ?? null,
      createdById: input.createdById ?? null,
    };
  }

  /** Write a single evidence row. Returns null when the input carries no signal. */
  async record(input: BrakeEvidenceWriteInput) {
    const data = this.toCreateData(input);
    if (!data) return null;
    return this.prisma.brakeEvidence.create({ data });
  }

  /** Bulk-write evidence rows, skipping inputs without a meaningful signal. */
  async recordMany(inputs: BrakeEvidenceWriteInput[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) return { count: 0 };
    const prepared = inputs
      .map((input) => this.toCreateData(input))
      .filter((d): d is Prisma.BrakeEvidenceUncheckedCreateInput => d != null);
    if (prepared.length === 0) return { count: 0 };
    return this.prisma.brakeEvidence.createMany({ data: prepared });
  }

  /** Idempotent per (documentExtractionId, axle) — one evidence row per axle per extraction. */
  async recordForDocumentExtraction(input: BrakeEvidenceWriteInput) {
    const data = this.toCreateData(input);
    if (!data?.documentExtractionId) return null;

    const existing = await this.prisma.brakeEvidence.findFirst({
      where: {
        documentExtractionId: data.documentExtractionId,
        axle: data.axle,
      },
    });
    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.brakeEvidence.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.brakeEvidence.findFirst({
          where: {
            documentExtractionId: data.documentExtractionId,
            axle: data.axle,
          },
        });
      }
      throw error;
    }
  }

  /** Most recent evidence row, optionally filtered by source / axle. */
  async getLatest(
    vehicleId: string,
    params: { source?: BrakeEvidenceSource; axle?: BrakeAxle } = {},
  ) {
    return this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        ...(params.source ? { source: params.source } : {}),
        ...(params.axle ? { axle: params.axle } : {}),
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Most recent row that carries a real measured pad/disc mm from a trusted
   * source (used to resolve the "measured" data basis for an axle).
   */
  async getLatestMeasurement(vehicleId: string, axle?: BrakeAxle) {
    return this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        ...(axle ? { axle } : {}),
        source: { in: Array.from(MM_TRUSTED_SOURCES) },
        OR: [{ measuredPadMm: { not: null } }, { measuredDiscMm: { not: null } }],
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Latest critical safety signal (immediate replacement / fluid / DTC). */
  async getLatestSafetySignal(vehicleId: string) {
    return this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        OR: [
          { immediateReplacement: true },
          { brakeFluidStatus: { in: [BrakeComponentStatus.WARNING, BrakeComponentStatus.CRITICAL] } },
          { discCondition: { in: [BrakeComponentStatus.WARNING, BrakeComponentStatus.CRITICAL] } },
          { dtcSeverity: { not: null } },
        ],
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listRecent(vehicleId: string, take = 50) {
    return this.prisma.brakeEvidence.findMany({
      where: { vehicleId },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take,
    });
  }
}
