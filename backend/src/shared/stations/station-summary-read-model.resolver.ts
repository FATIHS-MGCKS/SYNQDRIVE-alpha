import {
  STATION_SUMMARY_READ_MODEL_VERSION,
  type StationSummaryPartialDataStatus,
  type StationSummaryReadModel,
  type StationSummaryReadModelAssemblyInput,
} from './station-summary-read-model.contract';
import type { StationKpisResult } from './station-kpis.contract';

export * from './station-summary-read-model.contract';

function collectPartialDataStatus(kpis: StationKpisResult): StationSummaryPartialDataStatus {
  const unknownMetricNames = (
    Object.entries(kpis.metrics) as Array<
      [keyof StationKpisResult['metrics'], StationKpisResult['metrics'][keyof StationKpisResult['metrics']]]
    >
  )
    .filter(([, metric]) => !metric.known)
    .map(([name]) => String(name));

  const reasons = unknownMetricNames.flatMap((name) => {
    const metric = kpis.metrics[name as keyof StationKpisResult['metrics']];
    return metric?.reasons ?? [];
  });

  return {
    complete: unknownMetricNames.length === 0,
    unknownMetricNames,
    reasons,
  };
}

export function resolveStationSummaryReadModel(
  input: StationSummaryReadModelAssemblyInput,
): StationSummaryReadModel {
  const partialData = collectPartialDataStatus(input.kpis);

  return {
    version: STATION_SUMMARY_READ_MODEL_VERSION,
    stationId: input.masterData.id,
    organizationId: input.masterData.organizationId,
    lastCalculatedAt: input.evaluatedAt,
    masterData: input.masterData,
    lifecycle: input.lifecycle,
    openingStatus: input.operations.openingStatus,
    operationalCapabilities: {
      pickup: input.operations.pickupCapability,
      return: input.operations.returnCapability,
      afterHours: input.operations.afterHoursCapability,
      keybox: input.operations.keyboxStatus,
    },
    kpis: input.kpis,
    configurationProblems: input.operations.configurationProblems,
    operationalWarnings: input.operations.operationalWarnings,
    partialData,
    scope: input.scope,
    frontendRecomputation: false,
  };
}
