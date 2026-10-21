/**
 * CI-only DIMO token_id allocator for ERD-E4 PostgreSQL integration tests.
 *
 * ERD-E4 reconcile SQL requires `dimo_vehicles.token_id IS NOT NULL`.
 * Historical fixture used random ids in 100_000..999_999 (unique collisions).
 * This module reserves a high, deterministic, process-scoped range disjoint from that band.
 */

/** PostgreSQL signed INTEGER maximum (Prisma `Int`). */
export const ERD_E4_TEST_DIMO_POSTGRES_INT_MAX = 2_147_483_647;

/** First token id in the CI-only reserved band (disjoint from historical random fixtures). */
export const ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE = 2_100_000_000;

/** Historical ERD-E4 postgres fixture: Math.floor(Math.random() * 900_000) + 100_000 */
export const ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MIN = 100_000;
export const ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MAX = 999_999;

/** IDs allocated per process within one PID slot (cursor 1..SLOT_SIZE inclusive). */
export const ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE = 4_096;

/**
 * PID slot count — chosen so the entire configured domain fits in PostgreSQL INT:
 * RESERVE_BASE + PID_SLOT_COUNT * SLOT_SIZE <= POSTGRES_INT_MAX
 */
export const ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT = 10_000;

export const ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS = ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE;

/** Worst-case token id when slot index is PID_SLOT_COUNT - 1 and cursor is at capacity. */
export const ERD_E4_TEST_DIMO_MAX_CONFIGURED_TOKEN_ID =
  ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE +
  (ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT - 1) * ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE +
  ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS;

if (ERD_E4_TEST_DIMO_MAX_CONFIGURED_TOKEN_ID > ERD_E4_TEST_DIMO_POSTGRES_INT_MAX) {
  throw new Error(
    `ERD E4 test DIMO token_id domain exceeds PostgreSQL INT max (${ERD_E4_TEST_DIMO_MAX_CONFIGURED_TOKEN_ID} > ${ERD_E4_TEST_DIMO_POSTGRES_INT_MAX})`,
  );
}

if (ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE <= ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MAX) {
  throw new Error('ERD E4 test token reserve overlaps historical random fixture range');
}

export function computeErdE4TestDimoTokenIdBase(pid: number): number {
  const slot = ((pid % ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT) + ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT) %
    ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT;
  return ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE + slot * ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE;
}

export function createErdE4TestDimoTokenIdAllocator(pid: number = process.pid): () => number {
  const base = computeErdE4TestDimoTokenIdBase(pid);
  let cursor = 0;

  return function allocateErdE4TestDimoTokenId(): number {
    cursor += 1;
    if (cursor > ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS) {
      throw new Error('ERD E4 test DIMO token_id allocator exhausted');
    }
    const tokenId = base + cursor;
    if (tokenId > ERD_E4_TEST_DIMO_POSTGRES_INT_MAX) {
      throw new Error('ERD E4 test DIMO token_id exceeds PostgreSQL INT max');
    }
    return tokenId;
  };
}

/** Process-wide singleton for postgres integration specs. */
export const allocateErdE4TestDimoTokenId = createErdE4TestDimoTokenIdAllocator();
