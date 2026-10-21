import { describe, expect, it } from 'vitest';
import { translateAuthError } from './auth-error-i18n';
import { translateKey } from './LanguageContext';

describe('auth error localization', () => {
  it('maps known backend auth messages to semantic keys', () => {
    expect(translateAuthError('en', new Error('Invalid credentials'))).toBe('Invalid credentials.');
    expect(translateAuthError('de', new Error('Invalid credentials'))).toBe('Ungültige Anmeldedaten.');
    expect(translateAuthError('en', new Error('MFA login session expired or invalid'))).toBe(
      'Your MFA session expired. Please sign in again.',
    );
  });

  it('falls back to generic localized message for unknown errors', () => {
    expect(translateAuthError('en', new Error('totally unknown backend fault'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(translateKey('tr', 'auth.error.generic').source).toBe('fallback-en');
  });
});
