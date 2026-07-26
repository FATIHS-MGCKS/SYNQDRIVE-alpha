import { Injectable, OnModuleInit } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { bindNotificationCandidateRejectionMetric } from './notification-candidate.observability';

@Injectable()
export class NotificationCandidateMetricsBinder implements OnModuleInit {
  constructor(private readonly tripMetrics: TripMetricsService) {}

  onModuleInit(): void {
    bindNotificationCandidateRejectionMetric(({ field }) => {
      this.tripMetrics.notificationCandidateRejected.inc({ field });
    });
  }
}
