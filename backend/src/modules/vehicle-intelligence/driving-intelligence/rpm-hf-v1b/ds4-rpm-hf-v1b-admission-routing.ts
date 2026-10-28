import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowProcessingOutcome } from './ds4-rpm-hf-v1b.contract';

export type Ds4RpmHfV1bAdmissionRouting = {
  outcome: Ds4RpmHfV1bShadowProcessingOutcome;
  deferReasonCode: string | null;
  rejectionReasonCode: string | null;
  shouldPersistAnalysis: boolean;
};

/**
 * Maps V1A admission (sole authority) to V1B worker routing.
 * Transient readiness → DEFER_RETRY (bounded by outbox attempts).
 */
export function routeDs4RpmHfV1bFromV1aAdmission(
  tripInput: Ds4RpmHfV1aTripInputV1,
  attemptCount: number,
  maxDeferAttempts: number,
): Ds4RpmHfV1bAdmissionRouting {
  const a = tripInput.admission;
  const ch = tripInput.clickHouseRead;

  if (ch.tenantScopeViolation) {
    return terminal('TERMINAL_FAILED', 'TENANT_SCOPE_VIOLATION', false);
  }

  if (a.processingStatus === 'DISABLED_TENANT_SCOPE') {
    return terminal('TERMINAL_FAILED', 'TENANT_SCOPE_VIOLATION', false);
  }

  if (a.processingStatus === 'DISABLED_TRIP_IDENTITY') {
    return terminal('TERMINAL_INELIGIBLE', a.reasonCode, false);
  }

  if (a.processingStatus === 'DISABLED_NOT_APPLICABLE') {
    return terminal('TERMINAL_INELIGIBLE', a.reasonCode, false);
  }

  if (a.processingStatus === 'DISABLED_PROFILE') {
    return terminal('TERMINAL_INELIGIBLE', a.reasonCode, false);
  }

  if (a.processingStatus === 'DISABLED_INCOMPLETE_HF_READ') {
    return terminal('TERMINAL_INELIGIBLE', 'HF_RPM_READ_INCOMPLETE', false);
  }

  if (a.processingStatus === 'DISABLED_CH_UNAVAILABLE') {
    return defer('CLICKHOUSE_UNAVAILABLE', attemptCount, maxDeferAttempts);
  }

  if (a.processingStatus === 'DISABLED_NO_HF_DATA') {
    return defer('HF_RPM_DATA_MISSING', attemptCount, maxDeferAttempts);
  }

  if (a.processingStatus === 'DISABLED_TRIP_NOT_CLASSIFIED') {
    return defer('TRIP_RPM_PROFILE_UNCLASSIFIED', attemptCount, maxDeferAttempts);
  }

  if (a.processingAllowed && a.processingStatus === 'ENABLED') {
    if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') {
      return terminal('TERMINAL_INELIGIBLE', 'HF_READ_NOT_COMPLETE', false);
    }
    if (tripInput.clickHouseRead.status !== 'SUCCESS') {
      return defer('HF_READ_NOT_SUCCESS', attemptCount, maxDeferAttempts);
    }
    return {
      outcome: 'SUCCEEDED',
      deferReasonCode: null,
      rejectionReasonCode: null,
      shouldPersistAnalysis: true,
    };
  }

  return terminal('TERMINAL_INELIGIBLE', a.reasonCode || 'V1A_ADMISSION_BLOCKED', false);
}

function defer(
  code: string,
  attemptCount: number,
  maxDeferAttempts: number,
): Ds4RpmHfV1bAdmissionRouting {
  if (attemptCount >= maxDeferAttempts) {
    return terminal('TERMINAL_INELIGIBLE', `${code}_DEFER_BUDGET_EXCEEDED`, false);
  }
  return {
    outcome: 'DEFER_RETRY',
    deferReasonCode: code,
    rejectionReasonCode: null,
    shouldPersistAnalysis: false,
  };
}

function terminal(
  outcome: 'TERMINAL_INELIGIBLE' | 'TERMINAL_FAILED',
  code: string,
  shouldPersistAnalysis: boolean,
): Ds4RpmHfV1bAdmissionRouting {
  return {
    outcome,
    deferReasonCode: null,
    rejectionReasonCode: code,
    shouldPersistAnalysis,
  };
}
