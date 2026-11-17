import { describe, expect, it } from 'vitest';
import {
  PRODUCT_BUSINESS_LAUNCH_STATUS,
  businessLaunchStatusForSlug,
  classifyMasterProductApiError,
  isAssignableCatalogProduct,
  isLegacyRetiredProductSlug,
  isSelectableProductSlug,
} from './product-management.policy';

describe('product-management.policy', () => {
  it('maps business launch status for roadmap products', () => {
    expect(businessLaunchStatusForSlug('RENTAL')).toBe('EXISTING_PRODUCT');
    expect(businessLaunchStatusForSlug('FLEET')).toBe('IN_PREPARATION');
    expect(businessLaunchStatusForSlug('VYMOD')).toBe('IN_PREPARATION');
    expect(businessLaunchStatusForSlug('TAXI')).toBe('RETIRED_PRODUCT');
    expect(PRODUCT_BUSINESS_LAUNCH_STATUS.RENTAL).toBe('EXISTING_PRODUCT');
  });

  it('excludes TAXI from selectable slugs', () => {
    expect(isSelectableProductSlug('RENTAL')).toBe(true);
    expect(isSelectableProductSlug('FLEET')).toBe(true);
    expect(isSelectableProductSlug('VYMOD')).toBe(true);
    expect(isSelectableProductSlug('TAXI')).toBe(false);
    expect(isLegacyRetiredProductSlug('TAXI')).toBe(true);
  });

  it('assignable catalog filters DISABLED and non-selectable slugs', () => {
    expect(isAssignableCatalogProduct('VYMOD', 'ACTIVE')).toBe(true);
    expect(isAssignableCatalogProduct('VYMOD', 'DISABLED')).toBe(false);
    expect(isAssignableCatalogProduct('TAXI', 'ACTIVE')).toBe(false);
  });

  it('classifies MFA, conflict and auth errors for UI', () => {
    expect(classifyMasterProductApiError(403, '[STEP_UP_REQUIRED] MFA')).toContain('2FA');
    expect(classifyMasterProductApiError(409, 'vehicleAccessMode mismatch')).toContain('aktualisiert');
    expect(classifyMasterProductApiError(404, 'not found')).toContain('nicht gefunden');
  });
});