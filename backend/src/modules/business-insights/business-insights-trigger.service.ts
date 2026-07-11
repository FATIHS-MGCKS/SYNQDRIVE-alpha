import { Injectable, Logger } from '@nestjs/common';
import { NotificationEvaluationService } from '@modules/notifications/runtime/notification-evaluation.service';

/**
 * Event-driven notification evaluation triggers — persistent BullMQ debounce (no in-memory timers).
 */
@Injectable()
export class BusinessInsightsTriggerService {
  private readonly logger = new Logger(BusinessInsightsTriggerService.name);

  constructor(private readonly evaluationService: NotificationEvaluationService) {}

  async onBookingChange(organizationId: string, eventDetail?: string) {
    await this.requestDebouncedRerun(organizationId, `event_booking_change${eventDetail ? `:${eventDetail}` : ''}`);
  }

  async onVehicleChange(organizationId: string, eventDetail?: string) {
    await this.requestDebouncedRerun(organizationId, `event_vehicle_change${eventDetail ? `:${eventDetail}` : ''}`);
  }

  async onStationChange(organizationId: string, eventDetail?: string) {
    await this.requestDebouncedRerun(organizationId, `event_station_change${eventDetail ? `:${eventDetail}` : ''}`);
  }

  async requestDebouncedRerun(organizationId: string, eventSource: string) {
    this.logger.debug(`Scheduling debounced notification evaluation for org ${organizationId}: ${eventSource}`);
    await this.evaluationService.scheduleDebouncedEvaluation(organizationId, eventSource);
  }
}
