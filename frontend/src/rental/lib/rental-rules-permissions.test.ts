import { describe, expect, it } from 'vitest';
import {
  buildRentalRulesPermissions,
  isPermissionDeniedMessage,
  mapBookingEligibilityLoadError,
  mapRentalRulesLoadError,
  type HasPermissionFn,
} from './rental-rules-permissions';

function permMap(
  modules: Partial<
    Record<string, { read?: boolean; write?: boolean; manage?: boolean }>
  >,
): HasPermissionFn {
  return (module, level) => {
    const entry = modules[module];
    if (!entry) return false;
    if (level === 'read') return Boolean(entry.read || entry.write || entry.manage);
    if (level === 'write') return Boolean(entry.write || entry.manage);
    return Boolean(entry.manage);
  };
}

describe('buildRentalRulesPermissions', () => {
  it('grants full admin capabilities when all modules are enabled', () => {
    const perms = buildRentalRulesPermissions(
      permMap({
        'rental-rules': { read: true, write: true, manage: true },
        'rental-rules-publish': { write: true },
        'rental-rules-assign': { write: true },
        'rental-rules-overrides': { write: true },
        'booking-eligibility': { read: true },
        'booking-eligibility-override': { manage: true },
      }),
    );
    expect(perms).toEqual({
      canRead: true,
      canWrite: true,
      canPublish: true,
      canAssignVehicles: true,
      canManageOverrides: true,
      canReviewEligibility: true,
      canOverrideEligibility: true,
    });
  });

  it('allows read-only employee without write, publish, assign, or override', () => {
    const perms = buildRentalRulesPermissions(
      permMap({
        'rental-rules': { read: true },
        'booking-eligibility': { read: true },
      }),
    );
    expect(perms.canRead).toBe(true);
    expect(perms.canReviewEligibility).toBe(true);
    expect(perms.canWrite).toBe(false);
    expect(perms.canPublish).toBe(false);
    expect(perms.canAssignVehicles).toBe(false);
    expect(perms.canManageOverrides).toBe(false);
    expect(perms.canOverrideEligibility).toBe(false);
  });

  it('separates publish from write', () => {
    const perms = buildRentalRulesPermissions(
      permMap({
        'rental-rules': { read: true, write: true },
      }),
    );
    expect(perms.canWrite).toBe(true);
    expect(perms.canPublish).toBe(false);
  });

  it('separates assign vehicles from write', () => {
    const perms = buildRentalRulesPermissions(
      permMap({
        'rental-rules': { read: true },
        'rental-rules-assign': { write: true },
      }),
    );
    expect(perms.canAssignVehicles).toBe(true);
    expect(perms.canWrite).toBe(false);
  });

  it('separates eligibility override from review', () => {
    const perms = buildRentalRulesPermissions(
      permMap({
        'booking-eligibility': { read: true },
        'booking-eligibility-override': { manage: true },
      }),
    );
    expect(perms.canReviewEligibility).toBe(true);
    expect(perms.canOverrideEligibility).toBe(true);

    const reviewOnly = buildRentalRulesPermissions(
      permMap({
        'booking-eligibility': { read: true },
      }),
    );
    expect(reviewOnly.canOverrideEligibility).toBe(false);
  });

  it('denies driver without rental modules', () => {
    const perms = buildRentalRulesPermissions(permMap({}));
    expect(perms.canRead).toBe(false);
    expect(perms.canReviewEligibility).toBe(false);
  });
});

describe('rental rules permission error mapping', () => {
  it('maps API 403 to a professional permission message', () => {
    const result = mapRentalRulesLoadError(new Error('API error 403: Missing permission: rental-rules.read'));
    expect(result.forbidden).toBe(true);
    expect(result.message).toContain('Keine Berechtigung');
  });

  it('maps booking eligibility 403 separately', () => {
    const result = mapBookingEligibilityLoadError(
      new Error('Missing permission: booking-eligibility.read'),
    );
    expect(result.forbidden).toBe(true);
    expect(result.message).toContain('Buchungs-Eligibility');
  });

  it('keeps generic errors unchanged', () => {
    const result = mapRentalRulesLoadError(new Error('Network timeout'));
    expect(result.forbidden).toBe(false);
    expect(result.message).toBe('Network timeout');
  });

  it('detects permission denied messages', () => {
    expect(isPermissionDeniedMessage('Missing permission: rental-rules.write')).toBe(true);
    expect(isPermissionDeniedMessage('Vehicle not found')).toBe(false);
  });
});
