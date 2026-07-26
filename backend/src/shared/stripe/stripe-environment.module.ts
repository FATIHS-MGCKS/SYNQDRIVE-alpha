import { Global, Module } from '@nestjs/common';
import { StripeEnvironmentService } from './stripe-environment.service';

@Global()
@Module({
  providers: [StripeEnvironmentService],
  exports: [StripeEnvironmentService],
})
export class StripeEnvironmentModule {}
