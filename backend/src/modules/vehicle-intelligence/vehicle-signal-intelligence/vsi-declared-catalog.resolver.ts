import {
  BatteryCapabilityStatus,
  DrivingCapabilityStatus,
  type VsiProviderCatalogAxisDeclaredStatus,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BATTERY_CAPABILITY_SIGNALS } from '../battery-health/capability-preflight/battery-capability-signals.registry';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import {
  VSI_P3A_LIMITATION_LEGACY_VEHICLE_SCOPED_CATALOG,
  VSI_P3A_LIMITATION_PER_LINK_CATALOG_UNAVAILABLE,
  VSI_P3A_MATERIALIZATION_CATALOG_KEYS,
} from './vsi-p3a-catalog-axis.contract';
import { isVsiP3aPerLinkCatalogResolverEnabled } from './vsi-p3a-per-link-catalog.config';
import type { VsiProfileMaterializationKey } from './vsi-profile.types';
import { VSI_PROFILE_MATERIALIZATION_KEYS } from './vsi-profile.types';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

export type VsiDeclaredCatalogSnapshot = {
  checkedAt: Date | null;
  /** DIMO native signal name → catalog axis (never inferred from poll success). */
  byNativeSignalName: ReadonlyMap<string, VsiProviderCatalogStatus>;
  limitations: string[];
};

/** Limitation when multiple active source links make vehicle-scoped preflight non-attributable. */
export const VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION =
  'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS';

/** Limitation when DIMO-only cached preflight cannot be attributed to a non-DIMO link identity. */
export const VSI_DECLARED_CATALOG_PROVIDER_MISMATCH_LIMITATION =
  'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY';

function readListedFlag(metadata: unknown): boolean | 'UNKNOWN' {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'UNKNOWN';
  }
  const listed = (metadata as Record<string, unknown>).listedInAvailableSignals;
  if (listed === true) return true;
  if (listed === false) return false;
  return 'UNKNOWN';
}

function readPreflightReason(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const reason = (metadata as Record<string, unknown>).reason;
  return typeof reason === 'string' ? reason : null;
}

/** Provider-backed NOT_LISTED — never infer from absent rows or generic UNSUPPORTED. */
function isExplicitNotListedInAvailableSignals(metadata: unknown): boolean {
  if (readListedFlag(metadata) === false) return true;
  return readPreflightReason(metadata) === 'signal_not_in_availableSignals';
}

