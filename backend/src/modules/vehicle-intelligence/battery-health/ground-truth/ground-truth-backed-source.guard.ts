import { Injectable } from '@nestjs/common';
import { BatteryGroundTruthVerificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GroundTruthSourceCorrectionRequiredError } from './ground-truth-emission.errors';

@Injectable()
export class BatteryGroundTruthBackedSourceGuard {
  constructor(private readonly prisma: PrismaService) {}

  async assertServiceEventMutable(
    vehicleId: string,
    serviceEventId: string,
    mutation: 'update' | 'delete',
    patch?: { eventType?: string; eventDate?: string },
  ): Promise<void> {
    const backed = await this.prisma.batteryGroundTruthEvent.findFirst({
      where: {
        vehicleId,
        sourceServiceEventId: serviceEventId,
        verificationStatus: {
          in: [
            BatteryGroundTruthVerificationStatus.CONFIRMED,
            BatteryGroundTruthVerificationStatus.SUPERSEDED,
            BatteryGroundTruthVerificationStatus.REVOKED,
          ],
        },
      },
      select: { id: true, verificationStatus: true },
    });
    if (!backed) {
      return;
    }

    if (mutation === 'delete') {
      throw new GroundTruthSourceCorrectionRequiredError(
        'GT_SOURCE_CORRECTION_REQUIRED',
        'Ground-truth-backed service event cannot be deleted without explicit supersede/revoke workflow',
      );
    }

    if (patch?.eventType !== undefined || patch?.eventDate !== undefined) {
      throw new GroundTruthSourceCorrectionRequiredError(
        'GT_SOURCE_CORRECTION_REQUIRED',
        'Ground-truth-backed service event material fields cannot be updated silently',
      );
    }
  }
}
