import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { DiV0TripSpeedQualityProjectionService } from './di-v0-trip-speed-quality-projection.service';

/**
 * P2 trip speed quality projection (OFF by default — not imported by VehicleIntelligenceModule / AppModule).
 * Invoke DiV0TripSpeedQualityProjectionService explicitly from ops tooling when enabled.
 */
@Module({
  imports: [PrismaModule],
  providers: [DiV0TripSpeedQualityProjectionService],
  exports: [DiV0TripSpeedQualityProjectionService],
})
export class DiV0TripSpeedQualityModule {}
