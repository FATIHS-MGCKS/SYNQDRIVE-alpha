/**
 * Diagnostic: investigate why specific vehicles show a stale
 * "last signal X ago" label in the Fleet Connection tab while DIMO
 * itself reports a much more recent timestamp.
 *
 * For each candidate plate this prints:
 *   - Vehicle row (status, hardwareType, dimoVehicleId)
 *   - DimoVehicle (tokenId, connectionStatus, lastSignal, syncedAt)
 *   - VehicleLatestState (lastSeenAt, providerFetchedAt, syncJobRef)
 *   - Last ~10 DimoPollLog rows (SUCCESS / FAILED + error)
 *   - Interpretation: which value feeds the UI freshnessLabel
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/diagnose-dimo-lag.ts
 */
import { PrismaClient, DimoPollStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

// The plate substrings we want to find. Accept both "KS MS 661", "KS-MS-661",
// "KSMS661" and the HM C 215 variants the user typed.
const PLATE_CANDIDATES = [
  ['KS', 'MS', '661'],
  ['HM', 'C', '215'],
];

function fmtAge(iso: Date | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(1)} h ago`;
  return `${(h / 24).toFixed(1)} d ago`;
}

async function findVehicles(prisma: PrismaClient, tokens: string[]) {
  // Match a vehicle whose licensePlate contains EVERY token (case-insensitive,
  // whitespace-tolerant). We load a generous superset and filter in JS so we
  // do not have to depend on a specific plate formatting in the DB.
  const candidates = await prisma.vehicle.findMany({
    where: {
      licensePlate: { not: null, contains: tokens[0], mode: 'insensitive' },
    },
    select: {
      id: true,
      licensePlate: true,
      make: true,
      model: true,
      year: true,
      status: true,
      hardwareType: true,
      organizationId: true,
      dimoVehicleId: true,
    },
    take: 50,
  });
  const lower = tokens.map((t) => t.toLowerCase());
  return candidates.filter((v) => {
    const p = (v.licensePlate ?? '').toLowerCase();
    return lower.every((tok) => p.includes(tok));
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const tokens of PLATE_CANDIDATES) {
      const header = tokens.join(' ');
      console.log('\n====================================================');
      console.log(` Plate query: "${header}"`);
      console.log('====================================================');

      const matches = await findVehicles(prisma, tokens);
      if (matches.length === 0) {
        console.log(`  [!] No vehicle row found`);
        continue;
      }
      for (const v of matches) {
        console.log(
          `\n  Vehicle ${v.id.slice(0, 8)} — ${v.licensePlate} — ${v.make} ${v.model} ${v.year ?? ''}`,
        );
        console.log(
          `    status=${v.status} hardwareType=${v.hardwareType} dimoVehicleId=${v.dimoVehicleId ?? '—'}`,
        );

        const dv = v.dimoVehicleId
          ? await prisma.dimoVehicle.findUnique({
              where: { id: v.dimoVehicleId },
              select: {
                tokenId: true,
                connectionStatus: true,
                lastSignal: true,
                syncedAt: true,
                createdAt: true,
              },
            })
          : null;

        const ls = await prisma.vehicleLatestState.findUnique({
          where: { vehicleId: v.id },
          select: {
            lastSeenAt: true,
            sourceTimestamp: true,
            providerSource: true,
            providerFetchedAt: true,
            source: true,
            syncJobRef: true,
            updatedAt: true,
          },
        });

        console.log('    --- DimoVehicle ---');
        if (!dv) {
          console.log('      (no row — this vehicle has NO DIMO link)');
        } else {
          console.log(`      tokenId           = ${dv.tokenId ?? '—'}`);
          console.log(`      connectionStatus  = ${dv.connectionStatus ?? '—'}`);
          console.log(
            `      lastSignal        = ${dv.lastSignal?.toISOString() ?? '—'}   (${fmtAge(dv.lastSignal)})`,
          );
          console.log(
            `      syncedAt          = ${dv.syncedAt?.toISOString() ?? '—'}   (${fmtAge(dv.syncedAt)})`,
          );
        }

        console.log('    --- VehicleLatestState ---');
        if (!ls) {
          console.log('      (no row — snapshot processor never ran for this vehicle)');
        } else {
          console.log(`      source            = ${ls.source}`);
          console.log(`      providerSource    = ${ls.providerSource ?? '—'}`);
          console.log(
            `      lastSeenAt        = ${ls.lastSeenAt?.toISOString() ?? '—'}   (${fmtAge(ls.lastSeenAt)})`,
          );
          console.log(
            `      sourceTimestamp   = ${ls.sourceTimestamp?.toISOString() ?? '—'}   (${fmtAge(ls.sourceTimestamp)})`,
          );
          console.log(
            `      providerFetchedAt = ${ls.providerFetchedAt?.toISOString() ?? '—'}   (${fmtAge(ls.providerFetchedAt)})`,
          );
          console.log(
            `      updatedAt         = ${ls.updatedAt?.toISOString() ?? '—'}   (${fmtAge(ls.updatedAt)})`,
          );
          console.log(`      syncJobRef        = ${ls.syncJobRef ?? '—'}`);
        }

        console.log('    --- DimoPollLog (last 10) ---');
        const polls = await prisma.dimoPollLog.findMany({
          where: { vehicleId: v.id },
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            jobType: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            errorMessage: true,
          },
        });
        if (polls.length === 0) {
          console.log('      (no poll log entries at all)');
        } else {
          for (const p of polls) {
            console.log(
              `      ${p.startedAt.toISOString()} [${p.jobType}] ${p.status}  ` +
                `${p.durationMs ?? '—'}ms  ${p.errorMessage ? ' err=' + p.errorMessage.slice(0, 120) : ''}`,
            );
          }
        }

        // UI interpretation — replicate vehicles.service.getFleetConnectivity
        const uiLastSeen = ls?.lastSeenAt ?? dv?.lastSignal ?? null;
        console.log('    --- UI interpretation ---');
        console.log(
          `      UI lastSeenAt (what the card shows) = ${uiLastSeen?.toISOString() ?? '—'}   (${fmtAge(uiLastSeen)})`,
        );
      }
    }

    // Global health: do we have ANY recent successful snapshot polls?
    console.log('\n====================================================');
    console.log(' Global DIMO snapshot health (last 15 min)');
    console.log('====================================================');
    const since = new Date(Date.now() - 15 * 60_000);
    const agg = await prisma.dimoPollLog.groupBy({
      by: ['jobType', 'status'],
      where: { startedAt: { gte: since } },
      _count: true,
    });
    if (agg.length === 0) {
      console.log(
        '  (no DimoPollLog rows in the last 15 min — scheduler or queue is NOT running)',
      );
    } else {
      for (const row of agg) {
        console.log(`  ${row.jobType} ${row.status}: ${row._count}`);
      }
    }

    const recentFailures = await prisma.dimoPollLog.findMany({
      where: { startedAt: { gte: since }, status: { not: DimoPollStatus.SUCCESS } },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { vehicleId: true, jobType: true, errorMessage: true, startedAt: true },
    });
    if (recentFailures.length > 0) {
      console.log('\n  Recent FAILED polls:');
      for (const f of recentFailures) {
        const vid = f.vehicleId ? f.vehicleId.slice(0, 8) : '(unknown)';
        console.log(
          `    ${f.startedAt.toISOString()} v=${vid} [${f.jobType}]  ${f.errorMessage?.slice(0, 160) ?? ''}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[diagnose-dimo-lag] Failed:', err);
  process.exit(1);
});
