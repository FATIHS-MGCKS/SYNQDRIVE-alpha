export const BATTERY_LV_COMPLETE = {
  measurementDate: '2026-05-01',
  eventDate: '2026-05-01',
  scope: 'lv',
  recordKind: 'measurement',
  batteryType: 'AGM',
  voltageV: 12.44,
  restingVoltage: 12.61,
  crankingVoltage: 10.91,
  chargingVoltage: 14.11,
  temperatureC: 18,
  temperatureContext: 'Werkstatt, Motor aus',
  deviceOrWorkshop: 'Midtronics EXP-1000',
  workshopName: 'Bosch Car Service',
  odometerKm: 55200,
};

export const BATTERY_HV_SOH = {
  measurementDate: '2026-05-01',
  scope: 'hv',
  recordKind: 'measurement',
  batteryType: 'LITHIUM_ION',
  sohPercent: 87.5,
  sohSource: 'HV_BMS_REPORT',
  voltageV: 380,
  capacityKwh: 64,
  temperatureContext: 'Nach Schnellladung',
  deviceOrWorkshop: 'HV Diagnose',
};

export const BATTERY_MISSING_DATE = {
  scope: 'lv',
  voltageV: 12.4,
};

export const BATTERY_MISSING_SCOPE = {
  measurementDate: '2026-05-01',
  voltageV: 12.4,
};

export const BATTERY_LV_SOH_INFERRED = {
  measurementDate: '2026-05-01',
  scope: 'lv',
  sohPercent: 78,
  voltageV: 12.4,
};

export const BATTERY_UNKNOWN_TYPE = {
  measurementDate: '2026-05-01',
  scope: 'lv',
  batteryType: 'UNKNOWN',
  voltageV: 12.4,
};
