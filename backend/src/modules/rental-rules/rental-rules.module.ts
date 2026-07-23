import { Module } from '@nestjs/common';
import { RentalRulesController } from './rental-rules.controller';
import { RentalRulesService } from './rental-rules.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulePermissionService } from './rental-rule-permission.service';

@Module({
  controllers: [RentalRulesController],
  providers: [RentalRulesService, RentalEffectiveRulesService, RentalRulePermissionService],
  exports: [RentalRulesService, RentalEffectiveRulesService, RentalRulePermissionService],
})
export class RentalRulesModule {}
