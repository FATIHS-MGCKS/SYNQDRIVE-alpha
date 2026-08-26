import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../lib/auth';

vi.mock('../../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...actual,
    isAuthenticated: vi.fn(() => true),
    isMasterAdmin: vi.fn(() => false),
    getStoredUser: vi.fn(() => null),
  };
});

import {
  canAccessOperatorApp,
  evaluateOperatorAccess,
  isRentalBusinessType,
} from './operatorAccess';
import { isAuthenticated } from '../../lib/auth';

function user(partial: Partial<AuthUser> & Pick<AuthUser, 'id'>): AuthUser {
  return {
    email: 'operator@example.test',
    name: 'Field Operator',
    membershipRole: 'WORKER',
    organizationId: 'org-aaaaaaaa-bbbb-cccc-dddddddddddd',
    ...partial,
  };
}

describe('evaluateOperatorAccess', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
  });

  it('denies unauthenticated users', () => {
    vi.mocked(isAuthenticated).mockReturnValue(false);
    expect(evaluateOperatorAccess(null)).toEqual({ allowed: false, reason: 'unauthenticated' });
  });

  it('allows rental staff roles', () => {
    for (const role of ['ORG_ADMIN', 'SUB_ADMIN', 'WORKER'] as const) {
      expect(evaluateOperatorAccess(user({ id: 'u1', membershipRole: role }))).toEqual({ allowed: true });
    }
  });

  it('denies DRIVER role', () => {
    expect(evaluateOperatorAccess(user({ id: 'u2', membershipRole: 'DRIVER' }))).toEqual({
      allowed: false,
      reason: 'forbidden_role',
    });
  });

  it('denies unknown membership roles', () => {
    expect(evaluateOperatorAccess(user({ id: 'u3', membershipRole: 'CUSTOM_ROLE' }))).toEqual({
      allowed: false,
      reason: 'forbidden_role',
    });
  });

  it('denies when membership role is missing', () => {
    expect(evaluateOperatorAccess(user({ id: 'u4', membershipRole: undefined }))).toEqual({
      allowed: false,
      reason: 'forbidden_role',
    });
  });
});

describe('operator access helpers', () => {
  it('detects rental business type', () => {
    expect(isRentalBusinessType('RENTAL')).toBe(true);
    expect(isRentalBusinessType('fleet')).toBe(false);
    expect(isRentalBusinessType(null)).toBe(false);
  });

  it('canAccessOperatorApp reflects authenticated session state', () => {
    vi.mocked(isAuthenticated).mockReturnValue(false);
    expect(canAccessOperatorApp()).toEqual(false);
  });
});
