import {
  RENTAL_PRODUCT_LICENSED_CONTROLLERS,
  assertRentalProductLicenseMetadata,
} from './rental-product-license.controllers';
import { StripeConnectWebhookController } from '@modules/payments/stripe-connect-webhook.controller';
import { CoreEntitlementsReadController } from '@modules/products/entitlements/core-entitlements-read.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProductLicenseGuard } from './product-license.guard';

describe('Rental product license — controller coverage (P6-PR3)', () => {
  it.each(RENTAL_PRODUCT_LICENSED_CONTROLLERS.map((c) => [c.name, c]))(
    '%s has RequireProduct(RENTAL) and ProductLicenseGuard',
    (_name, controller) => {
      assertRentalProductLicenseMetadata(controller);
    },
  );

  it('excludes Stripe Connect webhook from product license guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, StripeConnectWebhookController) ?? [];
    expect(guards).not.toContain(ProductLicenseGuard);
  });

  it('excludes Core entitlements read from rental product license guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CoreEntitlementsReadController) ?? [];
    expect(guards).not.toContain(ProductLicenseGuard);
  });
});