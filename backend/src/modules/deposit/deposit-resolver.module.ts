import { Module } from '@nestjs/common';
import { RentalRulesModule } from '@modules/rental-rules/rental-rules.module';
import { DepositResolverService } from './deposit-resolver.service';

@Module({
  imports: [RentalRulesModule],
  providers: [DepositResolverService],
  exports: [DepositResolverService],
})
export class DepositResolverModule {}
