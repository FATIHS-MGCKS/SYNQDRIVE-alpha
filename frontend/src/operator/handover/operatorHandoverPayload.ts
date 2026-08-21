import type { TranslationKey } from '../../i18n/translations/en';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import {
  buildHandoverTelemetryPrefill,
  type HandoverVehicleTelemetryLike,
} from '../../rental/lib/handoverVehicleTelemetry';
import {
  collectTechnicalObservationsForPayload,
  type HandoverTechnicalObservationPayloadItem,
  type OperatorHandoverObservationDraft,
} from './operatorHandoverTechnicalObservations';

/** Persisted protocol note — never translate for API payload append. */
export const OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE = 'Reifenprofilmessung erfasst.' as const;

export type OperatorHandoverStepId =
  | 'vehicle'
  | 'condition'
  | 'damages'
  | 'documents'
  | 'signatures'
  | 'review';

export const OPERATOR_HANDOVER_STEPS: OperatorHandoverStepId[] = [
  'vehicle',
  'condition',
  'damages',
  'documents',
  'signatures',
  'review',
];

export type OperatorHandoverCheckField =
  | 'exteriorClean'
  | 'interiorClean'
  | 'tiresSeasonOk'
  | 'warningLightsOn'
  | 'documentsAcknowledged';

export interface OperatorHandoverChecks {
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  documentsAcknowledged: boolean;
}

export interface OperatorHandoverDamageRow {
  id: string;
  damageType: string;
  severity: string;
  description: string | null;
  locationLabel: string | null;
}

export interface OperatorHandoverFormState {
  odometerKm: string;
  fuelPercent: number;
  fuelFull: boolean;
  performedAtLocal: string;
  checks: OperatorHandoverChecks;
  warningLightsNotes: string;
  notes: string;
  staffId: string;
  staffName: string;
  customerSigData: string | null;
  customerSigName: string;
  staffSigData: string | null;
  staffSigName: string;
  actualStationId: string;
  selectedDamageIds: Set<string>;
  tireMeasurementCaptured: boolean;
  technicalObservationDrafts: OperatorHandoverObservationDraft[];
}

export type { HandoverTechnicalObservationPayloadItem, OperatorHandoverObservationDraft };

export interface OperatorHandoverBookingRef {
  id: string;
  vehicleId: string;
  customerId?: string | null;
  vehicleName: string;
  plate: string;
  customerName: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  returnLocation?: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  handoverInstructions?: string | null;
  returnInstructions?: string | null;
  pickupOdometerKm?: number | null;
}

export interface OperatorHandoverPayloadInput {
  kind: HandoverDialogKind;
  booking: OperatorHandoverBookingRef;
  state: OperatorHandoverFormState;
}

export interface OperatorHandoverValidationIssue {
  step: OperatorHandoverStepId;
  field: string;
  messageKey: TranslationKey;
  messageParams?: Record<string, string | number>;
}

export function createInitialHandoverState(
  booking: OperatorHandoverBookingRef | null,
  kind: HandoverDialogKind,
  vehicle?: HandoverVehicleTelemetryLike | null,
): OperatorHandoverFormState {
  const plannedId =
    kind === 'PICKUP' ? booking?.pickupStationId : booking?.returnStationId;
  const prefill = buildHandoverTelemetryPrefill({
    kind,
    vehicle,
    pickupOdometerKm: booking?.pickupOdometerKm,
  });
  return {
    odometerKm: prefill.odometerKm,
    fuelPercent: prefill.fuelPercent,
    fuelFull: prefill.fuelFull,
    performedAtLocal: '',
    checks: {
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      documentsAcknowledged: false,
    },
    warningLightsNotes: '',
    notes: '',
    staffId: '',
    staffName: '',
    customerSigData: null,
    customerSigName: '',
    staffSigData: null,
    staffSigName: '',
    actualStationId: plannedId ?? '',
    selectedDamageIds: new Set<string>(),
    tireMeasurementCaptured: false,
    technicalObservationDrafts: [],
  };
}

