/**
 * PG-03 placeholder — PLACEHOLDER_NOT_E2E_VERIFIED.
 * Real PostgreSQL E2E (case → activate → single outbox) is required in V2B-PR3.
 * Gate: `V2B_HM_ONLY_CANONICAL_PG=1`. Do not treat this file as PG PASS.
 */
const run = process.env.V2B_HM_ONLY_CANONICAL_PG === '1';

(run ? describe : describe.skip)('V2B HM_ONLY canonical convergence (PG-03) — NOT_E2E_VERIFIED', () => {
  it.skip('PLACEHOLDER: implement HM_ONLY → case → activate → single VEHICLE_ACTIVATED outbox in V2B-PR3', () => {});
});