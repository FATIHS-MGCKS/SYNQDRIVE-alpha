#!/usr/bin/env node
/**
 * Read-only Production export: parent chain by parentStateVersion + legacy reason reconstruction.
 */
const { writeFileSync } = require('fs');
const { PrismaClient } = require('@prisma/client');

const T0 = new Date('2026-09-18T09:33:25.000Z');
const T7 = new Date('2026-09-25T09:33:25.000Z');

function resolveParent(transitions, vehicleId, bindingKey, parentStateVersion) {
  if (parentStateVersion == null) return null;
  const parent = transitions.find(
    (t) =>
      t.vehicleId === vehicleId &&
      t.bindingKey === bindingKey &&
      t.appliedStateVersion === parentStateVersion,
  );
  if (!parent) return null;
  return {
    effectiveState: parent.effectiveState,
    evidenceObservedAt: parent.evidenceObservedAt.toISOString(),
    evidenceSource: parent.evidenceSource,
    evidenceReferenceId: parent.evidenceReferenceId,
    stateVersion: parentStateVersion,
  };
}

function episodeOpenAt(episodes, at) {
  const atMs = at.getTime();
  return (
    episodes.find((e) => {
      const openedMs = e.openedAt.getTime();
      const resolvedMs = e.resolvedAt ? e.resolvedAt.getTime() : null;
      return openedMs <= atMs && (e.status === 'OPEN' || (resolvedMs != null && resolvedMs > atMs));
    }) ?? null
  );
}

function inferLegacyWebhook(lastEvent, incomingAt, incomingPlugged) {
  if (!lastEvent) {
    return { legacyReasonSource: 'webhook_model', legacyReason: 'no_state_change', legacyAccepted: false };
  }
  const lastPlug =
    lastEvent.eventType === 'OBD_DEVICE_PLUGGED_IN'
      ? 'plugged'
      : lastEvent.eventType === 'OBD_DEVICE_UNPLUGGED'
        ? 'unplugged'
        : 'unknown';
  if (
    incomingPlugged &&
    lastPlug === 'plugged' &&
    lastEvent.observedAt.getTime() >= incomingAt.getTime()
  ) {
    return { legacyReasonSource: 'webhook_model', legacyReason: 'no_state_change', legacyAccepted: false };
  }
  if (incomingPlugged && lastPlug === 'plugged') {
    return { legacyReasonSource: 'webhook_model', legacyReason: 'no_state_change', legacyAccepted: false };
  }
  return { legacyReasonSource: 'webhook_model', legacyReason: 'no_state_change', legacyAccepted: false };
}

function inferLegacySnapshotPlug(episodeAtTime) {
  if (!episodeAtTime) {
    return { legacyReasonSource: 'episode_model', legacyReason: 'no_open_episode', legacyAccepted: false };
  }
  return { legacyReasonSource: 'episode_model', legacyReason: 'already_resolved', legacyAccepted: false };
}

