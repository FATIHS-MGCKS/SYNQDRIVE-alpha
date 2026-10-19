import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import type { VsiP3aMaterializationCatalogKey } from './vsi-p3a-catalog-axis.contract';
import { VSI_P3A_MATERIALIZATION_CATALOG_KEYS } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogSnapshotCompleteness } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

function normalizeFuelType(fuelType: string | null | undefined): string | null {
  if (!fuelType) return null;
  return fuelType.toUpperCase();
}

function isBatteryElectricOnly(fuelType: string | null | undefined): boolean {
  const normalized = normalizeFuelType(fuelType);
  if (!normalized) return false;
  return normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV';
}

function hasHighVoltagePackApplicability(fuelType: string | null | undefined): boolean {
  if (isBatteryElectricOnly(fuelType)) return true;
  const normalized = normalizeFuelType(fuelType);
  if (!normalized) return false;
  return normalized === 'PLUGIN_HYBRID' || normalized === 'HYBRID' || normalized === 'PHEV';
}

function hasIceFuelApplicability(fuelType: string | null | undefined): boolean {
  const normalized = normalizeFuelType(fuelType);
  if (!normalized) return false;
  if (isBatteryElectricOnly(normalized)) return false;
  return true;
}

function isApplicable(
  key: VsiP3aMaterializationCatalogKey,
  fuelType: string | null | undefined,
): boolean | 'UNKNOWN' {
  const def = getVsiCanonicalSignalDefinition(key);
  const normalized = normalizeFuelType(fuelType);
  if (!normalized) return 'UNKNOWN';

  if (def.evOnly) {
    return hasHighVoltagePackApplicability(normalized);
  }
  if (def.iceOnly) {
    return hasIceFuelApplicability(normalized);
  }
  return true;
}

export type VsiP3aCatalogAxisClassification = {
  canonicalSignalKey: VsiP3aMaterializationCatalogKey;
  providerNativeSignalName: string;
  declaredCatalogStatus: VsiProviderCatalogStatus;
  metadata: Record<string, unknown>;
};

/**
 * Classify declared catalog status from a complete DIMO availableSignals snapshot only.
 * Does not infer LISTED from segment detectors, poll success, or partial catalogs.
 */
export function classifyVsiP3aCatalogAxes(input: {
  availableSignals: readonly string[];
  fuelType: string | null | undefined;
  catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
}): VsiP3aCatalogAxisClassification[] {
  const available = new Set(input.availableSignals);
  const canProveNotListed =
    input.catalogSnapshotCompleteness ===
    VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG;

  return VSI_P3A_MATERIALIZATION_CATALOG_KEYS.map((key) => {
    const def = getVsiCanonicalSignalDefinition(key);
    const native = def.primaryDimoSignalName;
    if (!native) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: key,
        declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
        metadata: { reason: 'missing_primary_dimo_signal_name' },
      };
    }

    const applicability = isApplicable(key, input.fuelType);
    if (applicability === false) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
        metadata: {
          reason: 'powertrain_not_applicable',
          listedInAvailableSignals: false,
        },
      };
    }
    if (applicability === 'UNKNOWN') {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
        metadata: {
          reason: 'powertrain_applicability_unknown',
          listedInAvailableSignals: 'UNKNOWN',
        },
      };
    }

    const listed = available.has(native);
    if (listed) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.LISTED,
        metadata: {
          listedInAvailableSignals: true,
          reason: 'listed_in_available_signals',
        },
      };
    }

    if (canProveNotListed) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.NOT_LISTED,
        metadata: {
          listedInAvailableSignals: false,
          reason: 'signal_not_in_availableSignals',
        },
      };
    }

    return {
      canonicalSignalKey: key,
      providerNativeSignalName: native,
      declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
      metadata: {
        reason: 'catalog_snapshot_incomplete',
        listedInAvailableSignals: 'UNKNOWN',
      },
    };
  });
}
