#!/usr/bin/env node
/**
 * Read-only Tesla Natural Test #1 product-read verification (production ops).
 * Uses Nest application context — same code path as authenticated product API.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const FROM = '2026-10-12T13:06:55.000Z';
const TO = '2026-10-12T15:10:30.000Z';
const EXPECT_HV_ID = '3e5fe028-a217-4dfd-b165-76993117c794';

async function importDist(rel) {
  return import(pathToFileURL(join(BACKEND_ROOT, rel)).href);
}

async function createAppContext() {
  const mod = await importDist('dist/src/app.module.js');
  const appModule = await mod.AppModule.forRootAsync();
  return NestFactory.createApplicationContext(appModule, { logger: ['error'] });
}

async function main() {
  const backendEnv = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of readFileSync(backendEnv, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const key = t.slice(0, i);
    if (process.env[key] === undefined) process.env[key] = t.slice(i + 1);
  }

  const app = await createAppContext();
  try {
    const { isErdRechargeLegacyFragmentProductReadEnabled } = await importDist(
      'dist/src/modules/vehicle-intelligence/energy-events/erd-recharge-legacy-fragment-product-read/erd-recharge-legacy-fragment-product-read.config.js',
    );
    const { EnergyEventsService } = await importDist(
      'dist/src/modules/vehicle-intelligence/energy-events/energy-events.service.js',
    );
    const { PrismaService } = await importDist('dist/src/shared/database/prisma.service.js');
    const energy = app.get(EnergyEventsService);
    const prisma = app.get(PrismaService);

    const productRecharge = await energy.listCanonicalEnergyEvents(VEHICLE_ID, {
      from: new Date(FROM),
      to: new Date(TO),
    });
    const rechargeOnly = productRecharge.filter((e) => e.kind === 'RECHARGE');

    const rawRows = await prisma.vehicleEnergyEvent.findMany({
      where: {
        vehicleId: VEHICLE_ID,
        kind: 'RECHARGE',
        startTime: { lte: new Date(TO) },
        endTime: { gte: new Date(FROM) },
      },
      select: { id: true, dimoSegmentId: true, startTime: true, endTime: true },
    });

    const hvRows = await prisma.hvChargeSession.findMany({
      where: {
        vehicleId: VEHICLE_ID,
        startAt: { lte: new Date(TO) },
        OR: [{ endAt: { gte: new Date(FROM) } }, { endAt: null }],
      },
      select: { id: true, dimoSegmentId: true, startAt: true, endAt: true },
    });

    const out = {
      window: { from: FROM, to: TO },
      flagFile: process.env.ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED ?? '<unset>',
      flagEffective: isErdRechargeLegacyFragmentProductReadEnabled(process.env),
      productRechargeCount: rechargeOnly.length,
      productRechargeIds: rechargeOnly.map((e) => e.id),
      rawRechargeCount: rawRows.length,
      hvSessionCount: hvRows.length,
      hvSessionIds: hvRows.map((r) => r.id),
      expectHvPresent: hvRows.some((r) => r.id === EXPECT_HV_ID),
    };
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
