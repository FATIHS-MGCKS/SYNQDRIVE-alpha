import { useCallback, useMemo } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { GovernanceMfaState, SecurityAccessSection, SecurityAttentionCode } from './types';

export const SECURITY_ACCESS_SECTION_IDS: SecurityAccessSection[] = [
  'overview',
  'users',
  'master-admins',
  'roles',
  'audit',
  'security-events',
  'own-security',
];

export function useSecurityAccessPresentation() {
  const { t, locale } = useLanguage();

  const sectionLabel = useCallback(
    (id: SecurityAccessSection) => t(`master.securityAccess.sections.${id}` as TranslationKey),
    [t],
  );

  const sectionTabs = useMemo(
    () => SECURITY_ACCESS_SECTION_IDS.map((id) => ({ id, label: sectionLabel(id) })),
    [sectionLabel],
  );

  const localizeEnum = useCallback(
    (prefix: string, value: string, unknownKey: TranslationKey) => {
      const key = `${prefix}.${value}` as TranslationKey;
      const translated = t(key);
      return translated === key ? t(unknownKey) : translated;
    },
    [t],
  );

  const mfaStateLabel = useCallback(
    (state: GovernanceMfaState) =>
      localizeEnum('master.securityAccess.mfaState', state, 'master.securityAccess.mfaState.unknown'),
    [localizeEnum],
  );

  const attentionCodeLabel = useCallback(
    (code: SecurityAttentionCode) =>
      localizeEnum('master.securityAccess.attention', code, 'master.securityAccess.attention.unknown'),
    [localizeEnum],
  );

  const auditResultLabel = useCallback(
    (result: string) =>
      localizeEnum('master.securityAccess.auditResult', result, 'master.securityAccess.auditResult.unknown'),
    [localizeEnum],
  );

  const accountStateLabel = useCallback(
    (state: string) =>
      localizeEnum('master.securityAccess.accountState', state, 'master.securityAccess.accountState.unknown'),
    [localizeEnum],
  );

  const platformRoleLabel = useCallback(
    (role: string | null | undefined) => {
      if (!role) return t('master.securityAccess.common.emDash');
      return localizeEnum('master.securityAccess.platformRole', role, 'master.securityAccess.platformRole.unknown');
    },
    [localizeEnum, t],
  );

  const loadError = useCallback(
    (kind: 'attention' | 'users' | 'userDetail' | 'platformRoles' | 'orgRoles' | 'auditLog' | 'own') =>
      t(`master.securityAccess.errors.${kind}` as TranslationKey),
    [t],
  );

  const formatRelative = useCallback(
    (iso: string | null | undefined) => formatRelativeForLocale(iso, locale),
    [locale],
  );

  return {
    t,
    locale,
    sectionLabel,
    sectionTabs,
    mfaStateLabel,
    attentionCodeLabel,
    auditResultLabel,
    accountStateLabel,
    platformRoleLabel,
    loadError,
    formatRelative,
  };
}

export function formatRelativeForLocale(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffSec / 3600);
  if (Math.abs(diffHr) < 48) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffSec / 86400);
  return rtf.format(diffDay, 'day');
}