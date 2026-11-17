import { BadRequestException } from '@nestjs/common';
import { OrganizationProductVehicleAccessMode, ProductSlug } from '@prisma/client';
import {
  assertPlatformProductAssignable,
  assertPlatformProductGrantWritable,
  assertRetiredPlatformVehicleAccessModeMutation,
} from './retired-platform-product-slugs';

describe('retired-platform-product-slugs', () => {
  it('rejects TAXI assignment', () => {
    expect(() => assertPlatformProductAssignable(ProductSlug.TAXI)).toThrow(BadRequestException);
    expect(() => assertPlatformProductAssignable('taxi')).toThrow(/retired/i);
  });

  it('allows RENTAL, FLEET, and VYMOD', () => {
    expect(() => assertPlatformProductAssignable(ProductSlug.RENTAL)).not.toThrow();
    expect(() => assertPlatformProductAssignable(ProductSlug.FLEET)).not.toThrow();
    expect(() => assertPlatformProductAssignable(ProductSlug.VYMOD)).not.toThrow();
  });

  it('rejects TAXI vehicle grant writes', () => {
    expect(() => assertPlatformProductGrantWritable(ProductSlug.TAXI)).toThrow(BadRequestException);
  });

  it('rejects TAXI access broadening only', () => {
    expect(() =>
      assertRetiredPlatformVehicleAccessModeMutation({
        productSlug: ProductSlug.TAXI,
        from: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        to: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertRetiredPlatformVehicleAccessModeMutation({
        productSlug: ProductSlug.TAXI,
        from: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
        to: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
      }),
    ).not.toThrow();
    expect(() =>
      assertRetiredPlatformVehicleAccessModeMutation({
        productSlug: ProductSlug.RENTAL,
        from: OrganizationProductVehicleAccessMode.SELECTED_VEHICLES,
        to: OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      }),
    ).not.toThrow();
  });
});