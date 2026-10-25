import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { TireWearV3PriorSetupResult } from './tire-wear-v3-prior.types';

@Injectable()
export class TireWearV3PriorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestShadowRow(
    tireSetupId: string,
    modelVersion: string,
    inputFingerprint: string,
  ) {
    return this.prisma.tireWearV3PriorShadowV1.findFirst({
      where: {
        tireSetupId,
        modelVersion,
        inputFingerprint,
      },
      orderBy: { computedAt: 'desc' },
      select: { id: true },
    });
  }

  async insertShadowRow(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    modelVersion: string;
    modelConfigHash: string;
    inputFingerprint: string;
    resultPayload: TireWearV3PriorSetupResult;
  }) {
    return this.prisma.tireWearV3PriorShadowV1.create({
      data: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
        modelVersion: args.modelVersion,
        modelConfigHash: args.modelConfigHash,
        inputFingerprint: args.inputFingerprint,
        resultPayload: args.resultPayload as object,
        computedAt: new Date(args.resultPayload.computedAt),
      },
    });
  }
}
