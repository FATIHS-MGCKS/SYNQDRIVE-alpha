import { BadRequestException } from '@nestjs/common';
import {
  assertCategoryLifecycleTransition,
  canAssignVehiclesToCategory,
  canEditCategoryContent,
  isCategoryRulesEnforced,
  RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS,
  resolveCategoryStatusDisplayName,
  syncIsActiveFromCategoryStatus,
} from './rental-rules-category-lifecycle.util';

describe('rental-rules-category-lifecycle.util', () => {
  it('defines allowed lifecycle transitions', () => {
    expect(RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS.DRAFT).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS.ACTIVE).toEqual(['INACTIVE', 'ARCHIVED']);
    expect(RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS.INACTIVE).toEqual(['ACTIVE', 'ARCHIVED']);
    expect(RENTAL_CATEGORY_LIFECYCLE_TRANSITIONS.ARCHIVED).toEqual(['ACTIVE']);
  });

  it('allows valid transitions and rejects invalid ones', () => {
    expect(() => assertCategoryLifecycleTransition('DRAFT', 'ACTIVE')).not.toThrow();
    expect(() => assertCategoryLifecycleTransition('ACTIVE', 'INACTIVE')).not.toThrow();
    expect(() => assertCategoryLifecycleTransition('INACTIVE', 'ACTIVE')).not.toThrow();
    expect(() => assertCategoryLifecycleTransition('ARCHIVED', 'ACTIVE')).not.toThrow();
    expect(() => assertCategoryLifecycleTransition('ARCHIVED', 'INACTIVE')).toThrow(BadRequestException);
    expect(() => assertCategoryLifecycleTransition('DRAFT', 'INACTIVE')).toThrow(BadRequestException);
  });

  it('enforces rule and assignment semantics by status', () => {
    expect(isCategoryRulesEnforced('ACTIVE')).toBe(true);
    expect(isCategoryRulesEnforced('INACTIVE')).toBe(false);
    expect(canAssignVehiclesToCategory('DRAFT')).toBe(true);
    expect(canAssignVehiclesToCategory('ACTIVE')).toBe(true);
    expect(canAssignVehiclesToCategory('INACTIVE')).toBe(false);
    expect(canAssignVehiclesToCategory('ARCHIVED')).toBe(false);
    expect(canEditCategoryContent('ARCHIVED')).toBe(false);
    expect(canEditCategoryContent('INACTIVE')).toBe(true);
  });

  it('syncs isActive from status and formats display names', () => {
    expect(syncIsActiveFromCategoryStatus('ACTIVE')).toBe(true);
    expect(syncIsActiveFromCategoryStatus('INACTIVE')).toBe(false);
    expect(resolveCategoryStatusDisplayName('Economy', 'ARCHIVED')).toBe('Economy (archived)');
  });
});
