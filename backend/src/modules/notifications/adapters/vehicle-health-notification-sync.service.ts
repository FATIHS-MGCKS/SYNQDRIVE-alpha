import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import { ServiceComplianceService } from '@modules/vehicle-intelligence/service-compliance/service-compliance.service';
import { TireHealthAlertService } from '@modules/vehicle-intelligence/tires/tire-health-alert.service';
import { BrakeHealthAlertService } from '@modules/vehicle-intelligence/brakes/brake-health-alert.service';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import { projectVehicleHealthWarnings } from './rental-health-notification.projector';
import { projectServiceComplianceOverdueNotifications } from './service-compliance-notification.projector';

const VEHICLE_BATCH_SIZE = 10;

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

    const allHealthSources = [];
    const allComplianceSources = [];

    for (let i = 0; i < vehicles.length; i += VEHICLE_BATCH_SIZE) {
      const slice = vehicles.slice(i, i + VEHICLE_BATCH_SIZE);
      const batchResults = await Promise.all(
        slice.map((vehicle) => this.projectVehicle(organizationId, vehicle)),
      );
      for (const result of batchResults) {
        allHealthSources.push(...result.health);
        allComplianceSources.push(...result.compliance);
      }
    }

    await this.notificationIngest.syncVehicleHealthWarnings(
      organizationId,
      runId,
      allHealthSources,
    );
    await this.notificationIngest.syncServiceComplianceWarnings(
      organizationId,
      runId,
      allComplianceSources,
    );
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
  ) {
    const label =
      vehicle.licensePlate?.trim() ||
      `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
      vehicle.id;

    try {
      const complianceFields = {
        lastTuvDate: vehicle.lastTuvDate,
        nextTuvDate: vehicle.nextTuvDate,
        lastBokraftDate: vehicle.lastBokraftDate,
        nextBokraftDate: vehicle.nextBokraftDate,
      };

      const [health, activeDtcs, complianceEval] = await Promise.all([
        this.rentalHealth.getVehicleHealth(organizationId, vehicle.id),
        this.dtcService.findActive(vehicle.id),
        this.serviceCompliance.evaluateCompliance(vehicle.id, complianceFields),
      ]);

      const rentalSources = projectVehicleHealthWarnings(
        vehicle.id,
        label,
        health,
        activeDtcs,
      );
      const tireSources = this.tireHealthAlerts
        ? await this.tireHealthAlerts.listOpenAlertNotificationSources({
            organizationId,
            vehicleId: vehicle.id,
            label,
          })
        : [];
      const brakeSources = this.brakeHealthAlerts
        ? await this.brakeHealthAlerts.listOpenAlertNotificationSources({
            organizationId,
            vehicleId: vehicle.id,
            label,
          })
        : [];

      const complianceSources = projectServiceComplianceOverdueNotifications(
        vehicle,
        complianceEval,
      );

      return {
        health: [...rentalSources, ...tireSources, ...brakeSources],
        compliance: complianceSources,
      };
    } catch (err) {
      this.logger.warn(
        `Fleet readiness notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
      );
      return { health: [], compliance: [] };
    }
  }
}
