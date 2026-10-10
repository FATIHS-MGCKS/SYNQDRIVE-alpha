import { applyCustomerFacingBatterySummaryBoundaries } from './battery-customer-response.presenter';
import type { HvCustomerTelemetryFields } from './battery-hv-customer-telemetry.presenter';

describe('battery-customer-response.presenter', () => {
  const masked: HvCustomerTelemetryFields = {
    socPercent: null,
    rangeKm: null,
    currentEnergyKwh: null,
    grossCapacityKwh: null,
    addedEnergyKwh: null,
    chargingPowerKw: null,
    currentVoltageV: null,
    temperatureC: null,
    isCharging: null,
    chargingCableConnected: null,
    providerSohPercent: null,
  };

  it('masks canonical liveState hv values and signal values while preserving freshness', () => {
    const summary = {
      hv: { telemetry: { socPercent: 87 } },
      currentTelemetry: { socPercent: null, rangeKm: null },
      canonical: {
        hv: {
          soc: { percent: 87, observedAt: '2026-01-01T00:00:00.000Z' },
          currentEnergy: { kwh: 50, observedAt: '2026-01-01T00:00:00.000Z' },
          chargingState: {
            isCharging: true,
            cableConnected: true,
            powerKw: 11,
            state: 'charging',
          },
          providerSoh: { percent: 82, decisionFresh: false },
        },
        liveState: {
          hv: {
            values: {
              socPercent: 87,
              rangeKm: 278,
              currentEnergyKwh: 50,
              grossCapacityKwh: 76,
              addedEnergyKwh: 6,
              chargingPowerKw: 11,
              currentVoltageV: 380,
              temperatureC: 24,
              isCharging: true,
              chargingCableConnected: true,
              providerSohPercent: 82,
            },
            signals: {
              socPercent: {
                value: 87,
                freshness: { freshnessState: 'STALE' },
                error: null,
              },
            },
          },
        },
        legacy: {
          collapsed: true,
          lvDiagnostic: null,
          hvLegacyCapacity: null,
          crankDiagnostic: null,
          startProxyDiagnostic: null,
          v2Features: {
            publishedSohPct: 80,
            stabilizedSohPct: 79,
            rawSohPct: 78,
            publicationState: 'STABLE',
            scoredAt: null,
          },
        },
      },
    } as any;

    applyCustomerFacingBatterySummaryBoundaries(summary, masked, {
      lvPublicationCustomerVisible: false,
    });

    expect(summary.canonical.liveState.hv.values.socPercent).toBeNull();
    expect(summary.canonical.liveState.hv.signals.socPercent.value).toBeNull();
    expect(summary.canonical.liveState.hv.signals.socPercent.freshness.freshnessState).toBe(
      'STALE',
    );
    expect(summary.canonical.hv.chargingState.isCharging).toBeNull();
    expect(summary.canonical.hv.providerSoh.percent).toBeNull();
    expect(summary.canonical.legacy.v2Features?.publishedSohPct).toBeNull();
  });

  it('redacts lvDiagnostic SOH when publication is off even if decisionCapable=true', () => {
    const summary = {
      canonical: {
        legacy: {
          collapsed: true,
          lvDiagnostic: {
            displayMode: 'LEGACY_UNVERIFIED',
            decisionCapable: true,
            publishedSohPct: 91,
            stabilizedSohPct: 90,
            rawSohPct: 92,
            publicationState: 'STABLE',
            scoredAt: null,
            supersededByPrimary: false,
          },
          hvLegacyCapacity: null,
          crankDiagnostic: null,
          startProxyDiagnostic: null,
          v2Features: null,
        },
      },
    } as any;

    applyCustomerFacingBatterySummaryBoundaries(summary, masked, {
      lvPublicationCustomerVisible: false,
    });

    expect(summary.canonical.legacy.lvDiagnostic?.publishedSohPct).toBeNull();
    expect(summary.canonical.legacy.lvDiagnostic?.rawSohPct).toBeNull();
  });

  it('preserves lvDiagnostic SOH when publication and decisionCapable are both true', () => {
    const summary = {
      canonical: {
        legacy: {
          collapsed: true,
          lvDiagnostic: {
            displayMode: 'LEGACY_UNVERIFIED',
            decisionCapable: true,
            publishedSohPct: 91,
            stabilizedSohPct: 90,
            rawSohPct: 92,
            publicationState: 'STABLE',
            scoredAt: null,
            supersededByPrimary: false,
          },
          hvLegacyCapacity: null,
          crankDiagnostic: null,
          startProxyDiagnostic: null,
          v2Features: null,
        },
      },
    } as any;

    applyCustomerFacingBatterySummaryBoundaries(summary, masked, {
      lvPublicationCustomerVisible: true,
    });

    expect(summary.canonical.legacy.lvDiagnostic?.publishedSohPct).toBe(91);
  });
});
