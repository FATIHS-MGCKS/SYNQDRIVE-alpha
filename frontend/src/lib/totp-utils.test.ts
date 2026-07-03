import { describe, expect, it } from 'vitest';
import { isAuthLoginMfaChallenge, isAuthLoginSuccess } from '../lib/api';
import {
  formatRecoveryCodesForExport,
  mapAuthErrorMessage,
  parseTotpSecretFromOtpAuthUrl,
} from '../lib/totp-utils';

describe('totp-utils', () => {
  it('parses secret from otpauth url', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = `otpauth://totp/SynqDrive:user@example.com?secret=${secret}&issuer=SynqDrive`;
    expect(parseTotpSecretFromOtpAuthUrl(url)).toBe(secret);
  });

  it('formats recovery codes for export without persisting separately', () => {
    const text = formatRecoveryCodesForExport(['ABCD-EFGH', 'WXYZ-2345']);
    expect(text).toContain('ABCD-EFGH');
    expect(text).toContain('SynqDrive Wiederherstellungscodes');
  });

  it('maps rate limit errors to friendly german text', () => {
    expect(mapAuthErrorMessage('Too many MFA attempts', 'de')).toContain('Zu viele Versuche');
  });
});

describe('auth login response guards', () => {
  it('detects MFA challenge response', () => {
    expect(
      isAuthLoginMfaChallenge({
        mfaRequired: true,
        mfaChallengeToken: 'challenge',
        expiresIn: 300,
      }),
    ).toBe(true);
  });

  it('detects successful login response', () => {
    expect(
      isAuthLoginSuccess({
        token: 't',
        accessToken: 't',
        refreshToken: 'r',
        expiresIn: '24h',
        mustChangePassword: false,
        user: {
          id: '1',
          email: 'a@b.de',
          name: 'A',
          platformRole: 'USER',
          membershipRole: null,
          organizationId: null,
          organizationName: null,
          permissions: null,
        },
      }),
    ).toBe(true);
  });
});
