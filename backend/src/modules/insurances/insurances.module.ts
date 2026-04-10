import { Module } from '@nestjs/common';
import { InsurancesService } from './insurances.service';
import {
  InsurancesController,
  InsurancesAdminController,
} from './insurances.controller';
import { EmailChannelAdapter } from './adapters/email-channel.adapter';
import { ApiChannelAdapter } from './adapters/api-channel.adapter';

@Module({
  controllers: [InsurancesController, InsurancesAdminController],
  providers: [InsurancesService, EmailChannelAdapter, ApiChannelAdapter],
  exports: [InsurancesService],
})
export class InsurancesModule {}
