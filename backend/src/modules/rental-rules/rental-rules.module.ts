import { Module } from '@nestjs/common';
import { RentalRulesController } from './rental-rules.controller';
import { RentalRulesService } from './rental-rules.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import { RentalRulesRevisionService } from './rental-rules-revision.service';

@Module({
  controllers: [RentalRulesController],
  providers: [
    RentalRulesService,
    RentalEffectiveRulesService,
    RentalRulePermissionService,
    RentalRulesRevisionService,
  ],
  exports: [
    RentalRulesService,
    RentalEffectiveRulesService,
    RentalRulePermissionService,
    RentalRulesRevisionService,
  ],
})
export class RentalRulesModule {}
