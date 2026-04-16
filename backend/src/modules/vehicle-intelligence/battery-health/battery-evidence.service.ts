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

  async record(input: BatteryEvidenceWriteInput) {
    if (
      input.numericValue == null ||
      typeof input.numericValue !== 'number' ||
      Number.isNaN(input.numericValue)
    ) {
      return null;
    }

    return this.prisma.batteryEvidence.create({
      data: {
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
      },
    });
  }

  async recordMany(inputs: BatteryEvidenceWriteInput[]) {
    if (!Array.isArray(inputs) || inputs.length === 0) return;
    for (const input of inputs) {
      await this.record(input);
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
