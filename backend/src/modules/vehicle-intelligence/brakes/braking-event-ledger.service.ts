import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BehaviorEventCategory,
  BrakingEventPrimarySource,
  DrivingEventSource,
  DrivingEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BRAKING_EVENT_LEDGER_SOURCE_VERSION,
  correlateBrakingCandidates,
  DEFAULT_BRAKING_DEDUPE_WINDOW_MS,
  mapDimoIntakeToCandidate,
  mapDrivingEventToCandidate,
  mapTripBehaviorEventToCandidate,
  summarizeCanonicalBrakingIncidents,
  type BrakingEventCandidate,
  type BrakingEventCanonicalTripSummary,
  type BrakingEventLedgerIncident,
} from './braking-event-ledger.domain';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';

export type BrakingLedgerReconcileAction = 'created' | 'updated' | 'unchanged';

export interface BrakingLedgerReconcileResult {
  tripId: string;
  vehicleId: string;
  organizationId: string;
  incidents: number;
  created: number;
  updated: number;
  unchanged: number;
  invalidated: number;
  summary: BrakingEventCanonicalTripSummary;
}

export interface BrakingLedgerBackfillPlanItem {
  tripId: string;
  vehicleId: string;
  organizationId: string;
  action: 'reconcile';
  reason: string;
}

@Injectable()
export class BrakingEventLedgerService {
  private readonly logger = new Logger(BrakingEventLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
  ) {}

