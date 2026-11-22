import { Module, forwardRef } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { TenantOrganizationProfileController } from './tenant-organization-profile.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsOperationalService } from './organizations-operational.service';
import { UsersModule } from '@modules/users/users.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { BillingModule } from '@modules/billing/billing.module';
import { VehicleOnboardingModule } from '@modules/vehicle-onboarding/vehicle-onboarding.module';
import { IamDataRetentionModule } from '@modules/iam-data-retention/iam-data-retention.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { OrganizationOffboardingController } from './offboarding/organization-offboarding.controller';
import { OrganizationOffboardingService } from './offboarding/organization-offboarding.service';
import { OrganizationOffboardPreflightService } from './offboarding/organization-offboard-preflight.service';

@Module({
  imports: [
    UsersModule,
    PaymentsModule,
    VehiclesModule,
    BillingModule,
    forwardRef(() => VehicleOnboardingModule),
    IamDataRetentionModule,
    ActivityLogModule,
  ],
  controllers: [
    OrganizationsController,
    TenantOrganizationProfileController,
    OrganizationOffboardingController,
  ],
  providers: [
    OrganizationsService,
    OrganizationsOperationalService,
    OrganizationOffboardingService,
    OrganizationOffboardPreflightService,
  ],
  exports: [
    OrganizationsService,
    OrganizationsOperationalService,
    OrganizationOffboardingService,
    OrganizationOffboardPreflightService,
  ],
})
export class OrganizationsModule {}
