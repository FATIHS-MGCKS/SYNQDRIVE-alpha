import type {
  BroadObservationFieldDescriptor,
  ReferenceCaptureTemporalClass,
} from './reference-capture.types';
import { resolveDimoSignalSchemaEntry } from './reference-capture-signal-schema.registry';

export type ReferenceCaptureAcquisitionSurface =
  | 'LATEST_LIVE'
  | 'LATEST_SLOW'
  | 'HF_HISTORICAL'
  | 'NATIVE_EVENT_INCREMENTAL'
  | 'SESSION_METADATA';

export type ReferenceCaptureSurfacePlan = {
  surface: ReferenceCaptureAcquisitionSurface;
  temporalClasses: ReferenceCaptureTemporalClass[];
  providerFields: string[];
  requestedInterval: string | null;
  requestedCadenceMs: number;
  minCycleGap: number;
};

export type ReferenceCaptureAcquisitionCyclePlan = {
  cycleNumber: number;
  captureCycleId: string;
  surfaces: ReferenceCaptureSurfacePlan[];
};

const HF_CLASSES: ReferenceCaptureTemporalClass[] = [
  'WAVEFORM_DYNAMICS',
  'POWERTRAIN_DYNAMIC',
];

const SLOW_CLASSES: ReferenceCaptureTemporalClass[] = [
  'SLOW_PHYSICAL_CONTEXT',
  'HEALTH_DIAGNOSTIC',
  'SPATIAL_ROUTE',
];

export function buildAcquisitionCyclePlan(input: {
  cycleNumber: number;
  captureCycleId: string;
  broadFields: BroadObservationFieldDescriptor[];
  cycleIntervalMs: number;
  slowCycleEvery: number;
}): ReferenceCaptureAcquisitionCyclePlan {
  const hfFields = input.broadFields.filter((f) => HF_CLASSES.includes(f.temporalClass));
  const slowFields = input.broadFields.filter((f) => SLOW_CLASSES.includes(f.temporalClass));

  const hfProviderFields = hfFields.map((f) => f.providerField);
  const slowProviderFields = slowFields.map((f) => f.providerField);

  const hfHistoricalFields = hfProviderFields.filter((field) => {
    try {
      return resolveDimoSignalSchemaEntry(field).historicalSupported;
    } catch {
      return false;
    }
  });

  const surfaces: ReferenceCaptureSurfacePlan[] = [
    {
      surface: 'LATEST_LIVE',
      temporalClasses: HF_CLASSES,
      providerFields: hfProviderFields,
      requestedInterval: null,
      requestedCadenceMs: input.cycleIntervalMs,
      minCycleGap: 1,
    },
    {
      surface: 'HF_HISTORICAL',
      temporalClasses: HF_CLASSES,
      providerFields: hfHistoricalFields,
      requestedInterval: '1s',
      requestedCadenceMs: input.cycleIntervalMs,
      minCycleGap: 1,
    },
    {
      surface: 'NATIVE_EVENT_INCREMENTAL',
      temporalClasses: ['EVENT'],
      providerFields: [],
      requestedInterval: null,
      requestedCadenceMs: input.cycleIntervalMs,
      minCycleGap: 1,
    },
  ];

  const includeSlow = input.cycleNumber === 1 || input.cycleNumber % input.slowCycleEvery === 0;
  if (includeSlow && slowProviderFields.length > 0) {
    surfaces.push({
      surface: 'LATEST_SLOW',
      temporalClasses: SLOW_CLASSES,
      providerFields: slowProviderFields,
      requestedInterval: null,
      requestedCadenceMs: input.cycleIntervalMs * input.slowCycleEvery,
      minCycleGap: input.slowCycleEvery,
    });
  }

  return {
    cycleNumber: input.cycleNumber,
    captureCycleId: input.captureCycleId,
    surfaces,
  };
}

export function surfacesDifferByTemporalClass(
  planA: ReferenceCaptureAcquisitionCyclePlan,
  planB: ReferenceCaptureAcquisitionCyclePlan,
): boolean {
  const surfaceA = new Set(planA.surfaces.map((s) => s.surface));
  const surfaceB = new Set(planB.surfaces.map((s) => s.surface));
  return surfaceA.has('HF_HISTORICAL') && surfaceB.has('LATEST_SLOW') && !surfaceB.has('HF_HISTORICAL');
}
