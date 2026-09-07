import { Injectable, Logger } from '@nestjs/common';
import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { PrismaService } from '@shared/database/prisma.service';
import {
  loadSnapshotPollingTierConfig,
  type SnapshotPollingTierConfig,
} from '../schedulers/snapshot-polling/snapshot-polling-tier.config';
import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import {
  buildSnapshotWakeContext,
  classifyDimoStartWakeSignal,
  isRestingPrimaryWakeFsm,
  parseProviderWakeTimestamp,
} from './snapshot-wake.util';
import type { SnapshotWakeOutcome } from './snapshot-wake.types';

export interface ProviderWakeIntakeInput {
  tokenId: number;
  signalName: string | null | undefined;
  value: unknown;
  timestamp: unknown;
  receivedAt: Date;
}

export interface ProviderWakeIntakeResult {
  outcome: SnapshotWakeOutcome | 'INVALID_SIGNAL' | 'IGNORED_FSM_ACTIVE' | 'IGNORED_INELIGIBLE';
  wakeContext?: ReturnType<typeof buildSnapshotWakeContext>;
}

@Injectable()
export class SnapshotWakeIntakeService {
  private readonly logger = new Logger(SnapshotWakeIntakeService.name);
  private readonly tierConfig: SnapshotPollingTierConfig =
    loadSnapshotPollingTierConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: SnapshotWakeCoordinatorService,
  ) {}

  async handleProviderWake(
    input: ProviderWakeIntakeInput,
  ): Promise<ProviderWakeIntakeResult> {
    const classification = classifyDimoStartWakeSignal({
      signalName: input.signalName,
      value: input.value,
      movementSpeedKmh: this.tierConfig.movementSpeedKmh,
    });

    if (!classification.eligible || !classification.reason || !classification.signalName) {
      return { outcome: 'INVALID_SIGNAL' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        status: { in: [VehicleStatus.AVAILABLE, VehicleStatus.RENTED] },
        dimoVehicle: {
          connectionStatus: 'CONNECTED',
          tokenId: input.tokenId,
        },
      },
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true } },
        tripDetectionState: { select: { state: true } },
      },
    });

    if (!vehicle?.dimoVehicle?.tokenId) {
      return { outcome: 'IGNORED_INELIGIBLE' };
    }

    const fsmState = vehicle.tripDetectionState?.state ?? TripDetectionState.RESTING;
    if (!isRestingPrimaryWakeFsm(fsmState)) {
      this.coordinator.recordWakeMetric(
        buildSnapshotWakeContext({
          reason: classification.reason,
          signalName: classification.signalName,
          providerObservedAt: null,
          receivedAt: input.receivedAt,
        }),
        'IGNORED_FSM_ACTIVE',
      );
      return { outcome: 'IGNORED_FSM_ACTIVE' };
    }

    const { observedAt } = parseProviderWakeTimestamp(input.timestamp);
    const wakeContext = buildSnapshotWakeContext({
      reason: classification.reason,
      signalName: classification.signalName,
      providerObservedAt: observedAt,
      receivedAt: input.receivedAt,
      probeGeneration: 0,
    });

    const enqueueOutcome = await this.coordinator.requestSnapshot({
      vehicleId: vehicle.id,
      dimoTokenId: vehicle.dimoVehicle.tokenId,
      origin: 'PROVIDER_WAKE',
      wakeContext,
    });

    return { outcome: enqueueOutcome, wakeContext };
  }
}
