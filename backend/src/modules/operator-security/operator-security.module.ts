import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import operatorSecurityConfig from '@config/operator-security.config';
import { OperatorRateLimitService } from './operator-rate-limit.service';
import { OperatorIdempotencyService } from './operator-idempotency.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(operatorSecurityConfig)],
  providers: [OperatorRateLimitService, OperatorIdempotencyService],
  exports: [OperatorRateLimitService, OperatorIdempotencyService],
})
export class OperatorSecurityModule {}
