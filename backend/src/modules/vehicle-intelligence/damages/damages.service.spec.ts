import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  DamageEvidenceStatus,
  DamageLocationView,
  DamageSeverity,
  DamageSource,
  DamageStatus,
  DamageType,
} from '@prisma/client';
import {
  buildDamageStats,
  defaultLiabilityForSource,
  deriveDamageStatus,
  evidenceStatusFromImageCount,
  mapDamageToResponse,
} from './damage.mapper';

const vehicleId = 'veh-1';
const damageId = 'dmg-1';
const orgId = 'org-1';

function makeDamageRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-01T10:00:00.000Z');
  return {
    id: damageId,
    vehicleId,
    damageType: DamageType.SCRATCH,
    severity: DamageSeverity.MODERATE,
    status: DamageStatus.OPEN,
    description: 'Scratch on door',
    locationView: DamageLocationView.FRONT,
    locationX: 42,
    locationY: 55,
    locationLabel: 'Front bumper',
    estimatedCostCents: 15000,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: DamageSource.MANUAL,
    rentalImpact: 'WATCH',
    evidenceStatus: DamageEvidenceStatus.MISSING,
    liabilityStatus: 'NOT_APPLICABLE',
    liabilityNote: null,
    bookingId: null,
    customerId: null,
    handoverProtocolId: null,
    taskId: null,
    reportedBy: 'agent',
    repairStartedAt: null,
    repairedAt: null,
    createdAt: now,
    updatedAt: now,
    images: [],
    ...overrides,
  };
}

function makePrisma() {
  return {
    vehicleDamage: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vehicleDamageImage: {
      create: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: orgId }),
    },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    bookingHandoverProtocol: { findFirst: jest.fn() },
    orgTask: { findFirst: jest.fn() },
  } as any;
}

// Import after mocks are defined
import { DamagesService } from './damages.service';
import { CreateDamageDto } from './dto/create-damage.dto';

describe('damage.mapper', () => {
  it('derives REPAIRED when repairedAt is set', () => {
    expect(
      deriveDamageStatus({
        status: DamageStatus.OPEN,
        repairedAt: new Date(),
        repairStartedAt: null,
      }),
    ).toBe('REPAIRED');
  });

  it('maps reportedAt from createdAt and includes locationView/status', () => {
    const row = makeDamageRow();
    const dto = mapDamageToResponse(row as any);
    expect(dto.status).toBe('OPEN');
    expect(dto.reportedAt).toBe(row.createdAt.toISOString());
    expect(dto.locationView).toBe('FRONT');
    expect(dto.resolvedDate).toBeNull();
  });

  it('evidenceStatusFromImageCount respects DISPUTED', () => {
    expect(evidenceStatusFromImageCount(5, 'DISPUTED')).toBe('DISPUTED');
    expect(evidenceStatusFromImageCount(0, 'MISSING')).toBe('MISSING');
    expect(evidenceStatusFromImageCount(1, 'MISSING')).toBe('PARTIAL');
    expect(evidenceStatusFromImageCount(2, 'MISSING')).toBe('COMPLETE');
  });

  it('defaultLiabilityForSource maps handover sources', () => {
    expect(defaultLiabilityForSource(DamageSource.PICKUP_HANDOVER)).toBe('NOT_APPLICABLE');
    expect(defaultLiabilityForSource(DamageSource.RETURN_HANDOVER)).toBe('NEEDS_REVIEW');
    expect(defaultLiabilityForSource(DamageSource.MANUAL)).toBe('NEEDS_REVIEW');
  });

  it('buildDamageStats counts open/repaired/blocking/missingEvidence/unplaced', () => {
    const stats = buildDamageStats([
      makeDamageRow({
        id: '1',
        status: DamageStatus.OPEN,
        rentalImpact: 'BLOCK_RENTAL',
        evidenceStatus: 'MISSING',
        locationView: 'UNKNOWN',
        locationX: null,
      }) as any,
      makeDamageRow({
        id: '2',
        status: DamageStatus.REPAIRED,
        repairedAt: new Date('2026-05-01'),
        rentalImpact: 'NONE',
      }) as any,
    ]);
    expect(stats.total).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.repaired).toBe(1);
    expect(stats.blockingRental).toBe(1);
    expect(stats.missingEvidence).toBe(1);
    expect(stats.unplaced).toBe(1);
    expect(stats.estimatedOpenCostCents).toBe(15000);
  });
});

