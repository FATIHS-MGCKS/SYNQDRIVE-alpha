import { ChargingStationLocationResolverService } from './charging-station-location-resolver.service';
import { ChargingStationCandidateRepository } from './charging-station-candidate.repository';
import { buildRawCandidate } from './testing/charging-station-test-factories';

describe('ChargingStationLocationResolverService', () => {
  const repository = {
    getCurrentDatasetStatus: jest.fn(),
    findCandidatesNear: jest.fn(),
    explainCandidateLookup: jest.fn(),
  } as unknown as jest.Mocked<ChargingStationCandidateRepository>;

  const service = new ChargingStationLocationResolverService(repository);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getCurrentDatasetStatus.mockResolvedValue({
      ready: true,
      datasetVersion: 'synthetic-e6-2-test',
      stationCount: 5,
    });
  });

  it('R9 invalid latitude', async () => {
    const result = await service.resolve({ latitude: 120, longitude: 9 });
    expect(result.status).toBe('INVALID_COORDINATES');
  });

  it('R10 invalid longitude', async () => {
    const result = await service.resolve({ latitude: 51, longitude: 200 });
    expect(result.status).toBe('INVALID_COORDINATES');
  });

  it('R12 dataset unavailable', async () => {
    repository.getCurrentDatasetStatus.mockResolvedValue({ ready: false, errorMessage: 'missing' });
    const result = await service.resolve({ latitude: 50, longitude: 8 });
    expect(result.status).toBe('ERROR');
  });

  it('R11 zero zero valid lookup', async () => {
    repository.findCandidatesNear.mockResolvedValue([]);
    const result = await service.resolve({ latitude: 0, longitude: 0 });
    expect(result.status).toBe('NOT_FOUND');
    expect(repository.findCandidatesNear).toHaveBeenCalled();
  });
});

describe('charging resolver pipeline integration (mocked repository)', () => {
  const repository = {
    getCurrentDatasetStatus: jest.fn(),
    findCandidatesNear: jest.fn(),
  } as unknown as jest.Mocked<ChargingStationCandidateRepository>;

  const service = new ChargingStationLocationResolverService(repository);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getCurrentDatasetStatus.mockResolvedValue({
      ready: true,
      datasetVersion: 'synthetic-e6-2-test',
      stationCount: 5,
    });
  });

  it('R1 exact node MATCHED HIGH', async () => {
    repository.findCandidatesNear.mockResolvedValue([
      buildRawCandidate({
        geometry_distance_m: 0,
        point_distance_m: 0,
        inside_geometry: true,
        osm_id: 1001,
      }),
    ]);
    const result = await service.resolve({ latitude: 50.001, longitude: 8.001 });
    expect(result.status).toBe('MATCHED');
    expect(result.confidence).toBe('HIGH');
  });
});
