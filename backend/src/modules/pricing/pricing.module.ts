import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';

@Module({
  controllers: [PricingController],
  providers: [PricingService, PriceTariffsService, PricingMigrationService],
  exports: [PricingService, PriceTariffsService, PricingMigrationService],
})
export class PricingModule {}
