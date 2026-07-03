import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_PASSWORD_MIN_LENGTH,
  validateAccountPasswordChange,
} from './password-policy';

describe('validateAccountPasswordChange', () => {
  it('requires minimum password length', () => {
    expect(
      validateAccountPasswordChange({
        currentPassword: 'oldpassword',
        newPassword: 'short',
        confirmPassword: 'short',
      }),
    ).toContain(String(ACCOUNT_PASSWORD_MIN_LENGTH));
  });

  it('rejects identical new and current password', () => {
    expect(
      validateAccountPasswordChange({
        currentPassword: 'samepassword',
        newPassword: 'samepassword',
        confirmPassword: 'samepassword',
      }),
    ).toMatch(/unterscheiden/);
  });

  it('accepts valid password change payload', () => {
    expect(
      validateAccountPasswordChange({
        currentPassword: 'oldpassword1',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      }),
    ).toBeNull();
  });
});