  async loadCandidatesForTrip(tripId: string): Promise<BrakingEventCandidate[]> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
      },
    });
    if (!trip?.vehicle?.organizationId) return [];

    const organizationId = trip.vehicle.organizationId;
    const candidates: BrakingEventCandidate[] = [];

    const drivingEvents = await this.prisma.drivingEvent.findMany({
      where: {
        tripId,
        eventType: {
          in: [DrivingEventType.HARSH_BRAKING, DrivingEventType.EXTREME_BRAKING],
        },
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tripId: true,
        eventType: true,
        recordedAt: true,
        severity: true,
        speedKmh: true,
        metadataJson: true,
        source: true,
      },
    });

    for (const row of drivingEvents) {
      if (row.source !== DrivingEventSource.TELEMETRY_EVENTS) continue;
      const mapped = mapDrivingEventToCandidate({
        id: row.id,
        organizationId: row.organizationId ?? organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        eventType: row.eventType,
        recordedAt: row.recordedAt,
        severity: row.severity,
        speedKmh: row.speedKmh,
        metadataJson: (row.metadataJson ?? null) as Record<string, unknown> | null,
      });
      if (mapped) candidates.push(mapped);
    }

    const behaviorEvents = await this.prisma.tripBehaviorEvent.findMany({
      where: {
        tripId,
        OR: [
          { eventCategory: BehaviorEventCategory.BRAKING },
          { eventCategory: BehaviorEventCategory.ABUSE, eventType: 'FULL_BRAKING' },
        ],
      },
      select: {
        id: true,
        vehicleId: true,
        tripId: true,
        eventCategory: true,
        eventType: true,
        classification: true,
        startedAt: true,
        startSpeedKmh: true,
        endSpeedKmh: true,
        peakValue: true,
      },
    });

    for (const row of behaviorEvents) {
      const mapped = mapTripBehaviorEventToCandidate({
        id: row.id,
        organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        eventCategory: row.eventCategory,
        eventType: row.eventType,
        classification: row.classification,
        startedAt: row.startedAt,
        startSpeedKmh: row.startSpeedKmh,
        endSpeedKmh: row.endSpeedKmh,
        peakValue: row.peakValue,
        confidence: null,
      });
      if (mapped) candidates.push(mapped);
    }

    const intakeRows = await this.prisma.dimoBrakingEventIntake.findMany({
      where: {
        tripId,
        eventType: {
          in: [DrivingEventType.HARSH_BRAKING, DrivingEventType.EXTREME_BRAKING],
        },
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tripId: true,
        eventType: true,
        eventTimestamp: true,
        severity: true,
        providerEventId: true,
      },
    });

    for (const row of intakeRows) {
      const mapped = mapDimoIntakeToCandidate({
        id: row.id,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        eventType: row.eventType,
        eventTimestamp: row.eventTimestamp,
        severity: row.severity,
        providerEventId: row.providerEventId,
      });
      if (mapped) candidates.push(mapped);
    }

    return candidates;
  }

  async reconcileTrip(
    tripId: string,
    options?: { dedupeWindowMs?: number; expectedOrganizationId?: string },
  ): Promise<BrakingLedgerReconcileResult | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    if (!trip?.vehicle?.organizationId) {
      this.logger.warn(`Braking ledger reconcile skipped — trip ${tripId} missing org scope`);
      return null;
    }

    if (
      options?.expectedOrganizationId &&
      options.expectedOrganizationId !== trip.vehicle.organizationId
    ) {
      this.logger.warn(
        `Braking ledger reconcile cross-tenant skip trip=${tripId} org=${options.expectedOrganizationId}`,
      );
      return null;
    }

    const dedupeWindowMs = options?.dedupeWindowMs ?? DEFAULT_BRAKING_DEDUPE_WINDOW_MS;
    const candidates = await this.loadCandidatesForTrip(tripId);
    const incidents = correlateBrakingCandidates(candidates, dedupeWindowMs);
    const summary = summarizeCanonicalBrakingIncidents(incidents);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const activeFingerprints = new Set<string>();

    for (const incident of incidents) {
      const action = await this.upsertIncident(incident, dedupeWindowMs);
      activeFingerprints.add(incident.sourceFingerprint);
      if (action === 'created') {
        created += 1;
        this.observability?.recordEventIntake({ source: 'ledger', outcome: 'created' });
      } else if (action === 'updated') {
        updated += 1;
        this.observability?.recordEventIntake({ source: 'ledger', outcome: 'created' });
      } else {
        unchanged += 1;
        this.observability?.recordEventIntake({ source: 'ledger', outcome: 'duplicate' });
      }
    }

    const invalidated = await this.invalidateStaleTripRows(tripId, activeFingerprints);

    this.logger.debug(
      `Braking ledger reconcile trip ${tripId}: incidents=${incidents.length} ` +
        `created=${created} updated=${updated} unchanged=${unchanged} invalidated=${invalidated}`,
    );

    this.observability?.recordReconciliation({
      action: 'ledger_reconcile',
      result: `created:${created},updated:${updated},unchanged:${unchanged}`,
    });

    return {
      tripId,
      vehicleId: trip.vehicleId,
      organizationId: trip.vehicle.organizationId,
      incidents: incidents.length,
      created,
      updated,
      unchanged,
      invalidated,
      summary: { ...summary, tripId, vehicleId: trip.vehicleId, organizationId: trip.vehicle.organizationId },
    };
  }

  async getCanonicalSummaryForTrip(
    tripId: string,
  ): Promise<BrakingEventCanonicalTripSummary | null> {
    const rows = await this.prisma.brakingEventLedger.findMany({
      where: { tripId, invalidatedAt: null },
      orderBy: { occurredAt: 'asc' },
      select: {
        organizationId: true,
        vehicleId: true,
        tripId: true,
        occurredAt: true,
        canonicalType: true,
        severity: true,
        primarySource: true,
        providerEventId: true,
        confidence: true,
        peakDecelerationMs2: true,
        startSpeedKmh: true,
        correlatedSourceIds: true,
      },
    });

    if (rows.length === 0) return null;

    const incidents: BrakingEventLedgerIncident[] = rows.map((row, index) => {
      const winner: BrakingEventCandidate = {
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        tripId: row.tripId,
        occurredAt: row.occurredAt,
        canonicalType: row.canonicalType,
        severity: row.severity,
        primarySource: row.primarySource,
        providerEventId: row.providerEventId,
        confidence: row.confidence,
        peakDecelerationMs2: row.peakDecelerationMs2,
        startSpeedKmh: row.startSpeedKmh,
        correlatedSourceIds: Array.isArray(row.correlatedSourceIds)
          ? (row.correlatedSourceIds as BrakingEventCandidate['correlatedSourceIds'])
          : [],
      };
      return {
        incidentKey: `persisted-${index}`,
        sourceFingerprint: `persisted-${index}`,
        winner,
        correlated: [winner],
      };
    });

    return summarizeCanonicalBrakingIncidents(incidents);
  }

  async planBackfill(input: {
    organizationId?: string;
    vehicleId?: string;
    limit?: number;
  }): Promise<BrakingLedgerBackfillPlanItem[]> {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        endTime: { not: null },
        ...(input.organizationId
          ? { vehicle: { organizationId: input.organizationId } }
          : {}),
        ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
      },
      orderBy: { endTime: 'desc' },
      take: input.limit ?? 500,
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
        _count: {
          select: {
            events: true,
            behaviorEvents: true,
          },
        },
      },
    });

    const plan: BrakingLedgerBackfillPlanItem[] = [];
    for (const trip of trips) {
      const orgId = trip.vehicle.organizationId;
      if (!orgId) continue;
      const hasSources = trip._count.events > 0 || trip._count.behaviorEvents > 0;
      if (!hasSources) continue;

      const existing = await this.prisma.brakingEventLedger.count({
        where: { tripId: trip.id, invalidatedAt: null },
      });
      if (existing > 0) continue;

      plan.push({
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        organizationId: orgId,
        action: 'reconcile',
        reason: 'missing_ledger_rows_with_source_events',
      });
    }

    return plan;
  }

  private async upsertIncident(
    incident: BrakingEventLedgerIncident,
    dedupeWindowMs: number,
  ): Promise<BrakingLedgerReconcileAction> {
    const w = incident.winner;
    const existing = await this.prisma.brakingEventLedger.findUnique({
      where: {
        organizationId_sourceFingerprint: {
          organizationId: w.organizationId,
          sourceFingerprint: incident.sourceFingerprint,
        },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        correlatedSourceIds: true,
        canonicalType: true,
        primarySource: true,
      },
    });

    const correlatedSourceIds = w.correlatedSourceIds as unknown as Prisma.InputJsonValue;

    if (!existing) {
      await this.prisma.brakingEventLedger.create({
        data: {
          organizationId: w.organizationId,
          vehicleId: w.vehicleId,
          tripId: w.tripId,
          occurredAt: w.occurredAt,
          canonicalType: w.canonicalType,
          severity: w.severity,
          primarySource: w.primarySource,
          providerEventId: w.providerEventId,
          sourceFingerprint: incident.sourceFingerprint,
          correlatedSourceIds,
          confidence: w.confidence,
          dedupeWindowMs,
          peakDecelerationMs2: w.peakDecelerationMs2,
          startSpeedKmh: w.startSpeedKmh,
        },
      });
      return 'created';
    }

    const samePayload =
      existing.canonicalType === w.canonicalType &&
      existing.primarySource === w.primarySource &&
      JSON.stringify(existing.correlatedSourceIds) === JSON.stringify(w.correlatedSourceIds);

    if (samePayload) return 'unchanged';

    await this.prisma.brakingEventLedger.update({
      where: { id: existing.id },
      data: {
        occurredAt: w.occurredAt,
        canonicalType: w.canonicalType,
        severity: w.severity,
        primarySource: w.primarySource,
        providerEventId: w.providerEventId,
        correlatedSourceIds,
        confidence: w.confidence,
        peakDecelerationMs2: w.peakDecelerationMs2,
        startSpeedKmh: w.startSpeedKmh,
        invalidatedAt: null,
      },
    });
    return 'updated';
  }

  private async invalidateStaleTripRows(
    tripId: string,
    activeFingerprints: Set<string>,
  ): Promise<number> {
    const rows = await this.prisma.brakingEventLedger.findMany({
      where: { tripId, invalidatedAt: null },
      select: { id: true, sourceFingerprint: true },
    });

    const staleIds = rows
      .filter((row) => !activeFingerprints.has(row.sourceFingerprint))
      .map((row) => row.id);

    if (staleIds.length === 0) return 0;

    const result = await this.prisma.brakingEventLedger.updateMany({
      where: { id: { in: staleIds } },
      data: { invalidatedAt: new Date() },
    });
    return result.count;
  }
}
