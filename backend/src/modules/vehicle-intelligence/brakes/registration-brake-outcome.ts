import type { RegistrationBrakeManualSpec } from './register-brake-baseline';
import {
  normalizeRegistrationBrakeCondition,
  registrationBrakeMeasuredSnapshot,
} from './register-brake-baseline';

/** Canonical brake baseline status after vehicle registration. */
export type RegistrationBrakeBaselineStatus =
  | 'DOCUMENTED_REPLACEMENT'
  | 'MEASURED'
  | 'NO_BASELINE'
  | 'INITIALIZATION_REQUIRED'
  | 'SPEC_ONLY'
  | 'FAILED';

export type RegistrationBrakeEvidenceSource =
  | 'MEASURED'
  | 'DOCUMENTED_REPLACEMENT'
  | 'SPEC_ONLY'
  | 'NONE';

export interface VehicleRegistrationBrakeResult {
  brakeHealthInitialized: boolean;
  brakeBaselineStatus: RegistrationBrakeBaselineStatus;
  evidenceSource: RegistrationBrakeEvidenceSource;
  requiresMeasurement: boolean;
  requiresSpecConfirmation: boolean;
  initializationError: string | null;
  specCreated: boolean;
  message: string;
}

export function buildNoBrakePayloadResult(): VehicleRegistrationBrakeResult {
  return {
    brakeHealthInitialized: false,
    brakeBaselineStatus: 'NO_BASELINE',
    evidenceSource: 'NONE',
    requiresMeasurement: true,
    requiresSpecConfirmation: false,
    initializationError: null,
    specCreated: false,
    message: 'No brake registration payload supplied.',
  };
}

export function deriveRegistrationBrakeResult(input: {
  rawBrakes: RegistrationBrakeManualSpec;
  specCreated: boolean;
  initialized: boolean;
  anchorValidationStatus?: string | null;
  initializationError?: string | null;
  workflowMessage?: string;
  initBlockedReason?: 'missing_odometer' | 'not_eligible' | null;
}): VehicleRegistrationBrakeResult {
  const condition = normalizeRegistrationBrakeCondition(input.rawBrakes.condition);
  const userMeasured = registrationBrakeMeasuredSnapshot(input.rawBrakes) != null;

  if (input.initializationError) {
    return {
      brakeHealthInitialized: false,
      brakeBaselineStatus: 'FAILED',
      evidenceSource: input.specCreated ? 'SPEC_ONLY' : 'NONE',
      requiresMeasurement: true,
      requiresSpecConfirmation: input.specCreated && condition !== 'NEW',
      initializationError: input.initializationError,
      specCreated: input.specCreated,
      message: input.workflowMessage ?? input.initializationError,
    };
  }

  if (input.initialized) {
    const anchorStatus = String(input.anchorValidationStatus ?? '').toLowerCase();
    const isMeasuredAnchor = userMeasured && anchorStatus.includes('measured');

    if (isMeasuredAnchor) {
      return {
        brakeHealthInitialized: true,
        brakeBaselineStatus: 'MEASURED',
        evidenceSource: 'MEASURED',
        requiresMeasurement: false,
        requiresSpecConfirmation: false,
        initializationError: null,
        specCreated: input.specCreated,
        message: 'Brake baseline initialized from measured registration thickness.',
      };
    }

    if (condition === 'NEW' || anchorStatus.includes('spec_fallback')) {
      return {
        brakeHealthInitialized: true,
        brakeBaselineStatus: 'DOCUMENTED_REPLACEMENT',
        evidenceSource: 'DOCUMENTED_REPLACEMENT',
        requiresMeasurement: true,
        requiresSpecConfirmation: false,
        initializationError: null,
        specCreated: input.specCreated,
        message:
          'Documented new brake replacement baseline initialized from nominal reference values — not a workshop measurement.',
      };
    }

    return {
      brakeHealthInitialized: true,
      brakeBaselineStatus: 'DOCUMENTED_REPLACEMENT',
      evidenceSource: 'DOCUMENTED_REPLACEMENT',
      requiresMeasurement: true,
      requiresSpecConfirmation: false,
      initializationError: null,
      specCreated: input.specCreated,
      message: input.workflowMessage ?? 'Brake baseline initialized from documented registration values.',
    };
  }

  if (input.specCreated) {
    const blocked = input.initBlockedReason;
    const status =
      blocked === 'missing_odometer' ? 'INITIALIZATION_REQUIRED' : ('SPEC_ONLY' as const);
    return {
      brakeHealthInitialized: false,
      brakeBaselineStatus: status,
      evidenceSource: 'SPEC_ONLY',
      requiresMeasurement: true,
      requiresSpecConfirmation: condition !== 'NEW',
      initializationError: null,
      specCreated: true,
      message:
        input.workflowMessage ??
        (status === 'INITIALIZATION_REQUIRED'
          ? 'Brake reference spec stored. Initialization requires a valid odometer anchor.'
          : 'Brake reference spec stored. Operative wear baseline requires measurement or replacement confirmation.'),
    };
  }

  return {
    brakeHealthInitialized: false,
    brakeBaselineStatus: 'NO_BASELINE',
    evidenceSource: 'NONE',
    requiresMeasurement: true,
    requiresSpecConfirmation: false,
    initializationError: null,
    specCreated: false,
    message:
      input.workflowMessage ??
      'Brake wear tracking awaits a valid service baseline with odometer and thickness anchor.',
  };
}
