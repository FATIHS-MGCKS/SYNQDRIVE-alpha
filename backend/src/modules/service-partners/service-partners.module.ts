import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import euromasterConfig from '@config/euromaster.config';
import { ServicePartnersController } from './service-partners.controller';
import { ServicePartnersAdminController } from './service-partners-admin.controller';
import { ServicePartnersService } from './service-partners.service';
import { EuromasterService } from './euromaster.service';
import { AdacService } from './adac.service';

import { EuromasterAuthService } from './euromaster/euromaster-auth.service';
import { EuromasterClient } from './euromaster/euromaster.client';
import { EuromasterMapperService } from './euromaster/euromaster-mapper.service';
import { EuromasterIntegrationService } from './euromaster/euromaster-integration.service';

@Module({
  imports: [ConfigModule.forFeature(euromasterConfig)],
  controllers: [ServicePartnersController, ServicePartnersAdminController],
  providers: [
    ServicePartnersService,
    EuromasterService,
    AdacService,
    EuromasterAuthService,
    EuromasterClient,
    EuromasterMapperService,
    EuromasterIntegrationService,
  ],
  exports: [
    ServicePartnersService,
    EuromasterService,
    AdacService,
    EuromasterIntegrationService,
  ],
})
export class ServicePartnersModule implements OnModuleInit {
  constructor(private readonly service: ServicePartnersService) {}

  async onModuleInit() {
    await this.service.ensureSeedPartners();
  }
}
