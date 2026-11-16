import { OrganizationProductVehicleAccessMode, ProductSlug } from '@prisma/client';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';

describe('defaultVehicleAccessModeForNewAssignment', () => {
  it('uses SELECTED_VEHICLES for VYMOD', () => {
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.VYMOD)).toBe(
      OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    );
  });

  it('uses ORGANIZATION_WIDE for Rental legacy products', () => {
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.RENTAL)).toBe(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    );
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.FLEET)).toBe(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    );
  });
});