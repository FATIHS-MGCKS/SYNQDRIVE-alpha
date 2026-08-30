import { FuelStationLocationResolverService } from './fuel-station-location-resolver.service';
import { FuelStationCandidateRepository } from './fuel-station-candidate.repository';
import { buildRawCandidate } from './testing/fuel-station-test-factories';

describe('FuelStationLocationResolverService', () => {
  const repository = {
    getCurrentDatasetStatus: jest.fn(),
    findCandidatesNear: jest.fn(),
    explainCandidateLookup: jest.fn(),
  } as unknown as jest.Mocked<FuelStationCandidateRepository>;

  const service = new FuelStationLocationResolverService(repository);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getCurrentDatasetStatus.mockResolvedValue({
      ready: true,
      datasetVersion: 'geofabrik-germany-test',
      stationCount: 1000,
    });
  });

  it('returns INVALID_COORDINATES for bad latitude', async () => {
    const result = await service.resolve({ latitude: 120, longitude: 9 });
    expect(result.status).toBe('INVALID_COORDINATES');
    expect(repository.findCandidatesNear).not.toHaveBeenCalled();
  });

  it('returns ERROR when dataset unavailable', async () => {
    repository.getCurrentDatasetStatus.mockResolvedValue({
      ready: false,
      errorMessage: 'missing metadata',
    });
    const result = await service.resolve({ latitude: 51.3, longitude: 9.4 });
    expect(result.status).toBe('ERROR');
  });

  it('uses fallback radius when primary has no candidates', async () => {
    repository.findCandidatesNear
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([buildRawCandidate({ geometry_distance_m: 180, point_distance_m: 180 })]);

    const result = await service.resolve({ latitude: 51.3127, longitude: 9.4797 });
    expect(repository.findCandidatesNear).toHaveBeenCalledTimes(2);
    expect(result.diagnostics?.usedFallbackRadius).toBe(true);
    expect(result.diagnostics?.searchRadiusMeters).toBe(250);
  });

  it('returns NOT_FOUND for distant coordinate', async () => {
    repository.findCandidatesNear.mockResolvedValue([]);
    const result = await service.resolve({ latitude: 0, longitude: 0 });
    expect(result.status).toBe('NOT_FOUND');
  });

  it('returns dataset version from metadata', async () => {
    repository.findCandidatesNear.mockResolvedValue([
      buildRawCandidate({ geometry_distance_m: 10, point_distance_m: 10, inside_geometry: true }),
    ]);
    const result = await service.resolve({ latitude: 51.3127, longitude: 9.4797 });
    expect(result.datasetVersion).toBe('geofabrik-germany-test');
    expect(result.resolverVersion).toBe('fuel-station-resolver-v1');
  });

  it('returns ERROR on SQL failure', async () => {
    repository.findCandidatesNear.mockRejectedValue(new Error('relation does not exist'));
    const result = await service.resolve({ latitude: 51.3, longitude: 9.4 });
    expect(result.status).toBe('ERROR');
  });

  it('returns identical output for same input', async () => {
    repository.findCandidatesNear.mockResolvedValue([
      buildRawCandidate({ geometry_distance_m: 18, point_distance_m: 18 }),
    ]);
    const input = { latitude: 51.3127, longitude: 9.4797 };
    const first = await service.resolve(input);
    const second = await service.resolve(input);
    expect(first).toEqual(second);
  });
});
