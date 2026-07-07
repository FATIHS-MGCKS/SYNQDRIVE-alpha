/**
 * SynqDrive — DIMO Device Connection Webhook Intake
 *
 * Handles OBD plug/unplug state changes delivered via DIMO Vehicle Triggers
 * (signal: obdIsPluggedIn). These are connectivity/tamper evidence events —
 * NOT misuse cases and NOT engine-context anchors.
 *
 * Idempotent layers:
 *   1. State-change gating — ignore repeated webhooks with unchanged plug state
 *   2. Plug impulse filter — ignore short plug-in after unplug unless DIMO confirms reconnect
 *   3. Time-bucket dedup — collapse burst duplicates within 30s
 */
import { Injectable, Logger } from '@nestjs/common';
import { DimoConnectionStatus, DimoDeviceConnectionEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  shouldIgnorePlugImpulseAfterUnplug,
  connectivityIndicatesPlugged,
  type DeviceConnectionConnectivityAnchor,
} from './device-connection-read-model';

export const DEVICE_CONNECTION_DEDUP_WINDOW_MS = 30_000;

export type DeviceConnectionIntakeOutcome =
  | 'created'
  | 'duplicate'
  | 'ignored';

export type ObdPlugState = 'plugged' | 'unplugged' | 'unknown';

export interface DeviceConnectionVehicle {
  id: string;
  organizationId: string;
}

export interface IngestDeviceConnectionInput {
  vehicle: DeviceConnectionVehicle;
  tokenId: number;
  pluggedIn: boolean;
  observedAt: Date;
  rawPayload: unknown;
}

/** Derive current plug state from the most recent persisted connection event. */
export function inferObdPlugStateFromLastEvent(
  lastEventType: DimoDeviceConnectionEventType | null | undefined,
): ObdPlugState {
  if (!lastEventType) return 'unknown';
  if (lastEventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN) return 'plugged';
  return 'unplugged';
}

/**
 * Whether an incoming webhook represents a real state transition worth persisting.
 *
 * - First observation with plugged=true → baseline only (device was already connected).
 * - First observation with plugged=false → real unplug event.
 * - Repeated same-state webhooks → ignored (DIMO may fire every ~26s while plugged).
 */
export function shouldPersistObdPlugStateChange(
  incomingPluggedIn: boolean,
  lastEventType: DimoDeviceConnectionEventType | null | undefined,
): { persist: boolean; reason?: string } {
  const current = inferObdPlugStateFromLastEvent(lastEventType);
  const incoming = incomingPluggedIn ? 'plugged' : 'unplugged';

  if (current === 'unknown') {
    if (incomingPluggedIn) {
      return { persist: false, reason: 'baseline_already_plugged' };
    }
    return { persist: true };
  }

  if (current === incoming) {
    return { persist: false, reason: 'no_state_change' };
  }

  return { persist: true };
}

@Injectable()
export class DeviceConnectionWebhookService {
  private readonly logger = new Logger(DeviceConnectionWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** True when the webhook signal/metric is the OBD plug state. */
  static isObdPluggedSignal(signalName: unknown, metricName?: unknown): boolean {
    const candidates = [signalName, metricName];
    for (const raw of candidates) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const normalized = raw.trim().toLowerCase();
      const base = normalized.includes('.') ? normalized.split('.').pop()! : normalized;
      if (base === 'obdispluggedin') return true;
    }
    return false;
  }

  /** Parse a boolean plug state from a webhook value field. */
  static parsePluggedValue(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    return null;
  }

  static dedupBucket(observedAt: Date): bigint {
    return BigInt(Math.floor(observedAt.getTime() / DEVICE_CONNECTION_DEDUP_WINDOW_MS));
  }

  static eventTypeForPlugState(pluggedIn: boolean): DimoDeviceConnectionEventType {
    return pluggedIn
      ? DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN
      : DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED;
  }

  static pluggedInFromEventType(eventType: DimoDeviceConnectionEventType): boolean {
    return eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN;
  }

