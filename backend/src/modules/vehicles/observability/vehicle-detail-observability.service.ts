import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import {
  classifyVehicleDetailProviderError,
  redactVehicleDetailLogContext,
  type VehicleDetailLogContext,
} from './vehicle-detail-log.util';
import { VehicleDetailMetricsService } from './vehicle-detail-metrics.service';
import {
  normalizeVehicleDetailErrorCode,
  recordVehicleDetailCacheOutcome,
  recordVehicleDetailLiveGpsSource,
  recordVehicleDetailPermissionDenied,
  recordVehicleDetailProviderOutcome,
  recordVehicleDetailRequest,
  recordVehicleDetailStatusMutation,
  type VehicleDetailCacheOutcome,
  type VehicleDetailEndpoint,
  type VehicleDetailLiveGpsSource,
  type VehicleDetailRequestResult,
  type VehicleDetailStatusField,
} from './vehicle-detail-prometheus.metrics';

/**
 * Structured vehicle detail observability — no PII labels (no vehicleId/orgId/coordinates).
 */
@Injectable()
export class VehicleDetailObservabilityService {
  private readonly logger = new Logger(VehicleDetailObservabilityService.name);

  constructor(
    @Optional() private readonly metricsService: VehicleDetailMetricsService | null,
  ) {}

  private get metrics(): VehicleDetailMetricsService | null {
    return this.metricsService;
  }

  observeRequest(
    endpoint: VehicleDetailEndpoint,
    startedAtMs: number,
    err: unknown | null,
  ): void {
    const durationSeconds = (performance.now() - startedAtMs) / 1000;
    const result = this.classifyRequestResult(err);
    if (!this.metrics) return;
    recordVehicleDetailRequest(this.metrics, { endpoint, result }, durationSeconds);
    if (result === 'forbidden') {
      recordVehicleDetailPermissionDenied(this.metrics, { endpoint });
    }
  }

  observeProviderOutcome(
    endpoint: Extract<VehicleDetailEndpoint, 'telemetry' | 'live_gps'>,
    outcome: 'success' | 'cache_fallback' | 'provider_error' | 'timeout' | 'rate_limited',
    err?: unknown,
  ): void {
    if (!this.metrics) return;
    recordVehicleDetailProviderOutcome(this.metrics, { endpoint, outcome });
    if (outcome !== 'success' && err) {
      this.logWarn('vehicle_detail.provider_outcome', {
        endpoint,
        outcome,
        errorClass: classifyVehicleDetailProviderError(err),
      });
    }
  }

  recordLiveGpsSource(source: VehicleDetailLiveGpsSource): void {
    if (!this.metrics) return;
    recordVehicleDetailLiveGpsSource(this.metrics, source);
  }

  recordCacheOutcome(outcome: VehicleDetailCacheOutcome): void {
    if (!this.metrics) return;
    recordVehicleDetailCacheOutcome(this.metrics, outcome);
  }

  recordStatusMutation(field: VehicleDetailStatusField, err: unknown | null): void {
    if (!this.metrics) return;
    const result =
      err == null
        ? 'success'
        : err instanceof ForbiddenException
          ? 'forbidden'
          : 'error';
    recordVehicleDetailStatusMutation(this.metrics, { field, result });
    if (err) {
      this.logWarn('vehicle_detail.status_mutation_failed', {
        field,
        errorCode: normalizeVehicleDetailErrorCode(err),
      });
    }
  }

  recordDeviceConnectionError(err: unknown): void {
    this.logWarn('vehicle_detail.device_connection_failed', {
      errorClass: classifyVehicleDetailProviderError(err),
    });
  }

  logWarn(event: string, context: VehicleDetailLogContext = {}): void {
    this.logger.warn({
      msg: event,
      ...redactVehicleDetailLogContext(context),
    });
  }

  private classifyRequestResult(err: unknown | null): VehicleDetailRequestResult {
    if (!err) return 'success';
    if (err instanceof NotFoundException) return 'not_found';
    if (err instanceof ForbiddenException) return 'forbidden';
    return 'error';
  }
}
