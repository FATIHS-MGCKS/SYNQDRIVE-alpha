import { Module } from '@nestjs/common';
import { ServiceCasesController } from './service-cases.controller';
import { ServiceCasesService } from './service-cases.service';

@Module({
  controllers: [ServiceCasesController],
  providers: [ServiceCasesService],
  exports: [ServiceCasesService],
})
export class ServiceCasesModule {}
