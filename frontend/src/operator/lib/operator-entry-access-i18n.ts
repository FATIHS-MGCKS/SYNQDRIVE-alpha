/**
 * Operator Entry & Access shell presentation adapter (P2.2.48).
 * Denial reason machine IDs map to TranslationKey only — no auth/access semantics.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { OperatorAccessDenialReason } from './operatorAccess.types';

const DENIAL_TITLE_KEYS: Record<OperatorAccessDenialReason, TranslationKey> = {
  unauthenticated: 'operator.entry.access.denial.unauthenticated.title',
  forbidden_role: 'operator.entry.access.denial.forbidden_role.title',
  no_organization: 'operator.entry.access.denial.no_organization.title',
  no_rental_product: 'operator.entry.access.denial.no_rental_product.title',
};

const DENIAL_DESCRIPTION_KEYS: Record<OperatorAccessDenialReason, TranslationKey> = {
  unauthenticated: 'operator.entry.access.denial.unauthenticated.description',
  forbidden_role: 'operator.entry.access.denial.forbidden_role.description',
  no_organization: 'operator.entry.access.denial.no_organization.description',
  no_rental_product: 'operator.entry.access.denial.no_rental_product.description',
};

export function resolveOperatorEntryAccessLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function oea(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveOperatorEntryAccessLocale(locale), key, vars).text;
}

export function operatorEntryAccessAppName(locale: string): string {
  return oea(locale, 'operator.entry.access.appName');
}

export function operatorEntryAccessModalOptimizeLine(locale: string): string {
  return oea(locale, 'operator.entry.access.modal.optimizeLine');
}

export function operatorEntryAccessModalInstructionsLine(locale: string): string {
  return oea(locale, 'operator.entry.access.modal.instructionsLine');
}

export function operatorEntryAccessCloseLabel(locale: string): string {
  return oea(locale, 'common.close');
}

export function operatorEntryAccessButtonLabel(locale: string): string {
  return oea(locale, 'operator.entry.access.button.label');
}

export function operatorEntryAccessButtonTitle(locale: string): string {
  return oea(locale, 'operator.entry.access.button.title');
}

export function operatorEntryAccessNoticeHeading(locale: string): string {
  return oea(locale, 'operator.entry.access.notice.heading');
}

export function operatorEntryAccessNoticeBody(locale: string): string {
  return oea(locale, 'operator.entry.access.notice.body');
}

export function operatorEntryAccessBackToAppLabel(locale: string): string {
  return oea(locale, 'operator.entry.access.backToApp');
}

export function operatorEntryAccessLinkInstructionsBefore(locale: string): string {
  return oea(locale, 'operator.entry.access.link.instructionsBefore');
}

export function operatorEntryAccessLinkInstructionsAfter(locale: string): string {
  return oea(locale, 'operator.entry.access.link.instructionsAfter');
}

export function operatorEntryAccessLinkCopyLabel(locale: string): string {
  return oea(locale, 'operator.entry.access.link.copy');
}

export function operatorEntryAccessLinkCopiedLabel(locale: string): string {
  return oea(locale, 'operator.entry.access.link.copied');
}

export function operatorEntryAccessLinkToastSuccess(locale: string): string {
  return oea(locale, 'operator.entry.access.link.toastSuccess');
}

export function operatorEntryAccessLinkToastError(locale: string): string {
  return oea(locale, 'operator.entry.access.link.toastError');
}

export function operatorEntryAccessDenialTitle(
  locale: string,
  reason: OperatorAccessDenialReason,
): string {
  return oea(locale, DENIAL_TITLE_KEYS[reason]);
}

export function operatorEntryAccessDenialDescription(
  locale: string,
  reason: OperatorAccessDenialReason,
): string {
  return oea(locale, DENIAL_DESCRIPTION_KEYS[reason]);
}

export function operatorEntryAccessDenialMessage(
  locale: string,
  reason: OperatorAccessDenialReason,
): { title: string; description: string } {
  return {
    title: operatorEntryAccessDenialTitle(locale, reason),
    description: operatorEntryAccessDenialDescription(locale, reason),
  };
}

export function operatorEntryAccessLoginCta(locale: string): string {
  return oea(locale, 'operator.entry.access.loginCta');
}

export function operatorEntryAccessLoadingCheckingLabel(locale: string): string {
  return oea(locale, 'operator.entry.access.loading.checking');
}

export function operatorEntryAccessLoadingOrganizationLabel(locale: string): string {
  return oea(locale, 'operator.entry.access.loading.organization');
}

export function operatorEntryAccessOrgErrorTitle(locale: string): string {
  return oea(locale, 'operator.entry.access.orgError.title');
}

export function operatorEntryAccessOrgErrorFallback(locale: string): string {
  return oea(locale, 'operator.entry.access.orgError.fallback');
}

export function operatorEntryAccessRetryLabel(locale: string): string {
  return oea(locale, 'common.retry');
}
