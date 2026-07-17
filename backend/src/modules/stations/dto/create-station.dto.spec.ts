import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateStationDto } from './create-station.dto';

async function validateDto(payload: object) {
  const dto = plainToInstance(CreateStationDto, payload);
  return validate(dto);
}

describe('CreateStationDto validation', () => {
  it('accepts minimal valid create payload', async () => {
    const errors = await validateDto({ name: 'Zentrale' });
    expect(errors).toHaveLength(0);
  });

  it('rejects ARCHIVED status on create', async () => {
    const errors = await validateDto({ name: 'Alt', status: 'ARCHIVED' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects partial coordinates', async () => {
    const errors = await validateDto({ name: 'Geo', latitude: 52.5 });
    expect(errors.some((e) => e.property === 'latitude')).toBe(true);
  });

  it('rejects invalid latitude range', async () => {
    const errors = await validateDto({
      name: 'Geo',
      latitude: 95,
      longitude: 13,
    });
    expect(errors.some((e) => e.property === 'latitude')).toBe(true);
  });

  it('rejects invalid IANA timezone', async () => {
    const errors = await validateDto({
      name: 'TZ',
      timezone: 'Invalid/Zone',
    });
    expect(errors.some((e) => e.property === 'timezone')).toBe(true);
  });

  it('rejects geofence radius below minimum', async () => {
    const errors = await validateDto({
      name: 'Radius',
      radiusMeters: 10,
    });
    expect(errors.some((e) => e.property === 'radiusMeters')).toBe(true);
  });

  it('rejects geofence radius above maximum', async () => {
    const errors = await validateDto({
      name: 'Radius',
      radiusMeters: 9000,
    });
    expect(errors.some((e) => e.property === 'radiusMeters')).toBe(true);
  });

  it('accepts geofence radius within bounds', async () => {
    const errors = await validateDto({
      name: 'Radius',
      radiusMeters: 150,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects zero capacity', async () => {
    const errors = await validateDto({
      name: 'Cap',
      capacity: 0,
    });
    expect(errors.some((e) => e.property === 'capacity')).toBe(true);
  });

  it('accepts null capacity', async () => {
    const errors = await validateDto({
      name: 'Cap',
      capacity: null,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects inconsistent after-hours return capability', async () => {
    const errors = await validateDto({
      name: 'Ops',
      returnEnabled: false,
      afterHoursReturnEnabled: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects primary create when status is INACTIVE', async () => {
    const errors = await validateDto({
      name: 'Primary',
      isPrimary: true,
      status: 'INACTIVE',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid opening hours structure', async () => {
    const errors = await validateDto({
      name: 'Hours',
      openingHours: {
        monday: { open: '25:99', close: '18:00' },
      },
    });
    expect(errors.some((e) => e.property === 'openingHours')).toBe(true);
  });

  it('rejects empty weekday objects', async () => {
    const errors = await validateDto({
      name: 'Hours',
      openingHours: {
        monday: {},
      },
    });
    expect(errors.some((e) => e.property === 'openingHours')).toBe(true);
  });

  it('accepts midnight-spanning slots', async () => {
    const errors = await validateDto({
      name: 'Hours',
      openingHours: {
        friday: { open: '22:00', close: '06:00' },
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts structured opening hours', async () => {
    const errors = await validateDto({
      name: 'Hours',
      openingHours: {
        monday: { open: '08:00', close: '18:00' },
        sunday: { closed: true },
      },
    });
    expect(errors).toHaveLength(0);
  });
});
