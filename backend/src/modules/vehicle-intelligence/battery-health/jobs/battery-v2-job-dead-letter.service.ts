import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { BatteryV2JobType } from './battery-v2-job.types';
import type { BatteryV2JobErrorCode } from './battery-v2-job.errors';
import { sanitizeBatteryV2LogMessage } from './battery-v2-job-error.util';

export interface RecordBatteryV2DeadLetterInput {
  organizationId: string;
  vehicleId: string;
  jobType: BatteryV2JobType;
  idempotencyKey: string;
  correlationId?: string | null;
  errorCode: BatteryV2JobErrorCode;
  errorMessage: string;
  attempts: number;
}

@Injectable()
export class BatteryV2JobDeadLetterService {
  constructor(private readonly prisma: PrismaService) {}

  async isDeadLetter(jobType: BatteryV2JobType, idempotencyKey: string): Promise<boolean> {
    const row = await this.prisma.batteryV2JobDeadLetter.findUnique({
      where: {
        jobType_idempotencyKey: { jobType, idempotencyKey },
      },
      select: { id: true },
    });
    return row != null;
  }

  async recordDeadLetter(input: RecordBatteryV2DeadLetterInput): Promise<void> {
    await this.prisma.batteryV2JobDeadLetter.upsert({
      where: {
        jobType_idempotencyKey: {
          jobType: input.jobType,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        jobType: input.jobType,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId ?? null,
        errorCode: input.errorCode,
        errorMessage: sanitizeBatteryV2LogMessage(input.errorMessage),
        attempts: input.attempts,
      },
      update: {
        errorCode: input.errorCode,
        errorMessage: sanitizeBatteryV2LogMessage(input.errorMessage),
        attempts: input.attempts,
        failedAt: new Date(),
      },
    });
  }

  async countBacklog(): Promise<number> {
    return this.prisma.batteryV2JobDeadLetter.count();
  }
}
