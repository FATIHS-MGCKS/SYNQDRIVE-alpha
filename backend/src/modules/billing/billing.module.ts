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
import { StripeBillingAdapter } from './adapters/stripe-billing.adapter';
import { BillingEventPublisher } from './events/billing-event.publisher';
import {
  DiscountResolverService,
  EntitlementResolverService,
  InvoiceResolverService,
  PricingResolverService,
  QuantityResolverService,
  SubscriptionResolverService,
} from './resolvers';
import { BillingLegacyBackfillService } from './migration/billing-legacy-backfill.service';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { BillingQuantityService } from './billing-quantity.service';
import { BillingQuantityVehicleIntegration } from './billing-quantity-vehicle.integration';
import { BillingPeriodResolverService } from './billing-period-resolver.service';
import { UsageSnapshotService } from './usage-snapshot.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { MasterSubscriptionController } from './master-subscription.controller';
import { BillingSubscriptionAdminService } from './billing-subscription-admin.service';
import { BillingCommandService } from './billing-command.service';
import { BillingCommandOrchestratorService } from './billing-command-orchestrator.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingEntitlementResolver } from './billing-entitlement-resolver.service';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { StripeCatalogMappingController } from './stripe-catalog-mapping.controller';
import { StripeCatalogSyncService } from './stripe-catalog-sync.service';
import { StripeSubscriptionOrchestratorService } from './stripe-subscription-orchestrator.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { StripeWebhookDispatcherService } from './stripe-webhook-dispatcher.service';
import { StripePaymentLedgerService } from './stripe-payment-ledger.service';
import { BillingPaymentLedgerService } from './billing-payment-ledger.service';
import { BillingManualPaymentService } from './billing-manual-payment.service';
import { StripeWebhookProcessorService } from './stripe-webhook.processor';

@Module({
  controllers: [BillingController, StripeWebhookController, MasterSubscriptionController, StripeCatalogMappingController],
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
    SubscriptionResolverService,
    PricingResolverService,
    QuantityResolverService,
    DiscountResolverService,
    InvoiceResolverService,
    EntitlementResolverService,
    StripeBillingAdapter,
    BillingEventPublisher,
    BillingLegacyBackfillService,
    SubscriptionPricePreviewService,
    BillingQuantityService,
    BillingQuantityVehicleIntegration,
    BillingPeriodResolverService,
    UsageSnapshotService,
    SubscriptionLifecycleService,
    BillingSubscriptionAdminService,
    BillingCommandService,
    BillingCommandOrchestratorService,
    BillingDomainEventOutboxService,
    BillingEntitlementResolver,
    StripeCatalogMappingService,
    StripeCatalogSyncService,
    StripeSubscriptionOrchestratorService,
    StripePaymentMethodService,
    StripeWebhookDispatcherService,
    BillingPaymentLedgerService,
    BillingManualPaymentService,
    StripePaymentLedgerService,
    StripeWebhookProcessorService,
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
    SubscriptionResolverService,
    PricingResolverService,
    QuantityResolverService,
    DiscountResolverService,
    InvoiceResolverService,
    EntitlementResolverService,
    StripeBillingAdapter,
    BillingEventPublisher,
    BillingLegacyBackfillService,
    SubscriptionPricePreviewService,
    BillingQuantityService,
    BillingQuantityVehicleIntegration,
    BillingPeriodResolverService,
    UsageSnapshotService,
    SubscriptionLifecycleService,
    BillingSubscriptionAdminService,
    BillingCommandService,
    BillingCommandOrchestratorService,
    BillingDomainEventOutboxService,
    BillingEntitlementResolver,
    StripeCatalogMappingService,
    StripeCatalogSyncService,
    StripeSubscriptionOrchestratorService,
    StripePaymentMethodService,
    StripeWebhookDispatcherService,
    BillingPaymentLedgerService,
    BillingManualPaymentService,
    StripePaymentLedgerService,
    StripeWebhookProcessorService,
  ],
})
export class BillingModule {}
