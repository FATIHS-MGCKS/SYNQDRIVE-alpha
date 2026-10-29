import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/opt/synqdrive/current/backend/package.json');
function loadEnv(p) {
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    let v = t.slice(eq + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv('/opt/synqdrive/shared/backend.env');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const ids = [
  '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  '8c850ff1-4201-432b-af2e-2711dbc7ca48',
  'c10351f8-b6a2-4258-947f-631aeaa6d359',
];
const out = [];
for (const vehicleId of ids) {
  const links = await p.vehicleProviderSourceLink.findMany({
    where: { vehicleId, deactivatedAt: null },
    select: { id: true, provider: true, linkKind: true, activatedAt: true },
  });
  const prof = await p.vehicleSignalCapabilityProfile.findFirst({
    where: { vehicleId },
    select: { signalsSnapshot: true },
  });
  const sig = prof?.signalsSnapshot?.find((s) => s?.canonicalSignalKey === 'engine_rpm');
  out.push({
    vehicleId,
    links,
    activeRpm: sig?.cadenceIntelligence?.activeRpmProfile ?? null,
    hasCadence: !!sig?.cadenceIntelligence,
  });
}
console.log(JSON.stringify(out, null, 2));
await p.$disconnect();
