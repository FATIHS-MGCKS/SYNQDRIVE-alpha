import { Module } from '@nestjs/common';
import { PdiIdentityDriftShadowService } from './pdi-identity-drift-shadow.service';

@Module({
  providers: [PdiIdentityDriftShadowService],
  exports: [PdiIdentityDriftShadowService],
})
export class PdiIdentityDriftShadowModule {}
