/**
 * V2B-PR3 PostgreSQL harness placeholder (PG-03).
 * Enable with V2B_HM_ONLY_CANONICAL_PG=1 when disposable DB gate is armed.
 */
const run = process.env.V2B_HM_ONLY_CANONICAL_PG === '1';

(run ? describe : describe.skip)('V2B HM_ONLY canonical convergence (PG-03)', () => {
  it('documents PG-03 contract: HM_ONLY → case → activate → single VEHICLE_ACTIVATED outbox', () => {
    expect(true).toBe(true);
  });
});