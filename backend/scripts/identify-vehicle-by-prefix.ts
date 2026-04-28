/**
 * Quick helper: given a short id prefix, print the matching vehicle
 * (plate, make, model, status, hardware) so a BullMQ jobId can be
 * mapped back to a real vehicle.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/identify-vehicle-by-prefix.ts be15ecb1 c10351f8 4cefcda1
 */
import { PrismaClient } from '@prisma/client';
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

async function main() {
  const prefixes = process.argv.slice(2);
  if (prefixes.length === 0) {
    console.error('Usage: ... identify-vehicle-by-prefix <prefix> [...]');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    for (const p of prefixes) {
      const matches = await prisma.vehicle.findMany({
        where: { id: { startsWith: p } },
        select: {
          id: true,
          licensePlate: true,
          make: true,
          model: true,
          year: true,
          status: true,
          hardwareType: true,
          dimoVehicle: { select: { tokenId: true, connectionStatus: true, lastSignal: true } },
        },
      });
      console.log(`\n--- prefix "${p}" (${matches.length} matches) ---`);
      for (const v of matches) {
        console.log(
          `  ${v.id}  ${v.licensePlate ?? '—'}  ${v.make} ${v.model} ${v.year ?? ''}  status=${v.status}  hw=${v.hardwareType}  token=${v.dimoVehicle?.tokenId ?? '—'}  conn=${v.dimoVehicle?.connectionStatus ?? '—'}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[identify-vehicle-by-prefix] Failed:', err);
  process.exit(1);
});
