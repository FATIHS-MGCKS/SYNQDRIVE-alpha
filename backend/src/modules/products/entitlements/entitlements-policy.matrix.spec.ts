import { OrgProductStatus } from '@prisma/client';
import {
  isEntitledForAnyAccess,
  isOrganizationProductOperationallyEntitled,
  ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES,
  ORGANIZATION_PRODUCT_VEHICLE_ACTIVATION_ENTITLEMENT_STATUSES,
  ORGANIZATION_PRODUCT_VEHICLE_GRANT_ENTITLEMENT_STATUSES,
  resolveEntitlementCapabilities,
} from './entitlements-policy';
import { READINESS_PRODUCT_ENTITLEMENT_STATUSES } from '@modules/vehicle-onboarding/readiness/product-entitlement.authority';

const STATUSES = [
  OrgProductStatus.ACTIVE,
  OrgProductStatus.TRIAL,
  OrgProductStatus.SUSPENDED,
  OrgProductStatus.CANCELLED,
] as const;

describe('entitlements-policy — runtime alignment matrix', () => {
  it('operational status constants are ACTIVE-only and aliased', () => {
    expect(ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES).toEqual([OrgProductStatus.ACTIVE]);
    expect(ORGANIZATION_PRODUCT_VEHICLE_GRANT_ENTITLEMENT_STATUSES).toEqual(
      ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES,
    );
    expect(ORGANIZATION_PRODUCT_VEHICLE_ACTIVATION_ENTITLEMENT_STATUSES).toEqual(
      ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES,
    );
    expect(READINESS_PRODUCT_ENTITLEMENT_STATUSES).toEqual([
      ...ORGANIZATION_PRODUCT_VEHICLE_ACTIVATION_ENTITLEMENT_STATUSES,
    ]);
  });

  it.each(STATUSES)('status matrix for %s', (status) => {
    const caps = resolveEntitlementCapabilities(status);
    const operational = isOrganizationProductOperationallyEntitled(status);

    if (status === OrgProductStatus.ACTIVE) {
      expect(caps).toEqual({ canAccessProductUi: true, canActivateVehicles: true });
      expect(operational).toBe(true);
      expect(isEntitledForAnyAccess(status)).toBe(true);
    }
    if (status === OrgProductStatus.TRIAL) {
      expect(caps).toEqual({ canAccessProductUi: true, canActivateVehicles: false });
      expect(operational).toBe(false);
      expect(isEntitledForAnyAccess(status)).toBe(true);
    }
    if (status === OrgProductStatus.SUSPENDED || status === OrgProductStatus.CANCELLED) {
      expect(caps).toEqual({ canAccessProductUi: false, canActivateVehicles: false });
      expect(operational).toBe(false);
      expect(isEntitledForAnyAccess(status)).toBe(false);
    }
  });

  it('UNASSIGNED is fail-closed for UI and operational paths', () => {
    expect(resolveEntitlementCapabilities(null)).toEqual({
      canAccessProductUi: false,
      canActivateVehicles: false,
    });
    expect(isOrganizationProductOperationallyEntitled(null)).toBe(false);
    expect(isEntitledForAnyAccess(undefined)).toBe(false);
  });
});