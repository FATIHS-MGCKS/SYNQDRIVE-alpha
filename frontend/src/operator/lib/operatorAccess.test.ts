import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateOperatorAccess } from './operatorAccess';
import type { AuthUser } from '../../lib/auth';

function user(partial: Partial<AuthUser>): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.c',
    name: 'Test',
    platformRole: 'USER',
    membershipRole: 'WORKER',
    organizationId: 'org-1',
    organizationName: 'Org',
    permissions: {
      'operator-app': { read: true, write: false, manage: false },
    },
    ...partial,
  };
}

describe('evaluateOperatorAccess', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => {
        if (key === 'synqdrive_token') return 'token';
        if (key === 'synqdrive_user') return JSON.stringify(user({}));
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it('denies without operator.app.access permission', () => {
    const denied = evaluateOperatorAccess(
      user({
        permissions: {
          bookings: { read: true, write: true, manage: true },
        },
      }),
    );
    expect(denied).toEqual({ allowed: false, reason: 'forbidden_permission' });
  });

  it('allows when operator-app.read is granted', () => {
    expect(evaluateOperatorAccess(user({}))).toEqual({ allowed: true });
  });

  it('allows master admin without module permissions', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => {
        if (key === 'synqdrive_token') return 'token';
        if (key === 'synqdrive_user') {
          return JSON.stringify(user({ platformRole: 'MASTER_ADMIN', permissions: null }));
        }
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    expect(
      evaluateOperatorAccess(
        user({
          platformRole: 'MASTER_ADMIN',
          permissions: null,
        }),
      ),
    ).toEqual({ allowed: true });
  });
});
