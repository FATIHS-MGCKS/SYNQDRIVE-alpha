import { Injectable, Logger } from '@nestjs/common';
import type { HmNormalizedTelemetryDto } from './dto/high-mobility.dto';

/**
 * Phase 2: HighMobilityTelemetryRoutingService
 *
 * Routing scaffolding for normalized HM full telemetry.
 * In Phase 2, this service:
 *   - Accepts normalized telemetry DTOs from the ingestion service
 *   - Provides explicit adapter points for downstream routing
 *   - Logs routing decisions
 *   - Does NOT yet activate final business modules (trips, abuse, health scoring)
 *
 * Each TODO-marked adapter point is a clear integration seam for later phases.
 *
 * DOMAIN RULE: No existing calculation pipelines are wired here.
 * All downstream integration requires explicit product activation in a future phase.
 */
@Injectable()
export class HighMobilityTelemetryRoutingService {
  private readonly logger = new Logger(HighMobilityTelemetryRoutingService.name);

  /**
   * Route a normalized HM telemetry message to appropriate downstream staging areas.
   * Called by MqttConsumerService after successful ingestion.
   */
  async route(normalized: HmNormalizedTelemetryDto): Promise<void> {
    this.logger.debug(
      `HM telemetry routing: messageId=${normalized.messageId} VIN=${normalized.vin}`,
    );

    // ── Routing decision matrix ────────────────────────────────────────────
    // Each block is an explicitly guarded adapter point.
    // Activation is intentionally deferred to later phases.

    // ADAPTER POINT 1: Vehicle location / snapshot
    // Route location + speed signals to a vehicle snapshot staging area.
    // TODO Phase 3: wire to vehicle snapshot or last-known-position service
    if (normalized.latitude !== null && normalized.longitude !== null) {
      this.routeLocationSignal(normalized);
    }

    // ADAPTER POINT 2: Odometer
    // TODO Phase 3: wire to mileage tracking / odometer update
    if (normalized.odometerId !== null) {
      this.routeOdometerSignal(normalized);
    }

    // ADAPTER POINT 3: Ignition / trip boundary
    // TODO Phase 3: wire to trip boundary detection (separate from DIMO segment architecture)
    if (normalized.ignitionOn !== null) {
      this.routeIgnitionSignal(normalized);
    }

    // ADAPTER POINT 4: Battery voltage
    // TODO Phase 3: surface as informational OEM signal in battery module (display-grade only)
    if (normalized.batteryVoltage !== null) {
      this.routeBatterySignal(normalized);
    }

    // ADAPTER POINT 5: Engine coolant temperature
    // TODO Phase 3: surface as informational OEM signal in health module (display-grade only)
    if (normalized.engineCoolantTemperatureC !== null) {
      this.routeCoolantSignal(normalized);
    }

    // ADAPTER POINT 6: Fuel level
    // TODO Phase 3: wire to fuel/energy tracking
    if (normalized.fuelLevelPercent !== null) {
      this.routeFuelSignal(normalized);
    }

    // ADAPTER POINT 7: Raw diagnostic signals (DTC, dashboard lights, etc.)
    // TODO Phase 3: parse and route to diagnostics/health module (display-grade only)
    if (Object.keys(normalized.rawSignals).length > 0) {
      this.routeRawDiagnosticSignals(normalized);
    }
  }

  // ── Adapter point stubs ────────────────────────────────────────────────────
  // Each method is a clean seam for later activation. Logs intent only in Phase 2.

  private routeLocationSignal(dto: HmNormalizedTelemetryDto): void {
    // Phase 2: log only
    this.logger.debug(
      `[ROUTING:LOCATION] VIN=${dto.vin} lat=${dto.latitude} lng=${dto.longitude} speed=${dto.speedKmh ?? 'n/a'}`,
    );
    // TODO Phase 3: vehicleSnapshotService.upsertLastKnownPosition({ vin, lat, lng, speed, ts })
  }

  private routeOdometerSignal(dto: HmNormalizedTelemetryDto): void {
    this.logger.debug(`[ROUTING:ODOMETER] VIN=${dto.vin} odo=${dto.odometerId}`);
    // TODO Phase 3: vehicleMileageService.updateFromHm({ vin, odometerId, ts })
  }

  private routeIgnitionSignal(dto: HmNormalizedTelemetryDto): void {
    this.logger.debug(`[ROUTING:IGNITION] VIN=${dto.vin} ignition=${dto.ignitionOn}`);
    // TODO Phase 3: hmTripBoundaryService.handleIgnitionEvent({ vin, on: dto.ignitionOn, ts })
    // NOTE: Do not use DIMO Segment architecture for HM_ONLY trips — separate boundary detection
  }

  private routeBatterySignal(dto: HmNormalizedTelemetryDto): void {
    this.logger.debug(`[ROUTING:BATTERY] VIN=${dto.vin} battV=${dto.batteryVoltage}`);
    // TODO Phase 3: hmHealthSignalStager.stageBatteryVoltage({ vin, voltage, ts }) — display-grade only
  }

  private routeCoolantSignal(dto: HmNormalizedTelemetryDto): void {
    this.logger.debug(`[ROUTING:COOLANT] VIN=${dto.vin} temp=${dto.engineCoolantTemperatureC}°C`);
    // TODO Phase 3: hmHealthSignalStager.stageCoolantTemp({ vin, tempC, ts }) — display-grade only
  }

  private routeFuelSignal(dto: HmNormalizedTelemetryDto): void {
    this.logger.debug(`[ROUTING:FUEL] VIN=${dto.vin} level=${dto.fuelLevelPercent}%`);
    // TODO Phase 3: vehicleFuelService.updateFromHm({ vin, pct, ts })
  }

  private routeRawDiagnosticSignals(dto: HmNormalizedTelemetryDto): void {
    this.logger.debug(`[ROUTING:DIAGNOSTICS] VIN=${dto.vin} signals=${Object.keys(dto.rawSignals).length}`);
    // TODO Phase 3: hmDiagnosticStager.stageRawSignals({ vin, signals, ts }) — display-grade only
  }
}
