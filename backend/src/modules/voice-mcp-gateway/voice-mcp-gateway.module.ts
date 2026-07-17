import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { StationsModule } from '@modules/stations/stations.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { VoiceMcpGatewayController } from './voice-mcp-gateway.controller';
import { VoiceMcpTokenService } from './voice-mcp-token.service';
import { VoiceMcpNonceStore } from './voice-mcp-nonce.store';
import { VoiceMcpProtocolService } from './voice-mcp-protocol.service';
import {
  VoiceMcpAuditService,
  VoiceMcpGatewayMiddlewareService,
  VoiceMcpToolsService,
} from './voice-mcp-tools.service';
import { VoiceMcpEntityResolverService } from './voice-mcp-entity-resolver.service';
import { VoiceMcpRateLimitService } from './voice-mcp-rate-limit.service';
import { VoiceToolExecutionRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    CustomersModule,
    BookingsModule,
    VehiclesModule,
    InvoicesModule,
    StationsModule,
    OrganizationsModule,
    VoiceAssistantModule,
  ],
  controllers: [VoiceMcpGatewayController],
  providers: [
    VoiceMcpTokenService,
    VoiceMcpNonceStore,
    VoiceMcpProtocolService,
    VoiceMcpGatewayMiddlewareService,
    VoiceMcpToolsService,
    VoiceMcpAuditService,
    VoiceMcpEntityResolverService,
    VoiceMcpRateLimitService,
    VoiceToolExecutionRepository,
  ],
  exports: [VoiceMcpTokenService, VoiceMcpProtocolService],
})
export class VoiceMcpGatewayModule {}
