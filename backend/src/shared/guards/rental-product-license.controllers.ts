import type { Type } from '@nestjs/common';
import { BookingsController } from '@modules/bookings/bookings.controller';
import { CustomersController } from '@modules/customers/customers.controller';
import { PricingController } from '@modules/pricing/pricing.controller';
import { StationsController } from '@modules/stations/stations.controller';
import { BookingPaymentRequestController } from '@modules/payments/booking-payment-request.controller';
import { OrganizationPaymentRequestController } from '@modules/payments/organization-payment-request.controller';
import { PaymentsConnectController } from '@modules/payments/payments-connect.controller';
import { RentalRulesController } from '@modules/rental-rules/rental-rules.controller';
import { RentalHealthController } from '@modules/rental-health/rental-health.controller';
import { RentalDrivingAnalysisController } from '@modules/rental-driving-analysis/rental-driving-analysis.controller';
import { DocumentsController } from '@modules/documents/documents.controller';
import { LegalDocumentDeliveryEvidenceController } from '@modules/documents/legal-document-delivery-evidence.controller';
import { PRODUCT_KEY } from './product-license.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProductLicenseGuard } from './product-license.guard';
import { ProductSlug } from '@prisma/client';

/** Org-scoped Rental operational HTTP controllers (P6-PR3). */
export const RENTAL_PRODUCT_LICENSED_CONTROLLERS: Type<unknown>[] = [
  BookingsController,
  CustomersController,
  PricingController,
  StationsController,
  BookingPaymentRequestController,
  OrganizationPaymentRequestController,
  PaymentsConnectController,
  RentalRulesController,
  RentalHealthController,
  RentalDrivingAnalysisController,
  DocumentsController,
  LegalDocumentDeliveryEvidenceController,
];

export function assertRentalProductLicenseMetadata(controller: Type<unknown>): void {
  const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  const hasProductGuard = guards.some((g) => g === ProductLicenseGuard);
  const productSlug = Reflect.getMetadata(PRODUCT_KEY, controller);
  expect(hasProductGuard).toBe(true);
  expect(productSlug).toBe(ProductSlug.RENTAL);
}