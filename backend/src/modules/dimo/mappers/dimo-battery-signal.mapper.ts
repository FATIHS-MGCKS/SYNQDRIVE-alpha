/**
 * DIMO → SynqDrive battery signal mapper.
 *
 * Official DIMO signal names and documented units per
 * `docs/audits/dimo-tesla-hv-signal-capability.md` and
 * `docs/audits/battery-measurement-domain-decision.md`.
 *
 * Rules:
 * - Current Energy is remaining pack energy (kWh), never "consumed energy".
 * - Provider `timestamp` on each signal is preserved; collection `lastSeen` is separate.
 * - Unit conversion only when DIMO documents a different source unit.
 * - Unknown / mismatched declared units → unsupported (no silent conversion).
 */

export type DimoBatterySignalStatus =
  | 'valid'
  | 'missing'
  | 'invalid_value'
  | 'unsupported_unit';

export type DimoBatterySourceUnit =
  | 'V'
  | 'percent'
  | 'kWh'
  | 'W'
  | 'kW'
  | 'celsius'
  | 'boolean01';

export interface MappedDimoBatteryFloat {
  dimoSignalName: string;
  value: number | null;
  sourceUnit: DimoBatterySourceUnit;
  targetUnit: string;
  status: DimoBatterySignalStatus;
  observedAt: Date | null;
}

export interface MappedDimoBatteryBoolean {
  dimoSignalName: string;
  value: boolean | null;
  status: DimoBatterySignalStatus;
  observedAt: Date | null;
}

export interface DimoBatterySignalMap {
  collectionLastSeenAt: Date | null;
  lvBatteryVoltage: MappedDimoBatteryFloat;
  evSoc: MappedDimoBatteryFloat;
  tractionBatteryCurrentEnergyKwh: MappedDimoBatteryFloat;
  tractionBatterySohPercent: MappedDimoBatteryFloat;
  tractionBatteryPowerKw: MappedDimoBatteryFloat;
  tractionBatteryChargingPowerKw: MappedDimoBatteryFloat;
  tractionBatteryAddedEnergyKwh: MappedDimoBatteryFloat;
  tractionBatteryChargeLimitPercent: MappedDimoBatteryFloat;
  tractionBatteryCurrentVoltage: MappedDimoBatteryFloat;
  tractionBatteryTemperatureC: MappedDimoBatteryFloat;
  tractionBatteryGrossCapacityKwh: MappedDimoBatteryFloat;
  tractionBatteryIsCharging: MappedDimoBatteryBoolean;
  tractionBatteryChargingCableConnected: MappedDimoBatteryBoolean;
}

export interface VlsBatteryFields {
  evSoc: number | null;
  tractionBatteryCurrentEnergyKwh: number | null;
  tractionBatterySohPercent: number | null;
  tractionBatteryPowerKw: number | null;
  tractionBatteryChargingPowerKw: number | null;
  tractionBatteryAddedEnergyKwh: number | null;
  tractionBatteryChargeLimitPercent: number | null;
  tractionBatteryCurrentVoltage: number | null;
  tractionBatteryTemperatureC: number | null;
  tractionBatteryGrossCapacityKwh: number | null;
  tractionBatteryIsCharging: boolean | null;
  tractionBatteryChargingCableConnected: boolean | null;
  lvBatteryVoltage: number | null;
}

export interface HvBatterySignalObservedAt {
  soc?: Date;
  currentEnergyKwh?: Date;
  chargingPowerKw?: Date;
  addedEnergyKwh?: Date;
  providerSoh?: Date;
  temperatureC?: Date;
  rangeKm?: Date;
  chargeLimitPercent?: Date;
  cableConnected?: Date;
  isCharging?: Date;
}

interface SignalSpec {
  dimoSignalName: string;
  sourceUnit: DimoBatterySourceUnit;
  targetUnit: string;
  min?: number;
  max?: number;
  convert?: (raw: number) => number;
}

