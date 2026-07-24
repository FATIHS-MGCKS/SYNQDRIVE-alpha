import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveFeatureRepository } from './predictive-feature.repository';
import { PredictiveFeatureService } from './predictive-feature.service';

describe('PredictiveFeatureService', () => {
  const loader = {
    loadOrganizationTimezone: jest.fn(),
    loadRawData: jest.fn(),
    loadFleetContext: jest.fn(),
    retentionCutoffDate: jest.fn(),
  } as unknown as jest.Mocked<PredictiveFeatureLoader>;

  const repository = {
    createBuildRun: jest.fn(),
    completeBuildRun: jest.fn(),
    upsertSnapshot: jest.fn(),
    purgeOlderThan: jest.fn(),
    listSnapshots: jest.fn(),
    getLatestBuildRun: jest.fn(),
  } as unknown as jest.Mocked<PredictiveFeatureRepository>;

  const service = new PredictiveFeatureService(loader, repository);

  beforeEach(() => {
    jest.clearAllMocks();
    loader.loadOrganizationTimezone.mockResolvedValue('Europe/Berlin');
    loader.retentionCutoffDate.mockReturnValue('2024-07-01');
    repository.createBuildRun.mockResolvedValue({
      id: 'run-1',
      organizationId: 'org-a',
      featureSetVersion: FEATURE_SET_VERSION,
      fromDate: '2026-07-14',
      toDate: '2026-07-15',
      status: 'PARTIAL',
      snapshotsWritten: 0,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
    });
    repository.upsertSnapshot.mockResolvedValue({} as never);
    repository.purgeOlderThan.mockResolvedValue(2);
    repository.completeBuildRun.mockResolvedValue({} as never);
    loader.loadFleetContext.mockResolvedValue({ vehicleCount: 1, vehicleIds: ['v1'] });
    loader.loadRawData.mockResolvedValue({
      bookings: [
        {
          id: 'b-1',
          status: 'COMPLETED',
          createdAt: '2026-07-10T10:00:00.000Z',
          startDate: '2026-07-15T09:00:00.000Z',
          endDate: '2026-07-16T09:00:00.000Z',
          cancelledAt: null,
          completedAt: '2026-07-15T18:00:00.000Z',
          totalPriceCents: 12_000,
          kmDriven: 80,
          pickupStationId: 'st-1',
          vehicleId: 'v1',
          vehicleRentalCategoryId: null,
        },
      ],
      serviceCases: [],
      invoices: [],
    });
  });

  it('builds fleet snapshots for explicit observation dates without future leakage', async () => {
    const result = await service.buildFeatures({
      organizationId: 'org-a',
      observationDates: ['2026-07-15'],
      timezone: 'Europe/Berlin',
      trigger: 'test',
    });

    expect(result.snapshotCount).toBe(1);
    expect(result.featureSetVersion).toBe(FEATURE_SET_VERSION);
    expect(repository.createBuildRun).toHaveBeenCalledWith('org-a', {
      featureSetVersion: FEATURE_SET_VERSION,
      fromDate: '2026-07-15',
      toDate: '2026-07-15',
    });
    expect(repository.upsertSnapshot).toHaveBeenCalledTimes(1);
    const upsertArg = repository.upsertSnapshot.mock.calls[0][0];
    expect(upsertArg.organization.connect?.id).toBe('org-a');
    expect(upsertArg.scopeKey).toBe('fleet');
    expect(repository.purgeOlderThan).toHaveBeenCalledWith('org-a', '2024-07-01');
    expect(repository.completeBuildRun).toHaveBeenCalledWith('run-1', {
      status: 'COMPLETED',
      snapshotsWritten: 1,
    });
  });

  it('isolates organizations by scoping loader calls to organizationId', async () => {
    await service.buildFeatures({
      organizationId: 'org-b',
      observationDates: ['2026-07-15'],
      timezone: 'Europe/Berlin',
    });

    expect(loader.loadRawData).toHaveBeenCalledWith(
      'org-b',
      expect.any(Date),
      expect.any(Date),
      'Europe/Berlin',
    );
    expect(loader.loadFleetContext).toHaveBeenCalledWith('org-b');
    expect(repository.createBuildRun.mock.calls[0][0]).toBe('org-b');
  });

  it('marks failed builds and rethrows', async () => {
    loader.loadRawData.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(
      service.buildFeatures({
        organizationId: 'org-a',
        observationDates: ['2026-07-15'],
        timezone: 'Europe/Berlin',
      }),
    ).rejects.toThrow('db unavailable');

    expect(repository.completeBuildRun).toHaveBeenCalledWith('run-1', {
      status: 'FAILED',
      snapshotsWritten: 0,
      errorMessage: 'db unavailable',
    });
  });

  it('lists snapshots for one organization only', async () => {
    repository.listSnapshots.mockResolvedValue([]);
    await service.listSnapshots('org-a', {
      observationDateFrom: '2026-07-01',
      observationDateTo: '2026-07-15',
    });
    expect(repository.listSnapshots).toHaveBeenCalledWith('org-a', {
      fromDate: '2026-07-01',
      toDate: '2026-07-15',
      featureSetVersion: FEATURE_SET_VERSION,
    });
  });
});
