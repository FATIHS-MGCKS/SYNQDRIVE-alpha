import { Injectable, Optional } from '@nestjs/common';
import { TelemetryIngestionEnforcementMetricsService } from '../telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.metrics';
import { TripLocationEnforcementMetricsService } from '../trip-location-enforcement/trip-location-enforcement.metrics';
import { VehicleHealthEnforcementMetricsService } from '../vehicle-health-enforcement/vehicle-health-enforcement.metrics';
import { DrivingBehaviorEnforcementMetricsService } from '../driving-behavior-enforcement/driving-behavior-enforcement.metrics';
import { NotificationEnforcementMetricsService } from '../notification-enforcement/notification-enforcement.metrics';
import { ExternalAccessEnforcementMetricsService } from '../external-access-enforcement/external-access-enforcement.metrics';
import {
  ENFORCEMENT_COVERAGE_DOMAIN,
  ENFORCEMENT_COVERAGE_RUNTIME_HEALTH,
} from './enforcement-coverage-registry.constants';
import type { EnforcementCoverageDomain, EnforcementCoverageRuntimeHealth } from './enforcement-coverage-registry.constants';

/** Aggregate-only runtime health — no PII, only counter snapshots. */
@Injectable()
export class EnforcementCoverageHealthService {
  constructor(
    @Optional() private readonly telemetryMetrics?: TelemetryIngestionEnforcementMetricsService,
    @Optional() private readonly tripMetrics?: TripLocationEnforcementMetricsService,
    @Optional() private readonly healthMetrics?: VehicleHealthEnforcementMetricsService,
    @Optional() private readonly behaviorMetrics?: DrivingBehaviorEnforcementMetricsService,
    @Optional() private readonly notificationMetrics?: NotificationEnforcementMetricsService,
    @Optional() private readonly externalMetrics?: ExternalAccessEnforcementMetricsService,
  ) {}

  resolveDomainHealth(domain: EnforcementCoverageDomain): EnforcementCoverageRuntimeHealth {
    const snapshot = this.snapshotForDomain(domain);
    if (!snapshot) {
      return ENFORCEMENT_COVERAGE_RUNTIME_HEALTH.UNKNOWN;
    }

    const hasResolverError = Object.entries(snapshot).some(
      ([key, count]) => key.includes('resolver_error') && count > 0,
    );
    if (hasResolverError) {
      return ENFORCEMENT_COVERAGE_RUNTIME_HEALTH.ERROR;
    }

    const hasEnforcementError = Object.entries(snapshot).some(
      ([key, count]) =>
        (key.includes('enforcement_error') || key.includes('tenant_mismatch')) && count > 0,
    );
    if (hasEnforcementError) {
      return ENFORCEMENT_COVERAGE_RUNTIME_HEALTH.DEGRADED;
    }

    return ENFORCEMENT_COVERAGE_RUNTIME_HEALTH.OK;
  }

  snapshotForDomain(domain: EnforcementCoverageDomain): Record<string, number> | null {
    switch (domain) {
      case ENFORCEMENT_COVERAGE_DOMAIN.TELEMETRY_INGEST:
        return this.telemetryMetrics?.snapshot() ?? null;
      case ENFORCEMENT_COVERAGE_DOMAIN.TRIP_LOCATION:
        return this.tripMetrics?.snapshot() ?? null;
      case ENFORCEMENT_COVERAGE_DOMAIN.VEHICLE_HEALTH:
        return this.healthMetrics?.snapshot() ?? null;
      case ENFORCEMENT_COVERAGE_DOMAIN.DRIVING_BEHAVIOR:
        return this.behaviorMetrics?.snapshot() ?? null;
      case ENFORCEMENT_COVERAGE_DOMAIN.NOTIFICATION:
        return this.notificationMetrics?.snapshot() ?? null;
      case ENFORCEMENT_COVERAGE_DOMAIN.EXTERNAL_ACCESS:
        return this.externalMetrics?.snapshot() ?? null;
      default:
        return null;
    }
  }

  metricsSnapshot(): Record<string, Record<string, number>> {
    return {
      telemetry: this.telemetryMetrics?.snapshot() ?? {},
      tripLocation: this.tripMetrics?.snapshot() ?? {},
      vehicleHealth: this.healthMetrics?.snapshot() ?? {},
      drivingBehavior: this.behaviorMetrics?.snapshot() ?? {},
      notification: this.notificationMetrics?.snapshot() ?? {},
      externalAccess: this.externalMetrics?.snapshot() ?? {},
    };
  }
}