export const SIGNAL_SPECS = {
  lvBatteryVoltage: {
    dimoSignalName: 'lowVoltageBatteryCurrentVoltage',
    sourceUnit: 'V',
    targetUnit: 'V',
    min: 0,
    max: 20,
  },
  evSoc: {
    dimoSignalName: 'powertrainTractionBatteryStateOfChargeCurrent',
    sourceUnit: 'percent',
    targetUnit: 'percent',
    min: 0,
    max: 100,
  },
  tractionBatteryCurrentEnergyKwh: {
    dimoSignalName: 'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    sourceUnit: 'kWh',
    targetUnit: 'kWh',
    min: 0,
    max: 300,
  },
  tractionBatterySohPercent: {
    dimoSignalName: 'powertrainTractionBatteryStateOfHealth',
    sourceUnit: 'percent',
    targetUnit: 'percent',
    min: 0,
    max: 100,
  },
  tractionBatteryPowerKw: {
    dimoSignalName: 'powertrainTractionBatteryCurrentPower',
    sourceUnit: 'W',
    targetUnit: 'kW',
    min: -500,
    max: 500_000,
    convert: (raw: number) => raw / 1000,
  },
  tractionBatteryChargingPowerKw: {
    dimoSignalName: 'powertrainTractionBatteryChargingPower',
    sourceUnit: 'kW',
    targetUnit: 'kW',
    min: 0,
    max: 500,
  },
  tractionBatteryAddedEnergyKwh: {
    dimoSignalName: 'powertrainTractionBatteryChargingAddedEnergy',
    sourceUnit: 'kWh',
    targetUnit: 'kWh',
    min: 0,
    max: 200,
  },
  tractionBatteryChargeLimitPercent: {
    dimoSignalName: 'powertrainTractionBatteryChargingChargeLimit',
    sourceUnit: 'percent',
    targetUnit: 'percent',
    min: 0,
    max: 100,
  },
  tractionBatteryCurrentVoltage: {
    dimoSignalName: 'powertrainTractionBatteryCurrentVoltage',
    sourceUnit: 'V',
    targetUnit: 'V',
    min: 0,
    max: 1000,
  },
  tractionBatteryTemperatureC: {
    dimoSignalName: 'powertrainTractionBatteryTemperatureAverage',
    sourceUnit: 'celsius',
    targetUnit: 'celsius',
    min: -50,
    max: 100,
  },
  tractionBatteryGrossCapacityKwh: {
    dimoSignalName: 'powertrainTractionBatteryGrossCapacity',
    sourceUnit: 'kWh',
    targetUnit: 'kWh',
    min: 0,
    max: 300,
  },
} as const satisfies Record<string, SignalSpec>;

export const BOOLEAN_SIGNAL_SPECS = {
  tractionBatteryIsCharging: {
    dimoSignalName: 'powertrainTractionBatteryChargingIsCharging',
  },
  tractionBatteryChargingCableConnected: {
    dimoSignalName: 'powertrainTractionBatteryChargingIsChargingCableConnected',
  },
} as const;

function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function readRawNumeric(field: unknown): number | null {
  if (field == null) return null;
  if (typeof field === 'number') return Number.isNaN(field) ? null : field;
  if (typeof field === 'object') {
    const value = (field as Record<string, unknown>).value;
    return value != null && typeof value === 'number' && !Number.isNaN(value)
      ? value
      : null;
  }
  return null;
}

function readDeclaredUnit(field: unknown): string | null {
  if (!field || typeof field !== 'object') return null;
  const unit = (field as Record<string, unknown>).unit;
  return typeof unit === 'string' && unit.trim() ? unit.trim() : null;
}

function normalizeDeclaredUnit(unit: string): DimoBatterySourceUnit | null {
  const normalized = unit.trim().toLowerCase();
  switch (normalized) {
    case 'v':
    case 'volt':
    case 'volts':
      return 'V';
    case '%':
    case 'percent':
    case 'pct':
      return 'percent';
    case 'kwh':
    case 'kilowatt_hour':
    case 'kilowatthour':
      return 'kWh';
    case 'w':
    case 'watt':
    case 'watts':
      return 'W';
    case 'kw':
    case 'kilowatt':
    case 'kilowatts':
      return 'kW';
    case 'c':
    case 'celsius':
    case '°c':
    case 'degc':
      return 'celsius';
    default:
      return null;
  }
}

