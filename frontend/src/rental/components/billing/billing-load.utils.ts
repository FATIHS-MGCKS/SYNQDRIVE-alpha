import { getErrorMessage } from '../../../lib/api';

export const BILLING_ORG_MISSING_MESSAGE =
  'Organisation konnte nicht bestimmt werden. Bitte Organisation neu laden oder erneut anmelden.';

export const BILLING_PERMISSION_DENIED_MESSAGE =
  'Keine Berechtigung für diese Abrechnungsdaten.';

export function mapBillingLoadError(err: unknown): string {
  const msg = getErrorMessage(err, 'Abrechnungsdaten konnten nicht geladen werden');
  const lower = msg.toLowerCase();

  if (
    lower.includes('organization context required') ||
    lower.includes('no organization context')
  ) {
    return BILLING_ORG_MISSING_MESSAGE;
  }

  if (
    lower.includes('do not have access') ||
    lower.includes('missing permission') ||
    lower.includes('forbidden') ||
    lower.includes('403')
  ) {
    return BILLING_PERMISSION_DENIED_MESSAGE;
  }

  if (
    lower.includes('api error') ||
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503')
  ) {
    return 'Abrechnungsdaten konnten nicht geladen werden. Bitte später erneut versuchen.';
  }

  return msg;
}
