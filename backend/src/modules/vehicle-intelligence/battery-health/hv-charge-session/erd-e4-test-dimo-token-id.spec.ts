import {
  ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MAX,
  ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MIN,
  ERD_E4_TEST_DIMO_MAX_CONFIGURED_TOKEN_ID,
  ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS,
  ERD_E4_TEST_DIMO_POSTGRES_INT_MAX,
  ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT,
  ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE,
  ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE,
  computeErdE4TestDimoTokenIdBase,
  createErdE4TestDimoTokenIdAllocator,
} from './erd-e4-test-dimo-token-id';

const ERD_E4_FAIRNESS_FIXTURE_COUNT = 109;

describe('ERD E4 test DIMO token_id allocator', () => {
  it('keeps the full configured domain within PostgreSQL INT max', () => {
    expect(ERD_E4_TEST_DIMO_MAX_CONFIGURED_TOKEN_ID).toBeLessThanOrEqual(
      ERD_E4_TEST_DIMO_POSTGRES_INT_MAX,
    );
  });

  it('places PID slot 0 in range', () => {
    const base = computeErdE4TestDimoTokenIdBase(0);
    expect(base).toBe(ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE);
    expect(base + ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS).toBeLessThanOrEqual(
      ERD_E4_TEST_DIMO_POSTGRES_INT_MAX,
    );
  });

  it('places maximum PID slot in range', () => {
    const pidForMaxSlot = ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT - 1;
    const base = computeErdE4TestDimoTokenIdBase(pidForMaxSlot);
    const slotOffset = pidForMaxSlot * ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE;
    expect(base).toBe(ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE + slotOffset);
    expect(base + ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS).toBeLessThanOrEqual(
      ERD_E4_TEST_DIMO_POSTGRES_INT_MAX,
    );
  });

  it('does not overlap historical random fixture range', () => {
    const reserveEnd =
      ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE +
      ERD_E4_TEST_DIMO_TOKEN_PID_SLOT_COUNT * ERD_E4_TEST_DIMO_TOKEN_SLOT_SIZE;
    expect(ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE).toBeGreaterThan(
      ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MAX,
    );
    expect(reserveEnd).toBeGreaterThan(ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MAX);
    expect(ERD_E4_HISTORICAL_RANDOM_TOKEN_ID_MIN).toBeLessThan(
      ERD_E4_TEST_DIMO_TOKEN_RESERVE_BASE,
    );
  });

  it('allocates unique sequential ids including 109 fairness fixtures', () => {
    const allocate = createErdE4TestDimoTokenIdAllocator(42_424);
    const first = allocate();
    const seen = new Set<number>([first]);
    for (let i = 1; i < ERD_E4_FAIRNESS_FIXTURE_COUNT; i += 1) {
      const next = allocate();
      expect(seen.has(next)).toBe(false);
      seen.add(next);
    }
    expect(seen.size).toBe(ERD_E4_FAIRNESS_FIXTURE_COUNT);
  });

  it('fails deterministically when per-process capacity is exhausted', () => {
    const allocate = createErdE4TestDimoTokenIdAllocator(99);
    for (let i = 0; i < ERD_E4_TEST_DIMO_MAX_PER_PROCESS_ALLOCATIONS; i += 1) {
      allocate();
    }
    expect(() => allocate()).toThrow(/allocator exhausted/);
  });
});
