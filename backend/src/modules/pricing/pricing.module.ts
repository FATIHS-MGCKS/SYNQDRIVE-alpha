import { Module } from '@nestjs/common';
import { DepositResolverModule } from '@modules/deposit/deposit-resolver.module';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PriceTariffsService } from './price-tariffs.service';
import { PricingMigrationService } from './pricing-migration.service';
import { PricingQuoteService } from './pricing-quote.service';
import { PricingQuoteApplicationService } from './pricing-quote-application.service';
import { PricingIntegrityAuditService } from './pricing-integrity-audit.service';

@Module({
  imports: [DepositResolverModule],
  controllers: [PricingController],
  providers: [
    PricingService,
    PriceTariffsService,
    PricingMigrationService,
    PricingQuoteService,
    PricingQuoteApplicationService,
    PricingIntegrityAuditService,
  ],
  exports: [
    PricingService,
    PriceTariffsService,
    PricingMigrationService,
    PricingQuoteService,
    PricingQuoteApplicationService,
    PricingIntegrityAuditService,
  ],
})
export class PricingModule {}
