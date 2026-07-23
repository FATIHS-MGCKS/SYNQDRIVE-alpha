import { Module, forwardRef } from '@nestjs/common';
import { RentalRulesController } from './rental-rules.controller';
import { RentalRulesService } from './rental-rules.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import { RentalRulesRevisionService } from './rental-rules-revision.service';
import { RentalRulesRevisionImpactService } from './rental-rules-revision-impact.service';
import { BookingsModule } from '@modules/bookings/bookings.module';

@Module({
  imports: [forwardRef(() => BookingsModule)],
  controllers: [RentalRulesController],
  providers: [
    RentalRulesService,
    RentalEffectiveRulesService,
    RentalRulePermissionService,
    RentalRulesRevisionService,
    RentalRulesRevisionImpactService,
  ],
  exports: [
    RentalRulesService,
    RentalEffectiveRulesService,
    RentalRulePermissionService,
    RentalRulesRevisionService,
    RentalRulesRevisionImpactService,
  ],
})
export class RentalRulesModule {}