  /**
   * Persist an OBD plug/unplug webhook event only on real state transitions.
   */
  async ingestObdPlugStateChange(
    input: IngestDeviceConnectionInput,
  ): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string; eventType?: DimoDeviceConnectionEventType }> {
    const eventType = DeviceConnectionWebhookService.eventTypeForPlugState(input.pluggedIn);
    const gate = await this.evaluateStateChangeGate(
      input.vehicle.id,
      input.pluggedIn,
      input.observedAt,
    );
    if (!gate.persist) {
      this.logger.debug(
        `Device connection ignored for vehicle ${input.vehicle.id}: ${gate.reason} pluggedIn=${input.pluggedIn}`,
      );
      return { outcome: 'ignored', eventType };
    }

    return this.persistDeviceConnectionEvent({
      ...input,
      eventType,
    });
  }

  /** Persist a device connection event with an explicit event type (console-specific webhooks). */
  async ingestExplicitDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string; eventType?: DimoDeviceConnectionEventType }> {
    const pluggedIn = DeviceConnectionWebhookService.pluggedInFromEventType(input.eventType);
    const gate = await this.evaluateStateChangeGate(
      input.vehicle.id,
      pluggedIn,
      input.observedAt,
    );
    if (!gate.persist) {
      this.logger.debug(
        `Device connection ignored for vehicle ${input.vehicle.id}: ${gate.reason} eventType=${input.eventType}`,
      );
      return { outcome: 'ignored', eventType: input.eventType };
    }

    return this.persistDeviceConnectionEvent(input);
  }

  private async evaluateStateChangeGate(
    vehicleId: string,
    incomingPluggedIn: boolean,
    incomingObservedAt: Date,
  ): Promise<{ persist: boolean; reason?: string }> {
    const lastEvent = await this.prisma.dimoDeviceConnectionEvent.findFirst({
      where: { vehicleId, provider: 'DIMO' },
      orderBy: { observedAt: 'desc' },
      select: { eventType: true, observedAt: true },
    });
    const base = shouldPersistObdPlugStateChange(incomingPluggedIn, lastEvent?.eventType);
    if (!base.persist) return base;

    if (incomingPluggedIn) {
      const anchor = await this.loadConnectivityAnchor(vehicleId);
      const impulse = shouldIgnorePlugImpulseAfterUnplug(
        incomingPluggedIn,
        lastEvent,
        incomingObservedAt,
        anchor,
      );
      if (impulse.ignore) {
        return { persist: false, reason: impulse.reason };
      }
    }

    return base;
  }

  private async loadConnectivityAnchor(
    vehicleId: string,
  ): Promise<DeviceConnectionConnectivityAnchor | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        dimoVehicle: { select: { connectionStatus: true } },
        latestState: { select: { rawPayloadJson: true } },
      },
    });
    if (!vehicle) return null;

    const raw = vehicle.latestState?.rawPayloadJson as Record<string, unknown> | null;
    const conn = extractConnectivitySnapshot(raw ?? undefined);
    return {
      dimoConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
      obdIsPluggedIn: conn.obdIsPluggedIn,
    };
  }

  private async persistDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string; eventType?: DimoDeviceConnectionEventType }> {
    const { vehicle, tokenId, observedAt, rawPayload, eventType } = input;
    const dedupBucket = DeviceConnectionWebhookService.dedupBucket(observedAt);

    try {
      const row = await this.prisma.dimoDeviceConnectionEvent.upsert({
        where: {
          provider_vehicleId_eventType_dedupBucket: {
            provider: 'DIMO',
            vehicleId: vehicle.id,
            eventType,
            dedupBucket,
          },
        },
        create: {
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          tokenId,
          provider: 'DIMO',
          eventType,
          observedAt,
          dedupBucket,
          rawPayloadJson: rawPayload as object,
        },
        update: {},
        select: { id: true, createdAt: true, updatedAt: true },
      });

      const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
      if (!isNew) {
        return { outcome: 'duplicate', eventId: row.id, eventType };
      }

      this.logger.log(
        `Device connection event ${eventType} for vehicle ${vehicle.id} at ${observedAt.toISOString()}`,
      );
      return { outcome: 'created', eventId: row.id, eventType };
    } catch (err: unknown) {
      this.logger.warn(
        `Device connection intake failed for vehicle ${vehicle.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { outcome: 'ignored' };
    }
  }

  /**
   * When the DIMO "plugged in" webhook is disabled, recover reconnect evidence from
   * snapshot polling after a persisted unplug event (open unplug episode).
   */
  async maybeMaterializePlugInFromSnapshot(input: {
    vehicleId: string;
    tokenId: number;
    obdIsPluggedIn: boolean | null;
    dimoConnectionStatus: DimoConnectionStatus | null;
    observedAt: Date;
  }): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string }> {
    if (input.obdIsPluggedIn !== true) {
      return { outcome: 'ignored' };
    }

    const anchor: DeviceConnectionConnectivityAnchor = {
      dimoConnectionStatus: input.dimoConnectionStatus,
      obdIsPluggedIn: input.obdIsPluggedIn,
    };
    if (!connectivityIndicatesPlugged(anchor)) {
      return { outcome: 'ignored' };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) return { outcome: 'ignored' };

    const lastEvent = await this.prisma.dimoDeviceConnectionEvent.findFirst({
      where: { vehicleId: input.vehicleId, provider: 'DIMO' },
      orderBy: { observedAt: 'desc' },
      select: { eventType: true, observedAt: true },
    });

    if (lastEvent?.eventType !== DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED) {
      return { outcome: 'ignored' };
    }

    return this.persistDeviceConnectionEvent({
      vehicle,
      tokenId: input.tokenId,
      observedAt: input.observedAt,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN,
      rawPayload: {
        source: 'dimo_snapshot',
        obdIsPluggedIn: true,
        dimoConnectionStatus: input.dimoConnectionStatus,
        observedAt: input.observedAt.toISOString(),
      },
    });
  }
}
