import { loadVsiBundleHistoricalEvidence } from './vsi-profile-historical-evidence.loader';

describe('loadVsiBundleHistoricalEvidence', () => {
  it('requests latest 64 rows desc then returns chronological window', async () => {
    const newest = new Date('2026-10-15T12:00:00.000Z');
    const rows = Array.from({ length: 64 }, (_, i) => ({
      providerSourceTimestamp: new Date(newest.getTime() - (63 - i) * 60_000),
    }));
    const findMany = jest.fn().mockResolvedValue([...rows].reverse());
    const prisma = {
      vehicleProviderSourceObservation: { findMany },
    };

    const result = await loadVsiBundleHistoricalEvidence(prisma as never, {
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      provider: 'DIMO',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ providerSourceTimestamp: 'desc' }, { observationIndex: 'desc' }],
        take: 64,
      }),
    );
    expect(result.bundleSourceTimestamps).toHaveLength(64);
    expect(result.bundleSourceTimestamps[0]!.getTime()).toBeLessThan(
      result.bundleSourceTimestamps[63]!.getTime(),
    );
    expect(result.bundleSourceTimestamps[63]!.toISOString()).toBe(newest.toISOString());
  });
});
