import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { StationMapboxService } from './station-mapbox.service';

describe('StationMapboxService', () => {
  const originalEnv = process.env;
  let service: StationMapboxService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.MAPBOX_ACCESS_TOKEN = 'mapbox-token';
    service = new StationMapboxService();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('retrieve() throws ServiceUnavailableException when no Mapbox token is configured', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;
    service = new StationMapboxService();
    await expect(service.retrieve('id', 'session')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('retrieve() returns address fields but rejects low-confidence coordinates', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [13.4, 52.5] },
            properties: {
              name: 'Mapbox POI Name',
              address: 'Musterstraße 1',
              full_address: 'Musterstraße 1, 10115 Berlin',
              mapbox_id: 'poi.123',
              match_type: 'fallback',
              coordinates: { latitude: 52.5, longitude: 13.4 },
            },
          },
        ],
      }),
    });

    const result = await service.retrieve('poi.123', 'session-token');

    expect(result).toMatchObject({
      name: 'Mapbox POI Name',
      street: 'Musterstraße 1',
      latitude: null,
      longitude: null,
      coordinatesAccepted: false,
    });
  });

  it('retrieve() accepts high-confidence coordinates', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [13.4, 52.5] },
            properties: {
              name: 'Depot',
              address: 'Musterstraße 1',
              mapbox_id: 'poi.456',
              match_type: 'exact',
              coordinates: { latitude: 52.5, longitude: 13.4 },
            },
          },
        ],
      }),
    });

    const result = await service.retrieve('poi.456', 'session-token');

    expect(result).toMatchObject({
      latitude: 52.5,
      longitude: 13.4,
      coordinatesAccepted: true,
    });
  });

  it('search() surfaces BadGatewayException on upstream HTTP errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });
    await expect(service.search('depot')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
