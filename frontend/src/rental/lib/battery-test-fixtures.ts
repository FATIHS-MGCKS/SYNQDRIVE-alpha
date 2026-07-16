import type { BatteryHealthDetail, BatteryHealthSummary } from '../../lib/api';

export function batterySummary(partial: Record<string, unknown> = {}): BatteryHealthSummary {
  return partial as unknown as BatteryHealthSummary;
}

export function batteryDetail(partial: Record<string, unknown> = {}): BatteryHealthDetail {
  return partial as unknown as BatteryHealthDetail;
}

/** ICE with live LV telemetry and qualified resting voltage. */
export function iceLvLiveStable(): BatteryHealthSummary {
  return batterySummary({
    support: { lv: true, hv: false },
    lv: {
      publicationState: 'STABLE',
      healthStatus: 'GOOD',
      estimatedHealth: {
        status: 'GOOD',
        bars: 3,
        label: 'Geschätzter 12V-Batteriezustand',
        scorePct: 82,
      },
      telemetry: { voltageV: 12.48, voltageSource: 'live_telemetry' },
      freshness: { isFresh: true, observedAt: '2026-07-16T13:00:00.000Z', ageMs: 12_000 },
      restingVoltage: {
        valueV: 12.62,
        status: 'GOOD',
        batteryType: 'AGM',
        measurementContext: 'REST_60M',
        dataQualityStatus: 'VERIFIED',
        dataQuality: { status: 'VERIFIED', observedAt: '2026-07-16T08:00:00.000Z' },
      },
    },
    dataQuality: {
      status: 'VERIFIED',
      slices: {
        lvEstimatedHealth: { status: 'VERIFIED', decisionCapable: true, observedAt: null, labelKey: '' },
        lvRestingVoltage: { status: 'VERIFIED', decisionCapable: true, observedAt: null, labelKey: '' },
        lvCrank: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        hvSoh: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        hvLegacyCapacity: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
      },
    },
    currentTelemetry: { lvVoltageV: 12.48, observedAt: '2026-07-16T13:00:00.000Z' },
  });
}

export function iceLvObservationStale(): BatteryHealthSummary {
  return batterySummary({
    ...iceLvLiveStable(),
    lv: {
      ...iceLvLiveStable().lv!,
      freshness: { isFresh: false, observedAt: '2026-07-16T10:00:00.000Z', ageMs: 3_600_000 },
    },
  });
}

export function iceLvStartProxyProxy(): BatteryHealthSummary {
  const base = iceLvLiveStable();
  return batterySummary({
    ...base,
    dataQuality: {
      ...base.dataQuality!,
      status: 'PROXY',
    },
    lv: {
      ...base.lv!,
      telemetry: {
        ...base.lv!.telemetry,
        startProxy: {
          availability: 'SUPPORTED',
          uiLabelDe: 'Startverhalten (geschätzt)',
          measurements: [
            {
              classification: 'PROXY',
              dataQualityStatus: 'PROXY',
              numericValue: 10.8,
              unit: 'V',
              measurementAgeMs: 120_000,
            },
          ],
        },
      },
    },
  });
}

export function iceLvStartProxyExperimental(): BatteryHealthSummary {
  const base = iceLvStartProxyProxy();
  return batterySummary({
    ...base,
    lv: {
      ...base.lv!,
      telemetry: {
        ...base.lv!.telemetry,
        startProxy: {
          ...base.lv!.telemetry!.startProxy!,
          measurements: [
            {
              classification: 'EXPERIMENTAL',
              dataQualityStatus: 'EXPERIMENTAL',
              numericValue: 10.5,
              unit: 'V',
              measurementAgeMs: 60_000,
            },
          ],
        },
      },
    },
  });
}

export function iceLvMissedRest(): BatteryHealthSummary {
  return batterySummary({
    ...iceLvLiveStable(),
    dataQuality: {
      status: 'MISSED',
      slices: {
        ...iceLvLiveStable().dataQuality!.slices,
        lvRestingVoltage: { status: 'MISSED', decisionCapable: false, observedAt: null, labelKey: '' },
      },
    },
    lv: {
      ...iceLvLiveStable().lv!,
      restingVoltage: {
        valueV: null,
        status: 'UNKNOWN',
        batteryType: 'AGM',
        measurementContext: 'REST_60M',
        dataQualityStatus: 'MISSED',
      },
    },
  });
}

export function iceLvUnsupported(): BatteryHealthSummary {
  return batterySummary({
    support: { lv: true, hv: false },
    lv: { status: 'estimate_unavailable', publicationState: 'INITIAL_CALIBRATION' },
  });
}

