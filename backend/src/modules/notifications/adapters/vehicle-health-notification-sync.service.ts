import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import { TireHealthAlertService } from '@modules/vehicle-intelligence/tires/tire-health-alert.service';
import { BrakeHealthAlertService } from '@modules/vehicle-intelligence/brakes/brake-health-alert.service';
import { DashboardWarningLightsService } from '@modules/vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.service';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import { projectVehicleHealthWarnings } from './rental-health-notification.projector';
import { projectServiceComplianceOverdueNotifications } from './service-compliance-notification.projector';
import { projectVehicleAlertNotifications } from './vehicle-alerts-notification.projector';
import type { VehicleHealthAdapterSource } from './notification-adapter.types';
import type { ServiceComplianceAdapterSource } from './notification-adapter.types';
import type { VehicleAlertsNotificationAdapterSource } from './notification-adapter.types';

const VEHICLE_BATCH_SIZE = 10;

type ProjectVehicleResult = {
  health: VehicleHealthAdapterSource[];
  compliance: ServiceComplianceAdapterSource[];
  vehicleAlerts: VehicleAlertsNotificationAdapterSource[];
};

/**
 * Canonical fleet-readiness notification sync — independent of Business Insights policy.
 *
 * Triggered by {@link NotificationEvaluationService} on every evaluation run
 * (scheduled, debounced, boot). Does not require DashboardInsight publication.
 */
@Injectable()
export class VehicleHealthNotificationSyncService {
  private readonly logger = new Logger(VehicleHealthNotificationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationIngest: NotificationProducerIngestService,
    private readonly rentalHealth: RentalHealthService,
    private readonly dtcService: DtcService,
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly dashboardWarningLights: DashboardWarningLightsService,
    @Optional() private readonly tireHealthAlerts?: TireHealthAlertService,
    @Optional() private readonly brakeHealthAlerts?: BrakeHealthAlertService,
  ) {}

