import { EnergyEventKind } from '@prisma/client';
import {
  pickBestPoiFeature,
  resolveEnergyEventLocationFromFeatures,
  scoreEnergyEventPoi,
} from './energy-event-location.service';

describe('energy-event-location.service', () => {
  it('prefers fuel POI for REFUEL events', () => {
    const poiFeatures = [
      {
        place_type: ['poi'],
        text: 'Aral Kassel',
        place_name: 'Aral Kassel, Kassel, Germany',
        properties: { category: 'fuel' },
      },
      {
        place_type: ['poi'],
        text: 'REWE',
        place_name: 'REWE, Kassel, Germany',
        properties: { category: 'grocery' },
      },
    ];

    const resolved = resolveEnergyEventLocationFromFeatures(
      poiFeatures,
      [],
      [],
      EnergyEventKind.REFUEL,
    );

    expect(resolved.locationDisplayName).toBe('Aral Kassel');
    expect(resolved.locationSource).toBe('poi');
    expect(resolved.locationConfidence).toBe('HIGH');
  });

  it('prefers charging POI for RECHARGE events', () => {
    const poiFeatures = [
      {
        place_type: ['poi'],
        text: 'Tesla Supercharger Kassel',
        place_name: 'Tesla Supercharger Kassel, Kassel, Germany',
        properties: { category: 'charging station' },
      },
    ];

    const resolved = resolveEnergyEventLocationFromFeatures(
      poiFeatures,
      [],
      [],
      EnergyEventKind.RECHARGE,
    );

    expect(resolved.locationDisplayName).toBe('Tesla Supercharger Kassel');
    expect(resolved.locationSource).toBe('poi');
    expect(resolved.locationConfidence).toBe('HIGH');
  });

  it('falls back to address when no relevant POI exists', () => {
    const addressFeatures = [
      {
        place_type: ['address'],
        text: 'Wilhelmshöher Allee',
        address: '241',
        place_name: 'Wilhelmshöher Allee 241, 34131 Kassel, Germany',
        context: [{ id: 'place.123', text: 'Kassel' }],
      },
    ];

    const resolved = resolveEnergyEventLocationFromFeatures(
      [],
      addressFeatures,
      [],
      EnergyEventKind.REFUEL,
    );

    expect(resolved.locationDisplayName).toBe('Wilhelmshöher Allee 241, Kassel');
    expect(resolved.locationSource).toBe('address');
    expect(resolved.locationConfidence).toBe('MEDIUM');
  });

  it('returns null display name when nothing is available', () => {
    const resolved = resolveEnergyEventLocationFromFeatures(
      [],
      [],
      [],
      EnergyEventKind.RECHARGE,
    );

    expect(resolved.locationDisplayName).toBeNull();
    expect(resolved.locationSource).toBeNull();
    expect(resolved.locationConfidence).toBeNull();
  });

  it('does not pick unrelated POIs for refuel scoring', () => {
    const score = scoreEnergyEventPoi(
      {
        place_type: ['poi'],
        text: 'REWE',
        properties: { category: 'grocery' },
      },
      EnergyEventKind.REFUEL,
    );
    expect(score).toBe(0);
    expect(
      pickBestPoiFeature(
        [
          {
            place_type: ['poi'],
            text: 'REWE',
            properties: { category: 'grocery' },
          },
        ],
        EnergyEventKind.REFUEL,
      ),
    ).toBeNull();
  });
});
