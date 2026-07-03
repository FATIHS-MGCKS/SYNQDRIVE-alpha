import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AuthApiModule } from '@modules/auth/auth.module';
import { TwoFactorModule } from './two-factor/two-factor.module';

@Module({
  imports: [AuthApiModule, TwoFactorModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
