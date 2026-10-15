import type { PrismaClient } from '@prisma/client';

/** Matches DI `API_SYNTHETIC_IDENTITY` — verified SOFTWARE_INTEGRATION modality for PG tests. */
export const VO_PG_DIMO_SOFTWARE_RAW_JSON = {
  aftermarketDevice: null,
  syntheticDevice: { id: 'vo-pg-ci-fixture' },
};

const DEFAULT_DIMO_RAW_JSON = VO_PG_DIMO_SOFTWARE_RAW_JSON;

/**
 * Insert DIMO mirror without Prisma create — avoids optional schema columns
 * (e.g. powertrain_type) when integration DB migration chain is partial.
 */
export async function insertDimoMirrorForPostgresTests(
  prisma: PrismaClient,
  input: {
    id: string;
    externalId: string;
    vin?: string | null;
    tokenId?: number | null;
    rawJson?: object;
  },
): Promise<void> {
  const raw = JSON.stringify(input.rawJson ?? DEFAULT_DIMO_RAW_JSON);
  const tokenId = input.tokenId ?? null;
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (
      id, external_id, token_id, vin, make, model, year, fuel_type, connection_status, raw_json, created_at, updated_at
    )
    VALUES (
      ${input.id}::uuid,
      ${input.externalId},
      ${tokenId},
      ${input.vin ?? null},
      'Audi',
      'A3',
      2021,
      'GASOLINE',
      'CONNECTED'::"DimoConnectionStatus",
      ${raw}::jsonb,
      NOW(),
      NOW()
    )
  `;
}