function mapAxisDeclaredStatus(
  status: VsiProviderCatalogAxisDeclaredStatus,
): VsiProviderCatalogStatus {
  switch (status) {
    case 'LISTED':
      return VsiProviderCatalogStatus.LISTED;
    case 'NOT_LISTED':
      return VsiProviderCatalogStatus.NOT_LISTED;
    default:
      return VsiProviderCatalogStatus.UNKNOWN;
  }
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
      if (isExplicitNotListedInAvailableSignals(row.metadata)) {
        byNative.set(native, VsiProviderCatalogStatus.NOT_LISTED);
        continue;
      }
      if (row.capabilityStatus === DrivingCapabilityStatus.SUPPORTED) {
        byNative.set(native, VsiProviderCatalogStatus.LISTED);
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
    } else {
      limitations.push('DECLARED_CATALOG_VEHICLE_SCOPED_NOT_PER_SOURCE_LINK');
    }

    for (const key of VSI_PROFILE_MATERIALIZATION_KEYS) {
      const def = getVsiCanonicalSignalDefinition(key);
      const native = def.primaryDimoSignalName;
      if (!native || byNative.has(native)) continue;
      byNative.set(native, VsiProviderCatalogStatus.UNKNOWN);
    }

    return { checkedAt, byNativeSignalName: byNative, limitations };
  }

  /**
   * Per-link materialization view: never maps vehicle-scoped DIMO preflight to a specific
   * providerSourceLinkId when attribution is ambiguous (multi active link or provider mismatch).
   */
  async resolveForMaterialization(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
    linkProvider: string,
  ): Promise<VsiDeclaredCatalogSnapshot> {
    const activeLinkCount = await this.prisma.vehicleDataSourceLink.count({
      where: { vehicleId, isActive: true },
    });

    if (!isVsiP3aPerLinkCatalogResolverEnabled()) {
      const base = await this.resolveForVehicle(organizationId, vehicleId);
      const limitations = [...base.limitations];

      if (linkProvider !== 'DIMO') {
        limitations.push(VSI_DECLARED_CATALOG_PROVIDER_MISMATCH_LIMITATION);
        return this.withDeclaredCatalogUnknown(base, limitations);
      }

      if (activeLinkCount > 1) {
        limitations.push(VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION);
        return this.withDeclaredCatalogUnknown(base, limitations);
      }

      return { ...base, limitations };
    }

    const linkAxes = await this.prisma.vsiProviderCatalogAxis.findMany({
      where: {
        organizationId,
        vehicleId,
        providerSourceLinkId,
      },
    });

    const base = await this.resolveForVehicle(organizationId, vehicleId);
    const limitations = [...base.limitations];
    const byNative = new Map<string, VsiProviderCatalogStatus>();
    let checkedAt: Date | null = null;

    for (const axis of linkAxes) {
      if (axis.checkedAt && (!checkedAt || axis.checkedAt > checkedAt)) {
        checkedAt = axis.checkedAt;
      }
      byNative.set(
        axis.providerNativeSignalName,
        mapAxisDeclaredStatus(axis.declaredCatalogStatus),
      );
    }

    if (linkProvider !== 'DIMO') {
      limitations.push(VSI_DECLARED_CATALOG_PROVIDER_MISMATCH_LIMITATION);
      return this.withDeclaredCatalogUnknown(
        { checkedAt, byNativeSignalName: byNative, limitations },
        limitations,
      );
    }

    if (activeLinkCount > 1) {
      limitations.push(VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION);
      if (linkAxes.length === 0) {
        limitations.push(VSI_P3A_LIMITATION_PER_LINK_CATALOG_UNAVAILABLE);
      }
      return this.mergePerLinkCatalogWithLegacyFallback({
        base,
        perLinkByNative: byNative,
        checkedAt: checkedAt ?? base.checkedAt,
        limitations,
        allowLegacyFallback: false,
      });
    }

    if (linkAxes.length === 0) {
      limitations.push(VSI_P3A_LIMITATION_PER_LINK_CATALOG_UNAVAILABLE);
      return { ...base, limitations };
    }

    return this.mergePerLinkCatalogWithLegacyFallback({
      base,
      perLinkByNative: byNative,
      checkedAt: checkedAt ?? base.checkedAt,
      limitations: limitations.filter(
        (l) => l !== 'DECLARED_CATALOG_VEHICLE_SCOPED_NOT_PER_SOURCE_LINK',
      ),
      allowLegacyFallback: true,
    });
  }

  private mergePerLinkCatalogWithLegacyFallback(input: {
    base: VsiDeclaredCatalogSnapshot;
    perLinkByNative: Map<string, VsiProviderCatalogStatus>;
    checkedAt: Date | null;
    limitations: string[];
    allowLegacyFallback: boolean;
  }): VsiDeclaredCatalogSnapshot {
    const byNative = new Map<string, VsiProviderCatalogStatus>();
    const limitations = [...input.limitations];

    for (const key of VSI_PROFILE_MATERIALIZATION_KEYS) {
      const def = getVsiCanonicalSignalDefinition(key);
      const native = def.primaryDimoSignalName;
      if (!native) {
        continue;
      }

      const perLink = input.perLinkByNative.get(native);
      if (perLink != null) {
        byNative.set(native, perLink);
        continue;
      }

      const isP3aCatalogKey = (VSI_P3A_MATERIALIZATION_CATALOG_KEYS as readonly string[]).includes(
        key,
      );
      if (!isP3aCatalogKey) {
        byNative.set(native, VsiProviderCatalogStatus.UNKNOWN);
        continue;
      }

      if (input.allowLegacyFallback) {
        const legacy = input.base.byNativeSignalName.get(native);
        if (legacy != null && legacy !== VsiProviderCatalogStatus.UNKNOWN) {
          byNative.set(native, legacy);
          limitations.push(VSI_P3A_LIMITATION_LEGACY_VEHICLE_SCOPED_CATALOG);
          continue;
        }
      }

      byNative.set(native, VsiProviderCatalogStatus.UNKNOWN);
    }

    for (const native of input.perLinkByNative.keys()) {
      if (!byNative.has(native)) {
        byNative.set(native, input.perLinkByNative.get(native)!);
      }
    }

    return {
      checkedAt: input.checkedAt,
      byNativeSignalName: byNative,
      limitations: [...new Set(limitations)],
    };
  }

  private withDeclaredCatalogUnknown(
    base: VsiDeclaredCatalogSnapshot,
    limitations: string[],
  ): VsiDeclaredCatalogSnapshot {
    const byNative = new Map<string, VsiProviderCatalogStatus>();
    for (const key of VSI_PROFILE_MATERIALIZATION_KEYS) {
      const def = getVsiCanonicalSignalDefinition(key);
      const native = def.primaryDimoSignalName;
      if (native) {
        byNative.set(native, VsiProviderCatalogStatus.UNKNOWN);
      }
    }
    for (const native of base.byNativeSignalName.keys()) {
      if (!byNative.has(native)) {
        byNative.set(native, VsiProviderCatalogStatus.UNKNOWN);
      }
    }
    return {
      checkedAt: base.checkedAt,
      byNativeSignalName: byNative,
      limitations,
    };
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