export function evHvProviderSoh(): BatteryHealthSummary {
  return batterySummary({
    support: { lv: true, hv: true },
    lv: iceLvLiveStable().lv,
    hv: {
      publicationState: 'STABLE',
      healthStatus: 'GOOD',
      sohPct: 91,
      sohSource: 'PROVIDER',
      dataQualityStatus: 'VERIFIED',
      telemetry: {
        socPercent: 68,
        currentEnergyKwh: 52.4,
        providerSohPercent: 91,
        isCharging: true,
        chargingPowerKw: 11.2,
        rangeKm: 312,
      },
      freshness: { isFresh: true, observedAt: '2026-07-16T13:00:00.000Z', ageMs: 8_000 },
    },
    canonical: {
      hv: {
        providerSoh: { percent: 91, source: 'PROVIDER', decisionFresh: true },
        referenceCapacity: {
          capacityKwh: 77,
          verificationStatus: 'VERIFIED',
          source: 'DOCUMENT',
        },
        sohAssessment: { sohGatePassed: true, estimatedUsableCapacityKwh: 70.1 },
        currentChargeSession: {
          id: 'sess-1',
          startTime: '2026-07-16T11:30:00.000Z',
          startSoc: 42,
          endSoc: 68,
          energyChargedKwh: 18.2,
          maxChargingPowerKw: 11.2,
          isOngoing: true,
        },
      },
      liveState: {
        hv: {
          observedAt: '2026-07-16T13:00:00.000Z',
          values: { socPercent: 68, currentEnergyKwh: 52.4, providerSohPercent: 91 },
        },
      },
    },
    dataQuality: {
      status: 'VERIFIED',
      slices: {
        lvEstimatedHealth: { status: 'VERIFIED', decisionCapable: true, observedAt: null, labelKey: '' },
        lvRestingVoltage: { status: 'VERIFIED', decisionCapable: true, observedAt: null, labelKey: '' },
        lvCrank: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        hvSoh: { status: 'VERIFIED', decisionCapable: true, observedAt: null, labelKey: '' },
        hvLegacyCapacity: { status: 'ESTIMATED', decisionCapable: true, observedAt: null, labelKey: '' },
      },
    },
  });
}

export function evHvMissingSoh(): BatteryHealthSummary {
  return batterySummary({
    support: { lv: true, hv: true },
    hv: {
      publicationState: 'STABLE',
      healthStatus: 'UNKNOWN',
      sohPct: null,
      noFallbackSoh: true,
      dataQualityStatus: 'UNAVAILABLE',
      telemetry: { socPercent: 55, currentEnergyKwh: 41.0 },
    },
    dataQuality: {
      status: 'UNAVAILABLE',
      slices: {
        lvEstimatedHealth: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        lvRestingVoltage: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        lvCrank: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        hvSoh: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        hvLegacyCapacity: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
      },
    },
  });
}

export function evHvLegacyUnverified(): BatteryHealthSummary {
  return batterySummary({
    support: { lv: true, hv: true },
    hv: {
      publicationState: 'STABLE',
      sohPct: 78,
      sohSource: 'CAPACITY_ESTIMATE',
      dataQualityStatus: 'LEGACY_UNVERIFIED',
      noFallbackSoh: true,
      legacyCapacity: { displayMode: 'LEGACY_UNVERIFIED', decisionCapable: false },
      telemetry: { socPercent: 60 },
    },
    dataQuality: {
      status: 'LEGACY_UNVERIFIED',
      slices: {
        lvEstimatedHealth: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        lvRestingVoltage: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        lvCrank: { status: 'UNAVAILABLE', decisionCapable: false, observedAt: null, labelKey: '' },
        hvSoh: { status: 'LEGACY_UNVERIFIED', decisionCapable: false, observedAt: null, labelKey: '' },
        hvLegacyCapacity: { status: 'LEGACY_UNVERIFIED', decisionCapable: false, observedAt: null, labelKey: '' },
      },
    },
  });
}

export function evHvCapacityShadow(): BatteryHealthSummary {
  return batterySummary({
    ...evHvProviderSoh(),
    hv: {
      ...evHvProviderSoh().hv!,
      sohSource: 'CAPACITY_ESTIMATE',
      sohPct: 86,
      method: 'SHADOW_ROLLING_MEDIAN',
      confidence: 'HIGH',
    },
    canonical: {
      ...evHvProviderSoh().canonical!,
      hv: {
        ...evHvProviderSoh().canonical!.hv!,
        sohAssessment: {
          sohGatePassed: true,
          estimatedUsableCapacityKwh: 66.2,
          shadowModelVersion: 2,
        },
      },
    },
  });
}
