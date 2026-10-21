import { classifyVsiP3aCatalogAxes } from './vsi-p3a-catalog-axis.classifier';
import { VsiProviderCatalogSnapshotCompleteness } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

describe('classifyVsiP3aCatalogAxes', () => {
  it('marks speed LISTED only when present in complete availableSignals', () => {
    const rows = classifyVsiP3aCatalogAxes({
      availableSignals: ['speed', 'powertrainTransmissionTravelledDistance'],
      fuelType: 'GASOLINE',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    });
    const speed = rows.find((r) => r.canonicalSignalKey === 'vehicle_speed');
    expect(speed?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.LISTED);
  });

  it('does not emit NOT_LISTED when catalog snapshot is incomplete', () => {
    const rows = classifyVsiP3aCatalogAxes({
      availableSignals: [],
      fuelType: 'GASOLINE',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.PROVIDER_ERROR,
    });
    const speed = rows.find((r) => r.canonicalSignalKey === 'vehicle_speed');
    expect(speed?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.UNKNOWN);
  });

  it('keeps hv_battery_soc UNKNOWN on ICE when not applicable', () => {
    const rows = classifyVsiP3aCatalogAxes({
      availableSignals: ['powertrainTractionBatteryStateOfChargeCurrent'],
      fuelType: 'GASOLINE',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    });
    const hv = rows.find((r) => r.canonicalSignalKey === 'hv_battery_soc');
    expect(hv?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.UNKNOWN);
  });

  it('allows fuel and HV classification on PLUGIN_HYBRID when present in catalog', () => {
    const rows = classifyVsiP3aCatalogAxes({
      availableSignals: [
        'powertrainFuelSystemRelativeLevel',
        'powertrainTractionBatteryStateOfChargeCurrent',
      ],
      fuelType: 'PLUGIN_HYBRID',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    });
    const fuel = rows.find((r) => r.canonicalSignalKey === 'fuel_level_relative');
    const hv = rows.find((r) => r.canonicalSignalKey === 'hv_battery_soc');
    expect(fuel?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.LISTED);
    expect(hv?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.LISTED);
  });

  it('does not emit NOT_LISTED on incomplete catalog even when signals absent', () => {
    const rows = classifyVsiP3aCatalogAxes({
      availableSignals: [],
      fuelType: 'GASOLINE',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
    });
    expect(rows.some((r) => r.declaredCatalogStatus === VsiProviderCatalogStatus.NOT_LISTED)).toBe(
      false,
    );
  });

  it('marks hv NOT_LISTED on ICE when absent from complete catalog', () => {
    const rows = classifyVsiP3aCatalogAxes({
      availableSignals: ['speed'],
      fuelType: 'GASOLINE',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    });
    const hv = rows.find((r) => r.canonicalSignalKey === 'hv_battery_soc');
    expect(hv?.declaredCatalogStatus).toBe(VsiProviderCatalogStatus.UNKNOWN);
  });
});
