import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { HandoverValidationService } from './handover-validation.service';
import { HANDOVER_ERROR_CODES } from './handover-error.codes';
import type { CreateHandoverCommand } from './handover-command.types';

function baseCommand(overrides: Partial<CreateHandoverCommand> = {}): CreateHandoverCommand {
  return {
    odometerKm: 12000,
    fuelPercent: 75,
    documentsAcknowledged: true,
    ...overrides,
  };
}

function baseCtx(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    kind: 'RETURN' as const,
    vehicleId: 'veh-1',
    bookingStatus: 'ACTIVE',
    scheduledStartDate: new Date('2026-08-01T10:00:00.000Z'),
    pickupOdometerKm: 10000,
    hasOverridePermission: false,
    ...overrides,
  };
}

describe('HandoverValidationService', () => {
  const prisma = {
    station: { findFirst: jest.fn() },
    vehicleDamage: { findMany: jest.fn() },
  };
  const service = new HandoverValidationService(prisma as never);

  describe('assertBookingStatus', () => {
    it('allows pickup on CONFIRMED', () => {
      expect(() => service.assertBookingStatus('PICKUP', 'CONFIRMED')).not.toThrow();
    });

    it('rejects pickup on ACTIVE', () => {
      expect(() => service.assertBookingStatus('PICKUP', 'ACTIVE')).toThrow(ConflictException);
    });

    it('allows return on ACTIVE', () => {
      expect(() => service.assertBookingStatus('RETURN', 'ACTIVE')).not.toThrow();
    });

    it('rejects return on CONFIRMED', () => {
      expect(() => service.assertBookingStatus('RETURN', 'CONFIRMED')).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: HANDOVER_ERROR_CODES.RETURN_WRONG_STATUS,
          }),
        }),
      );
    });
  });

  describe('assertOdometerRules', () => {
    it('rejects return odometer below pickup without override reason', () => {
      expect(() =>
        service.assertOdometerRules(baseCommand({ odometerKm: 9000 }), baseCtx()),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: HANDOVER_ERROR_CODES.ODOMETER_OVERRIDE_REASON_REQUIRED,
          }),
        }),
      );
    });

    it('rejects return odometer override without permission', () => {
      expect(() =>
        service.assertOdometerRules(
          baseCommand({
            odometerKm: 9000,
            odometerOverrideReason: 'Tachowechsel dokumentiert durch Werkstatt',
          }),
          baseCtx(),
        ),
      ).toThrow(ForbiddenException);
    });

    it('allows return odometer override with permission and reason', () => {
      expect(() =>
        service.assertOdometerRules(
          baseCommand({
            odometerKm: 9000,
            odometerOverrideReason: 'Tachowechsel dokumentiert durch Werkstatt',
          }),
          baseCtx({ hasOverridePermission: true }),
        ),
      ).not.toThrow();
    });
  });

  describe('resolvePerformedAt', () => {
    it('rejects future performedAt', () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      expect(() =>
        service.resolvePerformedAt(baseCommand({ performedAt: future }), 'PICKUP', new Date()),
      ).toThrow(BadRequestException);
    });

    it('returns null when performedAt omitted', () => {
      expect(
        service.resolvePerformedAt(baseCommand(), 'PICKUP', new Date('2026-08-01T10:00:00.000Z')),
      ).toBeNull();
    });
  });

  describe('assertTenantScopedReferences', () => {
    it('rejects unknown damage IDs', async () => {
      prisma.vehicleDamage.findMany.mockResolvedValue([]);
      await expect(
        service.assertTenantScopedReferences(
          baseCommand({ damageIds: ['11111111-1111-4111-8111-111111111111'] }),
          baseCtx({ kind: 'PICKUP' }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: HANDOVER_ERROR_CODES.DAMAGE_ID_NOT_FOUND,
        }),
      });
    });

    it('rejects damage IDs from another vehicle', async () => {
      prisma.vehicleDamage.findMany.mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', vehicleId: 'other-veh' },
      ]);
      await expect(
        service.assertTenantScopedReferences(
          baseCommand({ damageIds: ['11111111-1111-4111-8111-111111111111'] }),
          baseCtx({ kind: 'PICKUP' }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: HANDOVER_ERROR_CODES.DAMAGE_VEHICLE_MISMATCH,
        }),
      });
    });
  });
});
