import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import { DiV0S4ResearchS4ReadRepository } from '../s4-research-worker/di-v0-s4-research-s4-read.repository';
import { adaptMotionCoreShadowEvidenceFromParsedContainer } from './di-v0-motion-core-shadow-evidence.adapter';
import {
  buildMotionTripMapSamples,
  mapMotionTripMapEvents,
  mapMotionTripMapStops,
  stripMotionTripMapEventGeometry,
  stripMotionTripMapSamples,
  stripMotionTripMapStopGeometry,
  type MotionMapPositionRow,
} from './di-v0-motion-core-shadow-trip-map-read.mapper';
import type { DiV0MotionCoreShadowTripMapReadResponse } from './di-v0-motion-core-shadow-trip-map-read.types';
import { DiV0MotionCoreShadowRunRepository } from './di-v0-motion-core-shadow-run.repository';

const EMPTY_RESPONSE: DiV0MotionCoreShadowTripMapReadResponse = {
  status: 'NOT_AVAILABLE',
  previewLabel: 'S4 Motion · vorläufig',
  runId: null,
  workItemId: null,
  pinnedSnapshotHash: null,
  combinedInputIdentity: null,
  algorithmVersions: null,
  speedAuthority: null,
  computedAtUtc: null,
  geometrySource: 'NONE',
  geometryNote: null,
  samples: [],
  events: [],
  stopEpisodes: [],
  limitations: [],
  failureCode: null,
  snapshotBindingVerified: false,
  newerFailedRunId: null,
  newerFailedRunStatus: null,
};

@Injectable()
export class DiV0MotionCoreShadowTripMapReadService {
  private readonly runs: DiV0MotionCoreShadowRunRepository;
  private readonly s4Read: DiV0S4ResearchS4ReadRepository;

  constructor(private readonly prisma: PrismaService) {
    const client = prisma as unknown as PrismaClient;
    this.runs = new DiV0MotionCoreShadowRunRepository(client);
    this.s4Read = new DiV0S4ResearchS4ReadRepository(client);
  }

