import { Injectable, Logger } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import {
  buildLvRestWindowIdempotencyKey,
  LvRestWindowEventType,
} from '../battery-v2-domain';
import { BatteryMeasurementSessionRepository } from '../battery-measurement-session.repository';
import {
  buildLvRestWindowPolicyContext,
  isPlausibleLvVoltage,
} from './lv-rest-window.policy';
import { LvRestWindowStateMachineService } from './lv-rest-window.service';
import type { LvRestWindowSignalContext } from './lv-rest-window.types';

/** Tolerated forward clock skew for a finalized trip's end anchor. */
const ANCHOR_FUTURE_SKEW_MS = 5 * 60_000;

export interface EnsureLvRestWindowForFinalizedTripInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  /**
   * When supplied (durable job payload), must equal authoritative trip.endTime.
   * Persisted trip.endTime remains the anchor authority either way.
   */
  payloadTripEndedAt?: string;
  /** Injection point for deterministic tests only. */
  now?: Date;
}

export type EnsureLvRestWindowOutcome =
  | 'opened'
  | 'already_exists'
  | 'not_eligible'
  | 'skipped';

export interface EnsureLvRestWindowForFinalizedTripResult {
  outcome: EnsureLvRestWindowOutcome;
  reason: string;
  windowId?: string;
  sessionId?: string;
  anchorAt?: Date;
  promotedToResting?: boolean;
}

/**
 * Canonical, idempotent LV_REST_WINDOW session opener for authoritative
 * finalized trips (Battery V2 Stage 1 liveness fix).
 *
 * Why this exists: session opening previously depended on a
 * BATTERY_OBSERVATION_CLASSIFY cycle running AFTER Trip Detection finalized
 * the trip. When the provider observation stream stalls exactly at trip end
 * (production race: last observation at the anchor, RESTING transition ~30s
 * later, no further observation), no session was ever created and every REST
 * temporal target for that anchor was silently lost.
 *
 * This operation derives everything from canonical, already-persisted state:
 * - trip identity/anchor from the finalized `vehicle_trips` row
 *   (TripDecisionEngine remains the only trip lifecycle authority),
 * - rest context from `vehicle_trip_detection_states` + `vehicle_latest_states`
 *   (read-only; never mutated here),
 * - session creation/target scheduling from the existing LV rest FSM
 *   (`LvRestWindowStateMachineService.processEvent`) — the single session
 *   creation implementation. No parallel create path is introduced.
 *
 * Idempotency and concurrency:
 * - window identity is deterministic: `lv-rest:{vehicleId}:{trip.endTime ms}`,
 * - the session table enforces `@@unique(vehicleId, idempotencyKey)`;
 *   concurrent callers converge on the same row via
 *   `BatteryMeasurementSessionRepository.createIdempotent` (P2002 → fetch),
 * - the FSM treats a repeated TRIP_ENDED for the same open window as
 *   `duplicate_trip_end_event` (no-op),
 * - REST target scheduling reuses the deterministic
 *   `battery-rest:{vehicleId}:{windowId}:{60m|6h}` job identities, so replays
 *   and races cannot produce duplicate targets.
 *
 * Provenance rules preserved:
 * - the anchor is the authoritative trip end; never receivedAt or
 *   provider_fetched_at,
 * - no observation is fabricated: momentary telemetry context (speed,
 *   ignition, engine, voltage, charging flags) is only used when the latest
 *   real provider observation (`source_timestamp`) is at/after the anchor.
 *   A pre-anchor frozen observation describes the trip, not the rest period,
 *   so it is treated as unknown context — REST target evaluation later
 *   adjudicates quality from real in-window observations (MISSED when none
 *   exist),
 * - `provider_fetched_at`/receivedAt never rejuvenate observations here.
 */
@Injectable()
export class LvRestWindowSessionArmingService {
  private readonly logger = new Logger(LvRestWindowSessionArmingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fsm: LvRestWindowStateMachineService,
    private readonly sessions: BatteryMeasurementSessionRepository,
    private readonly policyProfiles: BatteryPolicyProfileService,
  ) {}

