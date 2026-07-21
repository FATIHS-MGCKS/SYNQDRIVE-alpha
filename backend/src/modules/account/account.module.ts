import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AuthApiModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';

@Module({
  imports: [AuthApiModule, UsersModule, IamMfaModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
