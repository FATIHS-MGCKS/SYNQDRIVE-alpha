import { getErrorMessage } from '../../../lib/api';
import type {
  ConnectStatusDto,
  CustomerPaymentsUiState,
  PaymentsConnectErrorCode,
} from '../../types/payments-connect.types';

const CONNECT_ERROR_CODES: PaymentsConnectErrorCode[] = [
  'PAYMENTS_FEATURE_DISABLED',
  'CONNECT_ACCOUNT_ALREADY_EXISTS',
  'CONNECT_NOT_CONFIGURED',
  'CONNECT_ACCOUNT_RESTRICTED',
  'STRIPE_MODE_MISMATCH',
  'CONNECT_PROVIDER_ERROR',
];

export function extractConnectErrorCode(err: unknown): PaymentsConnectErrorCode | null {
  const msg = getErrorMessage(err, '');
  for (const code of CONNECT_ERROR_CODES) {
    if (msg.includes(code)) return code;
  }
  const lower = msg.toLowerCase();
  if (lower.includes('not enabled for organization') || lower.includes('payments feature')) {
    return 'PAYMENTS_FEATURE_DISABLED';
  }
  if (lower.includes('no stripe connected account') || lower.includes('not configured')) {
    return 'CONNECT_NOT_CONFIGURED';
  }
  if (lower.includes('restricted')) return 'CONNECT_ACCOUNT_RESTRICTED';
  if (lower.includes('test mode')) return 'STRIPE_MODE_MISMATCH';
  if (lower.includes('permission') || lower.includes('forbidden')) return null;
  return null;
}

export function mapConnectStatusToUiState(
  status: ConnectStatusDto | null,
  errorCode?: PaymentsConnectErrorCode | null,
): CustomerPaymentsUiState {
  if (errorCode === 'PAYMENTS_FEATURE_DISABLED') return 'FEATURE_DISABLED';
  if (!status) return 'NOT_STARTED';

  switch (status.onboardingStatus) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'RESTRICTED':
      return 'RESTRICTED';
    case 'DISABLED':
    case 'REJECTED':
      return 'DISABLED';
    case 'ONBOARDING':
    case 'PENDING':
      return 'ONBOARDING';
    default:
      return 'NOT_STARTED';
  }
}

export { buildCustomerPaymentsReturnUrl as formatConnectReturnUrl } from '../finance-navigation';

export function formatRequirementLabel(requirement: string): string {
  return requirement
    .replace(/_/g, ' ')
    .replace(/\./g, ' · ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
