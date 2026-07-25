import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { OperatorHandoverFormState, OperatorHandoverStepId } from './operatorHandoverPayload';
import type { HandoverSessionDraftPayload } from './operatorHandoverDraft.types';

export type { HandoverSessionDraftPayload };

export interface HandoverDraftApiRecord {
  id: string;
  organizationId: string;
  stationId: string | null;
  bookingId: string;
  vehicleId: string;
  kind: 'PICKUP' | 'RETURN';
  status: string;
  currentStep: OperatorHandoverStepId | null;
  version: number;
  draft: HandoverSessionDraftPayload | null;
  expiresAt: string | null;
  editable: boolean;
  expired: boolean;
}

export interface HandoverDraftViewResponse {
  lifecycleStatus: string;
  draft: HandoverDraftApiRecord | null;
}

export function formStateToDraftPayload(
  state: OperatorHandoverFormState,
  step: OperatorHandoverStepId,
): HandoverSessionDraftPayload {
  return {
    schemaVersion: 1,
    currentStep: step,
    form: {
      odometerKm: state.odometerKm,
      fuelPercent: state.fuelPercent,
      fuelFull: state.fuelFull,
      performedAtLocal: state.performedAtLocal,
      checks: { ...state.checks },
      warningLightsNotes: state.warningLightsNotes,
      notes: state.notes,
      staffId: state.staffId,
      staffName: state.staffName,
      actualStationId: state.actualStationId,
      selectedDamageIds: [...state.selectedDamageIds],
      tireMeasurementCaptured: state.tireMeasurementCaptured,
      technicalObservationDrafts: state.technicalObservationDrafts.map((o) => ({ ...o })),
    },
    uploadRefs: [],
    signatureStatus: {
      customer: {
        name: state.customerSigName?.trim() || null,
        captured: Boolean(state.customerSigData?.trim()),
      },
      staff: {
        name: state.staffSigName?.trim() || null,
        captured: Boolean(state.staffSigData?.trim()),
      },
    },
  };
}

export function draftPayloadToFormState(
  draft: HandoverSessionDraftPayload,
  kind: HandoverDialogKind,
): Partial<OperatorHandoverFormState> {
  const { form, signatureStatus } = draft;
  return {
    odometerKm: form.odometerKm,
    fuelPercent: form.fuelPercent,
    fuelFull: form.fuelFull,
    performedAtLocal: form.performedAtLocal,
    checks: { ...form.checks },
    warningLightsNotes: form.warningLightsNotes,
    notes: form.notes,
    staffId: form.staffId,
    staffName: form.staffName,
    actualStationId:
      form.actualStationId ||
      (kind === 'PICKUP' ? '' : ''),
    selectedDamageIds: new Set(form.selectedDamageIds),
    tireMeasurementCaptured: form.tireMeasurementCaptured,
    technicalObservationDrafts: form.technicalObservationDrafts.map((o) => ({
      id: o.id,
      description: o.description,
      category: o.category ?? undefined,
      affectedArea: o.affectedArea ?? undefined,
      severity: o.severity ?? undefined,
      blocksRental: o.blocksRental,
    })),
    customerSigName: signatureStatus.customer.name ?? '',
    staffSigName: signatureStatus.staff.name ?? '',
    customerSigData: null,
    staffSigData: null,
  };
}
