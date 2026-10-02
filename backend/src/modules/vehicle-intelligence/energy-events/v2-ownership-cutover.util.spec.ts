import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';
import { FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV } from '@config/fuel-station-enrichment.config';
import { resolveEffectiveV2OwnershipCutoverAt } from './v2-ownership-cutover.util';

describe('resolveEffectiveV2OwnershipCutoverAt (F10.6.6-B.2)', () => {
  it('uses explicit V2 cutover from supplied env', () => {
    const env = {
      [PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV]: '2026-09-10T00:00:00.000Z',
      [FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV]: '2026-09-01T00:00:00.000Z',
    };
    expect(resolveEffectiveV2OwnershipCutoverAt(env)?.toISOString()).toBe(
      '2026-09-10T00:00:00.000Z',
    );
  });

  it('falls back to fuel enrichment cutover from the same env object', () => {
    const env = {
      [FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV]: '2026-09-02T12:00:00.000Z',
    };
    expect(resolveEffectiveV2OwnershipCutoverAt(env)?.toISOString()).toBe(
      '2026-09-02T12:00:00.000Z',
    );
  });
});
