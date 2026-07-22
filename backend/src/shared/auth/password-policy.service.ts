import { BadRequestException, Injectable } from '@nestjs/common';
import { MIN_USER_PASSWORD_LENGTH } from './permission.constants';

const MAX_PASSWORD_LENGTH = 128;

/**
 * Central server-side password policy (Prompt 6/22).
 * No arbitrary complexity rules — length + optional compromised check.
 */
@Injectable()
export class PasswordPolicyService {
  assertAcceptablePassword(password: string): void {
    if (!password || password.length < MIN_USER_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_USER_PASSWORD_LENGTH} characters`,
      );
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
      );
    }
    if (this.isKnownCompromised(password)) {
      throw new BadRequestException(
        'This password has appeared in known data breaches. Please choose a different password.',
      );
    }
  }

  /**
   * Extension point for k-anonymity breach checks (e.g. HIBP).
   * Disabled by default — enable only with a vetted integration.
   */
  private isKnownCompromised(_password: string): boolean {
    if (process.env.PASSWORD_BREACH_CHECK_ENABLED !== 'true') {
      return false;
    }
    return false;
  }
}
