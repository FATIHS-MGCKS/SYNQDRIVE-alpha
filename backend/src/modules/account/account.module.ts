import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AuthApiModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [AuthApiModule, UsersModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
