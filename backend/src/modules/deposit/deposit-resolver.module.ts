import { Module } from '@nestjs/common';
import { RentalRulesModule } from '@modules/rental-rules/rental-rules.module';
import { BookingDepositSnapshotService } from './booking-deposit-snapshot.service';
import { DepositResolverService } from './deposit-resolver.service';

@Module({
  imports: [RentalRulesModule],
  providers: [DepositResolverService, BookingDepositSnapshotService],
  exports: [DepositResolverService, BookingDepositSnapshotService],
})
export class DepositResolverModule {}
