import { OFFICIAL_PRODUCT_LOCALE_CODES } from '../../i18n/locales';

export const PROFILE_DATE_FORMATS = ['DD.MM.YYYY', 'YYYY-MM-DD'] as const;

export const PROFILE_LOCALE_OPTIONS = [...OFFICIAL_PRODUCT_LOCALE_CODES];

/** Common IANA zones — backend validates with Intl; list is UX helper only. */
export const PROFILE_TIMEZONE_OPTIONS = [
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Istanbul',
  'Europe/Rome',
  'America/New_York',
  'UTC',
] as const;

export const MEMBERSHIP_ROLE_OPTIONS = ['ORG_ADMIN', 'SUB_ADMIN', 'WORKER'] as const;