describe('DamagesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: DamagesService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new DamagesService(prisma);
  });

  it('create persists damage with valid payload and maps response', async () => {
    const row = makeDamageRow();
    prisma.vehicleDamage.create.mockResolvedValue(row);

    const result = await svc.create(vehicleId, {
      damageType: DamageType.SCRATCH,
      severity: DamageSeverity.MODERATE,
      locationView: DamageLocationView.FRONT,
      locationX: 42,
      locationY: 55,
      description: 'Scratch on door',
    });

    expect(result.status).toBe('OPEN');
    expect(result.reportedAt).toBeTruthy();
    expect(result.locationView).toBe('FRONT');
    expect(prisma.vehicleDamage.create).toHaveBeenCalled();
  });

  it('create rejects invalid locationX via DTO validation at controller; service accepts in-range coords', async () => {
    prisma.vehicleDamage.create.mockResolvedValue(makeDamageRow());
    await svc.create(vehicleId, {
      damageType: DamageType.DENT,
      locationX: 50,
      locationY: 50,
    });
    expect(prisma.vehicleDamage.create).toHaveBeenCalled();
  });

  it('validateImagePayload rejects oversize data', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(12_000_000);
    expect(() => svc.validateImagePayload(huge)).toThrow(BadRequestException);
  });

  it('findActive excludes repaired damages', async () => {
    prisma.vehicleDamage.findMany.mockResolvedValue([
      makeDamageRow({ status: DamageStatus.OPEN, repairedAt: null }),
      makeDamageRow({ id: 'dmg-2', status: DamageStatus.REPAIRED, repairedAt: new Date() }),
    ]);

    const active = await svc.findActive(vehicleId);
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe('OPEN');
    expect(prisma.vehicleDamage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vehicleId,
          repairedAt: null,
          status: { in: ['OPEN', 'IN_REPAIR'] },
        }),
      }),
    );
  });

  it('markRepaired sets repairedAt, status REPAIRED, and clears rentalImpact', async () => {
    const existing = makeDamageRow();
    prisma.vehicleDamage.findFirst.mockResolvedValue(existing);
    prisma.vehicleDamage.update.mockResolvedValue({
      ...existing,
      status: DamageStatus.REPAIRED,
      repairedAt: new Date('2026-06-02'),
      rentalImpact: 'NONE',
    });

    const result = await svc.markRepaired(vehicleId, damageId, { repairCostCents: 20000 });

    expect(result.status).toBe('REPAIRED');
    expect(result.resolvedDate).toBeTruthy();
    expect(prisma.vehicleDamage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: damageId },
        data: expect.objectContaining({
          status: DamageStatus.REPAIRED,
          rentalImpact: 'NONE',
          repairCostCents: 20000,
        }),
      }),
    );
  });

  it('addImage updates evidenceStatus based on image count', async () => {
    const existing = makeDamageRow({ evidenceStatus: DamageEvidenceStatus.MISSING, images: [] });
    prisma.vehicleDamage.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);
    prisma.vehicleDamageImage.create.mockResolvedValue({ id: 'img-1' });
    prisma.vehicleDamage.update.mockResolvedValue({
      ...existing,
      evidenceStatus: DamageEvidenceStatus.PARTIAL,
      images: [
        {
          id: 'img-1',
          imageData: 'data:image/png;base64,abc',
          mimeType: 'image/png',
          caption: null,
          uploadedBy: null,
          createdAt: new Date(),
        },
      ],
    });

    const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';
    const result = await svc.addImage(vehicleId, damageId, tinyPng);

    expect(prisma.vehicleDamageImage.create).toHaveBeenCalled();
    expect(prisma.vehicleDamage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { evidenceStatus: DamageEvidenceStatus.PARTIAL },
      }),
    );
    expect(result.evidenceStatus).toBe('PARTIAL');
  });

  it('assertDamageBelongsToVehicle throws when damage is on another vehicle', async () => {
    prisma.vehicleDamage.findFirst.mockResolvedValue(null);
    await expect(svc.markRepaired(vehicleId, damageId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicleDamage.update).not.toHaveBeenCalled();
  });

  it('markRepaired preserves reportedBy and does not overwrite with repairedBy', async () => {
    const existing = makeDamageRow({ reportedBy: 'original-agent' });
    prisma.vehicleDamage.findFirst.mockResolvedValue(existing);
    prisma.vehicleDamage.update.mockResolvedValue({
      ...existing,
      status: DamageStatus.REPAIRED,
      repairedAt: new Date('2026-06-02'),
      rentalImpact: 'NONE',
      reportedBy: 'original-agent',
    });

    await svc.markRepaired(vehicleId, damageId, { repairCostCents: 20000, repairedBy: 'tech-1' });

    expect(prisma.vehicleDamage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ reportedBy: 'tech-1' }),
      }),
    );
  });

  it('getStats does not load image blobs', async () => {
    prisma.vehicleDamage.findMany.mockResolvedValue([
      makeDamageRow({ status: DamageStatus.OPEN, rentalImpact: 'BLOCK_RENTAL' }),
    ]);
    const stats = await svc.getStats(vehicleId);
    expect(stats).toMatchObject({
      total: 1,
      open: 1,
      active: 1,
      blockingRental: 1,
    });
    expect(stats.insights?.hasEnoughData).toBe(true);
    expect(prisma.vehicleDamage.findMany).toHaveBeenCalledWith({ where: { vehicleId } });
  });

  it('getFleetStats scopes by organization via vehicle relation', async () => {
    prisma.vehicleDamage.findMany.mockResolvedValue([]);
    const stats = await svc.getFleetStats(orgId);
    expect(stats.organizationId).toBe(orgId);
    expect(stats.total).toBe(0);
    expect(prisma.vehicleDamage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vehicle: { organizationId: orgId } },
      }),
    );
  });

  it('CreateDamageDto rejects locationX/locationY outside 0-100', () => {
    const dto = plainToInstance(CreateDamageDto, {
      damageType: 'SCRATCH',
      locationX: 150,
      locationY: -1,
    });
    const errors = validateSync(dto);
    expect(errors.some((e) => e.property === 'locationX')).toBe(true);
    expect(errors.some((e) => e.property === 'locationY')).toBe(true);
  });
});
