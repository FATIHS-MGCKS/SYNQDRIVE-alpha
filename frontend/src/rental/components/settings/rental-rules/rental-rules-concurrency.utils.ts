import type { OrganizationRentalRulesDto, RentalVehicleCategoryDto } from './rental-rules.types';
import { RENTAL_RULES_INITIAL_EXPECTED_VERSION } from './rental-rules-concurrency.constants';
import { summarizeRuleEntity } from './rental-rules.utils';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { RentalRulesMutationError } from './rental-rules-concurrency.errors';
import type { RentalRulesConflictViewModel } from './RentalRulesConcurrencyDialog';

export function resolveExpectedVersion(version: number | undefined | null): number {
  return version ?? RENTAL_RULES_INITIAL_EXPECTED_VERSION;
}

export function withExpectedVersion(
  payload: Record<string, unknown>,
  version: number | undefined | null,
): Record<string, unknown> {
  return {
    ...payload,
    expectedVersion: resolveExpectedVersion(version),
  };
}

export function buildRentalRulesConflictModel(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  err: RentalRulesMutationError,
  localSummary: string,
): RentalRulesConflictViewModel {
  const serverSummary =
    err.current != null
      ? summarizeRuleEntity(err.current)
      : t('rentalRules.concurrency.serverUnavailable');

  return {
    title: t('rentalRules.concurrency.title'),
    description: t('rentalRules.concurrency.description', {
      expected: err.expectedVersion ?? '—',
      current: err.currentVersion ?? '—',
    }),
    yourChangesLabel: t('rentalRules.concurrency.yourChanges'),
    yourChangesSummary: localSummary || t('rentalRules.concurrency.noLocalSummary'),
    serverChangesLabel: t('rentalRules.concurrency.serverChanges'),
    serverChangesSummary: serverSummary,
    reloadLabel: t('rentalRules.concurrency.reload'),
    editAgainLabel: t('rentalRules.concurrency.editAgain'),
    cancelLabel: t('rentalRules.concurrency.cancel'),
  };
}

export function mergeServerOrganizationDefaults(
  current: OrganizationRentalRulesDto | null,
  server: Record<string, unknown> | null | undefined,
): OrganizationRentalRulesDto | null {
  if (!server) return current;
  return {
    ...(current ?? {
      organizationId: String(server.organizationId ?? ''),
      isActive: true,
      configured: true,
      minimumAgeYears: null,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: null,
      depositCurrency: 'EUR',
      creditCardRequired: null,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
    }),
    ...server,
    configured: true,
  } as OrganizationRentalRulesDto;
}

export function mergeServerCategory(
  current: RentalVehicleCategoryDto | null,
  server: Record<string, unknown> | null | undefined,
): RentalVehicleCategoryDto | null {
  if (!server || !current) return current;
  return { ...current, ...server } as RentalVehicleCategoryDto;
}