export function buildOperatorHandoverPayload(input: OperatorHandoverPayloadInput) {
  const { kind, state } = input;
  let performedAtIso: string | null = null;
  if (kind === 'PICKUP' && state.performedAtLocal) {
    const d = new Date(state.performedAtLocal);
    if (!Number.isNaN(d.getTime())) performedAtIso = d.toISOString();
  }

  const noteParts = [state.notes.trim()];
  if (state.tireMeasurementCaptured) {
    noteParts.push(OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE);
  }

  return {
    performedAt: performedAtIso,
    performedByUserId: state.staffId || null,
    performedByName: state.staffName || null,
    odometerKm: Number(state.odometerKm),
    fuelPercent: Math.max(0, Math.min(100, Math.round(state.fuelPercent))),
    fuelFull: state.fuelFull,
    exteriorClean: state.checks.exteriorClean,
    interiorClean: state.checks.interiorClean,
    tiresSeasonOk: state.checks.tiresSeasonOk,
    warningLightsOn: state.checks.warningLightsOn,
    warningLightsNotes: state.checks.warningLightsOn ? state.warningLightsNotes || null : null,
    notes: noteParts.filter(Boolean).join(' ') || null,
    customerSignatureName: state.customerSigName || null,
    customerSignatureDataUrl: state.customerSigData,
    staffSignatureName: state.staffSigName || null,
    staffSignatureDataUrl: state.staffSigData,
    documentsAcknowledged: state.checks.documentsAcknowledged,
    damageIds: Array.from(state.selectedDamageIds),
    actualStationId: state.actualStationId || null,
    technicalObservations: collectTechnicalObservationsForPayload(kind, state),
  };
}

/** Operator flow requires drawn signatures (typed name alone is not sufficient). */
export function validateOperatorHandover(
  kind: HandoverDialogKind,
  booking: OperatorHandoverBookingRef | null,
  state: OperatorHandoverFormState,
): OperatorHandoverValidationIssue[] {
  const issues: OperatorHandoverValidationIssue[] = [];
  if (!booking) {
    issues.push({
      step: 'vehicle',
      field: 'booking',
      messageKey: 'handover.operator.validation.bookingNotLoaded',
    });
    return issues;
  }

  if (!state.odometerKm || Number.isNaN(Number(state.odometerKm))) {
    issues.push({
      step: 'condition',
      field: 'odometerKm',
      messageKey: 'handover.operator.validation.odometerRequired',
    });
  } else if (kind === 'RETURN' && booking.pickupOdometerKm != null) {
    if (Number(state.odometerKm) < booking.pickupOdometerKm) {
      issues.push({
        step: 'condition',
        field: 'odometerKm',
        messageKey: 'handover.operator.validation.odometerBelowPickup',
        messageParams: { pickupKm: booking.pickupOdometerKm },
      });
    }
  }

  if (state.fuelPercent < 0 || state.fuelPercent > 100) {
    issues.push({
      step: 'condition',
      field: 'fuelPercent',
      messageKey: 'handover.operator.validation.fuelRange',
    });
  }

  if (state.checks.warningLightsOn && !state.warningLightsNotes.trim()) {
    issues.push({
      step: 'condition',
      field: 'warningLightsNotes',
      messageKey: 'handover.operator.validation.warningLightsDescription',
    });
  }

  if (!state.checks.documentsAcknowledged) {
    issues.push({
      step: 'documents',
      field: 'documentsAcknowledged',
      messageKey: 'handover.operator.validation.documentsAckRequired',
    });
  }

  if (!state.staffId && !state.staffName.trim()) {
    issues.push({
      step: 'signatures',
      field: 'staff',
      messageKey: 'handover.operator.validation.staffRequired',
    });
  }

  if (!state.customerSigData) {
    issues.push({
      step: 'signatures',
      field: 'customerSignature',
      messageKey: 'handover.operator.validation.customerSignatureRequired',
    });
  }

  if (!state.staffSigData) {
    issues.push({
      step: 'signatures',
      field: 'staffSignature',
      messageKey: 'handover.operator.validation.staffSignatureRequired',
    });
  }

  return issues;
}

export function validateOperatorHandoverStep(
  step: OperatorHandoverStepId,
  kind: HandoverDialogKind,
  booking: OperatorHandoverBookingRef | null,
  state: OperatorHandoverFormState,
): OperatorHandoverValidationIssue[] {
  const all = validateOperatorHandover(kind, booking, state);
  return all.filter((i) => i.step === step);
}

export function stepIndex(step: OperatorHandoverStepId): number {
  return OPERATOR_HANDOVER_STEPS.indexOf(step);
}

export function canAdvanceFromStep(
  step: OperatorHandoverStepId,
  kind: HandoverDialogKind,
  booking: OperatorHandoverBookingRef | null,
  state: OperatorHandoverFormState,
): boolean {
  if (step === 'vehicle') return Boolean(booking);
  if (step === 'damages') return true;
  return validateOperatorHandoverStep(step, kind, booking, state).length === 0;
}
