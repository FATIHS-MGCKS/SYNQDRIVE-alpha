import { translateKey } from './LanguageContext';
import type { SupportedLocale } from './locales';
import type { TranslationKey } from './translations/en';

const AUTH_ERROR_MESSAGE_MAP: Record<string, TranslationKey> = {
  'Email and password are required': 'auth.error.credentialsRequired',
  'Invalid credentials': 'auth.error.invalidCredentials',
  'Account is inactive': 'auth.error.accountInactive',
  'MFA login session expired or invalid': 'auth.error.mfaSessionExpired',
  'Invalid MFA code': 'auth.error.invalidMfaCode',
  'Invalid recovery code': 'auth.error.invalidRecoveryCode',
  'Invalid MFA login context': 'auth.error.mfaFailed',
  'MFA enrollment required before login': 'auth.error.mfaFailed',
  'Login failed': 'auth.error.loginFailed',
  'MFA verification failed': 'auth.error.mfaFailed',
  'Login response incomplete': 'auth.error.loginFailed',
  'Organization selection still required': 'auth.error.loginFailed',
};

function normalizeAuthErrorMessage(message: string): string {
  return message.replace(/^\[[^\]]+\]\s*/, '').trim();
}

export function translateAuthError(locale: SupportedLocale, error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const message = normalizeAuthErrorMessage(rawMessage);

  const mappedKey = AUTH_ERROR_MESSAGE_MAP[message];
  if (mappedKey) {
    return translateKey(locale, mappedKey).text;
  }

  if (/failed to fetch|network|networkerror/i.test(message)) {
    return translateKey(locale, 'auth.error.network').text;
  }

  if (message.toLowerCase().includes('login failed')) {
    return translateKey(locale, 'auth.error.loginFailed').text;
  }
  if (message.toLowerCase().includes('mfa')) {
    return translateKey(locale, 'auth.error.mfaFailed').text;
  }

  return translateKey(locale, 'auth.error.generic').text;
}
