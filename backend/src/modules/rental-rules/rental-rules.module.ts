import { Module } from '@nestjs/common';
import { RentalRulesController } from './rental-rules.controller';
import { RentalRulesService } from './rental-rules.service';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';

@Module({
  controllers: [RentalRulesController],
  providers: [RentalRulesService, RentalEffectiveRulesService],
  exports: [RentalRulesService, RentalEffectiveRulesService],
})
export class RentalRulesModule {}
