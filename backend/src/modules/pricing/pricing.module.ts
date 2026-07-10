import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteService } from './pricing-quote.service';

@Module({
  controllers: [PricingController],
  providers: [PricingService, PriceTariffsService, PricingMigrationService, PricingQuoteService],
  exports: [PricingService, PriceTariffsService, PricingMigrationService, PricingQuoteService],
})
export class PricingModule {}
