import { Module } from '@nestjs/common';
import { AccountTwoFactorService } from './account-two-factor.service';
import { SecretEncryptionService } from '@shared/crypto/secret-encryption.service';

@Module({
  providers: [SecretEncryptionService, AccountTwoFactorService],
  exports: [SecretEncryptionService, AccountTwoFactorService],
})
export class TwoFactorModule {}
