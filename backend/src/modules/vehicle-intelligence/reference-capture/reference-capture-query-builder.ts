import {
  buildHistoricalSelectionForField,
  buildLatestSelectionForField,
  filterSchemaValidProviderFields,
  isValidGraphqlFieldName,
} from './reference-capture-signal-schema.registry';

export type ReferenceCaptureQueryPlan = {
  providerFields: string[];
  rejectedFields: string[];
  latestSelectionLines: string[];
  historicalSelectionLines: string[];
};

export function planReferenceCaptureQuery(providerFields: string[]): ReferenceCaptureQueryPlan {
  const rejectedFields = providerFields.filter((f) => !isValidGraphqlFieldName(f));
  const validFields = filterSchemaValidProviderFields(providerFields);

  const latestSelectionLines = ['lastSeen', ...validFields.map(buildLatestSelectionForField)];
  const historicalSelectionLines = validFields
    .map(buildHistoricalSelectionForField)
    .filter((line): line is string => line != null);

  return {
    providerFields: validFields,
    rejectedFields,
    latestSelectionLines,
    historicalSelectionLines,
  };
}

/** Dynamic broad signalsLatest — NOT the static production snapshot query. */
export function buildBroadReferenceSignalsLatestQuery(
  tokenId: number,
  providerFields: string[],
): string {
  const plan = planReferenceCaptureQuery(providerFields);
  const body = plan.latestSelectionLines.join('\n        ');
  return `
    query BroadReferenceSignalsLatest {
      signalsLatest(tokenId: ${tokenId}) {
        ${body}
      }
    }
  `.trim();
}

export function buildBroadReferenceHistoricalSignalsQuery(
  tokenId: number,
  providerFields: string[],
  from: Date,
  to: Date,
  requestedInterval: string,
): string | null {
  const plan = planReferenceCaptureQuery(providerFields);
  if (plan.historicalSelectionLines.length === 0) return null;

  const body = ['timestamp', ...plan.historicalSelectionLines].join('\n        ');
  return `
    query BroadReferenceHistoricalSignals {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "${requestedInterval}"
      ) {
        ${body}
      }
    }
  `.trim();
}

export function buildBroadReferenceEventsQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query BroadReferenceEvents {
      events(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
      ) {
        timestamp
        name
        source
        durationNs
        metadata
      }
    }
  `.trim();
}

/**
 * Regression guard: fields present in broad plan but absent from static production snapshot.
 */
export function fieldsMissingFromProductionSnapshot(providerFields: string[]): string[] {
  const productionFields = new Set([
    'lastSeen',
    'currentLocationCoordinates',
    'speed',
    'powertrainTransmissionTravelledDistance',
    'powertrainFuelSystemRelativeLevel',
    'powertrainFuelSystemAbsoluteLevel',
    'powertrainTractionBatteryStateOfChargeCurrent',
    'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    'powertrainTractionBatteryStateOfHealth',
    'powertrainTractionBatteryCurrentPower',
    'powertrainTractionBatteryCurrentVoltage',
    'powertrainTractionBatteryTemperatureAverage',
    'powertrainTractionBatteryChargingIsCharging',
    'powertrainTractionBatteryChargingIsChargingCableConnected',
    'powertrainTractionBatteryChargingPower',
    'powertrainTractionBatteryChargingChargeLimit',
    'powertrainTractionBatteryChargingAddedEnergy',
    'powertrainTractionBatteryRange',
    'powertrainTractionBatteryGrossCapacity',
    'powertrainCombustionEngineEngineOilRelativeLevel',
    'powertrainCombustionEngineDieselExhaustFluidLevel',
    'powertrainCombustionEngineECT',
    'chassisAxleRow1WheelLeftTirePressure',
    'chassisAxleRow1WheelRightTirePressure',
    'chassisAxleRow2WheelLeftTirePressure',
    'chassisAxleRow2WheelRightTirePressure',
    'chassisTireSystemIsWarningOn',
    'isIgnitionOn',
    'obdIsPluggedIn',
    'connectivityCellularIsJammingDetected',
    'obdEngineLoad',
    'lowVoltageBatteryCurrentVoltage',
    'powertrainType',
  ]);

  return filterSchemaValidProviderFields(providerFields).filter((f) => !productionFields.has(f));
}