  async syncForOrganization(organizationId: string, runId: string): Promise<void> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        homeStationId: true,
        mileageKm: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
      },
    });

    const allHealthSources: VehicleHealthAdapterSource[] = [];
    const allComplianceSources: ServiceComplianceAdapterSource[] = [];
    const allVehicleAlertSources: VehicleAlertsNotificationAdapterSource[] = [];

    for (let i = 0; i < vehicles.length; i += VEHICLE_BATCH_SIZE) {
      const slice = vehicles.slice(i, i + VEHICLE_BATCH_SIZE);
      const batchResults = await Promise.all(
        slice.map((vehicle) => this.projectVehicle(organizationId, vehicle)),
      );
      for (const result of batchResults) {
        allHealthSources.push(...result.health);
        allComplianceSources.push(...result.compliance);
        allVehicleAlertSources.push(...result.vehicleAlerts);
      }
    }

    const failures: Error[] = [];

    try {
      await this.notificationIngest.syncVehicleHealthWarnings(
        organizationId,
        runId,
        allHealthSources,
      );
    } catch (err) {
      failures.push(err instanceof Error ? err : new Error(String(err)));
    }

    try {
      await this.notificationIngest.syncServiceComplianceWarnings(
        organizationId,
        runId,
        allComplianceSources,
      );
    } catch (err) {
      failures.push(err instanceof Error ? err : new Error(String(err)));
    }

    try {
      await this.notificationIngest.syncVehicleAlertsWarnings(
        organizationId,
        runId,
        allVehicleAlertSources,
      );
    } catch (err) {
      failures.push(err instanceof Error ? err : new Error(String(err)));
    }

    if (failures.length > 0) {
      throw failures[0];
    }
  }

  private async projectVehicle(
    organizationId: string,
    vehicle: {
      id: string;
      licensePlate: string | null;
      make: string;
      model: string;
      homeStationId: string | null;
      mileageKm: number | null;
      lastServiceDate: Date | null;
      lastServiceOdometerKm: number | null;
      serviceIntervalManufacturerKm: number | null;
      serviceIntervalManufacturerMonths: number | null;
      lastTuvDate: Date | null;
      nextTuvDate: Date | null;
      lastBokraftDate: Date | null;
      nextBokraftDate: Date | null;
    },
  ): Promise<ProjectVehicleResult> {
    const label =
      vehicle.licensePlate?.trim() ||
      `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
      vehicle.id;

    const health: VehicleHealthAdapterSource[] = [];
    const compliance: ServiceComplianceAdapterSource[] = [];

    const complianceFields = {
      lastTuvDate: vehicle.lastTuvDate,
      nextTuvDate: vehicle.nextTuvDate,
      lastBokraftDate: vehicle.lastBokraftDate,
      nextBokraftDate: vehicle.nextBokraftDate,
    };

    let rentalHealth: VehicleHealth | null = null;
    try {
      rentalHealth = await this.rentalHealth.getVehicleHealth(organizationId, vehicle.id);
    } catch (err) {
      this.logger.warn(
        `Rental health notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
      );
    }

    let activeDtcs: Awaited<ReturnType<DtcService['findActive']>> = [];
    try {
      activeDtcs = await this.dtcService.findActive(vehicle.id);
    } catch (err) {
      this.logger.warn(
        `DTC notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
      );
    }

    try {
      const healthForProjection =
        rentalHealth ?? this.emptyVehicleHealthForDtcOnly(organizationId, vehicle.id);
      health.push(
        ...projectVehicleHealthWarnings(vehicle.id, label, healthForProjection, activeDtcs),
      );
    } catch (err) {
      this.logger.warn(
        `Vehicle health warning projection failed for ${vehicle.id}: ${(err as Error).message}`,
      );
    }

    if (this.tireHealthAlerts) {
      try {
        health.push(
          ...(await this.tireHealthAlerts.listOpenAlertNotificationSources({
            organizationId,
            vehicleId: vehicle.id,
            label,
          })),
        );
      } catch (err) {
        this.logger.warn(
          `Tire health notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
        );
      }
    }

    if (this.brakeHealthAlerts) {
      try {
        health.push(
          ...(await this.brakeHealthAlerts.listOpenAlertNotificationSources({
            organizationId,
            vehicleId: vehicle.id,
            label,
          })),
        );
      } catch (err) {
        this.logger.warn(
          `Brake health notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
        );
      }
    }

    try {
      const complianceEval = await this.serviceCompliance.evaluateCompliance(
        vehicle.id,
        complianceFields,
      );
      compliance.push(
        ...projectServiceComplianceOverdueNotifications(vehicle, complianceEval),
      );
    } catch (err) {
      this.logger.warn(
        `Service compliance notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
      );
    }

    const vehicleAlerts = await this.projectVehicleAlerts(vehicle.id, label);

    return { health, compliance, vehicleAlerts };
  }

  private emptyVehicleHealthForDtcOnly(
    organizationId: string,
    vehicleId: string,
  ): VehicleHealth {
    const module = {
      state: 'good' as const,
      reason: '',
      last_updated_at: null,
      data_stale: false,
      pipeline_available: false,
    };
    return {
      vehicle_id: vehicleId,
      organization_id: organizationId,
      overall_state: 'unknown',
      rental_blocked: null,
      rental_readiness: 'unevaluable',
      availability: 'partial',
      modules: {
        battery: module,
        tires: module,
        brakes: module,
        error_codes: module,
        service_compliance: module,
        complaints: module,
        vehicle_alerts: module,
      },
      blocking_reasons: [],
      generated_at: new Date().toISOString(),
    };
  }

  private async projectVehicleAlerts(
    vehicleId: string,
    label: string,
  ): Promise<VehicleAlertsNotificationAdapterSource[]> {
    try {
      const envelope = await this.dashboardWarningLights.getDashboardWarningLights(vehicleId);
      return projectVehicleAlertNotifications(vehicleId, label, envelope);
    } catch (err) {
      this.logger.warn(
        `Vehicle alerts notification projection failed for ${vehicleId}: ${(err as Error).message}`,
      );
      return projectVehicleAlertNotifications(vehicleId, label, null, { loadFailed: true });
    }
  }
}
