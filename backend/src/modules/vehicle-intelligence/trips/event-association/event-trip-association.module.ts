import { Module } from '@nestjs/common';
import { EventTripAssociationService } from './event-trip-association.service';

/**
 * Standalone DI module for the canonical Event → Trip association resolver.
 *
 * Kept free of module-level dependencies (PrismaModule and ObservabilityModule
 * are global) so both DimoModule — which owns event intake — and
 * VehicleIntelligenceModule — which owns the trip lifecycle — can import it
 * without widening the existing forwardRef cycle between them.
 */
@Module({
  providers: [EventTripAssociationService],
  exports: [EventTripAssociationService],
})
export class EventTripAssociationModule {}
