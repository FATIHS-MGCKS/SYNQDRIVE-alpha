import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteService } from './pricing-quote.service';
import { PricingIntegrityAuditService } from './pricing-integrity-audit.service';

@Module({
  controllers: [PricingController],
  providers: [
    PricingService,
    PriceTariffsService,
    PricingMigrationService,
    PricingQuoteService,
    PricingIntegrityAuditService,
  ],
  exports: [
    PricingService,
    PriceTariffsService,
    PricingMigrationService,
    PricingQuoteService,
    PricingIntegrityAuditService,
  ],
})
export class PricingModule {}