async function main() {
  const prisma = new PrismaClient();
  const outPath = process.env.P25_T7_EXPORT_PATH ?? '/tmp/p25-t7-full-evidence-export.json';

  try {
    const shadows = await prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: {
        observedAt: { gte: T0, lte: T7 },
        classification: 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT',
        legacyDecision: 'reject',
        physicalDecision: 'accept',
      },
      orderBy: { observedAt: 'asc' },
    });

    const vehicleIds = [...new Set(shadows.map((s) => s.vehicleId))];
    const transitions = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: { createdAt: 'asc' },
    });

    const episodesByVehicle = new Map();
    for (const vid of vehicleIds) {
      const eps = await prisma.deviceConnectionEpisode.findMany({
        where: { vehicleId: vid, provider: 'DIMO' },
        orderBy: { openedAt: 'asc' },
      });
      episodesByVehicle.set(vid, eps);
    }

    const transitionByKey = new Map();
    for (const t of transitions) {
      transitionByKey.set(
        `${t.vehicleId}|${t.bindingKey}|${t.evidenceReferenceId}|${t.evidenceObservedAt.toISOString()}`,
        t,
      );
    }

    const legacyStats = {
      log_backed: 0,
      episode_model: 0,
      webhook_model: 0,
      pattern_assumed: 0,
    };
    let parentUnresolved = 0;
    const rows = [];

    for (const s of shadows) {
      const key = `${s.vehicleId}|${s.bindingKey}|${s.evidenceReferenceId}|${s.evidenceObservedAt?.toISOString() ?? ''}`;
      const t = transitionByKey.get(key);
      if (!t) continue;

      const parentEvidence = resolveParent(
        transitions,
        s.vehicleId,
        s.bindingKey ?? '',
        t.parentStateVersion,
      );
      if (!parentEvidence) parentUnresolved += 1;

      const observedAt = s.evidenceObservedAt ?? s.observedAt;
      let legacy = { legacyReasonSource: 'episode_model', legacyReason: null, legacyAccepted: false };
      let episodeReconstruction = null;

      if (t.evidenceSource === 'WEBHOOK' && t.candidateState === 'PLUGGED') {
        const lastEvent = await prisma.dimoDeviceConnectionEvent.findFirst({
          where: {
            vehicleId: s.vehicleId,
            provider: 'DIMO',
            observedAt: { lte: t.evidenceObservedAt },
          },
          orderBy: { observedAt: 'desc' },
        });
        legacy = inferLegacyWebhook(lastEvent, t.evidenceObservedAt, true);
        legacyStats.webhook_model += 1;
      } else if (t.evidenceSource === 'SNAPSHOT_OBD' && t.candidateState === 'UNPLUGGED') {
        legacy = { legacyReasonSource: 'episode_model', legacyReason: 'obd_false', legacyAccepted: false };
        legacyStats.episode_model += 1;
      } else if (t.evidenceSource === 'SNAPSHOT_OBD' && t.candidateState === 'PLUGGED') {
        const eps = episodesByVehicle.get(s.vehicleId) ?? [];
        const ep = episodeOpenAt(eps, observedAt);
        legacy = inferLegacySnapshotPlug(ep);
        episodeReconstruction = {
          openEpisodeId: ep?.id ?? null,
          openEpisodeAtObservation: ep != null,
        };
        legacyStats.episode_model += 1;
      }

      const retentionEdgePm2LegacyMissing =
        t.evidenceSource === 'SNAPSHOT_OBD' &&
        t.candidateState === 'PLUGGED' &&
        parentEvidence != null &&
        new Date(observedAt).getTime() > new Date(parentEvidence.evidenceObservedAt).getTime();

      rows.push({
        shadowId: s.id,
        vehicleId: s.vehicleId,
        bindingKey: s.bindingKey,
        evidenceReferenceId: s.evidenceReferenceId,
        evidenceObservedAt: s.evidenceObservedAt?.toISOString(),
        observedAt: s.observedAt.toISOString(),
        transition: {
          decision: t.decision,
          previousState: t.previousState,
          candidateState: t.candidateState,
          effectiveState: t.effectiveState,
          evidenceSource: t.evidenceSource,
          parentStateVersion: t.parentStateVersion,
          appliedStateVersion: t.appliedStateVersion,
        },
        parentEvidence,
        legacyReasonSource: legacy.legacyReasonSource,
        legacyReason: legacy.legacyReason,
        legacyAccepted: legacy.legacyAccepted,
        episodeReconstruction,
        retentionEdgePm2LegacyMissing,
      });
    }

    writeFileSync(
      outPath,
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        shadowTotal: shadows.length,
        rowCount: rows.length,
        parentUnresolved,
        legacyReasonStats: legacyStats,
        rows,
      }),
    );

    console.log(
      JSON.stringify({
        shadowTotal: shadows.length,
        rowCount: rows.length,
        parentUnresolved,
        legacyReasonStats: legacyStats,
        retentionEdgeRows: rows.filter((r) => r.retentionEdgePm2LegacyMissing).length,
        outPath,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
