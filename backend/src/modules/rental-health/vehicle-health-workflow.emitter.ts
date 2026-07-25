import { Injectable, Logger, Optional } from '@nestjs/common';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import type { HealthState, VehicleHealth } from './rental-health.types';

const WORKFLOW_SEVERITY_BANDS: HealthState[] = ['warning', 'critical'];

@Injectable()
export class VehicleHealthWorkflowEmitter {
  private readonly logger = new Logger(VehicleHealthWorkflowEmitter.name);
  private readonly lastBandByVehicle = new Map<string, HealthState | 'good'>();

  constructor(
    @Optional() private readonly workflowEvents?: WorkflowEventService,
  ) {}

  /**
   * Emit `vehicle.health.warning` / `vehicle.health.critical` on rental-health
   * severity transitions (VW-F-034). Fire-and-forget; does not block health reads.
   */
  emitIfRentalHealthBandChanged(health: VehicleHealth): void {
    if (!this.workflowEvents) return;

    const band = this.resolveWorkflowBand(health.overall_state);
    const cacheKey = `${health.organization_id}:${health.vehicle_id}`;
    const previous = this.lastBandByVehicle.get(cacheKey) ?? 'good';

    if (band === previous) return;
    this.lastBandByVehicle.set(cacheKey, band);

    if (band === 'good') return;

    const eventType =
      band === 'critical' ? 'vehicle.health.critical' : 'vehicle.health.warning';

    this.workflowEvents.scheduleEmit({
      organizationId: health.organization_id,
      type: eventType,
      entityType: 'vehicle',
      entityId: health.vehicle_id,
      idempotencyKey: `${eventType}:${health.vehicle_id}:${health.evaluated_at ?? health.generated_at}`,
      payload: {
        vehicleId: health.vehicle_id,
        overallState: health.overall_state,
        rentalBlocked: health.rental_blocked,
        rentalReadiness: health.rental_readiness,
        blockingReasons: health.blocking_reasons,
        projectionVersion: health.projection_version,
      },
    });

    this.logger.debug(
      `Workflow health event ${eventType} for vehicle ${health.vehicle_id} (${previous} → ${band})`,
    );
  }

  private resolveWorkflowBand(state: HealthState): HealthState | 'good' {
    if (WORKFLOW_SEVERITY_BANDS.includes(state)) return state;
    return 'good';
  }
}
