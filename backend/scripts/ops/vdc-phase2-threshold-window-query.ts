/**
 * Read-only: threshold-window poll/alert forensics for KS MX 2024.
 * Usage on VPS:
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register \
 *     scripts/ops/vdc-phase2-threshold-window-query.ts
 */
import * as fs from 'fs';
import { DimoPollJobType, PrismaClient } from '@prisma/client';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const p = new PrismaClient();
  const VID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
  const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

  const cycles = [
    { id: 'C1', cross: '2026-09-09T05:02:15.000Z', next: '2026-09-09T05:04:58.000Z' },
    { id: 'C2', cross: '2026-09-10T05:04:58.000Z', next: '2026-09-10T05:07:59.000Z' },
    { id: 'C3', cross: '2026-09-11T05:07:59.000Z', next: '2026-09-11T05:10:42.000Z' },
  ];

  const out: Record<string, unknown> = { cycles: [] as unknown[] };

  for (const c of cycles) {
    const cross = new Date(c.cross);
    const next = new Date(c.next);
    const polls = await p.dimoPollLog.findMany({
      where: {
        vehicleId: VID,
        jobType: DimoPollJobType.SNAPSHOT,
        startedAt: { gte: cross, lt: next },
      },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, status: true, finishedAt: true },
    });
    const notifs = await p.notification.findMany({
      where: {
        organizationId: ORG,
        entityId: VID,
        OR: [
          { firstSeenAt: { gte: cross, lt: next } },
          { lastSeenAt: { gte: cross, lt: next } },
        ],
        eventType: { in: ['TELEMETRY_SOFT_OFFLINE', 'TELEMETRY_OFFLINE'] },
      },
      select: {
        eventType: true,
        firstSeenAt: true,
        lastSeenAt: true,
        status: true,
        conditionCode: true,
        resolvedAt: true,
      },
    });
    const occurrences = await p.notificationOccurrence.findMany({
      where: {
        organizationId: ORG,
        occurredAt: { gte: cross, lt: next },
        notification: {
          entityId: VID,
          eventType: { in: ['TELEMETRY_SOFT_OFFLINE', 'TELEMETRY_OFFLINE'] },
        },
      },
      select: { occurredAt: true, notification: { select: { eventType: true } } },
    });
    (out.cycles as unknown[]).push({
      cycle: c.id,
      window: {
        thresholdCrossing: c.cross,
        nextStrictAdvance: c.next,
        durationSec: Math.round((next.getTime() - cross.getTime()) / 1000),
      },
      polls: {
        count: polls.length,
        success: polls.filter((x) => x.status === 'SUCCESS').length,
        failure: polls.filter((x) => x.status !== 'SUCCESS').length,
        timestamps: polls.map((x) => ({ at: x.startedAt.toISOString(), status: x.status })),
      },
      notifications: notifs,
      notificationOccurrences: occurrences.map((o) => ({
        eventType: o.notification.eventType,
        occurredAt: o.occurredAt.toISOString(),
      })),
    });
  }

  out.augSoftOffline = await p.notification.findMany({
    where: { organizationId: ORG, entityId: VID, eventType: 'TELEMETRY_SOFT_OFFLINE' },
    select: { firstSeenAt: true, lastSeenAt: true, status: true, resolvedAt: true },
  });

  out.inbox = await p.deviceConnectionWebhookInbox.findMany({
    where: { vehicleId: VID },
    orderBy: { receivedAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      observedAt: true,
      receivedAt: true,
      processedAt: true,
      processingStatus: true,
      processingAttempts: true,
      nextRetryAt: true,
      lastErrorCode: true,
      createdAt: true,
      domainEventId: true,
    },
  });

  out.canonicalEvents = await p.dimoDeviceConnectionEvent.findMany({
    where: { vehicleId: VID },
    orderBy: { observedAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      observedAt: true,
      receivedAt: true,
      processedAt: true,
      createdAt: true,
      dedupBucket: true,
    },
  });

  out.episodes = await p.deviceConnectionEpisode.findMany({
    where: { vehicleId: VID },
    select: {
      id: true,
      openedAt: true,
      resolvedAt: true,
      openedByEventId: true,
      resolutionMethod: true,
      resolutionEvidenceAt: true,
      status: true,
      openedReason: true,
    },
  });

  out.lifecycleAudits = await p.deviceConnectionEpisodeLifecycleAudit.findMany({
    where: { vehicleId: VID },
    orderBy: { id: 'asc' },
    take: 20,
  }).catch(() => []);

  console.log(JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
