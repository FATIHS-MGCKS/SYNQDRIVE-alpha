import type { OperatorHandoverFormState } from './operatorHandoverPayload';
import type { OperatorHandoverObservationDraft } from './operatorHandoverTechnicalObservations';

export interface SerializedHandoverDraftPayload {
  odometerKm: string;
  fuelPercent: number;
  fuelFull: boolean;
  performedAtLocal: string;
  checks: OperatorHandoverFormState['checks'];
  warningLightsNotes: string;
  notes: string;
  staffId: string;
  staffName: string;
  customerSigName: string;
  staffSigName: string;
  actualStationId: string;
  selectedDamageIds: string[];
  tireMeasurementCaptured: boolean;
  technicalObservationDrafts: OperatorHandoverObservationDraft[];
}

export function serializeHandoverDraftState(
  state: OperatorHandoverFormState,
): SerializedHandoverDraftPayload {
  return {
    odometerKm: state.odometerKm,
    fuelPercent: state.fuelPercent,
    fuelFull: state.fuelFull,
    performedAtLocal: state.performedAtLocal,
    checks: state.checks,
    warningLightsNotes: state.warningLightsNotes,
    notes: state.notes,
    staffId: state.staffId,
    staffName: state.staffName,
    customerSigName: state.customerSigName,
    staffSigName: state.staffSigName,
    actualStationId: state.actualStationId,
    selectedDamageIds: [...state.selectedDamageIds],
    tireMeasurementCaptured: state.tireMeasurementCaptured,
    technicalObservationDrafts: state.technicalObservationDrafts,
  };
}

export function mergeHandoverDraftIntoState(
  base: OperatorHandoverFormState,
  payload: Record<string, unknown>,
): OperatorHandoverFormState {
  const draft = payload as Partial<SerializedHandoverDraftPayload>;
  return {
    ...base,
    odometerKm: typeof draft.odometerKm === 'string' ? draft.odometerKm : base.odometerKm,
    fuelPercent: typeof draft.fuelPercent === 'number' ? draft.fuelPercent : base.fuelPercent,
    fuelFull: typeof draft.fuelFull === 'boolean' ? draft.fuelFull : base.fuelFull,
    performedAtLocal:
      typeof draft.performedAtLocal === 'string' ? draft.performedAtLocal : base.performedAtLocal,
    checks: draft.checks && typeof draft.checks === 'object' ? { ...base.checks, ...draft.checks } : base.checks,
    warningLightsNotes:
      typeof draft.warningLightsNotes === 'string' ? draft.warningLightsNotes : base.warningLightsNotes,
    notes: typeof draft.notes === 'string' ? draft.notes : base.notes,
    staffId: typeof draft.staffId === 'string' ? draft.staffId : base.staffId,
    staffName: typeof draft.staffName === 'string' ? draft.staffName : base.staffName,
    customerSigName:
      typeof draft.customerSigName === 'string' ? draft.customerSigName : base.customerSigName,
    staffSigName: typeof draft.staffSigName === 'string' ? draft.staffSigName : base.staffSigName,
    actualStationId:
      typeof draft.actualStationId === 'string' ? draft.actualStationId : base.actualStationId,
    selectedDamageIds: Array.isArray(draft.selectedDamageIds)
      ? new Set(draft.selectedDamageIds.filter((id): id is string => typeof id === 'string'))
      : base.selectedDamageIds,
    tireMeasurementCaptured:
      typeof draft.tireMeasurementCaptured === 'boolean'
        ? draft.tireMeasurementCaptured
        : base.tireMeasurementCaptured,
    technicalObservationDrafts: Array.isArray(draft.technicalObservationDrafts)
      ? draft.technicalObservationDrafts
      : base.technicalObservationDrafts,
    customerSigData: base.customerSigData,
    staffSigData: base.staffSigData,
  };
}