function unitsCompatible(
  declared: DimoBatterySourceUnit | null,
  expected: DimoBatterySourceUnit,
): boolean {
  if (declared == null) return true;
  return declared === expected;
}

function mapFloatSignal(
  signals: Record<string, unknown>,
  spec: SignalSpec,
): MappedDimoBatteryFloat {
  const field = signals[spec.dimoSignalName];
  const raw = readRawNumeric(field);
  const observedAt = parseTimestamp(
    field && typeof field === 'object'
      ? (field as Record<string, unknown>).timestamp
      : null,
  );
  const declaredUnitRaw = readDeclaredUnit(field);
  const declaredUnit = declaredUnitRaw
    ? normalizeDeclaredUnit(declaredUnitRaw)
    : null;

  if (raw == null) {
    return {
      dimoSignalName: spec.dimoSignalName,
      value: null,
      sourceUnit: spec.sourceUnit,
      targetUnit: spec.targetUnit,
      status: 'missing',
      observedAt,
    };
  }

  if (declaredUnitRaw && declaredUnit == null) {
    return {
      dimoSignalName: spec.dimoSignalName,
      value: null,
      sourceUnit: spec.sourceUnit,
      targetUnit: spec.targetUnit,
      status: 'unsupported_unit',
      observedAt,
    };
  }

  if (!unitsCompatible(declaredUnit, spec.sourceUnit)) {
    return {
      dimoSignalName: spec.dimoSignalName,
      value: null,
      sourceUnit: spec.sourceUnit,
      targetUnit: spec.targetUnit,
      status: 'unsupported_unit',
      observedAt,
    };
  }

  const converted = spec.convert ? spec.convert(raw) : raw;
  if (
    spec.min != null &&
    spec.max != null &&
    (converted < spec.min || converted > spec.max)
  ) {
    return {
      dimoSignalName: spec.dimoSignalName,
      value: null,
      sourceUnit: spec.sourceUnit,
      targetUnit: spec.targetUnit,
      status: 'invalid_value',
      observedAt,
    };
  }

  return {
    dimoSignalName: spec.dimoSignalName,
    value: converted,
    sourceUnit: spec.sourceUnit,
    targetUnit: spec.targetUnit,
    status: 'valid',
    observedAt,
  };
}

function mapBooleanSignal(
  signals: Record<string, unknown>,
  dimoSignalName: string,
): MappedDimoBatteryBoolean {
  const field = signals[dimoSignalName];
  const raw = readRawNumeric(field);
  const observedAt = parseTimestamp(
    field && typeof field === 'object'
      ? (field as Record<string, unknown>).timestamp
      : null,
  );

  if (raw == null) {
    return {
      dimoSignalName,
      value: null,
      status: 'missing',
      observedAt,
    };
  }

  if (raw !== 0 && raw !== 1) {
    return {
      dimoSignalName,
      value: null,
      status: 'invalid_value',
      observedAt,
    };
  }

  return {
    dimoSignalName,
    value: raw >= 0.5,
    status: 'valid',
    observedAt,
  };
}

