import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DamageSeverity, DamageSource } from '@prisma/client';
import { OperatorDamageService } from './operator-damage.service';
import { OperatorDamageAuditService } from './operator-damage-audit.service';
import { assertOperatorCaptureSourceAllowed } from './operator-damage-source.util';

describe('OperatorDamageService', () => {
  const prisma = {
    operatorDamageCaptureIdempotency: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    vehicleDamage: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const damages = {
    findActive: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
  const audit = { log: jest.fn() };

  const service = new OperatorDamageService(
    prisma as never,
    damages as never,
    audit as never,
  );

  const orgId = 'org-1';
  const vehicleId = 'vehicle-1';
  const actor = { userId: 'user-1' };

  const activeDamage = {
    id: 'damage-1',
    vehicleId,
    damageType: 'SCRATCH',
    severity: DamageSeverity.MODERATE,
    status: 'OPEN',
    description: 'Kratzer Front',
    locationLabel: 'Front',
    locationView: 'FRONT',
    source: DamageSource.MANUAL,
    rentalImpact: 'WATCH',
    liabilityStatus: 'NEEDS_REVIEW',
    evidenceStatus: 'COMPLETE',
    bookingId: null,
    customerId: null,
    handoverProtocolId: null,
    reportedBy: 'Operator',
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    locationX: null,
    locationY: null,
    estimatedCostCents: null,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    liabilityNote: null,
    reportedAt: new Date().toISOString(),
    repairStartedAt: null,
    repairedAt: null,
    resolvedDate: null,
    taskId: null,
  };

  const captureDto = {
    captureKey: 'cap-1',
    source: 'pickup' as const,
    damageType: 'SCRATCH',
    severity: DamageSeverity.MODERATE,
    locationLabel: 'Front',
    description: 'Kratzer Front',
    bookingId: 'booking-1',
    customerId: 'customer-1',
    images: [{ imageData: 'data:image/png;base64,abc' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
    prisma.booking.findFirst.mockResolvedValue({
      id: 'booking-1',
      vehicleId,
      customerId: 'customer-1',
      pickupStationId: 'station-1',
      returnStationId: 'station-1',
    });
    prisma.operatorDamageCaptureIdempotency.findUnique.mockResolvedValue(null);
    damages.findActive.mockResolvedValue([activeDamage]);
    damages.create.mockResolvedValue({ ...activeDamage, id: 'damage-new' });
    damages.findById.mockResolvedValue(activeDamage);
  });

  it('returns existing damage on dedup instead of creating duplicate', async () => {
    const result = await service.capture(orgId, vehicleId, captureDto, actor);
    expect(result.deduplicated).toBe(true);
    expect(result.damage.id).toBe('damage-1');
    expect(damages.create).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'OPERATOR_DAMAGE_DEDUPLICATED' }),
    );
  });

  it('creates and links new damage when no duplicate exists', async () => {
    damages.findActive.mockResolvedValue([]);
    damages.create.mockResolvedValue({ ...activeDamage, id: 'damage-new' });

    const result = await service.capture(orgId, vehicleId, captureDto, actor);

    expect(result.deduplicated).toBe(false);
    expect(damages.create).toHaveBeenCalledWith(
      vehicleId,
      expect.objectContaining({
        bookingId: 'booking-1',
        customerId: 'customer-1',
        source: DamageSource.PICKUP_HANDOVER,
      }),
      orgId,
    );
    expect(prisma.operatorDamageCaptureIdempotency.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'OPERATOR_DAMAGE_CAPTURED' }),
    );
  });

  it('replays idempotent capture without second create', async () => {
    damages.findActive.mockResolvedValue([]);
    prisma.operatorDamageCaptureIdempotency.findUnique.mockResolvedValue({
      damageId: 'damage-1',
    });

    const result = await service.capture(orgId, vehicleId, captureDto, actor);

    expect(result.idempotentReplay).toBe(true);
    expect(damages.create).not.toHaveBeenCalled();
  });

  it('rejects AI suggestion source without auto-confirmation', () => {
    expect(() =>
      assertOperatorCaptureSourceAllowed('ai_suggestion'),
    ).toThrow(/verification/i);
  });

  it('rejects foreign organization vehicle scope', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.capture(orgId, vehicleId, captureDto, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('blocks silent edit of final damage', async () => {
    damages.findById.mockResolvedValue({ ...activeDamage, status: 'REPAIRED' });
    await expect(
      service.assertEditable(orgId, vehicleId, 'damage-1', actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'OPERATOR_DAMAGE_UPDATE_BLOCKED' }),
    );
  });

  it('rejects booking from foreign organization', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    damages.findActive.mockResolvedValue([]);
    await expect(service.capture(orgId, vehicleId, captureDto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
