import { Injectable } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { BookingPreparationArtifactType } from './booking-preparation.constants';

@Injectable()
export class BookingPreparationObservabilityService {
  constructor(private readonly metrics: TripMetricsService) {}

  recordPersistentlyFailed(artifactType: BookingPreparationArtifactType, count: number) {
    this.metrics.setBookingPreparationFailedGauge(artifactType, count);
  }
}