export function mapDimoBatterySignals(
  signals: Record<string, unknown>,
): DimoBatterySignalMap {
  return {
    collectionLastSeenAt: parseTimestamp(signals.lastSeen),
    lvBatteryVoltage: mapFloatSignal(signals, SIGNAL_SPECS.lvBatteryVoltage),
    evSoc: mapFloatSignal(signals, SIGNAL_SPECS.evSoc),
    tractionBatteryCurrentEnergyKwh: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryCurrentEnergyKwh,
    ),
    tractionBatterySohPercent: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatterySohPercent,
    ),
    tractionBatteryPowerKw: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryPowerKw,
    ),
    tractionBatteryChargingPowerKw: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryChargingPowerKw,
    ),
    tractionBatteryAddedEnergyKwh: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryAddedEnergyKwh,
    ),
    tractionBatteryChargeLimitPercent: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryChargeLimitPercent,
    ),
    tractionBatteryCurrentVoltage: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryCurrentVoltage,
    ),
    tractionBatteryTemperatureC: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryTemperatureC,
    ),
    tractionBatteryGrossCapacityKwh: mapFloatSignal(
      signals,
      SIGNAL_SPECS.tractionBatteryGrossCapacityKwh,
    ),
    tractionBatteryIsCharging: mapBooleanSignal(
      signals,
      BOOLEAN_SIGNAL_SPECS.tractionBatteryIsCharging.dimoSignalName,
    ),
    tractionBatteryChargingCableConnected: mapBooleanSignal(
      signals,
      BOOLEAN_SIGNAL_SPECS.tractionBatteryChargingCableConnected.dimoSignalName,
    ),
  };
}

export function toVlsBatteryFields(map: DimoBatterySignalMap): VlsBatteryFields {
  const pickFloat = (signal: MappedDimoBatteryFloat) =>
    signal.status === 'valid' ? signal.value : null;
  const pickBoolean = (signal: MappedDimoBatteryBoolean) =>
    signal.status === 'valid' ? signal.value : null;

  return {
    evSoc: pickFloat(map.evSoc),
    tractionBatteryCurrentEnergyKwh: pickFloat(map.tractionBatteryCurrentEnergyKwh),
    tractionBatterySohPercent: pickFloat(map.tractionBatterySohPercent),
    tractionBatteryPowerKw: pickFloat(map.tractionBatteryPowerKw),
    tractionBatteryChargingPowerKw: pickFloat(map.tractionBatteryChargingPowerKw),
    tractionBatteryAddedEnergyKwh: pickFloat(map.tractionBatteryAddedEnergyKwh),
    tractionBatteryChargeLimitPercent: pickFloat(map.tractionBatteryChargeLimitPercent),
    tractionBatteryCurrentVoltage: pickFloat(map.tractionBatteryCurrentVoltage),
    tractionBatteryTemperatureC: pickFloat(map.tractionBatteryTemperatureC),
    tractionBatteryGrossCapacityKwh: pickFloat(map.tractionBatteryGrossCapacityKwh),
    tractionBatteryIsCharging: pickBoolean(map.tractionBatteryIsCharging),
    tractionBatteryChargingCableConnected: pickBoolean(
      map.tractionBatteryChargingCableConnected,
    ),
    lvBatteryVoltage: pickFloat(map.lvBatteryVoltage),
  };
}

export function toHvBatterySignalObservedAt(
  map: DimoBatterySignalMap,
): HvBatterySignalObservedAt {
  const ts = (signal: MappedDimoBatteryFloat | MappedDimoBatteryBoolean) =>
    signal.status === 'valid' ? (signal.observedAt ?? undefined) : undefined;

  return {
    soc: ts(map.evSoc),
    currentEnergyKwh: ts(map.tractionBatteryCurrentEnergyKwh),
    chargingPowerKw:
      ts(map.tractionBatteryChargingPowerKw) ?? ts(map.tractionBatteryPowerKw),
    addedEnergyKwh: ts(map.tractionBatteryAddedEnergyKwh),
    providerSoh: ts(map.tractionBatterySohPercent),
    temperatureC: ts(map.tractionBatteryTemperatureC),
    chargeLimitPercent: ts(map.tractionBatteryChargeLimitPercent),
    cableConnected: ts(map.tractionBatteryChargingCableConnected),
    isCharging: ts(map.tractionBatteryIsCharging),
  };
}

export function resolveLvBatteryObservedAt(
  map: DimoBatterySignalMap,
): Date | null {
  if (map.lvBatteryVoltage.status === 'valid' && map.lvBatteryVoltage.observedAt) {
    return map.lvBatteryVoltage.observedAt;
  }
  return map.collectionLastSeenAt;
}
