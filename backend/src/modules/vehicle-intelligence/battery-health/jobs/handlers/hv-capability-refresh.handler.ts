import { Injectable, Logger } from '@nestjs/common';
import { BatteryCapabilityPreflightService } from '../../capability-preflight/battery-capability-preflight.service';
import {
  BatteryCapabilityRefreshTrigger,
  type BatteryCapabilityRefreshTrigger as BatteryCapabilityRefreshTriggerType,
} from '../../capability-preflight/battery-capability-lifecycle.policy';
import { HvRechargeSessionReconcileProducerService } from '../../hv-charge-session/hv-recharge-session-reconcile-producer.service';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { HvCapabilityRefreshPayload } from '../battery-v2-job.types';

function parseRefreshTrigger(
  value: string | null | undefined,
): BatteryCapabilityRefreshTriggerType | undefined {
  if (!value) return undefined;
  const triggers = Object.values(BatteryCapabilityRefreshTrigger);
  return triggers.includes(value as BatteryCapabilityRefreshTriggerType)
    ? (value as BatteryCapabilityRefreshTriggerType)
    : undefined;
}

@Injectable()
export class HvCapabilityRefreshHandler implements BatteryV2JobHandler<'HV_CAPABILITY_REFRESH'> {
  readonly jobType = 'HV_CAPABILITY_REFRESH' as const;
  private readonly logger = new Logger(HvCapabilityRefreshHandler.name);

  constructor(
    private readonly capabilityPreflight: BatteryCapabilityPreflightService,
    private readonly rechargeReconcileProducer: HvRechargeSessionReconcileProducerService,
  ) {}

  async handle(payload: HvCapabilityRefreshPayload): Promise<void> {
    const result = await this.capabilityPreflight.runForVehicle(
      payload.organizationId,
      payload.vehicleId,
      {
        refreshTrigger: parseRefreshTrigger(payload.refreshTrigger),
        correlationId: payload.correlationId,
      },
    );

    if (!result) {
      this.logger.debug(
        `Skipping ${this.jobType}: no DIMO token org=${payload.organizationId} vehicle=${payload.vehicleId}`,
      );
      return;
    }

    const availableCount = result.signals.filter(
      (signal) =>
        signal.preflightStatus === 'AVAILABLE_WITH_DATA' ||
        signal.preflightStatus === 'STALE',
    ).length;

    this.logger.debug(
      `${this.jobType} completed org=${payload.organizationId} vehicle=${payload.vehicleId} trigger=${payload.refreshTrigger ?? 'unknown'} signals=${result.signals.length} withData=${availableCount} queryError=${result.queryError ?? 'none'}`,
    );

    await this.rechargeReconcileProducer.enqueueAfterCapabilityRefresh(
      payload.organizationId,
      payload.vehicleId,
      payload.correlationId,
    );
  }
}