  async readForTrip(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    options?: { includeRepairAdminDetail?: boolean },
  ): Promise<DiV0MotionCoreShadowTripMapReadResponse> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicleId, vehicle: { organizationId } },
      select: { id: true },
    });
    if (!trip) {
      return { ...EMPTY_RESPONSE, failureCode: 'TRIP_NOT_FOUND' };
    }

    const latestAny = await this.runs.findLatestRunForTrip({ organizationId, vehicleId, tripId });
    const run = await this.runs.findLatestSucceededRunForTrip({ organizationId, vehicleId, tripId });

    if (!run) {
      const pending = await this.detectPendingOutbox(organizationId, vehicleId, tripId);
      if (pending) {
        return { ...EMPTY_RESPONSE, status: 'PENDING', failureCode: null };
      }
      if (latestAny && latestAny.shadowStatus !== 'SUCCEEDED') {
        return {
          ...EMPTY_RESPONSE,
          status: 'FAILED',
          runId: latestAny.id,
          workItemId: latestAny.workItemId,
          pinnedSnapshotHash: latestAny.pinnedSnapshotHash,
          combinedInputIdentity: latestAny.combinedInputIdentity,
          failureCode: latestAny.shadowStatus,
        };
      }
      return { ...EMPTY_RESPONSE };
    }

    const newerFailed =
      latestAny && latestAny.id !== run.id && latestAny.shadowStatus !== 'SUCCEEDED'
        ? { id: latestAny.id, status: latestAny.shadowStatus }
        : null;

    const payload = this.runs.decodePayload(run.payloadGzip);
    const positionLoad = await this.loadPositionGrid(
      organizationId,
      vehicleId,
      tripId,
      run.workItemId,
      run.pinnedSnapshotHash,
    );
    const positions = positionLoad.rows;
    let { samples, geometrySource, geometryNote } = buildMotionTripMapSamples(payload, positions, [], {
      includeRepairAdminDetail: options?.includeRepairAdminDetail,
    });
    let sampleByLabel = new Map(samples.map((s) => [s.bucketLabelUtc, s]));
    let events = mapMotionTripMapEvents(payload, sampleByLabel);
    let stopEpisodes = mapMotionTripMapStops(payload.stopEpisodes, sampleByLabel);

    const limitations = [
      ...payload.contract.sparse.limitations,
      ...run.summaryJson.limitations,
    ];
    if (!positionLoad.snapshotBindingVerified) {
      limitations.push('SNAPSHOT_BINDING_UNVERIFIED');
      samples = stripMotionTripMapSamples(samples);
      sampleByLabel = new Map(samples.map((s) => [s.bucketLabelUtc, s]));
      events = stripMotionTripMapEventGeometry(events);
      stopEpisodes = stripMotionTripMapStopGeometry(stopEpisodes);
      geometrySource = 'NONE';
      geometryNote = 'Positionsraster nicht verifiziert — keine Karten-Geometrie.';
    }

    const status =
      events.length === 0 && stopEpisodes.length === 0 && samples.every((s) => s.speedKmh == null)
        ? 'SUCCEEDED_EMPTY'
        : 'SUCCEEDED';

    return {
      status,
      previewLabel: 'S4 Motion · vorläufig',
      runId: run.id,
      workItemId: run.workItemId,
      pinnedSnapshotHash: run.pinnedSnapshotHash,
      combinedInputIdentity: run.combinedInputIdentity,
      algorithmVersions: {
        c4: payload.contract.algorithmVersions.c4,
        c5_1: payload.contract.algorithmVersions.c5_1,
        fsm: payload.contract.algorithmVersions.fsm,
        events: payload.contract.algorithmVersions.events,
        bundle: payload.contract.algorithmVersions.bundle,
      },
      speedAuthority: payload.contract.speedAuthority,
      computedAtUtc: payload.contract.timeSemantics.computedAtUtc,
      geometrySource,
      geometryNote,
      samples,
      events,
      stopEpisodes,
      limitations,
      failureCode: null,
      snapshotBindingVerified: positionLoad.snapshotBindingVerified,
      newerFailedRunId: newerFailed?.id ?? null,
      newerFailedRunStatus: newerFailed?.status ?? null,
    };
  }

  private async detectPendingOutbox(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      SELECT o.status
      FROM di_v0_motion_core_shadow_outbox_v1 o
      INNER JOIN di_v0_s4_work_items wi ON wi.id = o.work_item_id
      WHERE wi.organization_id = ${organizationId}
        AND wi.vehicle_id = ${vehicleId}
        AND wi.trip_id = ${tripId}
        AND o.status IN ('PENDING', 'PROCESSING', 'FAILED_RETRYABLE')
      LIMIT 1`;
    return rows.length > 0;
  }

  private async loadPositionGrid(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    workItemId: string,
    snapshotHash: string,
  ): Promise<{
    rows: MotionMapPositionRow[];
    snapshotBindingVerified: boolean;
  }> {
    const unverified = { rows: [] as MotionMapPositionRow[], snapshotBindingVerified: false };
    const wi = await this.s4Read.loadWorkItemForResearch({
      workItemId,
      organizationId,
      tripId,
    });
    if (!wi || wi.pinnedSnapshotHash !== snapshotHash) return unverified;
    const snapshot = await this.s4Read.loadEvidenceSnapshot({
      organizationId,
      tripId,
      snapshotHash,
    });
    if (!snapshot || snapshot.vehicleId !== vehicleId) return unverified;
    const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
      {
        organization_id: snapshot.organizationId,
        vehicle_id: snapshot.vehicleId,
        trip_id: snapshot.tripId,
        boundary_fingerprint: snapshot.boundaryFingerprint,
        acquisition_window_start: snapshot.acquisitionWindowStart,
        acquisition_window_end: snapshot.acquisitionWindowEnd,
        channel_manifest: snapshot.channelManifest,
        payload_gzip: snapshot.payloadGzip,
        uncompressed_bytes: snapshot.uncompressedBytes,
      },
      {
        organizationId,
        vehicleId,
        tripId,
        boundaryFingerprint: wi.boundaryFingerprint,
        snapshotHash,
        sourceFamily: wi.sourceFamily as DiV0S4SourceFamily,
      },
    );
    if (!verified.ok) return unverified;
    const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(
      verified.parsed,
      wi.sourceFamily as DiV0S4SourceFamily,
    );
    return {
      snapshotBindingVerified: true,
      rows: adapted.buckets.map((b) => ({
        bucketLabelUtc: b.bucketLabelUtc,
        latitude: b.latitude,
        longitude: b.longitude,
        availability: b.availability,
      })),
    };
  }
}
