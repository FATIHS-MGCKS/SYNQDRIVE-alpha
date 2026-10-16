#!/usr/bin/env ts-node
/**
 * EXP021 — read-only extract of sealed POSITION fetch metadata for one trip/WI.
 * Run from /tmp; do not write into release tree.
 */
import * as fs from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { buildDiV0HistoricalPositionQuery } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-query';
import { DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.types';

const ORG = process.env.EXP021_FETCH_ORG ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TRIP = process.env.EXP021_FETCH_TRIP_ID ?? '533b2bf8-fa07-4f0b-bc40-d540447a1542';
const WI = process.env.EXP021_FETCH_WORK_ITEM_ID ?? '339856c6-a4af-43f8-aecd-07baacec3d22';
const VEHICLE = process.env.EXP021_FETCH_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';

async function main(): Promise<void> {
  const out = process.env.EXP021_FETCH_OUT ?? '/tmp/exp021-position-fetch-metadata.json';
  const analysisSha = process.env.EXP021_ANALYSIS_GIT_SHA ?? 'workspace';
  const prisma = new PrismaClient();
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
        const wiRows = await tx.$queryRaw<
          Array<{
            id: string;
            trip_id: string;
            vehicle_id: string;
            completed_at: Date;
            pinned_snapshot_hash: string;
            boundary_fingerprint: string;
            source_family: string;
            combined_input_identity: string;
          }>
        >`
          SELECT id, trip_id, vehicle_id, completed_at, pinned_snapshot_hash, boundary_fingerprint,
                 source_family::text AS source_family, combined_input_identity
          FROM di_v0_s4_work_items
          WHERE organization_id = ${ORG} AND id = ${WI} AND trip_id = ${TRIP}
          LIMIT 1`;
        const wi = wiRows[0];
        if (!wi) throw new Error('WORK_ITEM_NOT_FOUND');

        const linkRows = await tx.$queryRaw<
          Array<{
            provider: string;
            source_type: string;
            is_active: boolean;
            dimo_vehicle_id: string | null;
            activated_at: Date;
          }>
        >`
          SELECT provider, source_type, is_active, dimo_vehicle_id, activated_at
          FROM vehicle_data_source_links
          WHERE vehicle_id = ${VEHICLE}::uuid
          ORDER BY activated_at DESC`;
        const snapRows = await tx.$queryRaw<
          Array<{
            snapshot_hash: string;
            acquisition_window_start: Date;
            acquisition_window_end: Date;
            channel_manifest: unknown;
            payload_gzip: Buffer;
            created_at: Date;
          }>
        >`
          SELECT snapshot_hash, acquisition_window_start, acquisition_window_end, channel_manifest,
                 payload_gzip, created_at
          FROM di_v0_s4_evidence_snapshots
          WHERE organization_id = ${ORG} AND trip_id = ${TRIP} AND snapshot_hash = ${wi.pinned_snapshot_hash}
          LIMIT 1`;
        const snap = snapRows[0];
        if (!snap) throw new Error('SNAPSHOT_NOT_FOUND');

        const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
          {
            organization_id: ORG,
            vehicle_id: wi.vehicle_id,
            trip_id: wi.trip_id,
            boundary_fingerprint: wi.boundary_fingerprint,
            acquisition_window_start: snap.acquisition_window_start,
            acquisition_window_end: snap.acquisition_window_end,
            channel_manifest: snap.channel_manifest,
            payload_gzip: snap.payload_gzip,
            uncompressed_bytes: 0,
          },
          {
            organizationId: ORG,
            vehicleId: wi.vehicle_id,
            tripId: wi.trip_id,
            boundaryFingerprint: wi.boundary_fingerprint,
            snapshotHash: wi.pinned_snapshot_hash,
            sourceFamily: wi.source_family as DiV0S4SourceFamily,
          },
        );
        if (!verified.ok) {
          return { ok: false, verifyError: verified.code, wi, snapshotHash: wi.pinned_snapshot_hash };
        }

        const posEntry = verified.parsed.channelManifest.find((c) => c.channel === 'POSITION');
        const payload = verified.parsed.channelPayloads.POSITION;
        if (!payload || posEntry?.formatVersion !== DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1) {
          return { ok: false, reason: 'POSITION_CHANNEL_MISSING', posEntry, wi };
        }

        const material = parseDiV0PositionSnapshot(payload);
        const canonicalQuery = buildDiV0HistoricalPositionQuery(material.dimoTokenId, material.window);
        let rowAbsent = 0;
        let present = 0;
        let signalNull = 0;
        let providerRowsMatched = 0;
        for (const b of material.buckets) {
          providerRowsMatched += b.providerRowCount;
          if (b.availability === 'ROW_ABSENT') rowAbsent += 1;
          else if (b.availability === 'SIGNAL_NULL') signalNull += 1;
          else present += 1;
        }

        return {
          ok: true,
          analysisGitSha: analysisSha,
          identities: {
            organizationId: ORG,
            tripId: TRIP,
            workItemId: WI,
            vehicleId: VEHICLE,
            pinnedSnapshotHash: wi.pinned_snapshot_hash,
            s4SourceFamily: wi.source_family,
            combinedInputIdentity: wi.combined_input_identity,
          },
          timing: {
            workItemCompletedAtUtc: wi.completed_at.toISOString(),
            evidenceSnapshotCreatedAtUtc: snap.created_at.toISOString(),
            note: 'Original fetch instant is not stored separately; completed_at is upper-bound proxy only.',
          },
          vehicleDataSourceLinksNow: linkRows,
          vehicleDataSourceLinksAtFetch: 'UNKNOWN (not stored in pin; current rows are post-hoc)',
          s4EvidenceAcquisitionWindow: {
            startInclusiveUtc: snap.acquisition_window_start.toISOString(),
            endExclusiveUtc: snap.acquisition_window_end.toISOString(),
            gridBoundary: 'FROM_INCLUSIVE_TO_EXCLUSIVE',
          },
          positionChannelSealed: {
            adapterVersion: DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
            evidenceFormat: DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
            dimoTokenId: material.dimoTokenId,
            sourceFamily: material.sourceFamily,
            sourceFamilyPolicyVersion: material.sourceFamilyPolicyVersion,
            providerSignalsNull: material.providerSignalsNull,
            requestedWindow: {
              fromUtc: material.window.fromUtc,
              toUtc: material.window.toUtc,
              expectedBucketCount: material.window.expectedBucketCount,
            },
            rejectedProviderRowCount: material.rejectedProviderRows.length,
            rejectedProviderRowReasons: material.rejectedProviderRows.reduce<Record<string, number>>((acc, r) => {
              acc[r.reason] = (acc[r.reason] ?? 0) + 1;
              return acc;
            }, {}),
            bucketAvailabilityTotals: { rowAbsent, signalNull, presentOrOther: present },
            providerRowsMatchedToBuckets: providerRowsMatched,
            completenessIdentity: {
              expectedBuckets: material.buckets.length,
              sumProviderRowCount: providerRowsMatched,
              note:
                'S3A uses one GraphQL signals() query without cursor pagination; sparse provider rows expand to ROW_ABSENT per grid index.',
            },
          },
          canonicalQueryShape: canonicalQuery,
          paginationPolicy: {
            s3aPages: 1,
            cursorFieldsInQuery: 'none',
            dimoExecutorRetries: 'owned by DimoTelemetryService / provider gateway (not re-fetched in S3A)',
          },
          implementationBinding: {
            acquisitionEntry: 'acquireDiV0HistoricalPositions',
            s4Executor: 'DiV0S4cExecutor.execute → runDimo(POST_TRIP_ENRICHMENT)',
            transport: 'DimoTelemetryDiV0HistoricalPositionTransport',
            sealedAdapterInPin: DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
            repositoryGitShaAtFetch: 'UNKNOWN (not in POSITION snapshot)',
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    fs.writeFileSync(out, JSON.stringify({ kind: 'EXP021_POSITION_FETCH_METADATA_V1', ...report }, null, 2));
    console.log(JSON.stringify({ ok: true, out, reportOk: (report as { ok?: boolean }).ok }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
