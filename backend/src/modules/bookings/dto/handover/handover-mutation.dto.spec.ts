import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHandoverProtocolDto } from './create-handover-protocol.dto';
import { HandoverTechnicalObservationDto } from './handover-technical-observation.dto';

async function validateDto<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

const VALID_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('CreateHandoverProtocolDto', () => {
  const basePayload = {
    odometerKm: 12000,
    fuelPercent: 75,
    documentsAcknowledged: true,
    customerSignatureName: 'Max Mustermann',
    customerSignatureDataUrl: VALID_SIGNATURE,
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: VALID_SIGNATURE,
  };

  it('accepts valid pickup payload', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, basePayload);
    expect(errors).toHaveLength(0);
  });

  it('rejects negative odometerKm', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      odometerKm: -1,
    });
    expect(errors.some((e) => e.property === 'odometerKm')).toBe(true);
  });

  it('rejects fuelPercent above 100', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      fuelPercent: 150,
    });
    expect(errors.some((e) => e.property === 'fuelPercent')).toBe(true);
  });

  it('accepts chargePercent as EV alias', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      odometerKm: 12000,
      chargePercent: 80,
      documentsAcknowledged: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown fields (performedByUserId)', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      performedByUserId: 'fake-user',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid signature data URL', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      customerSignatureDataUrl: 'not-a-data-url',
    });
    expect(errors.some((e) => e.property === 'customerSignatureDataUrl')).toBe(true);
  });

  it('rejects oversized signature data URL', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(800_000);
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      customerSignatureDataUrl: huge,
    });
    expect(errors.some((e) => e.property === 'customerSignatureDataUrl')).toBe(true);
  });

  it('requires warningLightsNotes when warningLightsOn is true', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      warningLightsOn: true,
    });
    expect(errors.some((e) => e.property === 'warningLightsNotes')).toBe(true);
  });

  it('rejects invalid damage UUIDs', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      damageIds: ['not-a-uuid'],
    });
    expect(errors.some((e) => e.property === 'damageIds')).toBe(true);
  });

  it('rejects duplicate damageIds', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      damageIds: [id, id],
    });
    expect(errors.some((e) => e.property === 'damageIds')).toBe(true);
  });

  it('enforces override reason min length', async () => {
    const errors = await validateDto(CreateHandoverProtocolDto, {
      ...basePayload,
      pickupGateOverrideReason: 'short',
    });
    expect(errors.some((e) => e.property === 'pickupGateOverrideReason')).toBe(true);
  });

  it('validates technical observation description length', async () => {
    const errors = await validateDto(HandoverTechnicalObservationDto, {
      description: 'ab',
    });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });
});
