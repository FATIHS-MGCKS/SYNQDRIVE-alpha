/**
 * READ-ONLY probe: does a `VehicleEnergyEvent` numeric round-trip preserve the
 * exact IEEE-754 double the canonical detector produced?
 *
 * Compares three representations of the same stored value:
 *   1. the JS number Prisma deserializes
 *   2. the PostgreSQL `float8` text rendering (`::text`)
 *   3. the raw `jsonb` text of `raw_detection_meta`
 *
 * A mismatch between (1) and (2) proves read-side precision loss; a value in
 * (2)/(3) that is shorter than the shortest-round-trip representation proves
 * write-side precision loss. Either way, exact `===` comparison of stored vs
 * freshly detected measurements can never converge.
 *
 * No DIMO traffic, no writes.
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import { createMutationGuardedPrismaClient } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';

{
  const envPath = require('path').resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const NUMERIC_COLUMNS = [
  ['socDeltaPercent', 'soc_delta_percent'],
  ['energyDeltaKwh', 'energy_delta_kwh'],
  ['fuelDeltaLiters', 'fuel_delta_liters'],
  ['fuelDeltaPercent', 'fuel_delta_percent'],
  ['odometerStartKm', 'odometer_start_km'],
  ['odometerEndKm', 'odometer_end_km'],
  ['startLatitude', 'start_latitude'],
  ['startLongitude', 'start_longitude'],
  ['endLatitude', 'end_latitude'],
  ['endLongitude', 'end_longitude'],
] as const;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');

  const rawPrisma = new PrismaClient();
  const prisma = createMutationGuardedPrismaClient(rawPrisma);
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);

  const [{ setting: extraFloatDigits }] = await prisma.$queryRawUnsafe<
    Array<{ setting: string }>
  >(`SELECT setting FROM pg_settings WHERE name = 'extra_float_digits'`);
  const [{ version }] = await prisma.$queryRawUnsafe<Array<{ version: string }>>(
    `SELECT split_part(version(), ' ', 2) AS version`,
  );

  /**
   * Parameter round-trip: hand a double that needs 17 significant digits to the
   * driver and ask PostgreSQL to render what it actually received. Touches no
   * table, so it isolates the write-path serialization from storage and reads.
   */
  const parameterProbeValues = [
    2.2399999499320984,
    11.636887154233477,
    12.941176470588236,
    52.999998815357685,
    0.1,
    1 / 3,
  ];
  const parameterRoundTrip: Array<{
    input: string;
    postgresReceived: string;
    exact: boolean;
    significantDigitsIn: number;
  }> = [];
  for (const value of parameterProbeValues) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ v: string }>>(
      `SELECT $1::float8::text AS v`,
      value,
    );
    parameterRoundTrip.push({
      input: String(value),
      postgresReceived: row.v,
      exact: Number(row.v) === value,
      significantDigitsIn: String(value).replace(/[-.]|e.*$/g, '').replace(/^0+/, '')
        .length,
    });
  }

  const prismaRows = await prisma.vehicleEnergyEvent.findMany({
    where: { startTime: { gte: outageStart, lt: recoveryCutoff } },
    select: {
      id: true,
      socDeltaPercent: true,
      energyDeltaKwh: true,
      fuelDeltaLiters: true,
      fuelDeltaPercent: true,
      odometerStartKm: true,
      odometerEndKm: true,
      startLatitude: true,
      startLongitude: true,
      endLatitude: true,
      endLongitude: true,
      rawDetectionMeta: true,
    },
  });

  const textRows = await prisma.$queryRawUnsafe<
    Array<Record<string, string | null>>
  >(
    `SELECT id,
       soc_delta_percent::text AS soc_delta_percent,
       energy_delta_kwh::text AS energy_delta_kwh,
       fuel_delta_liters::text AS fuel_delta_liters,
       fuel_delta_percent::text AS fuel_delta_percent,
       odometer_start_km::text AS odometer_start_km,
       odometer_end_km::text AS odometer_end_km,
       start_latitude::text AS start_latitude,
       start_longitude::text AS start_longitude,
       end_latitude::text AS end_latitude,
       end_longitude::text AS end_longitude,
       raw_detection_meta::text AS raw_detection_meta
     FROM vehicle_energy_events
     WHERE start_time >= $1 AND start_time < $2`,
    outageStart,
    recoveryCutoff,
  );

  const textById = new Map(textRows.map((row) => [row.id as string, row]));
  const mismatches: Array<{
    rowAlias: string;
    field: string;
    prismaValue: string;
    postgresText: string;
    side: 'READ_SIDE_PRECISION_LOSS' | 'STORED_VALUE_NOT_SHORTEST_ROUND_TRIP';
  }> = [];
  let rowIndex = 0;
  let rowsWithMismatch = 0;
  const metaShortValues: Array<{ rowAlias: string; key: string; stored: string }> = [];

  for (const row of prismaRows) {
    rowIndex += 1;
    const alias = `ROW${rowIndex}`;
    const textRow = textById.get(row.id);
    if (!textRow) continue;
    let rowHasMismatch = false;

    for (const [field, column] of NUMERIC_COLUMNS) {
      const prismaValue = (row as unknown as Record<string, number | null>)[field];
      const postgresText = textRow[column];
      if (prismaValue == null || postgresText == null) continue;
      // Shortest round-trip rendering of the value Prisma handed back.
      const prismaText = String(prismaValue);
      if (prismaText === postgresText) continue;
      rowHasMismatch = true;
      mismatches.push({
        rowAlias: alias,
        field,
        prismaValue: prismaText,
        postgresText,
        side:
          Number(postgresText) === prismaValue
            ? 'STORED_VALUE_NOT_SHORTEST_ROUND_TRIP'
            : 'READ_SIDE_PRECISION_LOSS',
      });
    }

    const storedMeta = textRow.raw_detection_meta;
    if (storedMeta) {
      const parsed = JSON.parse(storedMeta) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'number') continue;
        const storedText = storedMeta.match(
          new RegExp(`"${key}"\\s*:\\s*(-?[0-9.eE+]+)`),
        )?.[1];
        if (!storedText) continue;
        if (storedText !== String(value)) {
          metaShortValues.push({ rowAlias: alias, key, stored: storedText });
        }
      }
    }

    if (rowHasMismatch) rowsWithMismatch += 1;
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        postgresVersion: version,
        extraFloatDigits,
        parameterRoundTrip,
        rowsProbed: prismaRows.length,
        rowsWithMismatch,
        columnMismatchCount: mismatches.length,
        columnMismatches: mismatches,
        jsonbMetaNonCanonicalNumberCount: metaShortValues.length,
        jsonbMetaNonCanonicalNumbers: metaShortValues,
      },
      null,
      2,
    ),
  );

  await rawPrisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
