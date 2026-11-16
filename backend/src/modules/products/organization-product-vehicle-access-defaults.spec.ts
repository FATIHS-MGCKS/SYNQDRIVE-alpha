import { OrganizationProductVehicleAccessMode, ProductSlug } from '@prisma/client';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';

describe('defaultVehicleAccessModeForNewAssignment', () => {
  it('uses SELECTED_VEHICLES for VYMOD', () => {
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.VYMOD)).toBe(
      OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
    );
  });

  it('uses ORGANIZATION_WIDE for legacy Rental-family products', () => {
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.RENTAL)).toBe(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    );
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.FLEET)).toBe(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    );
    expect(defaultVehicleAccessModeForNewAssignment(ProductSlug.TAXI)).toBe(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
    );
  });

  it('fails closed for unknown future ProductSlug values', () => {
    const unknownSlug = 'FUTURE_PRODUCT' as ProductSlug;
    expect(() => defaultVehicleAccessModeForNewAssignment(unknownSlug)).toThrow(/No default vehicleAccessMode/);
  });
});