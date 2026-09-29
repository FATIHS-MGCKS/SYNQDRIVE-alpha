import type { DiV0PositionAcquisitionFailure } from '../position-acquisition/di-v0-position-acquisition.types';

export type DiV0S4cPositionChannelOutcome =
  | 'PRESENT'
  | 'SOURCE_FAILURE'
  | 'AUTHORIZATION_FAILURE'
  | 'INVALID_REQUEST'
  | 'MALFORMED'
  | 'UNSUPPORTED_SOURCE';

export type DiV0S4cPositionFailureAction =
  | { action: 'RETRYABLE_RELEASE'; reasonCode: string }
  | {
      action: 'TERMINAL_T08';
      failureReason: string;
      outcome: 'AUTHORIZATION_FAILURE' | 'INVALID_REQUEST' | 'MALFORMED' | 'SOURCE_FAILURE';
    }
  | { action: 'SKIP_T09'; skipReason: 'POSITION_UNSUPPORTED_SOURCE' };

const RETRYABLE_REASON: Record<string, string> = {
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  PROVIDER_HTTP_ERROR: 'PROVIDER_HTTP_ERROR',
  PROVIDER_BUDGET_UNAVAILABLE: 'PROVIDER_BUDGET_UNAVAILABLE',
  GRAPHQL_ERROR: 'GRAPHQL_ERROR',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Deterministic mapping from S3A failure classes to frozen S4 POSITION channel outcomes.
 * Exhaustive over `DiV0PositionAcquisitionFailureClass`.
 */
export function mapDiV0S4cPositionFailure(failure: DiV0PositionAcquisitionFailure): DiV0S4cPositionFailureAction {
  switch (failure.failureClass) {
    case 'INVALID_REQUEST':
      return { action: 'TERMINAL_T08', failureReason: 'POSITION_INVALID_REQUEST', outcome: 'INVALID_REQUEST' };
    case 'AUTHENTICATION':
    case 'AUTHORIZATION':
      return { action: 'TERMINAL_T08', failureReason: 'POSITION_AUTHORIZATION', outcome: 'AUTHORIZATION_FAILURE' };
    case 'MALFORMED_RESPONSE':
      return { action: 'TERMINAL_T08', failureReason: 'POSITION_MALFORMED', outcome: 'MALFORMED' };
    case 'RATE_LIMITED':
    case 'TIMEOUT':
    case 'NETWORK':
    case 'PROVIDER_HTTP_ERROR':
    case 'PROVIDER_BUDGET_UNAVAILABLE':
    case 'GRAPHQL_ERROR':
    case 'UNKNOWN':
      if (failure.retryable) {
        return {
          action: 'RETRYABLE_RELEASE',
          reasonCode: RETRYABLE_REASON[failure.failureClass] ?? failure.failureClass,
        };
      }
      return { action: 'TERMINAL_T08', failureReason: 'POSITION_SOURCE_FAILURE', outcome: 'SOURCE_FAILURE' };
    default: {
      const exhaustive: never = failure.failureClass;
      throw new Error(`unmapped position failure class: ${exhaustive}`);
    }
  }
}
