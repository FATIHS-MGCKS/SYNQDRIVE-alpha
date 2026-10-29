import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/opt/synqdrive/current/backend/package.json');
for (const line of fs.readFileSync('/opt/synqdrive/shared/backend.env', 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq <= 0) continue;
  const k = t.slice(0, eq);
  let v = t.slice(eq + 1);
  if (process.env[k] === undefined) process.env[k] = v;
}
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const AUDI = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const row = await p.vehicleSignalCapabilityProfile.findFirst({ where: { vehicleId: AUDI } });
const sig = row?.signalsSnapshot?.find((s) => s?.canonicalSignalKey === 'engine_rpm');
console.log(JSON.stringify({ revision: row?.profileRevision, evaluatedAt: row?.evaluatedAt, sig }, null, 2));
// revisions with POST_TRIP or TRIP
const revs = await p.vehicleSignalCapabilityProfileRevision.findMany({
  where: { vehicleId: AUDI },
  orderBy: { profileRevision: 'desc' },
  take: 10,
  select: { profileRevision: true, materializationTrigger: true, evaluatedAt: true },
});
console.log('revs', JSON.stringify(revs, null, 2));
const postTrip = await p.vehicleSignalCapabilityProfileRevision.findFirst({
  where: { vehicleId: AUDI, materializationTrigger: { contains: 'TRIP' } },
  orderBy: { profileRevision: 'desc' },
});
console.log('lastTripTrigger', postTrip?.profileRevision, postTrip?.materializationTrigger, postTrip?.evaluatedAt);
await p.$disconnect();
