import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { VendorCategory } from '@prisma/client';
import {
  VendorMapboxService,
  mapMapboxCategory,
} from './vendor-mapbox.service';

describe('VendorMapboxService', () => {
  const originalEnv = process.env;
  let service: VendorMapboxService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_TOKEN;
    delete process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    service = new VendorMapboxService();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('search() throws ServiceUnavailableException when no Mapbox token is configured', async () => {
    await expect(service.search('werkstatt')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retrieve() throws ServiceUnavailableException when no Mapbox token is configured', async () => {
    await expect(
      service.retrieve('mapbox-id', 'session-token-123'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('prefers MAPBOX_ACCESS_TOKEN over legacy NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'server-token';
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = 'public-token';
    service = new VendorMapboxService();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });

    await service.search('test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('access_token=server-token'),
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('access_token=public-token'),
    );
  });

  it('search() normalizes Mapbox suggestions into VendorSearchSuggestion shape', async () => {
    process.env.MAPBOX_TOKEN = 'mapbox-token';
    service = new VendorMapboxService();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            mapbox_id: 'poi.123',
            name: 'Reifen Müller',
            full_address: 'Hauptstr. 1, 34117 Kassel',
            poi_category: ['Tire Shop'],
          },
        ],
      }),
    });

    const result = await service.search('reifen', { country: 'de', limit: 5 });

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      mapboxId: 'poi.123',
      name: 'Reifen Müller',
      category: VendorCategory.TIRE_DEALER,
      fullAddress: 'Hauptstr. 1, 34117 Kassel',
    });
    expect(result.sessionToken).toEqual(expect.any(String));
  });

  it('search() surfaces BadGatewayException on upstream HTTP errors', async () => {
    process.env.MAPBOX_ACCESS_TOKEN = 'mapbox-token';
    service = new VendorMapboxService();

    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    await expect(service.search('werkstatt')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});

describe('mapMapboxCategory — exported normaliser', () => {
  it('maps workshop POIs to WORKSHOP', () => {
    expect(mapMapboxCategory(['Car Repair'])).toBe(VendorCategory.WORKSHOP);
  });
});