  async ensureLvRestWindowForFinalizedTrip(
    input: EnsureLvRestWindowForFinalizedTripInput,
  ): Promise<EnsureLvRestWindowForFinalizedTripResult> {
    if (!isBatteryV2RestShadowEnabled()) {
      return { outcome: 'skipped', reason: 'rest_shadow_disabled' };
    }

    const now = input.now ?? new Date();

    // Tenant + vehicle scoped lookup of the authoritative finalized trip.
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: input.tripId,
        vehicleId: input.vehicleId,
        vehicle: { organizationId: input.organizationId },
      },
      select: { id: true, tripStatus: true, endTime: true },
    });

    if (!trip) {
      return { outcome: 'not_eligible', reason: 'trip_not_found' };
    }
    if (trip.tripStatus !== TripStatus.COMPLETED || !trip.endTime) {
      return { outcome: 'not_eligible', reason: 'trip_not_finalized' };
    }

    const anchorAt = trip.endTime;
    const windowId = buildLvRestWindowIdempotencyKey(input.vehicleId, anchorAt);

    if (input.payloadTripEndedAt != null) {
      const payloadAnchor = new Date(input.payloadTripEndedAt);
      if (
        Number.isNaN(payloadAnchor.getTime()) ||
        payloadAnchor.getTime() !== anchorAt.getTime()
      ) {
        return {
          outcome: 'not_eligible',
          reason: 'payload_anchor_mismatch',
          windowId,
          anchorAt,
        };
      }
    }

    const policy = buildLvRestWindowPolicyContext(
      await this.policyProfiles.resolveForVehicle(input.vehicleId),
    );
    if (!policy.restWindowSupported) {
      return {
        outcome: 'not_eligible',
        reason: 'lv_rest_not_supported_for_profile',
        windowId,
        anchorAt,
      };
    }

    if (anchorAt.getTime() > now.getTime() + ANCHOR_FUTURE_SKEW_MS) {
      return {
        outcome: 'not_eligible',
        reason: 'anchor_in_future',
        windowId,
        anchorAt,
      };
    }
    // Beyond the max rest window the session would be immediately EXPIRED by
    // FSM policy; opening it late would only create churn without evidence.
    if (now.getTime() - anchorAt.getTime() > policy.maxWindowMs) {
      return {
        outcome: 'not_eligible',
        reason: 'anchor_outside_max_window',
        windowId,
        anchorAt,
      };
    }

    // Replay fast-path: any session (open or terminal) for this canonical
    // anchor means the window was already adjudicated once — never recreate.
    const existing = await this.sessions.findLvRestWindowByIdempotencyKey(
      input.organizationId,
      input.vehicleId,
      windowId,
    );
    if (existing) {
      await this.sessions.repairCanonicalTripBindingIfNeeded(existing, {
        organizationId: input.organizationId,
        tripId: trip.id,
        startedAt: anchorAt,
        sourceEntityType: 'trip',
        sourceEntityId: trip.id,
      });
      return {
        outcome: 'already_exists',
        reason: 'session_exists',
        windowId,
        sessionId: existing.id,
        anchorAt,
      };
    }

    const signal = await this.fsm.buildSignalFromLatestState(input.vehicleId, {
      lastActivityAt: anchorAt,
      tripEndAt: anchorAt,
      tripId: trip.id,
    });
    if (!signal) {
      // The vehicle has never produced a provider observation — there is no
      // real telemetry identity to attach a rest window to.
      return {
        outcome: 'not_eligible',
        reason: 'missing_latest_state',
        windowId,
        anchorAt,
      };
    }

    // A provider observation at/after the anchor is real evidence about the
    // rest period and may gate the candidate (wake voltage / charging at trip
    // end are legitimate policy rejections). A frozen pre-anchor observation
    // describes the trip itself — treating it as current context would let
    // stale mid-trip telemetry (speed, ignition, alternator voltage) veto a
    // canonical RESTING fact, which is exactly the class of liveness failure
    // this service removes. Unknown context stays unknown; REST target
    // evaluation adjudicates quality from real in-window observations.
    const hasAtOrPostAnchorObservation =
      signal.providerObservedAt != null &&
      signal.providerObservedAt.getTime() >= anchorAt.getTime();

    const gateSignal: LvRestWindowSignalContext = hasAtOrPostAnchorObservation
      ? signal
      : {
          ...signal,
          speedKmh: null,
          ignitionOn: null,
          engineRunning: null,
          lvVoltage: null,
          isLvCharging: false,
          isHvCharging: false,
        };

    const eventAt = new Date(
      Math.max(anchorAt.getTime(), signal.observedAt.getTime()),
    );

    const transition = await this.fsm.processEvent(
      input.organizationId,
      input.vehicleId,
      {
        type: LvRestWindowEventType.TRIP_ENDED,
        at: eventAt,
        signal: gateSignal,
      },
    );

    if (transition.reason === 'duplicate_trip_end_event') {
      const session = await this.sessions.findLvRestWindowByIdempotencyKey(
        input.organizationId,
        input.vehicleId,
        windowId,
      );
      if (session) {
        await this.sessions.repairCanonicalTripBindingIfNeeded(session, {
          organizationId: input.organizationId,
          tripId: trip.id,
          startedAt: anchorAt,
          sourceEntityType: 'trip',
          sourceEntityId: trip.id,
        });
      }
      return {
        outcome: 'already_exists',
        reason: transition.reason,
        windowId,
        sessionId: session?.id,
        anchorAt,
      };
    }

    if (!transition.changed || transition.reason !== 'opened_candidate') {
      return {
        outcome: 'not_eligible',
        reason: transition.reason,
        windowId,
        anchorAt,
      };
    }

    // Converge with the observation-bridge behavior: when the latest real
    // observation is at/after the anchor and carries a plausible LV voltage,
    // attempt the CANDIDATE → RESTING promotion right away so REST targets are
    // scheduled without waiting for another observation. The FSM validates the
    // snapshot (retroactive/wake/charging/max-resting) — no policy is bypassed.
    let promotedToResting = false;
    if (hasAtOrPostAnchorObservation && isPlausibleLvVoltage(signal.lvVoltage)) {
      const snapshotTransition = await this.fsm.processEvent(
        input.organizationId,
        input.vehicleId,
        {
          type: LvRestWindowEventType.REST_SNAPSHOT,
          at: signal.observedAt,
          signal,
        },
      );
      promotedToResting =
        snapshotTransition.reason === 'candidate_promoted_to_resting';
    }

    const session = await this.sessions.findLvRestWindowByIdempotencyKey(
      input.organizationId,
      input.vehicleId,
      windowId,
    );

    this.logger.log(
      `LV rest window armed from finalized trip: vehicle=${input.vehicleId} trip=${trip.id} ` +
        `anchor=${anchorAt.toISOString()} window=${windowId} promoted=${promotedToResting}`,
    );

    return {
      outcome: 'opened',
      reason: 'opened_candidate',
      windowId,
      sessionId: session?.id,
      anchorAt,
      promotedToResting,
    };
  }
}
