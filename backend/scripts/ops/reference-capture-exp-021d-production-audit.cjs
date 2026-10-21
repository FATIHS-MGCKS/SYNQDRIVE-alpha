#!/usr/bin/env node
/**
 * EXP-021D — Production RC/shadow/health audit (read-only).
 */
const fs = require('fs');
const { PrismaClient, ReferenceCaptureSessionStatus } = require('@prisma/client');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

function loadEnv() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function redisConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : undefined,
  };
}

function parseAcquisitionState(json) {
  if (!json || typeof json !== 'object') return {};
  return json;
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const conn = new Redis(redisConnection());
  const shadowQueue = new Queue('reference.capture.settlement-shadow', { connection: conn });
  const rcQueue = new Queue('reference.capture.recording', { connection: conn });

  try {
    const blockingStatuses = [
      ReferenceCaptureSessionStatus.RECORDING,
      ReferenceCaptureSessionStatus.STARTING,
      ReferenceCaptureSessionStatus.STOPPING,
      ReferenceCaptureSessionStatus.READY,
    ];

    const activeRcSessions = await prisma.referenceCaptureSession.count({
      where: { status: { in: blockingStatuses } },
    });

    const recordingSessions = await prisma.referenceCaptureSession.count({
      where: { status: ReferenceCaptureSessionStatus.RECORDING },
    });

    const readySessions = await prisma.referenceCaptureSession.count({
      where: { status: ReferenceCaptureSessionStatus.READY },
    });

    const sessionsWithState = await prisma.referenceCaptureSession.findMany({
      where: {
        status: {
          in: [
            ReferenceCaptureSessionStatus.RECORDING,
            ReferenceCaptureSessionStatus.STOPPING,
            ReferenceCaptureSessionStatus.READY,
            ReferenceCaptureSessionStatus.STARTING,
            ReferenceCaptureSessionStatus.COMPLETED,
            ReferenceCaptureSessionStatus.ABORTED,
            ReferenceCaptureSessionStatus.FAILED,
          ],
        },
      },
      select: { id: true, status: true, acquisitionStateJson: true },
    });

    let activeCalibrationSeries = 0;
    for (const session of sessionsWithState) {
      const state = parseAcquisitionState(session.acquisitionStateJson);
      const series = state.hfCalibrationSeries;
      if (!series) continue;
      if (!series.terminalFinalizationAt && (series.activePhase || series.pendingPhaseRequest)) {
        activeCalibrationSeries += 1;
      }
    }

    const activeSettlementExperiments = await prisma.referenceCaptureSettlementShadowExperiment.count({
      where: { status: { in: ['PENDING', 'RUNNING', 'ACTIVE'] } },
    });

    const settlementSchedulesPending = await prisma.referenceCaptureSettlementShadowSchedule.count({
      where: { status: 'PENDING' },
    });

    const orphanSettlementSchedules = await prisma.referenceCaptureSettlementShadowSchedule.count({
      where: {
        status: { in: ['PENDING', 'EXECUTING'] },
        scheduledAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const staleShadowJobs = await prisma.referenceCaptureSettlementShadowSchedule.count({
      where: { status: { in: ['PENDING', 'EXECUTING'] } },
    });

    const [shadowWaiting, shadowActive, shadowDelayed] = await Promise.all([
      shadowQueue.getWaitingCount(),
      shadowQueue.getActiveCount(),
      shadowQueue.getDelayedCount(),
    ]);

    const [rcWaiting, rcActive, rcDelayed] = await Promise.all([
      rcQueue.getWaitingCount(),
      rcQueue.getActiveCount(),
      rcQueue.getDelayedCount(),
    ]);

    const staleSession = await prisma.referenceCaptureSession.findUnique({
      where: { id: '66f09794-fc00-444c-86a3-c398b20e1ce5' },
      select: {
        id: true,
        status: true,
        organizationId: true,
        vehicleId: true,
        createdAt: true,
        startedAt: true,
        updatedAt: true,
        completedAt: true,
        failureReason: true,
        runnerJobId: true,
        pendingCycleJobId: true,
        acquisitionStateJson: true,
      },
    });

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63' },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        latestState: {
          select: {
            lastSeenAt: true,
            dimoTokenId: true,
            online: true,
            isIgnitionOn: true,
            speedKmh: true,
            latitude: true,
            longitude: true,
            sourceTimestamp: true,
          },
        },
      },
    });

    let redisHealthy = false;
    try {
      redisHealthy = (await conn.ping()) === 'PONG';
    } catch {
      redisHealthy = false;
    }

    let databaseHealthy = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseHealthy = true;
    } catch {
      databaseHealthy = false;
    }

    const rcEnabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.REFERENCE_CAPTURE_ENABLED ?? '').toLowerCase(),
    );
    const shadowEnabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED ?? '').toLowerCase(),
    );

    console.log(
      JSON.stringify(
        {
          WALL_CLOCK_NOW_UTC: new Date().toISOString(),
          ACTIVE_RC_SESSIONS: activeRcSessions,
          RECORDING_RC_SESSIONS: recordingSessions,
          PRE_ARMED_READY_SESSIONS: readySessions,
          ACTIVE_CALIBRATION_SERIES: activeCalibrationSeries,
          ACTIVE_SETTLEMENT_EXPERIMENTS: activeSettlementExperiments,
          SETTLEMENT_SCHEDULES_PENDING: settlementSchedulesPending,
          STALE_SHADOW_SCHEDULES: staleShadowJobs,
          ORPHAN_SETTLEMENT_SCHEDULES: orphanSettlementSchedules,
          SETTLEMENT_QUEUE_WAITING: shadowWaiting,
          SETTLEMENT_QUEUE_ACTIVE: shadowActive,
          SETTLEMENT_QUEUE_DELAYED: shadowDelayed,
          RC_RECORDING_QUEUE_WAITING: rcWaiting,
          RC_RECORDING_QUEUE_ACTIVE: rcActive,
          RC_RECORDING_QUEUE_DELAYED: rcDelayed,
          STALE_SESSION: staleSession,
          KS_MX_2024_VEHICLE: vehicle,
          REFERENCE_CAPTURE_ENABLED_EFFECTIVE: rcEnabled,
          SETTLEMENT_SHADOW_ENABLED_EFFECTIVE: shadowEnabled,
          REDIS_HEALTHY: redisHealthy,
          DATABASE_HEALTHY: databaseHealthy,
        },
        null,
        2,
      ),
    );
  } finally {
    await shadowQueue.close();
    await rcQueue.close();
    await conn.quit();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('AUDIT_FAILED', error);
  process.exit(1);
});
