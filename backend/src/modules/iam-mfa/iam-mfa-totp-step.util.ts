import { authenticator } from 'otplib';
import { UnauthorizedException } from '@nestjs/common';
import { MFA_ERROR } from './iam-mfa.policy';

/**
 * Maps a verified TOTP code to the RFC 6238 time step that accepted it (respects otplib window).
 */
export function resolveAcceptedTotpStep(normalizedCode: string, secret: string): bigint {
  const delta = authenticator.checkDelta(normalizedCode, secret);
  if (delta === null) {
    throw new UnauthorizedException({
      code: MFA_ERROR.INVALID_CODE,
      message: 'Invalid MFA code',
    });
  }
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  return BigInt(currentStep + delta);
}