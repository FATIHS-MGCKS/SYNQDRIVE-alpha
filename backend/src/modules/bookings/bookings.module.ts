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
import { BookingRentalEligibilityService } from './booking-rental-eligibility.service';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import { BookingWizardCheckoutContextService } from './booking-wizard-checkout-context.service';
import { BookingWizardPaymentFlowService } from './booking-wizard-payment-flow.service';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { BookingAllowedDriversService } from './booking-allowed-drivers/booking-allowed-drivers.service';
import { BookingPermissionService } from './booking-permission.service';
import { BookingAccessService } from './booking-access.service';
import { BookingResponseRedactionService } from './booking-response-redaction.service';
import { BookingPermissionsGuard } from './guards/booking-permissions.guard';
import { BookingCreateValidationService } from './booking-create.validation.service';
import { BookingUpdateService } from './booking-update.service';
import { HandoverValidationService } from './handover-validation.service';
import { BookingStatusTransitionService } from './state-machine/booking-status-transition.service';
import { BookingStatusCommandService } from './status-commands/booking-status-command.service';
import { BookingStatusCommandsController } from './status-commands/booking-status-commands.controller';
import { BookingPickupGateModule } from './booking-pickup-gate/booking-pickup-gate.module';
import { BookingCancellationFeeService } from './cancellation/booking-cancellation-fee.service';
import { BookingCancellationOrchestrationService } from './cancellation/booking-cancellation-orchestration.service';
import { BookingCancellationAuditService } from './cancellation/booking-cancellation-audit.service';
import { BookingStatusOverrideAuditService } from './override/booking-status-override-audit.service';

@Module({
  imports: [
    RentalDrivingAnalysisModule,
    forwardRef(() => InvoicesModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => DocumentsModule),
    BookingPickupGateModule,
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
    ActivityLogModule,
  ],
  controllers: [BookingsController, BookingStatusCommandsController],
  providers: [
    BookingsService,
    BookingsHandoverService,
    BookingAllowedDriversService,
    BookingRentalEligibilityService,
    BookingWizardDraftService,
    BookingWizardCheckoutContextService,
    BookingWizardPaymentFlowService,
    BookingPermissionService,
    BookingAccessService,
    BookingResponseRedactionService,
    BookingCreateValidationService,
    BookingUpdateService,
    HandoverValidationService,
    BookingStatusTransitionService,
    BookingStatusCommandService,
    BookingCancellationFeeService,
    BookingCancellationOrchestrationService,
    BookingCancellationAuditService,
    BookingStatusOverrideAuditService,
    BookingPermissionsGuard,
  ],
  exports: [
    BookingsService,
    BookingsHandoverService,
    BookingRentalEligibilityService,
    BookingWizardDraftService,
    BookingAllowedDriversService,
    BookingPermissionService,
    BookingAccessService,
    BookingResponseRedactionService,
  ],
})
export class BookingsModule {}
