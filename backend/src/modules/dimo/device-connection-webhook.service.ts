/**
 * SynqDrive — DIMO Device Connection Webhook Intake
 *
 * Handles OBD plug/unplug state changes delivered via DIMO Vehicle Triggers
 * (signal: obdIsPluggedIn). These are connectivity/tamper evidence events —
 * NOT misuse cases and NOT engine-context anchors.
 *
 * Idempotent layers:
 *   1. State-change gating — ignore repeated webhooks with unchanged plug state
 *   2. Time-bucket dedup — collapse burst duplicates within 30s
 */
import { Injectable, Logger } from '@nestjs/common';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

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
    const gate = await this.evaluateStateChangeGate(input.vehicle.id, input.pluggedIn);
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
    const gate = await this.evaluateStateChangeGate(input.vehicle.id, pluggedIn);
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
  ): Promise<{ persist: boolean; reason?: string }> {
    const lastEvent = await this.prisma.dimoDeviceConnectionEvent.findFirst({
      where: { vehicleId, provider: 'DIMO' },
      orderBy: { observedAt: 'desc' },
      select: { eventType: true },
    });
    return shouldPersistObdPlugStateChange(incomingPluggedIn, lastEvent?.eventType);
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
}
