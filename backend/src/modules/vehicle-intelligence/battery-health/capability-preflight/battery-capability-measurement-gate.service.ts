import { Injectable } from '@nestjs/common';
import { BatteryMeasurementType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BATTERY_CAPABILITY_SIGNALS,
  RECHARGE_SEGMENTS_SIGNAL_KEY,
} from './battery-capability-signals.registry';
import { isCapabilityMeasurementEnabled } from './battery-capability-lifecycle.policy';

export interface CapabilityMeasurementGateResult {
  enabled: boolean;
  signalKey: string | null;
  status: string | null;
  reason: string | null;
}

@Injectable()
export class BatteryCapabilityMeasurementGateService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateMeasurementType(
    organizationId: string,
    vehicleId: string,
    measurementType: BatteryMeasurementType,
  ): Promise<CapabilityMeasurementGateResult> {
    const definition = BATTERY_CAPABILITY_SIGNALS.find(
      (entry) => entry.measurementType === measurementType,
    );

    if (!definition) {
      return {
        enabled: true,
        signalKey: null,
        status: null,
        reason: null,
      };
    }

    const capability = await this.prisma.vehicleBatteryCapability.findUnique({
      where: {
        vehicleId_signalKey: {
          vehicleId,
          signalKey: definition.signalKey,
        },
      },
      select: { status: true, signalKey: true, capabilityVersion: true },
    });

    if (!capability) {
      return {
        enabled: true,
        signalKey: definition.signalKey,
        status: null,
        reason: 'capability_not_preflighted',
      };
    }

    const enabled = isCapabilityMeasurementEnabled(capability.status);
    return {
      enabled,
      signalKey: capability.signalKey,
      status: capability.status,
      reason: enabled
        ? null
        : `capability_${capability.status.toLowerCase()}`,
    };
  }

  async listDisabledMeasurementTypes(
    organizationId: string,
    vehicleId: string,
  ): Promise<BatteryMeasurementType[]> {
    const capabilities = await this.prisma.vehicleBatteryCapability.findMany({
      where: { organizationId, vehicleId },
      select: { signalKey: true, status: true },
    });

    const disabled = new Set<BatteryMeasurementType>();
    for (const definition of BATTERY_CAPABILITY_SIGNALS) {
      if (!definition.measurementType) continue;
      const capability = capabilities.find(
        (entry) => entry.signalKey === definition.signalKey,
      );
      if (!capability) continue;
      if (!isCapabilityMeasurementEnabled(capability.status)) {
        disabled.add(definition.measurementType);
      }
    }

    if (
      capabilities.some(
        (entry) =>
          entry.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY &&
          !isCapabilityMeasurementEnabled(entry.status),
      )
    ) {
      disabled.add(BatteryMeasurementType.CHARGE_SESSION_CAPACITY);
    }

    return [...disabled];
  }
}
