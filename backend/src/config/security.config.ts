import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

function decodeEncryptionKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const fromBase64 = Buffer.from(trimmed, 'base64');
    if (fromBase64.length === 32) return fromBase64;
  } catch {
    /* fall through */
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  return null;
}

export default registerAs('security', () => {
  const logger = new Logger('SecurityConfig');
  const totpEncryptionKeyRaw = process.env.TOTP_ENCRYPTION_KEY ?? '';
  const totpEncryptionKey = decodeEncryptionKey(totpEncryptionKeyRaw);

  if (!totpEncryptionKey) {
    logger.warn(
      'TOTP_ENCRYPTION_KEY is not configured or invalid. TOTP 2FA setup/login will be unavailable until a 32-byte base64 or 64-char hex key is set.',
    );
  }

  return {
    totpEncryptionKey,
    totpIssuer: process.env.TOTP_ISSUER || 'SynqDrive',
    mfaChallengeTtlSeconds: parseInt(process.env.MFA_CHALLENGE_TTL_SECONDS || '300', 10),
    mfaMaxAttempts: parseInt(process.env.MFA_MAX_ATTEMPTS || '5', 10),
    recoveryCodeCount: parseInt(process.env.TOTP_RECOVERY_CODE_COUNT || '10', 10),
  };
});
