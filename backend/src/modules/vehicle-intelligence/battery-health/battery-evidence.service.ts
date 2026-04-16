import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface BatteryEvidenceWriteInput {
  vehicleId: string;
  scope: BatteryEvidenceScope;
  sourceType: BatteryEvidenceSourceType;
  valueType: BatteryEvidenceValueType;
  numericValue: number | null | undefined;
  unit?: string | null;
  observedAt?: Date | null;
  provider?: string | null;
  confidence?: string | null;
  quality?: string | null;
  documentExtractionId?: string | null;
  serviceEventId?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
}

@Injectable()
export class BatteryEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  private toCreateData(
    input: BatteryEvidenceWriteInput,
  ): Prisma.BatteryEvidenceUncheckedCreateInput | null {
    if (
      input.numericValue == null ||
      typeof input.numericValue !== 'number' ||
      Number.isNaN(input.numericValue)
    ) {
      return null;
    }

    return {
      vehicleId: input.vehicleId,
      scope: input.scope,
      sourceType: input.sourceType,
      valueType: input.valueType,
      numericValue: input.numericValue,
      unit: input.unit ?? null,
      observedAt: input.observedAt ?? new Date(),
      provider: input.provider ?? null,
      confidence: input.confidence ?? null,
      quality: input.quality ?? null,
      documentExtractionId: input.documentExtractionId ?? null,
      serviceEventId: input.serviceEventId ?? null,
      metadataJson: input.metadataJson ?? undefined,
    };
  }

  /**
   * Write a single evidence row.  Idempotent against the
   * (vehicleId, scope, valueType, sourceType, observedAt) dedup key: a
   * second write of the same tuple refreshes provenance/metadata instead
   * of inserting a duplicate.
   */
  async record(input: BatteryEvidenceWriteInput) {
    const data = this.toCreateData(input);
    if (!data) return null;

    const observedAt =
      data.observedAt instanceof Date ? data.observedAt : new Date(data.observedAt);

    return this.prisma.batteryEvidence.upsert({
      where: {
        battery_evidence_dedup_key: {
          vehicleId: data.vehicleId,
          scope: data.scope,
          valueType: data.valueType,
          sourceType: data.sourceType,
          observedAt,
        },
      },
      create: data,
      update: {
        numericValue: data.numericValue,
        unit: data.unit,
        provider: data.provider,
        confidence: data.confidence,
        quality: data.quality,
        documentExtractionId: data.documentExtractionId,
        serviceEventId: data.serviceEventId,
        metadataJson: data.metadataJson,
      },
    });
  }

  /**
   * Bulk-write evidence rows.  Uses createMany({ skipDuplicates: true })
   * backed by the dedup unique index for fast inserts when rows are new,
   * and falls back to per-row upsert on conflict so we still refresh
   * provenance for known tuples (important for corroborating later reads
   * from the same measurement).
   */
  async recordMany(inputs: BatteryEvidenceWriteInput[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) return;

    const prepared = inputs
      .map((input) => this.toCreateData(input))
      .filter((data): data is Prisma.BatteryEvidenceUncheckedCreateInput => data != null);
    if (prepared.length === 0) return;

    await this.prisma.batteryEvidence.createMany({
      data: prepared,
      skipDuplicates: true,
    });

    // Refresh rows whose dedup tuple already existed so updated provenance
    // (confidence/quality/metadata) does not silently get dropped.
    for (const input of inputs) {
      const data = this.toCreateData(input);
      if (!data) continue;
      const observedAt =
        data.observedAt instanceof Date ? data.observedAt : new Date(data.observedAt);
      await this.prisma.batteryEvidence.updateMany({
        where: {
          vehicleId: data.vehicleId,
          scope: data.scope,
          valueType: data.valueType,
          sourceType: data.sourceType,
          observedAt,
        },
        data: {
          numericValue: data.numericValue,
          unit: data.unit,
          provider: data.provider,
          confidence: data.confidence,
          quality: data.quality,
          documentExtractionId: data.documentExtractionId,
          serviceEventId: data.serviceEventId,
          metadataJson: data.metadataJson,
        },
      });
    }
  }

  async getLatest(
    vehicleId: string,
    params: {
      scope?: BatteryEvidenceScope;
      valueType?: BatteryEvidenceValueType;
      sourceType?: BatteryEvidenceSourceType;
    } = {},
  ) {
    return this.prisma.batteryEvidence.findFirst({
      where: {
        vehicleId,
        ...(params.scope ? { scope: params.scope } : {}),
        ...(params.valueType ? { valueType: params.valueType } : {}),
        ...(params.sourceType ? { sourceType: params.sourceType } : {}),
      },
      orderBy: { observedAt: 'desc' },
    });
  }

  async listRecent(
    vehicleId: string,
    params: {
      scope?: BatteryEvidenceScope;
      take?: number;
    } = {},
  ) {
    return this.prisma.batteryEvidence.findMany({
      where: {
        vehicleId,
        ...(params.scope ? { scope: params.scope } : {}),
      },
      orderBy: { observedAt: 'desc' },
      take: params.take ?? 100,
    });
  }

  async series(
    vehicleId: string,
    params: {
      scope: BatteryEvidenceScope;
      valueType: BatteryEvidenceValueType;
      days?: number;
      take?: number;
    },
  ) {
    const days = params.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.batteryEvidence.findMany({
      where: {
        vehicleId,
        scope: params.scope,
        valueType: params.valueType,
        observedAt: { gte: since },
      },
      orderBy: { observedAt: 'asc' },
      take: params.take ?? 500,
    });
  }
}
