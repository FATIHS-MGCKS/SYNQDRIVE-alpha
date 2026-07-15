import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis/rental-driving-analysis.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { StationsModule } from '@modules/stations/stations.module';
import { RentalRulesModule } from '@modules/rental-rules/rental-rules.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { CustomerVerificationModule } from '@modules/customer-verification/customer-verification.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { BookingRentalEligibilityService } from './booking-rental-eligibility.service';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import { BookingWizardCheckoutContextService } from './booking-wizard-checkout-context.service';
import { BookingWizardPaymentFlowService } from './booking-wizard-payment-flow.service';

@Module({
  imports: [
    RentalDrivingAnalysisModule,
    forwardRef(() => InvoicesModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => DocumentsModule),
    TasksModule,
    CustomersModule,
    CustomerVerificationModule,
    WorkflowsModule,
    PricingModule,
    StationsModule,
    RentalRulesModule,
    OutboundEmailModule,
    forwardRef(() => PaymentsModule),
    VehiclesModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingsHandoverService,
    BookingRentalEligibilityService,
    BookingWizardDraftService,
    BookingWizardCheckoutContextService,
    BookingWizardPaymentFlowService,
  ],
  exports: [
    BookingsService,
    BookingsHandoverService,
    BookingRentalEligibilityService,
    BookingWizardDraftService,
  ],
})
export class BookingsModule {}
