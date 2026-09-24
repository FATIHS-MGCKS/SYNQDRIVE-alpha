import type { PrismaService } from '@shared/database/prisma.service';
import { BatteryCapabilityStatus } from '../battery-v2-domain';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import {
  evaluateErdReconcileEligibility,
  HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS,
  HV_ERD_SOC_SIGNAL_KEY,
  isBatteryCapabilityRowAvailable,
} from './hv-erd-reconcile-eligibility.policy';
import {
  maxPeriodicCandidateScanSize,
  type HvRechargePeriodicTargetCandidate,
} from './hv-recharge-periodic-target.policy';
import { isBatteryV2HvFallbackChargeSessionEnabled } from '@config/battery-health-v2.config';

const CAPABILITY_AVAILABLE = [
  BatteryCapabilityStatus.AVAILABLE,
  BatteryCapabilityStatus.AVAILABLE_STALE,
];

const ERD_SIGNAL_KEYS = [
  HV_ERD_SOC_SIGNAL_KEY,
  RECHARGE_SEGMENTS_SIGNAL_KEY,
  ...HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS,
];

export async function fetchHvRechargePeriodicTargetCandidates(
  prisma: PrismaService,
  batchSize: number,
): Promise<HvRechargePeriodicTargetCandidate[]> {
  const maxScan = maxPeriodicCandidateScanSize(batchSize);
  const fallbackEnabled = isBatteryV2HvFallbackChargeSessionEnabled();

  const ongoing = await prisma.hvChargeSession.findMany({
    where: { isOngoing: true },
    take: maxScan,
    orderBy: { updatedAt: 'asc' },
    select: { vehicleId: true, organizationId: true },
  });

  const capabilityRows = await prisma.vehicleBatteryCapability.findMany({
    where: {
      signalKey: { in: [...ERD_SIGNAL_KEYS] },
      status: { in: CAPABILITY_AVAILABLE },
      vehicle: { dimoVehicle: { is: { tokenId: { not: null } } } },
    },
    take: maxScan * 4,
    orderBy: { checkedAt: 'asc' },
    select: {
      vehicleId: true,
      organizationId: true,
      signalKey: true,
      status: true,
      vehicle: { select: { fuelType: true } },
    },
  });

  const byVehicle = new Map<
    string,
    {
      organizationId: string;
      fuelType: string | null;
      keys: Set<string>;
      ongoing: boolean;
    }
  >();

  for (const row of ongoing) {
    byVehicle.set(row.vehicleId, {
      organizationId: row.organizationId,
      fuelType: null,
      keys: new Set(),
      ongoing: true,
    });
  }

  for (const row of capabilityRows) {
    if (!isBatteryCapabilityRowAvailable(row.status)) continue;
    let entry = byVehicle.get(row.vehicleId);
    if (!entry) {
      entry = {
        organizationId: row.organizationId,
        fuelType: row.vehicle.fuelType,
        keys: new Set(),
        ongoing: false,
      };
      byVehicle.set(row.vehicleId, entry);
    }
    entry.keys.add(row.signalKey);
    if (row.vehicle.fuelType) {
      entry.fuelType = row.vehicle.fuelType;
    }
  }

  const candidates: HvRechargePeriodicTargetCandidate[] = [];

  for (const [vehicleId, entry] of byVehicle) {
    const nativeRechargeCapable = entry.keys.has(RECHARGE_SEGMENTS_SIGNAL_KEY);
    const eligibility = evaluateErdReconcileEligibility({
      fuelType: entry.fuelType,
      hasOngoingHvChargeSession: entry.ongoing,
      nativeRechargeCapable,
      capabilityKeysAvailable: entry.keys,
    });

    if (!eligibility.eligible) continue;
    if (
      eligibility.category === 'telemetry_fallback_capability' &&
      !fallbackEnabled
    ) {
      continue;
    }

    candidates.push({
      vehicleId,
      organizationId: entry.organizationId,
      category: eligibility.category,
    });
  }

  return candidates.slice(0, maxScan);
}
