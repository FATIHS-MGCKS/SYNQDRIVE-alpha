import { describe, expect, it } from 'vitest';
import { buildRentalRulesPermissions } from '../../../lib/rental-rules-permissions';

describe('rental rules UI action visibility', () => {
  it('station manager can assign vehicles and manage overrides without write', () => {
    const perms = buildRentalRulesPermissions((module, level) => {
      const map: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> = {
        'rental-rules': { read: true },
        'rental-rules-assign': { write: true },
        'rental-rules-overrides': { write: true },
        'booking-eligibility': { read: true },
        'booking-eligibility-override': { manage: true },
      };
      const entry = map[module];
      if (!entry) return false;
      if (level === 'read') return Boolean(entry.read || entry.write || entry.manage);
      if (level === 'write') return Boolean(entry.write || entry.manage);
      return Boolean(entry.manage);
    });

    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(false);
    expect(perms.canAssignVehicles).toBe(true);
    expect(perms.canManageOverrides).toBe(true);
    expect(perms.canOverrideEligibility).toBe(true);
  });

  it('read-only employee can browse rules but not mutate', () => {
    const perms = buildRentalRulesPermissions((module, level) => {
      if (module === 'rental-rules') return level === 'read';
      if (module === 'booking-eligibility') return level === 'read';
      return false;
    });

    expect(perms.canRead).toBe(true);
    expect(perms.canWrite).toBe(false);
    expect(perms.canPublish).toBe(false);
    expect(perms.canAssignVehicles).toBe(false);
    expect(perms.canManageOverrides).toBe(false);
    expect(perms.canReviewEligibility).toBe(true);
    expect(perms.canOverrideEligibility).toBe(false);
  });

  it('hides rental rules tab for users without read permission', () => {
    const perms = buildRentalRulesPermissions(() => false);
    expect(perms.canRead).toBe(false);
  });
});
