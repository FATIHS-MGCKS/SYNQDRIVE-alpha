import { BatteryCapabilityStatus, DrivingCapabilityStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BATTERY_CAPABILITY_SIGNALS } from '../battery-health/capability-preflight/battery-capability-signals.registry';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import type { VsiProfileMaterializationKey } from './vsi-profile.types';
import { VSI_PROFILE_MATERIALIZATION_KEYS } from './vsi-profile.types';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

export type VsiDeclaredCatalogSnapshot = {
  checkedAt: Date | null;
  /** DIMO native signal name → catalog axis (never inferred from poll success). */
  byNativeSignalName: ReadonlyMap<string, VsiProviderCatalogStatus>;
  limitations: string[];
};

function readListedFlag(metadata: unknown): boolean | 'UNKNOWN' {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'UNKNOWN';
  }
  const listed = (metadata as Record<string, unknown>).listedInAvailableSignals;
  if (listed === true) return true;
  if (listed === false) return false;
  return 'UNKNOWN';
}

/**
 * Resolves provider-declared signal availability from persisted preflight rows only.
 * Does not call DIMO.
 */
@Injectable()
export class VsiDeclaredCatalogResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<VsiDeclaredCatalogSnapshot> {
    const limitations: string[] = [];
    const byNative = new Map<string, VsiProviderCatalogStatus>();

    const [drivingRows, batteryRows] = await Promise.all([
      this.prisma.vehicleDrivingCapability.findMany({
        where: { organizationId, vehicleId, providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY },
        select: {
          signalName: true,
          capabilityStatus: true,
          checkedAt: true,
          metadata: true,
        },
      }),
      this.prisma.vehicleBatteryCapability.findMany({
        where: { organizationId, vehicleId },
        select: {
          signalKey: true,
          status: true,
          checkedAt: true,
          metadata: true,
        },
      }),
    ]);

    let checkedAt: Date | null = null;
    for (const row of drivingRows) {
      if (row.checkedAt && (!checkedAt || row.checkedAt > checkedAt)) {
        checkedAt = row.checkedAt;
      }
      const native = row.signalName?.trim();
      if (!native) continue;
      const listed = readListedFlag(row.metadata);
      if (listed === true) {
        byNative.set(native, VsiProviderCatalogStatus.LISTED);
        continue;
      }
      if (listed === false) {
        byNative.set(native, VsiProviderCatalogStatus.NOT_LISTED);
        continue;
      }
      if (row.capabilityStatus === DrivingCapabilityStatus.SUPPORTED) {
        byNative.set(native, VsiProviderCatalogStatus.LISTED);
      } else if (row.capabilityStatus === DrivingCapabilityStatus.UNSUPPORTED) {
        byNative.set(native, VsiProviderCatalogStatus.NOT_LISTED);
      }
    }

    const batteryKeyToDimo = new Map(
      BATTERY_CAPABILITY_SIGNALS.map((def) => [def.signalKey, def.dimoSignalName]),
    );
    for (const row of batteryRows) {
      if (row.checkedAt && (!checkedAt || row.checkedAt > checkedAt)) {
        checkedAt = row.checkedAt;
      }
      const dimoName = batteryKeyToDimo.get(row.signalKey);
      if (!dimoName) continue;
      if (row.status === BatteryCapabilityStatus.NOT_LISTED) {
        byNative.set(dimoName, VsiProviderCatalogStatus.NOT_LISTED);
      } else if (
        row.status === BatteryCapabilityStatus.AVAILABLE ||
        row.status === BatteryCapabilityStatus.AVAILABLE_NULL ||
        row.status === BatteryCapabilityStatus.AVAILABLE_STALE
      ) {
        byNative.set(dimoName, VsiProviderCatalogStatus.LISTED);
      }
    }

    if (drivingRows.length === 0 && batteryRows.length === 0) {
      limitations.push('NO_CACHED_PROVIDER_CATALOG_EVIDENCE');
    }

    for (const key of VSI_PROFILE_MATERIALIZATION_KEYS) {
      const def = getVsiCanonicalSignalDefinition(key);
      const native = def.primaryDimoSignalName;
      if (!native || byNative.has(native)) continue;
      byNative.set(native, VsiProviderCatalogStatus.UNKNOWN);
    }

    return { checkedAt, byNativeSignalName: byNative, limitations };
  }

  catalogForCanonicalKey(
    snapshot: VsiDeclaredCatalogSnapshot,
    key: VsiProfileMaterializationKey,
  ): VsiProviderCatalogStatus {
    const def = getVsiCanonicalSignalDefinition(key);
    const native = def.primaryDimoSignalName;
    if (!native) {
      return VsiProviderCatalogStatus.UNKNOWN;
    }
    return snapshot.byNativeSignalName.get(native) ?? VsiProviderCatalogStatus.UNKNOWN;
  }
}
