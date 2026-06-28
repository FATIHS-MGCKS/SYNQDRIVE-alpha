import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingService } from './billing.service';
import { PricebookService } from './pricebook.service';
import { BillingUsageService } from './billing-usage.service';
import { BillingAuditService } from './billing-audit.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import { BillingSummaryService } from './billing-summary.service';
import { BillingAdminService } from './billing-admin.service';
import { StripePreparedService } from './stripe-prepared.service';
import { StripeBillingService } from './stripe-billing.service';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [
    BillingService,
    PricebookService,
    BillingUsageService,
    BillingAuditService,
    BillableVehiclesService,
    BillingPriceResolutionService,
    BillingSummaryService,
    BillingAdminService,
    StripeBillingService,
    StripeInvoiceMirrorService,
    StripeWebhookService,
    StripePreparedService,
  ],
  exports: [
    BillingService,
    PricebookService,
    BillingUsageService,
    BillingAuditService,
    BillableVehiclesService,
    BillingPriceResolutionService,
    BillingSummaryService,
    BillingAdminService,
    StripeBillingService,
    StripeInvoiceMirrorService,
    StripeWebhookService,
    StripePreparedService,
  ],
})
export class BillingModule {}
